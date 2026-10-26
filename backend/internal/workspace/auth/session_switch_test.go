package auth_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/gerege-systems/open-gerege-nexus/backend/internal/kernel/memo"
	"github.com/gerege-systems/open-gerege-nexus/backend/internal/workspace/auth"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// seedTenant leaves one tenant behind, with a membership for userID only when
// asked — a tenant somebody is not in is half of what switching has to refuse.
func seedTenant(t *testing.T, pool *pgxpool.Pool, userID string, member bool) string {
	t.Helper()
	ctx := context.Background()
	suffix := strings.ReplaceAll(uuid.NewString(), "-", "")[:12]

	var tenantID string
	if err := pool.QueryRow(ctx,
		`INSERT INTO registry.tenants (name, slug) VALUES ($1,$1) RETURNING id::text`,
		"switchtest-"+suffix).Scan(&tenantID); err != nil {
		t.Fatal(err)
	}
	if member {
		if _, err := pool.Exec(ctx,
			`INSERT INTO workspace.memberships (tenant_id, user_id) VALUES ($1,$2)`, tenantID, userID); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM registry.tenants WHERE id=$1`, tenantID)
	})
	return tenantID
}

// The point of the feature: a person in two organisations can reach the second
// one, and the token they were carrying stops working when they do.
func TestSwitchingTenantsRotatesTheToken(t *testing.T) {
	pool := openPool(t)
	userID, first := seedMember(t, pool)
	second := seedTenant(t, pool, userID, true)
	store := auth.NewSessionStore(pool, time.Hour*12)
	ctx := context.Background()

	token, expiresAt, err := store.Create(ctx, userID, first, "password", "test", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}

	next, nextExpiry, err := store.SwitchTenant(ctx, token, second)
	if err != nil {
		t.Fatalf("switching to a tenant the user belongs to failed: %v", err)
	}
	if next == token {
		t.Fatal("the session token was not rotated")
	}

	claims, err := store.Resolve(ctx, next)
	if err != nil {
		t.Fatalf("the new token did not resolve: %v", err)
	}
	if claims.WorkspaceID != second {
		t.Fatalf("tenant=%s want=%s", claims.WorkspaceID, second)
	}
	if claims.UserID != userID {
		t.Fatalf("user=%s want=%s", claims.UserID, userID)
	}

	// A switch is not a sign-in, so it must not push the expiry out. Compared
	// to the second: both values come from the same stored timestamp, and only
	// a deliberate extension would move it.
	if !nextExpiry.Truncate(time.Second).Equal(expiresAt.Truncate(time.Second)) {
		t.Fatalf("expiry moved: %s -> %s", expiresAt, nextExpiry)
	}

	if _, err := store.Resolve(ctx, token); !errors.Is(err, auth.ErrSessionInvalid) {
		t.Fatalf("the old token still resolves: %v", err)
	}
}

// The other half: asking for a tenant you hold no membership in is refused, and
// refused without disturbing the session you already have.
func TestSwitchingToATenantYouAreNotInIsRefused(t *testing.T) {
	pool := openPool(t)
	userID, first := seedMember(t, pool)
	stranger := seedTenant(t, pool, userID, false)
	store := auth.NewSessionStore(pool, time.Hour*12)
	ctx := context.Background()

	token, _, err := store.Create(ctx, userID, first, "password", "test", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}

	if _, _, err := store.SwitchTenant(ctx, token, stranger); !errors.Is(err, auth.ErrNotAMember) {
		t.Fatalf("err=%v want=%v", err, auth.ErrNotAMember)
	}

	claims, err := store.Resolve(ctx, token)
	if err != nil {
		t.Fatalf("the refused switch cost the caller their session: %v", err)
	}
	if claims.WorkspaceID != first {
		t.Fatalf("tenant=%s want=%s", claims.WorkspaceID, first)
	}
}

// A token that is no longer good cannot be traded for one in another tenant.
func TestSwitchingWithADeadSessionFails(t *testing.T) {
	pool := openPool(t)
	userID, first := seedMember(t, pool)
	second := seedTenant(t, pool, userID, true)
	store := auth.NewSessionStore(pool, time.Hour*12)
	ctx := context.Background()

	token, _, err := store.Create(ctx, userID, first, "password", "test", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Revoke(ctx, token); err != nil {
		t.Fatal(err)
	}

	if _, _, err := store.SwitchTenant(ctx, token, second); !errors.Is(err, auth.ErrSessionInvalid) {
		t.Fatalf("err=%v want=%v", err, auth.ErrSessionInvalid)
	}
}

func TestDeactivationEndsExistingWorkspaceSession(t *testing.T) {
	pool := openPool(t)
	user, tenant := seedMember(t, pool)
	ctx := context.Background()
	store := auth.NewSessionStore(pool, time.Hour)
	token, _, err := store.Create(ctx, user, tenant, "password", "test", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Resolve(ctx, token); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE workspace.memberships SET active=false,deactivated_at=now() WHERE tenant_id=$1 AND user_id=$2`, tenant, user); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Resolve(ctx, token); !errors.Is(err, auth.ErrSessionInvalid) {
		t.Fatalf("deactivated member's old session survived: %v", err)
	}
}

