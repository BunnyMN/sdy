package auth_test

import (
	"context"
	"testing"
	"time"

	"github.com/gerege-systems/open-gerege-nexus/backend/internal/workspace/auth"
	"github.com/google/uuid"
)

func TestClosedOrganisationsDoNotTrapSignInOrAppearInSwitcher(t *testing.T) {
	pool := openPool(t)
	ctx := context.Background()
	user := seedPerson(t, pool)
	h := handlersFor(pool)
	var ids []string
	for range 4 {
		id := uuid.NewString()
		if _, err := pool.Exec(ctx, `INSERT INTO registry.tenants(id,slug,name) VALUES($1,$2,'Availability test')`, id, "available-"+id); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM registry.tenants WHERE id=$1`, id) })
		if _, err := pool.Exec(ctx, `INSERT INTO workspace.memberships(tenant_id,user_id) VALUES($1,$2)`, id, user); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}
	for i, query := range []string{
		`UPDATE registry.tenants SET suspended_at=now() WHERE id=$1`,
		`UPDATE registry.tenants SET deletion_scheduled_at=now()+interval '30 days' WHERE id=$1`,
		`UPDATE workspace.memberships SET active=false,deactivated_at=now() WHERE tenant_id=$1`,
	} {
		if _, err := pool.Exec(ctx, query, ids[i]); err != nil {
			t.Fatal(err)
		}
	}
	opened, err := h.FirstTenantFor(ctx, user)
	if err != nil || opened != ids[3] {
		t.Fatalf("opened=%s want=%s err=%v", opened, ids[3], err)
	}
	sessions := auth.NewSessionStore(pool, time.Hour)
	options, err := sessions.TenantsForUser(ctx, user)
	if err != nil || len(options) != 2 || options[0].ID != ids[3] || options[1].Kind != "personal" {
		t.Fatalf("options=%+v err=%v; want one active organisation and home", options, err)
	}
	if _, err := pool.Exec(ctx, `UPDATE registry.tenants SET suspended_at=now() WHERE id=$1`, ids[3]); err != nil {
		t.Fatal(err)
	}
	opened, err = h.FirstTenantFor(ctx, user)
	if err != nil || opened != options[1].ID {
		t.Fatalf("all organisations closed: opened=%s want home=%s err=%v", opened, options[1].ID, err)
	}
}
