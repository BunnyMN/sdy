package migrations_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

// 00125: the chair and the secretary prepare archive documents, every
// position reads the archive, and the grant reaches a branch's position roles
// whether the permission is registered before or after the branch exists.
func TestArchivePermissionsFollowThePosition(t *testing.T) {
	pool := migrationsPool(t)
	ctx := t.Context()
	tenant := uuid.NewString()
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM registry.tenants WHERE id=$1`, tenant)
	})
	for _, code := range []string{"archive.read", "archive.manage"} {
		if _, err := pool.Exec(ctx, `INSERT INTO registry.permissions (code, name, description) VALUES ($1, $1, '') ON CONFLICT (code) DO NOTHING`, code); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(ctx, `INSERT INTO registry.tenants(id,slug,name,membership_branch) VALUES($1,$2,'Archive positions',true)`,
		tenant, "archive-pos-"+tenant); err != nil {
		t.Fatal(err)
	}
	granted := func(role, code string) bool {
		t.Helper()
		var ok bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM workspace.role_permissions rp
			JOIN workspace.roles r ON r.id = rp.role_id JOIN registry.permissions p ON p.id = rp.permission_id
			WHERE r.tenant_id = $1 AND r.code = $2 AND p.code = $3)`, tenant, role, code).Scan(&ok); err != nil {
			t.Fatal(err)
		}
		return ok
	}
	for role, want := range map[string]bool{"pos_chair": true, "pos_secretary": true, "pos_vice_chair": false, "pos_board": false, "pos_auditor": false, "manager": false} {
		if got := granted(role, "archive.manage"); got != want {
			t.Errorf("%s archive.manage = %v, want %v", role, got, want)
		}
	}
	for _, role := range []string{"pos_chair", "pos_board", "pos_finance", "pos_auditor"} {
		if !granted(role, "archive.read") {
			t.Errorf("%s cannot read the archive", role)
		}
	}
}
