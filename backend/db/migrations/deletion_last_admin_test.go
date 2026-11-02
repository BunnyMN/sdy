package migrations_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

// The last administrator may still delete their account (App Store
// 5.1.1(v)); the organisation's audit trail says it was left without one.
func TestTheLastAdministratorLeavingIsRecorded(t *testing.T) {
	pool := migrationsPool(t)
	ctx := t.Context()
	tenant, admin := uuid.NewString(), uuid.NewString()
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM registry.tenants WHERE id=$1`, tenant)
		_, _ = pool.Exec(context.Background(), `DELETE FROM registry.account_deletion_requests WHERE user_id=$1`, admin)
		_, _ = pool.Exec(context.Background(), `DELETE FROM registry.users WHERE id=$1`, admin)
	})
	for _, q := range []struct {
		sql  string
		args []any
	}{
		{`INSERT INTO registry.tenants(id,slug,name) VALUES($1,$2,'Last admin test')`, []any{tenant, "last-admin-" + tenant}},
		{`INSERT INTO registry.users(id,email,name,password_hash) VALUES($1,$2,'Only admin','unused')`, []any{admin, admin + "@admin.test"}},
		{`INSERT INTO workspace.memberships(tenant_id,user_id) VALUES($1,$2)`, []any{tenant, admin}},
		{`INSERT INTO workspace.membership_roles(membership_id,role_id) SELECT m.id,r.id FROM workspace.memberships m
			JOIN workspace.roles r ON r.tenant_id=m.tenant_id AND r.code='admin' WHERE m.tenant_id=$1 AND m.user_id=$2`, []any{tenant, admin}},
		{`SELECT registry.request_account_deletion($1,'')`, []any{admin}},
	} {
		if _, err := pool.Exec(ctx, q.sql, q.args...); err != nil {
			t.Fatal(err)
		}
	}
	var recorded int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM workspace.audit_events WHERE tenant_id=$1 AND action='organisation.left_without_admin'`, tenant).Scan(&recorded); err != nil || recorded != 1 {
		t.Fatalf("recorded %d (%v), want 1", recorded, err)
	}
}
