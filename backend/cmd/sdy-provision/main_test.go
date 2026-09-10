package main

import (
	"context"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestProvisionOnlyBranchesAndPreservesRemovedApps(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to a migrated disposable database")
	}
	t.Setenv("DATABASE_URL", dsn)
	ctx := context.Background()
	db, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ownerID := uuid.NewString()
	if _, err := db.Exec(ctx, `INSERT INTO registry.users(id,email,name,password_hash) VALUES($1,$2,'Provision test','x')`, ownerID, ownerID+"@example.test"); err != nil {
		t.Fatal(err)
	}
	var ids []string
	defer func() {
		_, _ = db.Exec(ctx, `DELETE FROM registry.tenants WHERE id=ANY($1::uuid[])`, ids)
		_, _ = db.Exec(ctx, `DELETE FROM registry.users WHERE id=$1`, ownerID)
	}()
	slugs := []string{"sdy-darkhan-uul", "sdy-darkhan-uul-darkhan", "sdy-darkhan-uul-orkhon", "sdy-darkhan-uul-shariin-gol", "sdy-darkhan-uul-khongor", "sdy-other-" + ownerID, "home-" + ownerID}
	for i, slug := range slugs {
		id := uuid.NewString()
		ids = append(ids, id)
		kind := "organisation"
		var owner any
		if i == 6 {
			kind = "personal"
			owner = ownerID
		}
		if _, err := db.Exec(ctx, `INSERT INTO registry.tenants(id,slug,name,kind,membership_branch,owner_user_id) VALUES($1,$4,'Provision test',$2,$3,$5)`, id, kind, i == 5, slug, owner); err != nil {
			t.Fatal(err)
		}
		if i > 0 && i < 5 {
			if _, err := db.Exec(ctx, `UPDATE workspace.tenant_profiles SET parent_tenant_id=$2 WHERE tenant_id=$1`, id, ids[0]); err != nil {
				t.Fatal(err)
			}
		}
	}
	path := "../../../catalog/apps.json"
	if _, err := db.Exec(ctx, `UPDATE workspace.tenant_profiles SET parent_tenant_id=NULL WHERE tenant_id=$1`, ids[4]); err != nil {
		t.Fatal(err)
	}
	if err := run(ctx, path, true); err == nil {
		t.Fatal("accepted an incomplete hierarchy")
	}
	if _, err := db.Exec(ctx, `UPDATE workspace.tenant_profiles SET parent_tenant_id=$2 WHERE tenant_id=$1`, ids[4], ids[0]); err != nil {
		t.Fatal(err)
	}
	if err := run(ctx, path, false); err != nil {
		t.Fatal(err)
	}
	count := func(want int) {
		t.Helper()
		var got int
		if err := db.QueryRow(ctx, `SELECT count(*) FROM workspace.app_installations WHERE tenant_id=ANY($1::uuid[])`, ids).Scan(&got); err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Fatalf("installations=%d want=%d", got, want)
		}
	}
	count(0)
	if err := run(ctx, path, true); err != nil {
		t.Fatal(err)
	}
	count(10)
	if _, err := db.Exec(ctx, `UPDATE workspace.app_installations SET enabled=false,status='disabled' WHERE tenant_id=$1 AND app_id='mn.sdy.events'`, ids[0]); err != nil {
		t.Fatal(err)
	}
	if err := run(ctx, path, true); err != nil {
		t.Fatal(err)
	}
	count(10)
	var enabled bool
	if err := db.QueryRow(ctx, `SELECT enabled FROM workspace.app_installations WHERE tenant_id=$1 AND app_id='mn.sdy.events'`, ids[0]).Scan(&enabled); err != nil {
		t.Fatal(err)
	}
	if enabled {
		t.Fatal("provision re-enabled an app removed by its organisation")
	}
	var outside int
	if err := db.QueryRow(ctx, `SELECT count(*) FROM workspace.app_installations WHERE tenant_id=ANY($1::uuid[])`, ids[5:]).Scan(&outside); err != nil {
		t.Fatal(err)
	}
	if outside != 0 {
		t.Fatal("installed outside Darkhan-Uul")
	}
	var published int
	if err := db.QueryRow(ctx, `SELECT count(*) FROM registry.tenants WHERE membership_branch AND id=ANY($1::uuid[])`, ids).Scan(&published); err != nil || published != 5 {
		t.Fatalf("published branches=%d want=5 err=%v", published, err)
	}
}
