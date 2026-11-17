package push

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/chacha20poly1305"
)

func TestTheAPNsAnswerDecidesTheRetry(t *testing.T) {
	for _, tc := range []struct {
		status int
		reason string
		want   outcome
	}{
		{200, "", delivered},
		{410, "Unregistered", tokenGone},
		{400, "BadDeviceToken", tokenGone},
		{400, "DeviceTokenNotForTopic", tokenGone},
		{429, "TooManyRequests", temporary},
		{500, "InternalServerError", temporary},
		{503, "ServiceUnavailable", temporary},
		{403, "ExpiredProviderToken", temporary},
		{400, "PayloadTooLarge", permanent},
		{400, "BadTopic", permanent},
	} {
		if got := classify(tc.status, tc.reason); got != tc.want {
			t.Errorf("%d %s: %v, want %v", tc.status, tc.reason, got, tc.want)
		}
	}
}

func seal(t *testing.T, key []byte, token string) string {
	t.Helper()
	aead, _ := chacha20poly1305.NewX(key)
	nonce := make([]byte, aead.NonceSize())
	_, _ = rand.Read(nonce)
	return base64.StdEncoding.EncodeToString(append(nonce, aead.Seal(nil, nonce, []byte(token), nil)...))
}

// fakeAPNs answers each device token from a script: the next status in its
// list, then 200.
type fakeAPNs struct {
	delay   time.Duration
	mu      sync.Mutex
	script  map[string][]int
	reasons map[int]string
	got     map[string]int
}

func (f *fakeAPNs) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	device := strings.TrimPrefix(r.URL.Path, "/3/device/")
	if f.delay > 0 {
		select {
		case <-time.After(f.delay):
		case <-r.Context().Done():
			return
		}
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.got[device]++
	status := 200
	if list := f.script[device]; len(list) > 0 {
		status, f.script[device] = list[0], list[1:]
	}
	w.WriteHeader(status)
	if status != 200 {
		_, _ = w.Write([]byte(`{"reason":"` + f.reasons[status] + `"}`))
	}
}

