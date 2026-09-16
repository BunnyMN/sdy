package events

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
	"time"

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

type eventFixture struct {
	pool          *pgxpool.Pool
	router        chi.Router
	tenant, other string
	users         []string
	application   string
}

// Run against a migrated, disposable database. The guard is the same one the
// host uses, so assertions exercise PostgreSQL RLS, not just tenant WHEREs.
func newEventFixture(t *testing.T) *eventFixture {
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
	application := "events-test-" + uuid.NewString()
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
	if _, err := pool.Exec(ctx, `GRANT SELECT, INSERT, UPDATE, DELETE ON events_events, events_attendance TO gerege_nexus_tenant`); err != nil {
		t.Fatal(err)
	}
	f := &eventFixture{pool: pool, tenant: uuid.NewString(), other: uuid.NewString(), application: application}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM registry.tenants WHERE id = ANY($1::uuid[])`, []string{f.tenant, f.other})
		_, _ = pool.Exec(context.Background(), `DELETE FROM registry.users WHERE id = ANY($1::uuid[])`, f.users)
	})
	for _, id := range []string{f.tenant, f.other} {
		if _, err := pool.Exec(ctx, `INSERT INTO registry.tenants (id, slug, name) VALUES ($1, $2, 'Events test')`, id, id); err != nil {
			t.Fatal(err)
		}
	}
	for range 25 {
		id := uuid.NewString()
		f.users = append(f.users, id)
		if _, err := pool.Exec(ctx, `INSERT INTO registry.users (id, email, name, password_hash) VALUES ($1, $2, 'Test member', 'x')`, id, id+"@example.test"); err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, `INSERT INTO workspace.memberships (tenant_id, user_id) VALUES ($1, $2), ($3, $2)`, f.tenant, id, f.other); err != nil {
			t.Fatal(err)
		}
	}
	m := &Module{db: pool, permissions: testPermissions{}}
	f.router = chi.NewRouter()
	m.RegisterRoutes(f.router, func(next http.Handler) http.Handler { return next })
	return f
}

func (f *eventFixture) request(method, path, body, tenant, user string, admin bool) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, "/api/v1/events"+path, strings.NewReader(body))
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

func (f *eventFixture) create(t *testing.T, capacity int) Event {
	t.Helper()
	in := eventInput{Title: "Салбарын уулзалт", StartsAt: "2026-10-01T10:00:00+08:00", Capacity: &capacity, Status: "planned"}
	body, _ := json.Marshal(in)
	w := f.request("POST", "/", string(body), f.tenant, f.users[0], true)
	status(t, w, http.StatusCreated)
	var e Event
	if err := json.Unmarshal(w.Body.Bytes(), &e); err != nil {
		t.Fatal(err)
	}
	return e
}

func (f *eventFixture) read(t *testing.T, id, user string) Event {
	t.Helper()
	w := f.request("GET", "/"+id+"/", "", f.tenant, user, false)
	status(t, w, http.StatusOK)
	var e Event
	if err := json.Unmarshal(w.Body.Bytes(), &e); err != nil {
		t.Fatal(err)
	}
	return e
}

func TestConcurrentRegistrationCannotOverbook(t *testing.T) {
	f := newEventFixture(t)
	e := f.create(t, 1)
	// Hold the parent row while every request reaches its blocking write/lock.
	// The old implementation reads the empty count, then waits on its INSERT's
	// FK check; the fixed implementation waits before reading the count. This
	// reproduces the race without depending on connection warm-up or scheduling.
	ctx := context.Background()
	tx, err := f.pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT id FROM events_events WHERE id=$1 FOR UPDATE`, e.ID); err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	results := make(chan *httptest.ResponseRecorder, len(f.users))
	var wg sync.WaitGroup
	for _, user := range f.users[1:] {
		wg.Go(func() { <-start; results <- f.request("POST", "/"+e.ID+"/register", "", f.tenant, user, false) })
	}
	close(start)
	waiting := 0
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if err := f.pool.QueryRow(ctx, `SELECT count(*) FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'`, f.application).Scan(&waiting); err != nil {
			t.Error(err)
			break
		}
		if waiting == len(f.users)-1 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	wg.Wait()
	close(results)
	if waiting != len(f.users)-1 {
		t.Fatalf("only %d requests reached the lock", waiting)
	}
	accepted := 0
	for w := range results {
		if w.Code == http.StatusOK {
			accepted++
		} else {
			status(t, w, http.StatusConflict)
		}
	}
	if accepted != 1 {
		t.Fatalf("%d registrations accepted for one seat", accepted)
	}
	if got := f.read(t, e.ID, f.users[0]).Registered; got != 1 {
		t.Fatalf("stored count = %d", got)
	}
}

