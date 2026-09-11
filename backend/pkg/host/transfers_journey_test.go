package host

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Continues the real admission, attendance, points and paid-dues journey.
func assertSDYTransfers(t *testing.T, pool *pgxpool.Pool, source, destination, admin, manager, member string, do func(string, string, string, string, int) *httptest.ResponseRecorder) {
	t.Helper()
	ctx := context.Background()
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec(`UPDATE registry.tenants SET membership_branch=true WHERE id=$1`, destination)
	// Existing inactive staff grants must never come back through a transfer.
	exec(`INSERT INTO workspace.memberships(tenant_id,user_id,active) VALUES($1,$2,false)`, destination, member)
	exec(`INSERT INTO workspace.membership_roles(membership_id,role_id) SELECT m.id,r.id FROM workspace.memberships m JOIN workspace.roles r ON r.tenant_id=m.tenant_id AND r.code='admin' WHERE m.tenant_id=$1 AND m.user_id=$2 ON CONFLICT DO NOTHING`, destination, member)
	history := func() string {
		t.Helper()
		var result string
		err := pool.QueryRow(ctx, `SELECT jsonb_build_array(
   (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM workspace.events_attendance x WHERE tenant_id=$1 AND user_id=$2),
   (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM workspace.events_point_entries x WHERE tenant_id=$1 AND user_id=$2),
   (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM workspace.membership_dues_charges x WHERE tenant_id=$1 AND user_id=$2),
   (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM workspace.membership_dues_payments x WHERE tenant_id=$1 AND user_id=$2),
   (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM workspace.membership_dues_entries x WHERE tenant_id=$1 AND user_id=$2))::text`, source, member).Scan(&result)
		if err != nil {
			t.Fatal(err)
		}
		return result
	}
	before := history()
	// The manager belongs to the destination as well, with no admin role.
	exec(`INSERT INTO workspace.memberships(tenant_id,user_id) VALUES($1,$2)`, destination, manager)
	exec(`WITH role AS (INSERT INTO workspace.roles(tenant_id,code,name) VALUES($1,'manager','Manager') ON CONFLICT(tenant_id,code) DO UPDATE SET active=true RETURNING id) INSERT INTO workspace.membership_roles(membership_id,role_id) SELECT m.id,role.id FROM workspace.memberships m,role WHERE m.tenant_id=$1 AND m.user_id=$2 ON CONFLICT DO NOTHING`, destination, manager)
	do(manager, "POST", "/api/v1/auth/switch-tenant", `{"tenant_id":"`+destination+`"}`, 200)
	membershipState := func(wantSource, wantDestination bool) {
		t.Helper()
		var a, b bool
		if err := pool.QueryRow(ctx, `SELECT (SELECT active FROM workspace.memberships WHERE tenant_id=$1 AND user_id=$3), (SELECT active FROM workspace.memberships WHERE tenant_id=$2 AND user_id=$3)`, source, destination, member).Scan(&a, &b); err != nil {
			t.Fatal(err)
		}
		if a != wantSource || b != wantDestination {
			t.Fatalf("membership state %v %v", a, b)
		}
	}
	ask := func() string {
		t.Helper()
		w := do(member, "POST", "/api/v1/me/transfers", `{"from_tenant_id":"`+source+`","slug":"journey-`+destination+`","message":"Оршин суух хаяг өөрчлөгдсөн"}`, 200)
		var response struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		return response.ID
	}
	for _, path := range []string{"/me/branch-requests", "/me/join-requests"} {
		w := do(member, "POST", "/api/v1"+path, `{"slug":"journey-`+destination+`"}`, 409)
		if !strings.Contains(w.Body.String(), "branch_transfer_required") {
			t.Fatal(w.Body.String())
		}
	}
	id := ask()
	if ask() != id {
		t.Fatal("retry created a second pending transfer")
	}
	membershipState(true, false)
	if !strings.Contains(do(member, "GET", "/api/v1/me/transfers", "", 200).Body.String(), id) {
		t.Fatal("own history missing")
	}
	if strings.Contains(do(manager, "GET", "/api/v1/me/transfers", "", 200).Body.String(), id) {
		t.Fatal("another person's history exposed")
	}
	do(manager, "GET", "/api/v1/membership/transfers", "", 403)
	do(manager, "POST", "/api/v1/membership/transfers/"+id, `{"accept":true}`, 403)
	do(member, "POST", "/api/v1/membership/transfers/"+id, `{"accept":true}`, 403)
	// Even direct SQL under a tenant role cannot bypass the HTTP admin gate.
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	_, err = tx.Exec(ctx, `SET LOCAL ROLE gerege_nexus_tenant`)
	if err != nil {
		t.Fatal(err)
	}
	_, err = tx.Exec(ctx, `SELECT set_config('app.current_tenant',$1,true),set_config('app.current_user',$2,true)`, destination, manager)
	if err != nil {
		t.Fatal(err)
	}
	var visible int
	if err = tx.QueryRow(ctx, `SELECT count(*) FROM workspace.membership_transfers`).Scan(&visible); err != nil || visible != 0 {
		t.Fatalf("manager RLS queue: %d %v", visible, err)
	}
	_, err = tx.Exec(ctx, `SELECT registry.decide_membership_transfer($1,true)`, id)
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "42501" {
		t.Fatalf("manager SQL decision: %v", err)
	}
	_ = tx.Rollback(ctx)
	do(admin, "POST", "/api/v1/auth/switch-tenant", `{"tenant_id":"`+source+`"}`, 200)
	do(admin, "POST", "/api/v1/membership/transfers/"+id, `{"accept":true}`, 404)
	do(admin, "POST", "/api/v1/auth/switch-tenant", `{"tenant_id":"`+destination+`"}`, 200)
	if !strings.Contains(do(admin, "GET", "/api/v1/membership/transfers", "", 200).Body.String(), id) {
		t.Fatal("destination admin cannot see requester")
	}
	do(admin, "POST", "/api/v1/membership/transfers/"+id, `{}`, 400)
	do(admin, "POST", "/api/v1/membership/transfers/"+id, `{"accept":false}`, 200)
	membershipState(true, false)
	id = ask()
	do(member, "POST", "/api/v1/me/transfers/"+id+"/cancel", `{}`, 200)
	do(admin, "POST", "/api/v1/membership/transfers/"+id, `{"accept":true}`, 409)
	membershipState(true, false)
	id = ask()
	do(admin, "POST", "/api/v1/membership/transfers/"+id, `{"accept":true}`, 200)
	membershipState(false, true)
	do(admin, "POST", "/api/v1/membership/transfers/"+id, `{"accept":true}`, 409)
	if history() != before {
		t.Fatal("transfer changed attendance, points or paid dues history")
	}
	var roles string
	if err := pool.QueryRow(ctx, `SELECT string_agg(r.code,',' ORDER BY r.code) FROM workspace.memberships m JOIN workspace.membership_roles mr ON mr.membership_id=m.id JOIN workspace.roles r ON r.id=mr.role_id WHERE m.tenant_id=$1 AND m.user_id=$2`, destination, member).Scan(&roles); err != nil {
		t.Fatal(err)
	}
	if roles != "user" {
		t.Fatalf("transfer restored staff privileges: %s", roles)
	}
	var decisions int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM workspace.audit_events WHERE action='membership.transfer.decided' AND details->>'request_id'=$1`, id).Scan(&decisions); err != nil {
		t.Fatal(err)
	}
	if decisions != 1 {
		t.Fatalf("decision audit count %d", decisions)
	}
	do(member, "GET", "/api/v1/auth/me", "", 401)
	do(member, "POST", "/api/v1/auth/login", `{"email":"`+member+`@example.test","password":"Journey-test-password-1!"}`, 200)
	me := do(member, "GET", "/api/v1/auth/me", "", 200)
	if !strings.Contains(me.Body.String(), destination) || strings.Contains(me.Body.String(), `"is_admin":true`) {
		t.Fatal(me.Body.String())
	}
	if !strings.Contains(do(member, "GET", "/api/v1/me/transfers", "", 200).Body.String(), "ACCEPTED") {
		t.Fatal("history lost after transfer")
	}
	// An admission queued before joining elsewhere also needs transfer approval.
	var queued string
	if err := pool.QueryRow(ctx, `INSERT INTO workspace.join_requests(tenant_id,user_id,message) VALUES($1,$2,'Old admission') RETURNING id::text`, source, member).Scan(&queued); err != nil {
		t.Fatal(err)
	}
	do(manager, "POST", "/api/v1/auth/switch-tenant", `{"tenant_id":"`+source+`"}`, 200)
	do(manager, "POST", "/api/v1/membership/join-requests/"+queued, `{"accept":true}`, 409)
	// Accept and cancel racing must produce exactly one final decision.
	w := do(member, "POST", "/api/v1/me/transfers", `{"from_tenant_id":"`+destination+`","slug":"journey-`+source+`","message":"Return"}`, 200)
	var back struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &back); err != nil {
		t.Fatal(err)
	}
	// The only remaining administrator cannot leave an organisation unowned.
	do(admin, "POST", "/api/v1/auth/switch-tenant", `{"tenant_id":"`+source+`"}`, 200)
	exec(`INSERT INTO workspace.membership_roles(membership_id,role_id) SELECT m.id,r.id FROM workspace.memberships m JOIN workspace.roles r ON r.tenant_id=m.tenant_id AND r.code='admin' WHERE m.tenant_id=$1 AND m.user_id=$2`, destination, member)
	exec(`UPDATE workspace.memberships SET active=false WHERE tenant_id=$1 AND user_id=$2`, destination, admin)
	refused := do(admin, "POST", "/api/v1/membership/transfers/"+back.ID, `{"accept":true}`, 409)
	if !strings.Contains(refused.Body.String(), "transfer_last_admin") {
		t.Fatal(refused.Body.String())
	}
	exec(`UPDATE workspace.memberships SET active=true WHERE tenant_id=$1 AND user_id=$2`, destination, admin)
	exec(`DELETE FROM workspace.membership_roles mr USING workspace.memberships m,workspace.roles r WHERE mr.membership_id=m.id AND mr.role_id=r.id AND m.tenant_id=$1 AND m.user_id=$2 AND r.code='admin'`, destination, member)
	start := make(chan struct{})
	results := make(chan error, 2)
	for _, accept := range []bool{true, false} {
		go func(accept bool) {
			<-start
			tx, err := pool.Begin(ctx)
			if err != nil {
				results <- err
				return
			}
			defer func() { _ = tx.Rollback(ctx) }()
			_, err = tx.Exec(ctx, `SET LOCAL ROLE gerege_nexus_tenant`)
			user := member
			if accept {
				user = admin
			}
			if err == nil {
				_, err = tx.Exec(ctx, `SELECT set_config('app.current_tenant',$1,true),set_config('app.current_user',$2,true)`, source, user)
			}
			query := `SELECT registry.cancel_membership_transfer($1)`
			if accept {
				query = `SELECT registry.decide_membership_transfer($1,true)`
			}
			if err == nil {
				_, err = tx.Exec(ctx, query, back.ID)
			}
			if err == nil {
				err = tx.Commit(ctx)
			}
			results <- err
		}(accept)
	}
	close(start)
	successes := 0
	for range 2 {
		err := <-results
		if err == nil {
			successes++
			continue
		}
		var pg *pgconn.PgError
		if !errors.As(err, &pg) || pg.Code != "55000" {
			t.Fatalf("concurrent decision: %v", err)
		}
	}
	if successes != 1 {
		t.Fatalf("concurrent decision successes %d", successes)
	}
	var active int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM workspace.memberships WHERE user_id=$1 AND active AND tenant_id=ANY($2::uuid[])`, member, []string{source, destination}).Scan(&active); err != nil || active != 1 {
		t.Fatalf("concurrent membership result %d %v", active, err)
	}
	if history() != before {
		t.Fatal("concurrent decision changed financial or attendance history")
	}
}
