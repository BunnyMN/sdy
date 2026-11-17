package devices

import (
	"context"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/gerege-systems/open-gerege-nexus/backend/internal/kernel/dbguard"
	"github.com/gerege-systems/open-gerege-nexus/backend/pkg/nexus"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type pushFixture struct {
	pool   *pgxpool.Pool
	h      *Handlers
	a, b   string
	member string
	loner  string
}

// The register and unregister handlers run under the same RLS guard the
// host installs, so what is tested is what PostgreSQL lets the tenant role do.
func newPushFixture(t *testing.T) *pushFixture {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to a migrated test database")
	}
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i + 3)
	}
	t.Setenv("PUSH_TOKEN_ENCRYPTION_KEY", base64.StdEncoding.EncodeToString(key))
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
	if err := guard.Probe(ctx, pool); err != nil || !guard.Enabled() {
		t.Fatalf("RLS guard: %v", err)
	}
	f := &pushFixture{pool: pool, h: New(pool, nil, nil), a: uuid.NewString(), b: uuid.NewString(), member: uuid.NewString(), loner: uuid.NewString()}
	t.Cleanup(func() {
		bg := context.Background()
		_, _ = pool.Exec(bg, `DELETE FROM workspace.push_tokens WHERE user_id = ANY($1::uuid[])`, []string{f.member, f.loner})
		_, _ = pool.Exec(bg, `DELETE FROM registry.tenants WHERE id = ANY($1::uuid[])`, []string{f.a, f.b})
		_, _ = pool.Exec(bg, `DELETE FROM registry.users WHERE id = ANY($1::uuid[])`, []string{f.member, f.loner})
	})
	for _, id := range []string{f.a, f.b} {
		if _, err := pool.Exec(ctx, `INSERT INTO registry.tenants (id, slug, name) VALUES ($1, $2, 'Push branch')`, id, "push-"+id); err != nil {
			t.Fatal(err)
		}
	}
	for _, id := range []string{f.member, f.loner} {
		if _, err := pool.Exec(ctx, `INSERT INTO registry.users (id, email, name, password_hash) VALUES ($1, $2, 'Push member', 'x')`, id, id+"@push.test"); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(ctx, `INSERT INTO workspace.memberships (tenant_id, user_id) VALUES ($1, $3), ($2, $3)`, f.a, f.b, f.member); err != nil {
		t.Fatal(err)
	}
	return f
}

func (f *pushFixture) call(handler http.HandlerFunc, method, body, tenant, user string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, "/api/v1/push-tokens", strings.NewReader(body))
	ctx := nexus.WithUser(r.Context(), nexus.UserClaims{WorkspaceID: tenant, UserID: user})
	if tenant != "" {
		ctx = nexus.WithWorkspaceID(ctx, tenant)
	} else {
		ctx = nexus.WithPersonScope(ctx)
	}
	w := httptest.NewRecorder()
	handler(w, r.WithContext(ctx))
	return w
}

func (f *pushFixture) token(t *testing.T, hash string) (tenant *string, user string, found bool) {
	t.Helper()
	err := f.pool.QueryRow(context.Background(), `SELECT tenant_id::text, user_id::text FROM workspace.push_tokens WHERE token_hash=$1`, hash).Scan(&tenant, &user)
	return tenant, user, err == nil
}

const phone = `{"token":"apns-device-token-0123456789abcdef","provider":"APNS","app_id":"mn.esdy.member"}`

// A phone registered in one branch moves with its person to the next branch
// they open: the second registration must not fail on the row the first
// branch's policy hides.
func TestPushTokenFollowsTheMemberAcrossBranches(t *testing.T) {
	f := newPushFixture(t)
	hash := caseSensitiveSecretHash("apns-device-token-0123456789abcdef")
	if w := f.call(f.h.HandleRegisterPushToken, "POST", phone, f.a, f.member); w.Code != http.StatusNoContent {
		t.Fatalf("first branch: %d %s", w.Code, w.Body.String())
	}
	if w := f.call(f.h.HandleRegisterPushToken, "POST", phone, f.b, f.member); w.Code != http.StatusNoContent {
		t.Fatalf("after switching branch: %d %s", w.Code, w.Body.String())
	}
	tenant, user, ok := f.token(t, hash)
	if !ok || tenant == nil || *tenant != f.b || user != f.member {
		t.Fatalf("token tenant=%v user=%q found=%v; want branch b", tenant, user, ok)
	}
	var count int
	if err := f.pool.QueryRow(context.Background(), `SELECT count(*) FROM workspace.push_tokens WHERE token_hash=$1`, hash).Scan(&count); err != nil || count != 1 {
		t.Fatalf("%d rows for one phone (%v)", count, err)
	}
}

