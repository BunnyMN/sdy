package migrations_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
)

func TestTransferRequesterCannotDecideTheirOwnRequest(t *testing.T) {
	for _, accept := range []bool{true, false} {
		name := "decline"
		if accept {
			name = "accept"
		}
		t.Run(name, func(t *testing.T) {
			f := newTransferFixture(t)
			id, err := f.request(t.Context(), f.destination)
			if err != nil {
				t.Fatal(err)
			}
			// A staff appointment after submission must not turn the requester
			// into the reviewer of their own pending transfer.
			f.exec(t, `INSERT INTO workspace.memberships(tenant_id,user_id) VALUES($1,$2)`, f.destination, f.member)
			f.exec(t, `INSERT INTO workspace.membership_roles(membership_id,role_id)
				SELECT m.id,r.id FROM workspace.memberships m JOIN workspace.roles r ON r.tenant_id=m.tenant_id
				WHERE m.tenant_id=$1 AND m.user_id=$2 AND r.code='admin'`, f.destination, f.member)
			_, err = f.call(t.Context(), f.destination, f.member, `SELECT registry.decide_membership_transfer($1,$2)::text`, id, accept)
			assertTransferError(t, err, "42501", "transfer_self_decision_forbidden")
			var pending, sourceActive bool
			var decisions int
			err = f.pool.QueryRow(t.Context(), `SELECT
				(SELECT status='PENDING' AND decided_at IS NULL FROM workspace.membership_transfers WHERE id=$1),
				(SELECT active FROM workspace.memberships WHERE tenant_id=$2 AND user_id=$3),
				(SELECT count(*) FROM workspace.audit_events WHERE details->>'request_id'=$1::text)`, id, f.source, f.member).
				Scan(&pending, &sourceActive, &decisions)
			if err != nil || !pending || !sourceActive || decisions != 0 {
				t.Fatalf("self decision changed state: pending=%v source=%v decisions=%d error=%v", pending, sourceActive, decisions, err)
			}
		})
	}
}

func TestTransferHistoryUsesIdentityNotMutableContactDetails(t *testing.T) {
	f := newTransferFixture(t)
	id, err := f.request(t.Context(), f.destination)
	if err != nil {
		t.Fatal(err)
	}
	originalEmail := f.member + "@transfer.test"
	f.exec(t, `UPDATE registry.users SET name='Renamed member',email=$2 WHERE id=$1`, f.member, f.member+"@renamed.test")
	// Reusing a former email address creates a different person. It must not
	// attach that account to historical requests belonging to the old UUID.
	replacement := uuid.NewString()
	f.exec(t, `INSERT INTO registry.users(id,email,name,password_hash) VALUES($1,$2,'Another person','unused')`, replacement, originalEmail)
	t.Cleanup(func() {
		if _, err := f.pool.Exec(context.Background(), `DELETE FROM registry.users WHERE id=$1`, replacement); err != nil {
			t.Errorf("remove replacement account: %v", err)
		}
	})
	var user, name, email string
	err = f.pool.QueryRow(t.Context(), `SELECT user_id::text,requester_name,requester_email FROM workspace.membership_transfers WHERE id=$1`, id).Scan(&user, &name, &email)
	if err != nil || user != f.member || name != "Transfer member" || email != originalEmail {
		t.Fatalf("request snapshot changed: user=%s name=%s email=%s error=%v", user, name, email, err)
	}
	for _, caller := range []string{f.member, replacement} {
		raw, err := f.call(t.Context(), "", caller, `SELECT COALESCE(jsonb_agg(x),'[]'::jsonb)::text FROM registry.my_membership_transfers() x`)
		if err != nil {
			t.Fatal(err)
		}
		var history []struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal([]byte(raw), &history); err != nil {
			t.Fatal(err)
		}
		if caller == f.member && (len(history) != 1 || history[0].ID != id) {
			t.Fatalf("original person lost their history: %s", raw)
		}
		if caller == replacement && len(history) != 0 {
			t.Fatalf("replacement account inherited history: %s", raw)
		}
	}
	if _, err := f.call(t.Context(), f.destination, f.admin, `SELECT registry.decide_membership_transfer($1,true)::text`, id); err != nil {
		t.Fatal(err)
	}
	var auditedUser string
	if err := f.pool.QueryRow(t.Context(), `SELECT details->>'user_id' FROM workspace.audit_events WHERE action='membership.transfer.decided' AND details->>'request_id'=$1`, id).Scan(&auditedUser); err != nil || auditedUser != f.member {
		t.Fatalf("decision attributed to %q, want %q: %v", auditedUser, f.member, err)
	}
}

func TestRecreatedMembershipCannotUseAnOldTransferRequest(t *testing.T) {
	f := newTransferFixture(t)
	id, err := f.request(t.Context(), f.destination)
	if err != nil {
		t.Fatal(err)
	}
	f.exec(t, `DELETE FROM workspace.memberships WHERE tenant_id=$1 AND user_id=$2`, f.source, f.member)
	f.exec(t, `INSERT INTO workspace.memberships(tenant_id,user_id) VALUES($1,$2)`, f.source, f.member)
	_, err = f.call(t.Context(), f.destination, f.admin, `SELECT registry.decide_membership_transfer($1,true)::text`, id)
	assertTransferError(t, err, "55000", "transfer_source_changed")
	f.assertPending(t, id)
}