func TestSavedWorkspaceSelectionLosesUnavailableMemberships(t *testing.T) {
	pool := openPool(t)
	user, current := seedMember(t, pool)
	ctx := context.Background()
	store := auth.NewSessionStore(pool, time.Hour)
	token, _, err := store.Create(ctx, user, current, "password", "test", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	for _, change := range []string{
		`UPDATE workspace.memberships SET active=false,deactivated_at=now() WHERE tenant_id=$1`,
		`DELETE FROM workspace.memberships WHERE tenant_id=$1`,
	} {
		other := seedTenant(t, pool, user, true)
		if _, err := store.SetActiveTenants(ctx, token, []string{other}); err != nil {
			t.Fatal(err)
		}
		claims, err := store.Resolve(ctx, token)
		if err != nil || !slices.Contains(claims.AllowedWorkspaceIDs, other) {
			t.Fatalf("initial selection=%v err=%v", claims.AllowedWorkspaceIDs, err)
		}
		if _, err := pool.Exec(ctx, change, other); err != nil {
			t.Fatal(err)
		}
		claims, err = store.Resolve(ctx, token)
		if err != nil || len(claims.AllowedWorkspaceIDs) != 1 || claims.AllowedWorkspaceIDs[0] != current {
			t.Fatalf("stale access survived: selection=%v err=%v", claims.AllowedWorkspaceIDs, err)
		}
		allowed, err := store.SetActiveTenants(ctx, token, []string{other})
		if err != nil || len(allowed) != 1 || allowed[0] != current {
			t.Fatalf("unavailable organisation could be selected again: %v err=%v", allowed, err)
		}
	}
}

// A browser never sends X-Session-Transport, and its answer must not change:
// the token stays in the HttpOnly cookie and never appears in the body.
func TestABrowserKeepsItsSessionInTheCookie(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
	recorder := httptest.NewRecorder()

	bodyToken := auth.DeliverSession(recorder, request, "browser-token", time.Now().Add(time.Hour))
	if bodyToken != "" {
		t.Fatalf("a browser was handed its token in the body: %q", bodyToken)
	}
	cookies := recorder.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != auth.SessionCookieName || cookies[0].Value != "browser-token" || !cookies[0].HttpOnly {
		t.Fatalf("cookies=%v, want one HttpOnly %s", cookies, auth.SessionCookieName)
	}
	body := auth.WithSessionToken(map[string]any{"expires_at": "x"}, bodyToken)
	if _, present := body["session_token"]; present {
		t.Fatal("session_token is in a browser's answer")
	}
}

// The native app opts in, and gets the token in the body and no cookie — a
// cookie it stored and replayed would make every write a CSRF-checked one.
func TestANativeClientThatAsksGetsABearerToken(t *testing.T) {
	for _, value := range []string{"bearer", "Bearer", " BEARER "} {
		request := httptest.NewRequest(http.MethodPost, "/api/v1/auth/eid/poll", nil)
		request.Header.Set(auth.SessionTransportHeader, value)
		recorder := httptest.NewRecorder()

		bodyToken := auth.DeliverSession(recorder, request, "app-token", time.Now().Add(time.Hour))
		if bodyToken != "app-token" {
			t.Fatalf("%q: body token=%q, want app-token", value, bodyToken)
		}
		if cookies := recorder.Result().Cookies(); len(cookies) != 0 {
			t.Fatalf("%q: a bearer client was also given a cookie: %v", value, cookies)
		}
		if got := recorder.Header().Get("Cache-Control"); got != "no-store" {
			t.Fatalf("%q: Cache-Control=%q, want no-store", value, got)
		}
		body := auth.WithSessionToken(map[string]any{}, bodyToken)
		if body["session_token"] != "app-token" {
			t.Fatalf("%q: body=%v", value, body)
		}
	}

	// Anything else is a browser.
	request := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
	request.Header.Set(auth.SessionTransportHeader, "cookie")
	if auth.WantsBearerSession(request) {
		t.Fatal("a transport other than bearer was read as bearer")
	}
}

// End to end through the password sign-in: the token in the body is a working
// session and is accepted back as Authorization: Bearer.
func TestPasswordSignInHandsANativeClientItsToken(t *testing.T) {
	pool := openPool(t)
	userID, _ := seedMember(t, pool)
	ctx := context.Background()
	hash, err := auth.HashPassword("Password123!")
	if err != nil {
		t.Fatal(err)
	}
	var email string
	if err := pool.QueryRow(ctx,
		`UPDATE registry.users SET password_hash=$2 WHERE id=$1 RETURNING email`, userID, hash).Scan(&email); err != nil {
		t.Fatal(err)
	}
	store := auth.NewSessionStore(pool, time.Hour)
	h := auth.New(auth.Deps{DB: pool, Sessions: store, Suspended: memo.New[bool](auth.SuspendedTTL)})

	request := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login",
		strings.NewReader(`{"email":"`+email+`","password":"Password123!"}`))
	request.Header.Set(auth.SessionTransportHeader, "bearer")
	recorder := httptest.NewRecorder()
	h.HandleLogin(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("sign-in: %d %s", recorder.Code, recorder.Body.String())
	}
	if cookies := recorder.Result().Cookies(); len(cookies) != 0 {
		t.Fatalf("a bearer sign-in also set cookies: %v", cookies)
	}
	var answer struct {
		SessionToken string `json:"session_token"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &answer); err != nil {
		t.Fatal(err)
	}
	if answer.SessionToken == "" {
		t.Fatalf("no session_token in %s", recorder.Body.String())
	}

	bearer := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	bearer.Header.Set("Authorization", "Bearer "+answer.SessionToken)
	claims, err := store.Resolve(ctx, auth.TokenFromRequest(bearer))
	if err != nil || claims.UserID != userID {
		t.Fatalf("the body token does not resolve to the account: %v %+v", err, claims)
	}
}

// Switching rotates the token, so a native client has to be handed the new one
// or it is signed out by its own tap.
func TestSwitchingTenantHandsANativeClientTheRotatedToken(t *testing.T) {
	pool := openPool(t)
	userID, first := seedMember(t, pool)
	second := seedTenant(t, pool, userID, true)
	ctx := context.Background()
	store := auth.NewSessionStore(pool, time.Hour)
	h := auth.New(auth.Deps{DB: pool, Sessions: store, Suspended: memo.New[bool](auth.SuspendedTTL)})

	token, _, err := store.Create(ctx, userID, first, "eid-app", "test", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	claims, err := store.Resolve(ctx, token)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/v1/auth/switch-tenant",
		strings.NewReader(`{"tenant_id":"`+second+`"}`))
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set(auth.SessionTransportHeader, "bearer")
	request = request.WithContext(auth.WithUserContext(request.Context(), claims))
	recorder := httptest.NewRecorder()
	h.HandleSwitchTenant(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("switch: %d %s", recorder.Code, recorder.Body.String())
	}
	var answer struct {
		SessionToken string `json:"session_token"`
		TenantID     string `json:"tenant_id"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &answer); err != nil {
		t.Fatal(err)
	}
	if answer.SessionToken == "" || answer.SessionToken == token {
		t.Fatalf("session_token=%q, want the rotated token", answer.SessionToken)
	}
	next, err := store.Resolve(ctx, answer.SessionToken)
	if err != nil || next.WorkspaceID != second {
		t.Fatalf("rotated token: %v %+v", err, next)
	}
	if cookies := recorder.Result().Cookies(); len(cookies) != 0 {
		t.Fatalf("a bearer switch also set cookies: %v", cookies)
	}
}