// Somebody in no branch yet — a join request waiting — still gets their
// notifications on the phone.
func TestPushTokenRegistersForSomebodyInNoBranch(t *testing.T) {
	f := newPushFixture(t)
	if w := f.call(f.h.HandleRegisterPushToken, "POST", phone, "", f.loner); w.Code != http.StatusNoContent {
		t.Fatalf("no branch: %d %s", w.Code, w.Body.String())
	}
	tenant, user, ok := f.token(t, caseSensitiveSecretHash("apns-device-token-0123456789abcdef"))
	if !ok || tenant != nil || user != f.loner {
		t.Fatalf("token tenant=%v user=%q found=%v", tenant, user, ok)
	}
	// Joining a branch later moves it there.
	if _, err := f.pool.Exec(context.Background(), `INSERT INTO workspace.memberships (tenant_id, user_id) VALUES ($1, $2)`, f.a, f.loner); err != nil {
		t.Fatal(err)
	}
	if w := f.call(f.h.HandleRegisterPushToken, "POST", phone, f.a, f.loner); w.Code != http.StatusNoContent {
		t.Fatalf("after joining: %d %s", w.Code, w.Body.String())
	}
	if tenant, _, _ := f.token(t, caseSensitiveSecretHash("apns-device-token-0123456789abcdef")); tenant == nil || *tenant != f.a {
		t.Fatalf("token tenant=%v after joining", tenant)
	}
}

func TestPushTokenRegistrationValidatesAndUnregisters(t *testing.T) {
	f := newPushFixture(t)
	for _, body := range []string{`{}`, `{"token":"short","provider":"APNS"}`, `{"token":"apns-device-token-0123456789abcdef","provider":"SMS"}`, `not json`} {
		if w := f.call(f.h.HandleRegisterPushToken, "POST", body, f.a, f.member); w.Code != http.StatusBadRequest {
			t.Fatalf("%s: %d", body, w.Code)
		}
	}
	if w := f.call(f.h.HandleRegisterPushToken, "POST", phone, f.a, f.member); w.Code != http.StatusNoContent {
		t.Fatalf("register: %d %s", w.Code, w.Body.String())
	}
	hash := caseSensitiveSecretHash("apns-device-token-0123456789abcdef")
	// Somebody else signing out with the same token does not remove it.
	if w := f.call(f.h.HandleUnregisterPushToken, "DELETE", `{"token":"apns-device-token-0123456789abcdef"}`, "", f.loner); w.Code != http.StatusNoContent {
		t.Fatalf("other unregister: %d", w.Code)
	}
	if _, _, ok := f.token(t, hash); !ok {
		t.Fatal("another person's sign-out removed the token")
	}
	// Signing out in another branch than the one it was registered in still removes it.
	if w := f.call(f.h.HandleUnregisterPushToken, "DELETE", `{"token":"apns-device-token-0123456789abcdef"}`, f.b, f.member); w.Code != http.StatusNoContent {
		t.Fatalf("unregister: %d %s", w.Code, w.Body.String())
	}
	if _, _, ok := f.token(t, hash); ok {
		t.Fatal("token still registered after sign-out")
	}
	if w := f.call(f.h.HandleUnregisterPushToken, "DELETE", `{"token":"x"}`, f.a, f.member); w.Code != http.StatusBadRequest {
		t.Fatalf("short token unregister: %d", w.Code)
	}
}

// The encryption key missing is a configuration fault, said as one.
func TestPushTokenRegistrationWithoutAKeyIsUnavailable(t *testing.T) {
	f := newPushFixture(t)
	t.Setenv("PUSH_TOKEN_ENCRYPTION_KEY", "")
	if w := f.call(f.h.HandleRegisterPushToken, "POST", phone, f.a, f.member); w.Code != http.StatusServiceUnavailable {
		t.Fatalf("no key: %d", w.Code)
	}
}