// Delivery is at least once with a bounded retry: a 5xx is tried again, a
// dead token is forgotten without a retry, a person with only an FCM token is
// not claimed, and five failures in a row are given up.
func TestDeliveryRetriesTemporaryFailuresAndGivesUp(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to a migrated test database")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	encryption := make([]byte, 32)
	_, _ = rand.Read(encryption)
	t.Setenv("PUSH_TOKEN_ENCRYPTION_KEY", base64.StdEncoding.EncodeToString(encryption))

	tenant := uuid.NewString()
	users := []string{uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()}
	flaky, dead, fcmOnly, broken := users[0], users[1], users[2], users[3]
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM registry.tenants WHERE id=$1`, tenant)
		_, _ = pool.Exec(context.Background(), `DELETE FROM registry.users WHERE id=ANY($1::uuid[])`, users)
	})
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec(`INSERT INTO registry.tenants(id,slug,name) VALUES($1,$2,'Push retry')`, tenant, "push-retry-"+tenant)
	for i, user := range users {
		exec(`INSERT INTO registry.users(id,email,name,password_hash) VALUES($1,$2,'Push member','unused')`, user, user+"@push.test")
		provider := "APNS"
		if user == fcmOnly {
			provider = "FCM"
		}
		device := "device-" + string(rune('a'+i))
		exec(`INSERT INTO workspace.push_tokens(tenant_id,user_id,provider,token_hash,token_ciphertext,app_id) VALUES($1,$2,$3,$4,$5,'mn.esdy.member')`,
			tenant, user, provider, "hash-"+user, seal(t, encryption, device))
	}
	// Other tests' notifications are settled so this batch is only ours.
	exec(`UPDATE registry.member_notifications SET pushed_at=now() WHERE pushed_at IS NULL`)
	for _, user := range users {
		exec(`INSERT INTO registry.member_notifications(user_id,event_key,kind,title,body,path) VALUES($1,'retry','event','Шинэ','','/member')`, user)
	}

	apns := &fakeAPNs{
		script:  map[string][]int{"device-a": {503}, "device-b": {400}, "device-d": {500, 500, 500, 500, 500}},
		reasons: map[int]string{400: "BadDeviceToken", 500: "InternalServerError", 503: "ServiceUnavailable"},
		got:     map[string]int{},
	}
	server := httptest.NewServer(apns)
	t.Cleanup(server.Close)
	key, _ := testKey(t)
	s := New(pool, Config{Key: key, KeyID: "ABC123DEFG", TeamID: "T65Z28HF29", Topic: "mn.esdy.member"})
	s.hosts = map[bool]string{false: server.URL, true: server.URL}

	state := func(user string) (attempts int, pushed bool) {
		t.Helper()
		if err := pool.QueryRow(ctx, `SELECT push_attempts, pushed_at IS NOT NULL FROM registry.member_notifications WHERE user_id=$1`, user).Scan(&attempts, &pushed); err != nil {
			t.Fatal(err)
		}
		return
	}
	due := func() {
		exec(`UPDATE registry.member_notifications SET push_next_attempt_at=now()-interval '1 second' WHERE user_id=ANY($1::uuid[]) AND pushed_at IS NULL`, users)
	}

	if _, err := s.Deliver(ctx); err != nil {
		t.Fatal(err)
	}
	if a, p := state(flaky); a != 1 || p {
		t.Fatalf("after a 503: attempts=%d pushed=%v; want a retry", a, p)
	}
	if a, p := state(dead); a != 1 || !p {
		t.Fatalf("dead token: attempts=%d pushed=%v; want completed", a, p)
	}
	var tokens int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM workspace.push_tokens WHERE user_id=$1`, dead).Scan(&tokens); err != nil || tokens != 0 {
		t.Fatalf("dead token kept: %d %v", tokens, err)
	}
	if a, p := state(fcmOnly); a != 0 || p {
		t.Fatalf("FCM-only: attempts=%d pushed=%v; want untouched", a, p)
	}
	// Not due yet: a second round straight away sends nothing.
	if sent, err := s.Deliver(ctx); err != nil || sent != 0 {
		t.Fatalf("early round sent %d (%v)", sent, err)
	}
	for range 4 {
		due()
		if _, err := s.Deliver(ctx); err != nil {
			t.Fatal(err)
		}
	}
	if a, p := state(flaky); a != 2 || !p || apns.got["device-a"] != 2 {
		t.Fatalf("flaky: attempts=%d pushed=%v sends=%d; want delivered on the second attempt", a, p, apns.got["device-a"])
	}
	if a, p := state(broken); a != 5 || !p || apns.got["device-d"] != 5 {
		t.Fatalf("broken: attempts=%d pushed=%v sends=%d; want given up after five", a, p, apns.got["device-d"])
	}
	due()
	if _, err := s.Deliver(ctx); err != nil {
		t.Fatal(err)
	}
	if apns.got["device-d"] != 5 || apns.got["device-c"] != 0 {
		t.Fatalf("sends after giving up: %v", apns.got)
	}
}

