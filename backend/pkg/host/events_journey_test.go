package host

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gerege-systems/open-gerege-nexus/backend/internal/kernel/cache"
	"github.com/gerege-systems/open-gerege-nexus/backend/internal/kernel/config"
	"github.com/gerege-systems/open-gerege-nexus/backend/internal/kernel/dbguard"
	"github.com/gerege-systems/open-gerege-nexus/backend/internal/workspace/appinstall"
	"github.com/gerege-systems/open-gerege-nexus/backend/internal/workspace/auth"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SDY-ийн бүтэн API урсгал. HTTP router, session, RLS, элсэлт, жинхэнэ
// installer, role permission болон Events бүгд бодитоор ажиллана.
func TestSDYJoinInstallAndAttendanceJourney(t *testing.T) {
	runSDYMembershipJourney(t, false)
}

func TestSDYAdminApprovedTransferJourney(t *testing.T) {
	runSDYMembershipJourney(t, true)
}

func runSDYMembershipJourney(t *testing.T, transfers bool) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to a migrated test database")
	}
	ctx := context.Background()
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	guard := &dbguard.Guard{}
	guard.Install(cfg)
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if err := guard.Probe(ctx, pool); err != nil {
		t.Fatal(err)
	}
	if !guard.Enabled() {
		t.Fatal("RLS must be active")
	}
	t.Setenv("APP_CATALOG_URL", "")
	t.Setenv("PUBLIC_ORIGIN", "http://nexus.localhost:3000")
	t.Setenv("CONTROL_PLANE_HOST", "admin.localhost:3000")
	srv, err := newServer(pool, filepath.FromSlash("../../../catalog/apps.json"), cache.NewBus(ctx, nil))
	if err != nil {
		t.Fatal(err)
	}
	// Production applies compiled modules' schemas during startup, before its
	// HTTP listener starts (run.go / StartBackgroundJobs). Prepare that same
	// schema here; every HTTP request below still uses the guarded tenant pool.
	if err := appinstall.NewAppInstaller(pool, nil, config.PlatformVersion).MigrateModules(ctx); err != nil {
		t.Fatal(err)
	}
	org, other := uuid.NewString(), uuid.NewString()
	admin, manager, member := uuid.NewString(), uuid.NewString(), uuid.NewString()
	users := []string{admin, manager, member}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM registry.tenants WHERE id = ANY($1::uuid[]) OR owner_user_id = ANY($2::uuid[])`, []string{org, other}, users)
		_, _ = pool.Exec(context.Background(), `DELETE FROM registry.users WHERE id = ANY($1::uuid[])`, users)
	})
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	for _, id := range []string{org, other} {
		exec(`INSERT INTO registry.tenants (id, slug, name) VALUES ($1, $2, 'SDY journey')`, id, "journey-"+id)
	}
	exec(`UPDATE registry.tenants SET membership_branch = true WHERE id = $1`, org)
	hash, err := auth.HashPassword("Journey-test-password-1!")
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range users {
		exec(`INSERT INTO registry.users (id, email, name, password_hash) VALUES ($1,$2,'Journey member',$3)`, id, id+"@example.test", hash)
	}
	for _, entry := range []struct{ user, role string }{{admin, "admin"}, {manager, "manager"}} {
		exec(`INSERT INTO workspace.memberships (tenant_id,user_id) VALUES ($1,$2)`, org, entry.user)
		exec(`WITH role AS (
			INSERT INTO workspace.roles (tenant_id,code,name) VALUES ($1,$2,$2)
			ON CONFLICT (tenant_id,code) DO UPDATE SET active=TRUE RETURNING id)
			INSERT INTO workspace.membership_roles (membership_id,role_id)
			SELECT m.id,role.id FROM workspace.memberships m,role WHERE m.tenant_id=$1 AND m.user_id=$3
			ON CONFLICT DO NOTHING`, org, entry.role, entry.user)
	}
	// The same administrator belongs to another, uninstalled organisation.
	exec(`INSERT INTO workspace.memberships (tenant_id,user_id) VALUES ($1,$2)`, other, admin)
	if transfers {
		exec(`INSERT INTO workspace.membership_roles(membership_id,role_id) SELECT m.id,r.id FROM workspace.memberships m JOIN workspace.roles r ON r.tenant_id=m.tenant_id AND r.code='admin' WHERE m.tenant_id=$1 AND m.user_id=$2 ON CONFLICT DO NOTHING`, other, admin)
	}
	cookies := map[string]*http.Cookie{}
	do := func(user, method, path, body string, want int) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, "http://nexus.localhost:3000"+path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Origin", "http://nexus.localhost:3000")
		r.Header.Set("Sec-Fetch-Site", "same-origin")
		if cookie := cookies[user]; cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		srv.router.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("%s %s: %d, want %d: %s", method, path, w.Code, want, w.Body.String())
		}
		response := w.Result()
		defer response.Body.Close()
		for _, cookie := range response.Cookies() {
			if cookie.Name == auth.SessionCookieName {
				cookies[user] = cookie
			}
		}
		return w
	}
	for _, user := range users {
		do(user, "POST", "/api/v1/auth/login", `{"email":"`+user+`@example.test","password":"Journey-test-password-1!"}`, 200)
		if cookies[user] == nil {
			t.Fatal("login did not set a session cookie")
		}
	}
	do(admin, "POST", "/api/v1/auth/switch-tenant", `{"tenant_id":"`+org+`"}`, 200)
	directory := do(member, "GET", "/api/v1/me/branches", "", 200)
	if !strings.Contains(directory.Body.String(), "journey-"+org) {
		t.Fatal("organisation without services is absent from the directory")
	}
	if strings.Contains(directory.Body.String(), "journey-"+other) {
		t.Fatal("an organisation outside the branch directory was offered")
	}
	do(member, "POST", "/api/v1/me/branch-requests", `{"slug":"journey-`+other+`"}`, 404)
	do(member, "POST", "/api/v1/me/branch-requests", `{"slug":"journey-`+org+`","message":"Элсэх хүсэлт"}`, 200)
	do(member, "GET", "/api/v1/membership/join-requests", "", 403)
	do(manager, "GET", "/api/v1/admin/access/overview", "", 403)
	do(manager, "POST", "/api/v1/admin/access/roles", "{}", 403)
	do(manager, "PUT", "/api/v1/admin/access/memberships/"+manager+"/roles", `{"roles":["admin"]}`, 403)
	queue := do(manager, "GET", "/api/v1/membership/join-requests", "", 200)
	var pending struct {
		Requests []struct {
			ID     string `json:"id"`
			UserID string `json:"user_id"`
		} `json:"requests"`
	}
	if err := json.Unmarshal(queue.Body.Bytes(), &pending); err != nil {
		t.Fatal(err)
	}
	if len(pending.Requests) != 1 || pending.Requests[0].UserID != member {
		t.Fatalf("pending applicant invisible: %s", queue.Body.String())
	}
	do(manager, "POST", "/api/v1/membership/join-requests/"+pending.Requests[0].ID, `{"accept":true}`, 200)
	items := do(member, "GET", "/api/v1/me/items", "", 200)
	if !strings.Contains(items.Body.String(), "ACCEPTED") {
		t.Fatalf("applicant was not told: %s", items.Body.String())
	}
	do(member, "POST", "/api/v1/auth/switch-tenant", `{"tenant_id":"`+org+`"}`, 200)
	do(member, "GET", "/api/v1/events/", "", 403)
	do(member, "POST", "/api/v1/store/apps/events/install", "{}", 403)
	do(admin, "POST", "/api/v1/store/apps/events/install", "{}", 200)
	me := do(member, "GET", "/api/v1/auth/me", "", 200)
	if !strings.Contains(me.Body.String(), "events.read") || strings.Contains(me.Body.String(), "events.manage") {
		t.Fatalf("new member permissions: %s", me.Body.String())
	}
	do(member, "GET", "/api/v1/events/", "", 200)
	do(member, "POST", "/api/v1/events/", "{}", 403)
	created := do(manager, "POST", "/api/v1/events/", `{"title":"SDY бүтэн урсгал","starts_at":"2026-10-01T10:00:00+08:00","capacity":2,"points_value":10}`, 201)
	var event struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(created.Body.Bytes(), &event); err != nil {
		t.Fatal(err)
	}
	path := "/api/v1/events/" + event.ID
	do(member, "POST", path+"/register", "", 200)
	code := do(manager, "POST", path+"/check-in-code", "", 200)
	var issued struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(code.Body.Bytes(), &issued); err != nil {
		t.Fatal(err)
	}
	do(member, "POST", path+"/check-in", `{"token":"`+issued.Token+`"}`, 200)
	points := do(member, "GET", "/api/v1/events/points", "", 200)
	if !strings.Contains(points.Body.String(), `"total":10`) {
		t.Fatal(points.Body.String())
	}
	for _, month := range []string{"2026-09", "2026-10"} {
		summary := do(manager, "GET", "/api/v1/events/summary?period="+month, "", 200)
		want := `"attended":0`
		if month == "2026-10" {
			want = `"attended":1`
		}
		if !strings.Contains(summary.Body.String(), want) {
			t.Fatal(summary.Body.String())
		}
	}
	do(manager, "PUT", path+"/attendance/"+member, `{"status":"attended","note":"Баталгаажсан"}`, 200)
	do(member, "DELETE", path+"/register", "", 409)
	do(member, "PUT", path+"/attendance/"+member, `{"status":"absent"}`, 403)
	attendance := do(manager, "GET", path+"/attendance", "", 200)
	if !strings.Contains(attendance.Body.String(), `"status":"attended"`) {
		t.Fatal("attendance was not persisted")
	}
	do(manager, "PUT", path+"/", `{"title":"SDY бүтэн урсгал","starts_at":"2026-10-01T10:00:00+08:00","status":"done","capacity":2}`, 200)
	do(member, "DELETE", path+"/register", "", 409)
	// A member can report a transfer, but only finance can turn it into paid
	// dues. This uses the real installer, session grants and financial RLS.
	do(admin, "POST", "/api/v1/store/apps/membership/install", "{}", 200)
	do(manager, "GET", "/api/v1/dues/finance", "", 403)
	do(admin, "PUT", "/api/v1/dues/settings", `{"enabled":true,"monthly_amount":10000,"due_day":15,"bank_name":"Test","account_number":"TEST-ONLY","account_holder":"Journey"}`, 200)
	do(admin, "POST", "/api/v1/dues/charges", `{"period":"2026-09"}`, 200)
	mine := do(member, "GET", "/api/v1/dues/mine", "", 200)
	var account struct {
		Charges []struct {
			ID   string `json:"id"`
			Paid int64  `json:"paid"`
		} `json:"charges"`
	}
	if err := json.Unmarshal(mine.Body.Bytes(), &account); err != nil {
		t.Fatal(err)
	}
	if len(account.Charges) != 1 {
		t.Fatal(mine.Body.String())
	}
	reported := do(member, "POST", "/api/v1/dues/payments", `{"charge_id":"`+account.Charges[0].ID+`","request_key":"`+uuid.NewString()+`","amount":10000,"reference":"JOURNEY-TRANSFER"}`, 201)
	var payment struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(reported.Body.Bytes(), &payment); err != nil {
		t.Fatal(err)
	}
	do(member, "POST", "/api/v1/dues/payments/"+payment.ID+"/review", `{"action":"approve","reason":"Attempt"}`, 403)
	do(admin, "POST", "/api/v1/dues/payments/"+payment.ID+"/review", `{"action":"approve","reason":"Matched test statement"}`, 200)
	mine = do(member, "GET", "/api/v1/dues/mine", "", 200)
	if !strings.Contains(mine.Body.String(), `"paid":10000`) {
		t.Fatal(mine.Body.String())
	}
	do(admin, "POST", "/api/v1/auth/switch-tenant", `{"tenant_id":"`+other+`"}`, 200)
	do(admin, "GET", path+"/attendance", "", 403)
	if transfers {
		assertSDYTransfers(t, pool, org, other, admin, manager, member, do)
	}
}