func TestConcurrentDuplicateRegistrationChangesOnce(t *testing.T) {
	f := newEventFixture(t)
	e := f.create(t, 1)
	start := make(chan struct{})
	results := make(chan *httptest.ResponseRecorder, 12)
	var wg sync.WaitGroup
	for range 12 {
		wg.Go(func() { <-start; results <- f.request("POST", "/"+e.ID+"/register", "", f.tenant, f.users[1], false) })
	}
	close(start)
	wg.Wait()
	close(results)
	changed := 0
	for w := range results {
		status(t, w, http.StatusOK)
		var answer struct {
			Changed bool `json:"changed"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &answer); err != nil {
			t.Fatal(err)
		}
		if answer.Changed {
			changed++
		}
	}
	if changed != 1 {
		t.Fatalf("%d requests claim to have changed the registration", changed)
	}
}

func TestCapacityIncludesOrganiserChanges(t *testing.T) {
	f := newEventFixture(t)
	e := f.create(t, 1)
	member, other, admin := f.users[1], f.users[2], f.users[0]
	register := "/" + e.ID + "/register"
	mark := "/" + e.ID + "/attendance/" + member
	status(t, f.request("POST", register, "", f.tenant, member, false), 200)
	status(t, f.request("POST", "/"+e.ID+"/attendance", `{"user_id":"`+other+`"}`, f.tenant, admin, true), 409)
	status(t, f.request("PUT", mark, `{"status":"attended","note":"Attendance confirmed"}`, f.tenant, admin, true), 200)
	status(t, f.request("PUT", mark, `{"status":"absent","note":"Attendance corrected"}`, f.tenant, admin, true), 200)
	status(t, f.request("POST", register, "", f.tenant, other, false), 200)
	status(t, f.request("PUT", mark, `{"status":"attended","note":"Attendance confirmed"}`, f.tenant, admin, true), 409)
	status(t, f.request("POST", "/"+e.ID+"/attendance", `{"user_id":"`+member+`","status":"registered"}`, f.tenant, admin, true), 409)
	if got := f.read(t, e.ID, member); got.Registered != 1 || got.MyStatus != "absent" {
		t.Fatalf("capacity/attendance changed after refusal: %+v", got)
	}
	status(t, f.request("DELETE", register, "", f.tenant, other, false), 200)
	status(t, f.request("PUT", mark, `{"status":"registered","note":"Registration restored"}`, f.tenant, admin, true), 200)
}

func TestCapacityCannotBeReducedBelowAttendance(t *testing.T) {
	f := newEventFixture(t)
	e := f.create(t, 2)
	for _, user := range f.users[1:3] {
		status(t, f.request("POST", "/"+e.ID+"/register", "", f.tenant, user, false), 200)
	}
	body := `{"title":"Updated","starts_at":"2026-10-01T02:00:00Z","capacity":1}`
	status(t, f.request("PUT", "/"+e.ID+"/", body, f.tenant, f.users[0], true), 409)
	if got := f.read(t, e.ID, f.users[0]); got.Capacity == nil || *got.Capacity != 2 {
		t.Fatalf("capacity changed: %+v", got)
	}
}

func TestWithdrawalPreservesClosedEventsAndRecordedAttendance(t *testing.T) {
	f := newEventFixture(t)
	for _, state := range []string{"planned", "done", "cancelled"} {
		for _, attendance := range []string{"registered", "attended", "absent"} {
			t.Run(state+"/"+attendance, func(t *testing.T) {
				e := f.create(t, 2)
				user := f.users[1]
				status(t, f.request("POST", "/"+e.ID+"/attendance", `{"user_id":"`+user+`","status":"`+attendance+`"}`, f.tenant, f.users[0], true), 200)
				status(t, f.request("PUT", "/"+e.ID+"/", `{"title":"Closed","starts_at":"2026-10-01T02:00:00Z","status":"`+state+`"}`, f.tenant, f.users[0], true), 200)
				want := 409
				if state == "planned" && attendance == "registered" {
					want = 200
				}
				status(t, f.request("DELETE", "/"+e.ID+"/register", "", f.tenant, user, false), want)
				got := f.read(t, e.ID, user).MyStatus
				if want == 200 {
					attendance = ""
				}
				if got != attendance {
					t.Fatalf("attendance = %q, want %q", got, attendance)
				}
				if state != "planned" {
					status(t, f.request("POST", "/"+e.ID+"/register", "", f.tenant, f.users[2], false), 409)
				}
			})
		}
	}
}

func TestEventsPermissionsAndTenantIsolation(t *testing.T) {
	f := newEventFixture(t)
	e := f.create(t, 2)
	user := f.users[1]
	status(t, f.request("POST", "/"+e.ID+"/register", "", f.tenant, user, false), 200)
	for _, route := range []struct{ method, path string }{
		{"POST", "/"}, {"PUT", "/" + e.ID + "/"}, {"GET", "/members"},
		{"POST", "/" + e.ID + "/attendance"}, {"PUT", "/" + e.ID + "/attendance/" + user},
	} {
		t.Run("member/"+route.method+route.path, func(t *testing.T) { status(t, f.request(route.method, route.path, "{}", f.tenant, user, false), 403) })
	}
	for _, route := range []struct{ method, path, body string }{
		{"GET", "/" + e.ID + "/", ""}, {"GET", "/" + e.ID + "/attendance", ""},
		{"POST", "/" + e.ID + "/register", ""}, {"DELETE", "/" + e.ID + "/register", ""},
		{"PUT", "/" + e.ID + "/", `{"title":"Other","starts_at":"2026-10-01T02:00:00Z"}`},
		{"POST", "/" + e.ID + "/attendance", `{"user_id":"` + user + `"}`},
		{"PUT", "/" + e.ID + "/attendance/" + user, `{"status":"absent"}`},
	} {
		t.Run("other tenant/"+route.method+route.path, func(t *testing.T) {
			status(t, f.request(route.method, route.path, route.body, f.other, user, true), 404)
		})
	}
	status(t, f.request("GET", "/", "", f.tenant, "", false), 401)
	// Deliberately omit tenant_id, to prove the second isolation layer itself.
	ctx := nexus.WithUser(nexus.WithWorkspaceID(context.Background(), f.other), nexus.UserClaims{UserID: user, WorkspaceID: f.other})
	var count int
	if err := f.pool.QueryRow(ctx, `SELECT count(*) FROM events_attendance WHERE event_id = $1`, e.ID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("RLS exposed %d attendance rows", count)
	}
	if got := f.read(t, e.ID, user).MyStatus; got != "registered" {
		t.Fatalf("other tenant changed attendance: %q", got)
	}
}

func TestEventTextLimitsCountCharacters(t *testing.T) {
	for _, tc := range []struct {
		name, title, description, location string
		invalid                            bool
	}{
		{"at limits", strings.Repeat("Ө", 200), strings.Repeat("Ү", 10000), strings.Repeat("Ө", 500), false},
		{"trimmed", " Уулзалт ", " " + strings.Repeat("Ү", 10000) + " ", " " + strings.Repeat("Ө", 500) + " ", false},
		{"empty title", " ", "", "", true},
		{"title too long", strings.Repeat("Ө", 201), "", "", true},
		{"description too long", "Уулзалт", strings.Repeat("Ү", 10001), "", true},
		{"location too long", "Уулзалт", "", strings.Repeat("Ө", 501), true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			in := eventInput{Title: tc.title, Description: tc.description, Location: tc.location, StartsAt: "2026-10-01T02:00:00Z"}
			_, _, err := in.validate()
			if (err != nil) != tc.invalid {
				t.Fatalf("validation error = %v, invalid = %v", err, tc.invalid)
			}
		})
	}
}
