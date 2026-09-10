package person_test

import (
	"context"
	"testing"

	"github.com/gerege-systems/open-gerege-nexus/backend/internal/person"
)

func TestBranchDirectoryPublishesHierarchyWithoutProfileAccess(t *testing.T) {
	pool := openPool(t)
	ctx := context.Background()
	parent, parentSlug := openOrganisation(t, pool)
	child, childSlug := openOrganisation(t, pool)
	quiet, _ := openOrganisation(t, pool)
	suspended, _ := openOrganisation(t, pool)
	deleting, _ := openOrganisation(t, pool)
	for _, id := range []string{parent, child, suspended, deleting} {
		if _, err := pool.Exec(ctx, `UPDATE registry.tenants SET membership_branch=true WHERE id=$1`, id); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(ctx, `UPDATE workspace.tenant_profiles SET parent_tenant_id=$1,phone='PRIVATE' WHERE tenant_id=$2`, parent, child); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE registry.tenants SET suspended_at=now() WHERE id=$1`, suspended); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE registry.tenants SET deletion_scheduled_at=now()+interval '30 days' WHERE id=$1`, deleting); err != nil {
		t.Fatal(err)
	}
	branches, err := person.New(pool).Branches(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(branches) != 2 {
		t.Fatalf("branches=%v; want only parent and child", branches)
	}
	if branches[0].Slug != parentSlug || branches[1].Slug != childSlug || branches[1].ParentSlug != parentSlug {
		t.Fatalf("incorrect hierarchy: %+v", branches)
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `SELECT set_config('app.current_tenant',$1,true)`, quiet); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `SET LOCAL ROLE gerege_nexus_tenant`); err != nil {
		t.Fatal(err)
	}
	var gotParent string
	if err := tx.QueryRow(ctx, `SELECT parent_slug FROM registry.membership_branches() WHERE slug=$1`, childSlug).Scan(&gotParent); err != nil || gotParent != parentSlug {
		t.Fatalf("non-member directory parent=%s err=%v", gotParent, err)
	}
	var exposed int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM workspace.tenant_profiles WHERE tenant_id=$1`, child).Scan(&exposed); err != nil || exposed != 0 {
		t.Fatalf("directory exposed private profile: count=%d err=%v", exposed, err)
	}
	if _, err := tx.Exec(ctx, `RESET ROLE`); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `UPDATE registry.tenants SET membership_branch=false WHERE id=$1`, parent); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `SET LOCAL ROLE gerege_nexus_tenant`); err != nil {
		t.Fatal(err)
	}
	var hidden bool
	if err := tx.QueryRow(ctx, `SELECT parent_slug IS NULL FROM registry.membership_branches() WHERE slug=$1`, childSlug).Scan(&hidden); err != nil || !hidden {
		t.Fatalf("unpublished parent was exposed: hidden=%t err=%v", hidden, err)
	}
}