// A slow APNs uses up the round's deadline. What was delivered before then is
// still completed — on a context of its own — and what was not reached is
// retried, not resent forever and not marked delivered.
func TestASlowAPNsRoundStillSettlesWhatItLearnt(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to a migrated test database")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	encryption := make([]byte, 32)
	_, _ = rand.Read(encryption)
	t.Setenv("PUSH_TOKEN_ENCRYPTION_KEY", base64.StdEncoding.EncodeToString(encryption))
	tenant := uuid.NewString()
	users := []string{uuid.NewString(), uuid.NewString(), uuid.NewString()}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM registry.tenants WHERE id=$1`, tenant)
		_, _ = pool.Exec(context.Background(), `DELETE FROM registry.users WHERE id=ANY($1::uuid[])`, users)
	})
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec(`INSERT INTO registry.tenants(id,slug,name) VALUES($1,$2,'Slow APNs')`, tenant, "slow-apns-"+tenant)
	exec(`UPDATE registry.member_notifications SET pushed_at=now() WHERE pushed_at IS NULL`)
	for i, user := range users {
		exec(`INSERT INTO registry.users(id,email,name,password_hash) VALUES($1,$2,'Slow member','unused')`, user, user+"@slow.test")
		exec(`INSERT INTO workspace.push_tokens(tenant_id,user_id,provider,token_hash,token_ciphertext,app_id) VALUES($1,$2,'APNS',$3,$4,'mn.esdy.member')`,
			tenant, user, "slow-"+user, seal(t, encryption, "slow-device"))
		exec(`INSERT INTO registry.member_notifications(user_id,event_key,kind,title,body,path,created_at) VALUES($1,'slow','event','Удаан','','/member',now()-make_interval(secs=>$2))`, user, 10-i)
	}
	apns := &fakeAPNs{delay: 400 * time.Millisecond, script: map[string][]int{}, reasons: map[int]string{}, got: map[string]int{}}
	server := httptest.NewServer(apns)
	t.Cleanup(server.Close)
	key, _ := testKey(t)
	s := New(pool, Config{Key: key, KeyID: "ABC123DEFG", TeamID: "T65Z28HF29", Topic: "mn.esdy.member"})
	s.hosts = map[bool]string{false: server.URL, true: server.URL}

	// Time for one answer, not three.
	round, cancel := context.WithTimeout(ctx, 600*time.Millisecond)
	defer cancel()
	sent, err := s.Deliver(round)
	if err != nil {
		t.Fatalf("the round failed to settle: %v", err)
	}
	if sent != 1 {
		t.Fatalf("sent %d, want 1 before the deadline", sent)
	}
	state := func(user string) (attempts int, pushed bool, next bool) {
		t.Helper()
		if err := pool.QueryRow(ctx, `SELECT push_attempts, pushed_at IS NOT NULL, push_next_attempt_at IS NOT NULL AND push_next_attempt_at < now() + interval '1 minute'
			FROM registry.member_notifications WHERE user_id=$1`, user).Scan(&attempts, &pushed, &next); err != nil {
			t.Fatal(err)
		}
		return
	}
	// claim_pushes does not promise an order, so which one got through is
	// not asserted — only that one did and the other two will be retried.
	completed, retried := 0, 0
	for _, user := range users {
		a, p, soon := state(user)
		switch {
		case a == 1 && p:
			completed++
		case a == 1 && !p && soon:
			retried++
		default:
			t.Fatalf("attempts=%d pushed=%v retry-soon=%v", a, p, soon)
		}
	}
	if completed != 1 || retried != 2 {
		t.Fatalf("completed=%d retried=%d; want 1 and 2", completed, retried)
	}
}

// claim_pushes never hands out a sixth attempt, even when the fifth never
// reported back.
func TestClaimStopsAtFiveAttempts(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to a migrated test database")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	tenant, user := uuid.NewString(), uuid.NewString()
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM registry.tenants WHERE id=$1`, tenant)
		_, _ = pool.Exec(context.Background(), `DELETE FROM registry.users WHERE id=$1`, user)
	})
	for _, q := range []struct {
		sql  string
		args []any
	}{
		{`INSERT INTO registry.tenants(id,slug,name) VALUES($1,$2,'Cap')`, []any{tenant, "cap-" + tenant}},
		{`INSERT INTO registry.users(id,email,name,password_hash) VALUES($1,$2,'Cap','unused')`, []any{user, user + "@cap.test"}},
		{`INSERT INTO workspace.push_tokens(tenant_id,user_id,provider,token_hash,token_ciphertext,app_id) VALUES($1,$2,'APNS',$3,'sealed','mn.esdy.member')`, []any{tenant, user, "cap-" + user}},
		{`UPDATE registry.member_notifications SET pushed_at=now() WHERE pushed_at IS NULL`, nil},
		{`INSERT INTO registry.member_notifications(user_id,event_key,kind,title,body,path,push_attempts,push_next_attempt_at) VALUES($1,'cap','event','Cap','','/member',5,now()-interval '1 minute')`, []any{user}},
	} {
		if _, err := pool.Exec(ctx, q.sql, q.args...); err != nil {
			t.Fatal(err)
		}
	}
	var claimed int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM registry.claim_pushes(500) WHERE user_id=$1`, user).Scan(&claimed); err != nil || claimed != 0 {
		t.Fatalf("claimed %d at five attempts (%v)", claimed, err)
	}
}
