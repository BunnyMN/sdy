package membership

import (
	"context"
	"encoding/json"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"

	"github.com/gerege-systems/open-gerege-nexus/backend/internal/kernel/dbguard"
	"github.com/gerege-systems/open-gerege-nexus/backend/pkg/nexus"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type testPermissions struct{}

func (testPermissions) GetUserPermissions(context.Context, string, string) (map[string]bool, error) {
	return map[string]bool{PermRead: true}, nil
}

type duesFixture struct {
	pool          *pgxpool.Pool
	router        chi.Router
	tenant, other string
	users         []string
	application   string
}

// Run against a migrated, disposable database. The guard is the same one the
// host uses, so assertions exercise PostgreSQL RLS, not just tenant WHEREs.
func newDuesFixture(t *testing.T) *duesFixture {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to a migrated test database")
	}
	ctx := context.Background()
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	cfg.MaxConns = 32
	guard := &dbguard.Guard{}
	guard.Install(cfg)
	application := "dues-test-" + uuid.NewString()
	cfg.ConnConfig.RuntimeParams["application_name"] = application
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if err := guard.Probe(ctx, pool); err != nil {
		t.Fatal(err)
	}
	if !guard.Enabled() {
		t.Fatal("RLS guard must be enabled")
	}
	migrations, err := fs.Glob(schema, "migrations/*.sql")
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range migrations {
		sql, err := schema.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, strings.Split(string(sql), "-- +goose Down")[0]); err != nil {
			t.Fatal(err)
		}
	}
	f := &duesFixture{pool: pool, tenant: uuid.NewString(), other: uuid.NewString(), application: application}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM registry.tenants WHERE id = ANY($1::uuid[])`, []string{f.tenant, f.other})
		_, _ = pool.Exec(context.Background(), `DELETE FROM registry.users WHERE id = ANY($1::uuid[])`, f.users)
	})
	for _, id := range []string{f.tenant, f.other} {
		if _, err := pool.Exec(ctx, `INSERT INTO registry.tenants (id, slug, name) VALUES ($1, $2, 'Events test')`, id, id); err != nil {
			t.Fatal(err)
		}
	}
	for range 3 {
		id := uuid.NewString()
		f.users = append(f.users, id)
		if _, err := pool.Exec(ctx, `INSERT INTO registry.users (id, email, name, password_hash) VALUES ($1, $2, 'Test member', 'x')`, id, id+"@example.test"); err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, `INSERT INTO workspace.memberships (tenant_id, user_id, is_primary, member_status, member_since) VALUES ($1, $2, true, 'active', now()), ($3, $2, false, 'none', NULL)`, f.tenant, id, f.other); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(ctx, `INSERT INTO workspace.membership_roles(membership_id,role_id)
SELECT m.id,r.id FROM workspace.memberships m JOIN workspace.roles r ON r.tenant_id=m.tenant_id AND r.code='admin'
WHERE m.user_id=$1 ON CONFLICT DO NOTHING`, f.users[0]); err != nil {
		t.Fatal(err)
	}
	m := &Module{db: pool, permissions: testPermissions{}}
	f.router = chi.NewRouter()
	m.RegisterRoutes(f.router, func(next http.Handler) http.Handler { return next })
	return f
}

func (f *duesFixture) request(method, path, body, tenant, user string, admin bool) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, "/api/v1/dues"+path, strings.NewReader(body))
	ctx := nexus.WithWorkspaceID(r.Context(), tenant)
	if user != "" {
		ctx = nexus.WithUser(ctx, nexus.UserClaims{WorkspaceID: tenant, UserID: user, IsAdmin: admin})
	}
	w := httptest.NewRecorder()
	f.router.ServeHTTP(w, r.WithContext(ctx))
	return w
}

func status(t *testing.T, w *httptest.ResponseRecorder, want int) {
	t.Helper()
	if w.Code != want {
		t.Fatalf("status = %d, want %d: %s", w.Code, want, w.Body.String())
	}
}

func (f *duesFixture) prepare(t *testing.T) []Charge {
	t.Helper()
	status(t, f.request("PUT", "/settings", `{"enabled":true,"monthly_amount":10000,"due_day":15,"bank_name":"Test bank","account_number":"TEST-ONLY","account_holder":"Test branch"}`, f.tenant, f.users[0], true), 200)
	w := f.request("POST", "/charges", `{"period":"2026-09"}`, f.tenant, f.users[0], true)
	status(t, w, 200)
	if !strings.Contains(w.Body.String(), `"created":3`) {
		t.Fatal(w.Body.String())
	}
	w = f.request("POST", "/charges", `{"period":"2026-09"}`, f.tenant, f.users[0], true)
	status(t, w, 200)
	if !strings.Contains(w.Body.String(), `"created":0`) {
		t.Fatal("duplicate monthly charges", w.Body.String())
	}
	charges := make([]Charge, len(f.users))
	for i, user := range f.users {
		w := f.request("GET", "/mine", "", f.tenant, user, i == 0)
		status(t, w, 200)
		var result struct {
			Charges []Charge `json:"charges"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if len(result.Charges) != 1 || result.Charges[0].UserID != user {
			t.Fatal("member saw another person's charge", w.Body.String())
		}
		charges[i] = result.Charges[0]
	}
	return charges
}

