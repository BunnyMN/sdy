package migrations_test

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

// member_history_read, member_profile_self, member_notifications_self and
// member_notifications_read are exercised by call's SET LOCAL ROLE binding.
func TestMemberRecordsAndNotificationsArePersonScoped(t *testing.T) {
	f := newTransferFixture(t)
	call := func(tenant, user, query string, args ...any) string {
		t.Helper()
		value, err := f.call(t.Context(), tenant, user, query, args...)
		if err != nil {
			t.Fatal(err)
		}
		return value
	}
	profile := call("", f.member, `INSERT INTO registry.member_profiles(user_id,phone,residence)
		VALUES($1,'99112233','Дархан') RETURNING phone`, f.member)
	if profile != "99112233" {
		t.Fatal(profile)
	}
	if got := call(f.source, f.admin, `SELECT count(*)::text FROM registry.member_profiles WHERE user_id=$1`, f.member); got != "0" {
		t.Fatalf("another person saw private contact details: %s", got)
	}
	if got := call("", f.member, `SELECT count(*)::text FROM workspace.membership_history WHERE user_id=$1`, f.member); got != "1" {
		t.Fatalf("person lost their branch history: %s", got)
	}
	if got := call(f.source, f.admin, `SELECT count(*)::text FROM workspace.membership_history WHERE user_id=$1`, f.member); got != "1" {
		t.Fatalf("branch administrator lost history: %s", got)
	}
	if got := call(f.destination, f.admin, `SELECT count(*)::text FROM workspace.membership_history WHERE user_id=$1`, f.member); got != "0" {
		t.Fatalf("another branch saw history: %s", got)
	}
	id := call("", f.member, `SELECT id::text FROM registry.member_notifications ORDER BY created_at LIMIT 1`)
	if got := call("", f.admin, `SELECT count(*)::text FROM registry.member_notifications WHERE id=$1`, id); got != "0" {
		t.Fatalf("another person saw notification: %s", got)
	}
	if got := call("", f.admin, `WITH changed AS (UPDATE registry.member_notifications SET read_at=now() WHERE id=$1 RETURNING id) SELECT count(*)::text FROM changed`, id); got != "0" {
		t.Fatalf("another person marked notification read: %s", got)
	}
	call("", f.member, `UPDATE registry.member_notifications SET read_at=now() WHERE id=$1 RETURNING id::text`, id)
	if got := call("", f.member, `SELECT count(*)::text FROM registry.member_notifications WHERE id=$1 AND read_at IS NOT NULL`, id); got != "1" {
		t.Fatalf("owner could not mark read: %s", got)
	}
	for _, query := range []string{
		`UPDATE registry.member_notifications SET title='Forged' WHERE user_id=$1 RETURNING id::text`,
		`SELECT registry.notify_member($1,'fake','dues','Forged','','/member')::text`,
		`UPDATE workspace.membership_history SET reason='Rewritten' WHERE user_id=$1 RETURNING id::text`,
		`UPDATE workspace.memberships SET is_primary=false,member_status='left' WHERE user_id=$1 RETURNING id::text`,
		`INSERT INTO registry.member_profiles(user_id,phone) VALUES($1,'fake') RETURNING user_id::text`,
	} {
		_, err := f.call(t.Context(), f.source, f.admin, query, f.member)
		var pg *pgconn.PgError
		if !errors.As(err, &pg) || pg.Code != "42501" {
			t.Fatalf("privileged write accepted or wrong error: %s: %v", query, err)
		}
	}
}

func TestPrimaryMembershipLifecyclePreservesIndependentStaffAccess(t *testing.T) {
	f := newTransferFixture(t)
	set := func(status string) {
		t.Helper()
		if _, err := f.call(t.Context(), f.source, f.admin, `SELECT registry.set_member_status($1,$2,$3,'Documented decision')::text`, f.source, f.member, status); err != nil {
			t.Fatal(err)
		}
	}
	check := func(primary, access bool, state string) {
		t.Helper()
		var p, a bool
		var s string
		if err := f.pool.QueryRow(t.Context(), `SELECT is_primary,active,member_status FROM workspace.memberships WHERE tenant_id=$1 AND user_id=$2`, f.source, f.member).Scan(&p, &a, &s); err != nil {
			t.Fatal(err)
		}
		if p != primary || a != access || s != state {
			t.Fatalf("primary=%v access=%v state=%s", p, a, s)
		}
	}
	set("suspended")
	check(true, false, "suspended")
	_, err := f.call(t.Context(), f.destination, f.admin, `SELECT registry.guard_branch_admission($1,$2)::text`, f.destination, f.member)
	assertTransferError(t, err, "55000", "branch_transfer_required")
	set("active")
	check(true, true, "active")
	f.exec(t, `INSERT INTO workspace.membership_roles(membership_id,role_id)
		SELECT m.id,r.id FROM workspace.memberships m JOIN workspace.roles r ON r.tenant_id=m.tenant_id
		WHERE m.tenant_id=$1 AND m.user_id=$2 AND r.code='manager' ON CONFLICT DO NOTHING`, f.source, f.member)
	set("suspended")
	check(true, true, "suspended")
	set("active")
	set("left")
	check(false, true, "left")
	// A retry neither appends history nor sends a duplicate notification.
	set("left")
	var histories, notifications int
	err = f.pool.QueryRow(t.Context(), `SELECT
		(SELECT count(*) FROM workspace.membership_history WHERE user_id=$1),
		(SELECT count(*) FROM registry.member_notifications WHERE user_id=$1)`, f.member).Scan(&histories, &notifications)
	if err != nil || histories != 6 || notifications != histories {
		t.Fatalf("history=%d notifications=%d error=%v", histories, notifications, err)
	}
	// The member may turn off future in-app notifications without losing history.
	f.exec(t, `INSERT INTO registry.member_profiles(user_id,notifications_enabled) VALUES($1,false)`, f.member)
	set("active")
	var after int
	if err := f.pool.QueryRow(t.Context(), `SELECT count(*) FROM registry.member_notifications WHERE user_id=$1`, f.member).Scan(&after); err != nil || after != notifications {
		t.Fatalf("notification preference ignored: %d %v", after, err)
	}
}

