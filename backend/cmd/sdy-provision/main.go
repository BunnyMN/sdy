// sdy-provision installs SDY's member apps into Darkhan-Uul and its four soums.
// It creates no organisation or identity and does not change member roles.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/gerege-systems/open-gerege-nexus/backend/internal/apps"
	"github.com/gerege-systems/open-gerege-nexus/backend/internal/kernel/appcatalog"
	"github.com/gerege-systems/open-gerege-nexus/backend/internal/kernel/config"
	"github.com/gerege-systems/open-gerege-nexus/backend/internal/workspace/appinstall"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	apply := flag.Bool("apply", false, "apply the displayed installations; without this flag only inspect")
	path := flag.String("catalog", "catalog/apps.json", "bundled catalogue path")
	flag.Parse()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	if err := run(ctx, *path, *apply); err != nil {
		fmt.Fprintln(os.Stderr, "sdy-provision:", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, path string, apply bool) error {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		return fmt.Errorf("DATABASE_URL is not set")
	}
	db, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return err
	}
	defer db.Close()
	apps.Bootstrap(appinstall.NewModulePlatform(db))
	catalog, err := appcatalog.LoadFile(path, config.PlatformVersion)
	if err != nil {
		return err
	}
	installer := appinstall.NewAppInstaller(db, catalog, config.PlatformVersion)
	rows, err := db.Query(ctx, `SELECT t.id::text,t.slug FROM registry.tenants t
		JOIN workspace.tenant_profiles p ON p.tenant_id=t.id
		JOIN registry.tenants root ON root.slug='sdy-darkhan-uul'
		WHERE (t.id=root.id OR p.parent_tenant_id=root.id)
		AND root.kind='organisation' AND root.suspended_at IS NULL AND root.deletion_scheduled_at IS NULL
		AND t.kind='organisation' AND t.suspended_at IS NULL AND t.deletion_scheduled_at IS NULL ORDER BY t.slug`)
	if err != nil {
		return err
	}
	type branch struct{ id, slug string }
	var branches []branch
	for rows.Next() {
		var b branch
		if err := rows.Scan(&b.id, &b.slug); err != nil {
			rows.Close()
			return err
		}
		branches = append(branches, b)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	expected := map[string]bool{
		"sdy-darkhan-uul": true, "sdy-darkhan-uul-darkhan": true,
		"sdy-darkhan-uul-orkhon": true, "sdy-darkhan-uul-shariin-gol": true,
		"sdy-darkhan-uul-khongor": true,
	}
	if len(branches) != len(expected) {
		return fmt.Errorf("expected Darkhan-Uul and four active soums, found %d; no changes applied", len(branches))
	}
	ids := make([]string, 0, len(branches))
	for _, b := range branches {
		if !expected[b.slug] {
			return fmt.Errorf("unexpected branch %s; no changes applied", b.slug)
		}
		ids = append(ids, b.id)
	}
	if apply {
		if _, err := db.Exec(ctx, `UPDATE registry.tenants SET membership_branch=(id=ANY($1::uuid[])) WHERE kind='organisation'`, ids); err != nil {
			return err
		}
		if err := installer.SyncCatalog(ctx); err != nil {
			return err
		}
		if err := installer.MigrateModules(ctx); err != nil {
			return err
		}
	}
	for _, b := range branches {
		installed, err := installer.GetInstallationsForTenant(ctx, b.id)
		if err != nil {
			return err
		}
		for _, slug := range []string{"events", "membership"} {
			app, ok := installer.GetAppBySlug(slug)
			if !ok {
				return fmt.Errorf("missing catalogue app %s", slug)
			}
			state, exists := installed[app.ID]
			if exists && !state.Enabled {
				fmt.Printf("%s %s: disabled by organisation, preserved\n", b.slug, slug)
				continue
			}
			if exists && state.PinnedVersion != "" {
				fmt.Printf("%s %s: version pin preserved\n", b.slug, slug)
				continue
			}
			if exists && state.Version == app.Version {
				fmt.Printf("%s %s: current %s\n", b.slug, slug, app.Version)
				continue
			}
			fmt.Printf("%s %s: %s -> %s (apply=%t)\n", b.slug, slug, state.Version, app.Version, apply)
			if apply {
				if err := installer.InstallApp(ctx, b.id, slug, appinstall.SystemActor); err != nil {
					return fmt.Errorf("%s/%s: %w", b.slug, slug, err)
				}
			}
		}
	}
	return nil
}