func TestInactiveMembersKeepOldChargesWithoutNewDues(t *testing.T) {
	f := newDuesFixture(t)
	f.prepare(t)
	if _, err := f.pool.Exec(context.Background(), `UPDATE workspace.memberships SET active=false,deactivated_at=now() WHERE tenant_id=$1 AND user_id=$2`, f.tenant, f.users[1]); err != nil {
		t.Fatal(err)
	}
	w := f.request("POST", "/charges", `{"period":"2026-10"}`, f.tenant, f.users[0], true)
	status(t, w, 200)
	if !strings.Contains(w.Body.String(), `"created":2`) {
		t.Fatal("inactive membership was charged", w.Body.String())
	}
	var old, fresh int
	err := f.pool.QueryRow(context.Background(), `SELECT count(*) FILTER(WHERE period='2026-09-01'),count(*) FILTER(WHERE period='2026-10-01') FROM membership_dues_charges WHERE tenant_id=$1 AND user_id=$2`, f.tenant, f.users[1]).Scan(&old, &fresh)
	if err != nil || old != 1 || fresh != 0 {
		t.Fatalf("inactive member old=%d fresh=%d err=%v", old, fresh, err)
	}
}

func TestDuesPrivacyReviewAndReversal(t *testing.T) {
	f := newDuesFixture(t)
	charges := f.prepare(t)
	member := f.users[1]
	status(t, f.request("GET", "/finance", "", f.tenant, member, false), 403)
	status(t, f.request("POST", "/charges", `{"period":"2026-10"}`, f.tenant, member, false), 403)
	status(t, f.request("PUT", "/settings", `{}`, f.tenant, member, false), 403)
	key := uuid.NewString()
	body := `{"charge_id":"` + charges[1].ID + `","request_key":"` + key + `","amount":10000,"reference":"TEST-TRANSFER"}`
	status(t, f.request("POST", "/payments", body, f.tenant, f.users[2], false), 404)
	status(t, f.request("POST", "/payments", body, f.other, member, false), 404)
	w := f.request("POST", "/payments", body, f.tenant, member, false)
	status(t, w, 201)
	var receipt struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &receipt); err != nil {
		t.Fatal(err)
	}
	status(t, f.request("POST", "/payments", body, f.tenant, member, false), 200)
	status(t, f.request("POST", "/payments", strings.Replace(body, "10000", "9999", 1), f.tenant, member, false), 409)
	check := func(paid int64, entries int) {
		t.Helper()
		var got int64
		var count int
		if err := f.pool.QueryRow(context.Background(), `SELECT COALESCE(sum(delta),0),count(*) FROM membership_dues_entries WHERE tenant_id=$1`, f.tenant).Scan(&got, &count); err != nil {
			t.Fatal(err)
		}
		if got != paid || count != entries {
			t.Fatalf("ledger %d/%d want %d/%d", got, count, paid, entries)
		}
	}
	check(0, 0)
	review := "/payments/" + receipt.ID + "/review"
	status(t, f.request("POST", review, `{"action":"approve","reason":"Matched bank statement"}`, f.tenant, member, false), 403)
	status(t, f.request("POST", review, `{"action":"approve","reason":"Matched bank statement"}`, f.other, f.users[0], true), 404)
	status(t, f.request("POST", review, `{"action":"approve","reason":"Matched bank statement"}`, f.tenant, f.users[0], true), 200)
	status(t, f.request("POST", review, `{"action":"approve","reason":"Retry"}`, f.tenant, f.users[0], true), 200)
	status(t, f.request("POST", "/payments", body, f.tenant, member, false), 200)
	check(10000, 1)
	status(t, f.request("POST", review, `{"action":"reverse","reason":"Bank reversed transfer"}`, f.tenant, f.users[0], true), 200)
	status(t, f.request("POST", review, `{"action":"reverse","reason":"Retry"}`, f.tenant, f.users[0], true), 200)
	check(0, 2)
	ctx := nexus.WithUser(nexus.WithWorkspaceID(context.Background(), f.tenant), nexus.UserClaims{WorkspaceID: f.tenant, UserID: f.users[2]})
	var count int
	if err := f.pool.QueryRow(ctx, `SELECT count(*) FROM membership_dues_payments`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatal("RLS exposed another member's payment")
	}
	if _, err := f.pool.Exec(ctx, `UPDATE membership_dues_payments SET status='approved'`); err != nil {
		t.Fatal(err)
	}
	check(0, 2)
	status(t, f.request("POST", "/charges/"+charges[1].ID+"/waive", `{"reason":"Approved exemption"}`, f.tenant, f.users[0], true), 200)
	status(t, f.request("POST", "/payments", strings.Replace(body, key, uuid.NewString(), 1), f.tenant, member, false), 409)
}

func TestConcurrentDuesApprovalsCannotOverpay(t *testing.T) {
	f := newDuesFixture(t)
	charges := f.prepare(t)
	ids := make([]string, 2)
	for i := range 2 {
		w := f.request("POST", "/payments", `{"charge_id":"`+charges[1].ID+`","request_key":"`+uuid.NewString()+`","amount":10000,"reference":"`+uuid.NewString()+`"}`, f.tenant, f.users[1], false)
		status(t, w, 201)
		var receipt struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &receipt); err != nil {
			t.Fatal(err)
		}
		ids[i] = receipt.ID
	}
	var wg sync.WaitGroup
	results := make(chan int, 2)
	for _, id := range ids {
		wg.Go(func() {
			results <- f.request("POST", "/payments/"+id+"/review", `{"action":"approve","reason":"Matched bank statement"}`, f.tenant, f.users[0], true).Code
		})
	}
	wg.Wait()
	close(results)
	counts := map[int]int{}
	for code := range results {
		counts[code]++
	}
	if counts[200] != 1 || counts[409] != 1 {
		t.Fatal(counts)
	}
	var paid int64
	if err := f.pool.QueryRow(context.Background(), `SELECT sum(delta) FROM membership_dues_entries WHERE tenant_id=$1`, f.tenant).Scan(&paid); err != nil {
		t.Fatal(err)
	}
	if paid != 10000 {
		t.Fatalf("paid %d exceeds charge", paid)
	}
}
