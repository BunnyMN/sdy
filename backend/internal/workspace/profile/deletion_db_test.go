/*
 * Gerege Nexus
 * Copyright (c) 2026 Gerege Systems Development Team, Gerege Nomadica Foundation
 * Distributed under the Apache 2.0 License.
 *
 * Бүртгэл устгах хүсэлтийн бүтэн амьдрал: хүсэлт → (дахин нэвтэрвэл) цуцлалт
 * → (30 хоногийн дараа) нэргүйжүүлэлт. Migration 00115.
 *
 *	AUTH_TEST_DATABASE_URL=postgres://... go test ./internal/workspace/profile/
 */

package profile

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gerege-systems/open-gerege-nexus/backend/internal/workspace/auth"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type deletionFixture struct {
	pool   *pgxpool.Pool
	h      *Handlers
	store  *auth.SessionStore
	userID string
	branch string
	token  string
}

func newDeletionFixture(t *testing.T) *deletionFixture {
	t.Helper()
	dsn := os.Getenv("AUTH_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set AUTH_TEST_DATABASE_URL to a migrated test database to run the account deletion tests")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(pool.Close)
	suffix := strings.ReplaceAll(uuid.NewString(), "-", "")[:12]

	f := &deletionFixture{pool: pool, store: auth.NewSessionStore(pool, time.Hour)}
	f.h = New(pool, f.store, nil)
	if err := pool.QueryRow(ctx,
		`INSERT INTO registry.tenants (name, slug, membership_branch) VALUES ($1,$1,true) RETURNING id::text`,
		"deltest-"+suffix).Scan(&f.branch); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx,
		`INSERT INTO registry.users (email, password_hash, name, phone, ge_id)
		 VALUES ($1,'x','Батболд Дорж','99112233',$2) RETURNING id::text`,
		"deltest-"+suffix+"@example.mn", int64(8_000_000_000)+int64(uuid.New().ID()%1_000_000)).Scan(&f.userID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM registry.users WHERE id=$1`, f.userID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM registry.tenants WHERE id=$1`, f.branch)
	})
	for _, statement := range []string{
		`INSERT INTO workspace.memberships (tenant_id, user_id, is_primary, member_status, member_since, member_reason)
		 VALUES ($2,$1,true,'active',now(),'test admission')`,
		`INSERT INTO registry.member_profiles (user_id, phone, residence) VALUES ($1,'99112233','Улаанбаатар, СБД')`,
		`INSERT INTO registry.user_eid_identities (user_id, person_etsi, reg_number, given_name, surname)
		 VALUES ($1::uuid,'PNOMN-'||$1::text,'УБ99112233','Батболд','Дорж')`,
	} {
		args := []any{f.userID}
		if strings.Contains(statement, "$2") {
			args = append(args, f.branch)
		}
		if _, err := pool.Exec(ctx, statement, args...); err != nil {
			t.Fatalf("%s: %v", statement, err)
		}
	}
	f.token, _, err = f.store.Create(ctx, f.userID, f.branch, "eid-app", "test", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	return f
}

func (f *deletionFixture) request(t *testing.T, method, body string) *httptest.ResponseRecorder {
	t.Helper()
	claims, err := f.store.Resolve(context.Background(), f.token)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	r := httptest.NewRequest(method, "/api/v1/profile/deletion-request", strings.NewReader(body))
	r = r.WithContext(auth.WithUserContext(r.Context(), claims))
	w := httptest.NewRecorder()
	if method == http.MethodPost {
		f.h.HandleRequestDeletion(w, r)
	} else {
		f.h.HandleDeletionStatus(w, r)
	}
	return w
}

func (f *deletionFixture) membership(t *testing.T) (status string, primary, active bool, reason string) {
	t.Helper()
	if err := f.pool.QueryRow(context.Background(),
		`SELECT member_status, is_primary, active, member_reason FROM workspace.memberships
		  WHERE user_id=$1 AND tenant_id=$2`, f.userID, f.branch).Scan(&status, &primary, &active, &reason); err != nil {
		t.Fatal(err)
	}
	return
}

// The request does what it says in one go: the session that asked is dead,
// the membership is ended with the reason on record, and asking twice is one
// request.
func TestADeletionRequestEndsSessionsAndMemberships(t *testing.T) {
	f := newDeletionFixture(t)
	ctx := context.Background()

	w := f.request(t, http.MethodPost, `{"reason":"Апп ашиглахаа больсон"}`)
	if w.Code != http.StatusAccepted {
		t.Fatalf("request: %d %s", w.Code, w.Body.String())
	}
	var answer DeletionRequest
	if err := json.Unmarshal(w.Body.Bytes(), &answer); err != nil {
		t.Fatal(err)
	}
	if answer.Status != "pending" || answer.ScheduledFor == nil || answer.GraceDays != 30 {
		t.Fatalf("answer=%+v", answer)
	}
	if d := answer.ScheduledFor.Sub(*answer.RequestedAt); d != DeletionGrace {
		t.Fatalf("scheduled %s after the request, want %s", d, DeletionGrace)
	}
	if cleared := w.Result().Cookies(); len(cleared) != 1 || cleared[0].MaxAge >= 0 {
		t.Fatalf("the session cookie was not cleared: %v", cleared)
	}

	if _, err := f.store.Resolve(ctx, f.token); err == nil {
		t.Fatal("the session that asked for deletion still works")
	}
	status, primary, active, reason := f.membership(t)
	if status != "left" || primary || active || reason != "account deletion" {
		t.Fatalf("membership after request: status=%s primary=%v active=%v reason=%q", status, primary, active, reason)
	}
	var history int
	if err := f.pool.QueryRow(ctx,
		`SELECT count(*) FROM workspace.membership_history WHERE user_id=$1 AND to_status='left' AND reason='account deletion'`,
		f.userID).Scan(&history); err != nil || history != 1 {
		t.Fatalf("membership history rows=%d err=%v, want 1", history, err)
	}

	again, err := f.h.RequestDeletion(ctx, f.userID, "")
	if err != nil {
		t.Fatal(err)
	}
	if again.ID != answer.ID {
		t.Fatalf("a second request opened another row: %s vs %s", again.ID, answer.ID)
	}
}