func TestPrimaryMembershipCannotBeAssignedAcrossBranches(t *testing.T) {
	f := newTransferFixture(t)
	f.exec(t, `INSERT INTO workspace.memberships(tenant_id,user_id) VALUES($1,$2)`, f.destination, f.member)
	_, err := f.call(t.Context(), f.destination, f.admin, `SELECT registry.set_member_status($1,$2,'active','Confirm primary')::text`, f.destination, f.member)
	assertTransferError(t, err, "55000", "branch_transfer_required")
	// Even a direct owner write cannot produce two primaries.
	_, err = f.pool.Exec(context.Background(), `UPDATE workspace.memberships SET is_primary=true,member_status='active' WHERE tenant_id=$1 AND user_id=$2`, f.destination, f.member)
	var pg *pgconn.PgError
	if !errors.As(err, &pg) || pg.Code != "23505" {
		t.Fatalf("duplicate primary: %v", err)
	}
}

func TestTransferPreservesExistingWorkRolesInBothBranches(t *testing.T) {
	f := newTransferFixture(t)
	f.exec(t, `INSERT INTO workspace.memberships(tenant_id,user_id) VALUES($1,$2)`, f.destination, f.member)
	for _, tenant := range []string{f.source, f.destination} {
		f.exec(t, `INSERT INTO workspace.membership_roles(membership_id,role_id)
			SELECT m.id,r.id FROM workspace.memberships m JOIN workspace.roles r ON r.tenant_id=m.tenant_id
			WHERE m.tenant_id=$1 AND m.user_id=$2 AND r.code='manager' ON CONFLICT DO NOTHING`, tenant, f.member)
	}
	id, err := f.request(t.Context(), f.destination)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.call(t.Context(), f.destination, f.admin, `SELECT registry.decide_membership_transfer($1,true)::text`, id); err != nil {
		t.Fatal(err)
	}
	for _, tenant := range []string{f.source, f.destination} {
		var active, primary, manager bool
		err := f.pool.QueryRow(t.Context(), `SELECT m.active,m.is_primary,EXISTS (
			SELECT 1 FROM workspace.membership_roles mr JOIN workspace.roles r ON r.id=mr.role_id
			WHERE mr.membership_id=m.id AND r.code='manager' AND r.active)
			FROM workspace.memberships m WHERE tenant_id=$1 AND user_id=$2`, tenant, f.member).Scan(&active, &primary, &manager)
		if err != nil || !active || primary != (tenant == f.destination) || !manager {
			t.Fatalf("branch=%s access=%v primary=%v manager=%v error=%v", tenant, active, primary, manager, err)
		}
	}
}

func TestReadmissionDoesNotRestoreInactiveStaffPrivileges(t *testing.T) {
	for _, activeWork := range []bool{false, true} {
		t.Run(map[bool]string{false: "revoked_work", true: "active_work"}[activeWork], func(t *testing.T) {
			f := newTransferFixture(t)
			if _, err := f.call(t.Context(), f.source, f.admin, `SELECT registry.set_member_status($1,$2,'left','End primary membership')::text`, f.source, f.member); err != nil {
				t.Fatal(err)
			}
			f.exec(t, `INSERT INTO workspace.membership_roles(membership_id,role_id)
				SELECT m.id,r.id FROM workspace.memberships m JOIN workspace.roles r ON r.tenant_id=m.tenant_id
				WHERE m.tenant_id=$1 AND m.user_id=$2 AND r.code='manager' ON CONFLICT DO NOTHING`, f.source, f.member)
			f.exec(t, `UPDATE workspace.memberships SET active=$3 WHERE tenant_id=$1 AND user_id=$2`, f.source, f.member, activeWork)
			request, err := f.call(t.Context(), "", f.member, `SELECT request_id::text FROM registry.request_to_join($1,$2,'Apply again')`, f.member, "transfer-"+f.source)
			if err != nil {
				t.Fatal(err)
			}
			_, err = f.call(t.Context(), f.source, f.admin, `UPDATE workspace.join_requests SET status='ACCEPTED',decided_by=$2,decided_at=now() WHERE id=$1 RETURNING id::text`, request, f.admin)
			if err != nil {
				t.Fatal(err)
			}
			var active, primary, staff bool
			err = f.pool.QueryRow(t.Context(), `SELECT active,is_primary,EXISTS (
				SELECT 1 FROM workspace.membership_roles mr JOIN workspace.roles r ON r.id=mr.role_id
				WHERE mr.membership_id=m.id AND r.code='manager')
				FROM workspace.memberships m WHERE tenant_id=$1 AND user_id=$2`, f.source, f.member).Scan(&active, &primary, &staff)
			if err != nil || !active || !primary || staff != activeWork {
				t.Fatalf("active=%v primary=%v staff=%v error=%v", active, primary, staff, err)
			}
		})
	}
}