// Signing in inside the grace period is changing your mind: the request is
// cancelled and the membership it ended comes back as it was.
func TestSigningInAgainCancelsTheRequest(t *testing.T) {
	f := newDeletionFixture(t)
	ctx := context.Background()
	if _, err := f.h.RequestDeletion(ctx, f.userID, ""); err != nil {
		t.Fatal(err)
	}

	tenantID, err := auth.New(auth.Deps{DB: f.pool}).FirstTenantFor(ctx, f.userID)
	if err != nil {
		t.Fatalf("sign-in: %v", err)
	}
	if tenantID != f.branch {
		t.Fatalf("the sign-in opened %s, want the restored branch %s", tenantID, f.branch)
	}
	status, primary, active, _ := f.membership(t)
	if status != "active" || !primary || !active {
		t.Fatalf("membership after cancel: status=%s primary=%v active=%v", status, primary, active)
	}

	f.token, _, err = f.store.Create(ctx, f.userID, tenantID, "eid-app", "test", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	w := f.request(t, http.MethodGet, "")
	var answer DeletionRequest
	if err := json.Unmarshal(w.Body.Bytes(), &answer); err != nil {
		t.Fatal(err)
	}
	if answer.Status != "cancelled" || answer.ProcessedAt == nil || answer.ScheduledFor != nil {
		t.Fatalf("status after sign-in: %+v", answer)
	}
}

// After the grace period the person's details go and their records stay.
func TestAnonymisationWaitsForTheGracePeriodAndKeepsRecords(t *testing.T) {
	f := newDeletionFixture(t)
	ctx := context.Background()
	req, err := f.h.RequestDeletion(ctx, f.userID, "")
	if err != nil {
		t.Fatal(err)
	}

	// Not yet due: nothing of this person's is touched.
	if _, err := f.h.AnonymiseDueAccounts(ctx, DeletionGrace); err != nil {
		t.Fatal(err)
	}
	var name string
	if err := f.pool.QueryRow(ctx, `SELECT name FROM registry.users WHERE id=$1`, f.userID).Scan(&name); err != nil {
		t.Fatal(err)
	}
	if name != "Батболд Дорж" {
		t.Fatalf("a request inside its grace period was anonymised: name=%q", name)
	}

	if _, err := f.pool.Exec(ctx,
		`UPDATE registry.account_deletion_requests SET requested_at = now() - interval '31 days' WHERE id=$1`, req.ID); err != nil {
		t.Fatal(err)
	}
	done, err := f.h.AnonymiseDueAccounts(ctx, DeletionGrace)
	if err != nil || done < 1 {
		t.Fatalf("anonymised=%d err=%v", done, err)
	}

	var email, phone string
	var geID *int64
	var active bool
	if err := f.pool.QueryRow(ctx,
		`SELECT name, email, phone, ge_id, active FROM registry.users WHERE id=$1`, f.userID).
		Scan(&name, &email, &phone, &geID, &active); err != nil {
		t.Fatalf("the users row is gone; records hang off it: %v", err)
	}
	if name != "Устгагдсан хэрэглэгч" || !strings.HasPrefix(email, "deleted+") || phone != "" || geID != nil || active {
		t.Fatalf("users row not anonymised: name=%q email=%q phone=%q ge_id=%v active=%v", name, email, phone, geID, active)
	}
	var residence string
	if err := f.pool.QueryRow(ctx,
		`SELECT phone, residence FROM registry.member_profiles WHERE user_id=$1`, f.userID).Scan(&phone, &residence); err != nil {
		t.Fatal(err)
	}
	if phone != "" || residence != "" {
		t.Fatalf("member profile kept phone=%q residence=%q", phone, residence)
	}
	var identities, memberships int
	if err := f.pool.QueryRow(ctx,
		`SELECT (SELECT count(*) FROM registry.user_eid_identities WHERE user_id=$1),
		        (SELECT count(*) FROM workspace.memberships WHERE user_id=$1 AND tenant_id=$2)`,
		f.userID, f.branch).Scan(&identities, &memberships); err != nil {
		t.Fatal(err)
	}
	if identities != 0 {
		t.Fatal("the eID link survived anonymisation")
	}
	if memberships != 1 {
		t.Fatal("the membership record was removed; it is the organisation's, and should stay")
	}

	status, err := f.h.DeletionStatus(ctx, f.userID)
	if err != nil || status.Status != "completed" {
		t.Fatalf("status=%+v err=%v", status, err)
	}
}
