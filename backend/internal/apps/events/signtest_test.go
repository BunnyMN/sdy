package events

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gerege-systems/open-gerege-nexus/backend/pkg/nexus"
	"github.com/google/uuid"
)

// diagSigner is a rail whose every answer the test chooses.
type diagSigner struct {
	mu          sync.Mutex
	disabled    bool
	startErr    error
	pollErr     error
	state       nexus.SignatureState
	verifyErr   error
	tamper      bool
	digests     map[string]string
	regs        map[string]string
	lastRequest nexus.SignatureRequest
}

func newDiagSigner() *diagSigner {
	return &diagSigner{state: nexus.SignatureRunning, digests: map[string]string{}, regs: map[string]string{}}
}

func (s *diagSigner) set(change func(*diagSigner)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	change(s)
}

func (s *diagSigner) Enabled() bool { s.mu.Lock(); defer s.mu.Unlock(); return !s.disabled }
func (s *diagSigner) SignDigest(_ context.Context, request nexus.SignatureRequest) (nexus.SignatureSession, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.lastRequest = request
	if s.startErr != nil {
		return nexus.SignatureSession{}, s.startErr
	}
	id := uuid.NewString()
	s.digests[id], s.regs[id] = request.DigestHex, request.RegNumber
	session := nexus.SignatureSession{SessionID: id, VerificationCode: "4321"}
	if request.CallbackURL != "" {
		session.AppLink = "https://eid.example/app?session=" + id
	}
	return session, nil
}
func (s *diagSigner) PollSignature(_ context.Context, reg, session string) (nexus.SignatureState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.regs[session] != reg {
		return "", errors.New("eidsign: signature session not found")
	}
	return s.state, s.pollErr
}
func (s *diagSigner) VerifiedDigest(_ context.Context, _ string, session string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.verifyErr != nil {
		return "", s.verifyErr
	}
	raw, _ := hex.DecodeString(s.digests[session])
	if s.tamper {
		raw[0] ^= 0xff
	}
	return base64.StdEncoding.EncodeToString(raw), nil
}
func (s *diagSigner) SignDocument(context.Context, nexus.DocumentSignatureRequest) (nexus.SignatureSession, error) {
	return nexus.SignatureSession{}, nexus.ErrPDFSigningUnavailable
}
func (s *diagSigner) SignedDocument(context.Context, string, string) (nexus.SignedDocument, error) {
	return nexus.SignedDocument{}, nexus.ErrPDFSigningUnavailable
}

type signTestAnswer struct {
	SessionID        string         `json:"session_id"`
	VerificationCode string         `json:"verification_code"`
	AppLink          string         `json:"app_link"`
	ExpiresAt        string         `json:"expires_at"`
	State            string         `json:"state"`
	Diagnostic       signDiagnostic `json:"diagnostic"`
	Mode             signTestMode   `json:"mode"`
}

func (f *eventFixture) linkEID(t *testing.T, user, reg string) {
	t.Helper()
	if _, err := f.pool.Exec(context.Background(), `INSERT INTO registry.user_eid_identities (user_id, reg_number, person_etsi)
		VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING`, user, reg, "PNOMN-"+user); err != nil {
		t.Fatal(err)
	}
}

func (f *eventFixture) signTestCall(t *testing.T, path, body, user string, want int) signTestAnswer {
	t.Helper()
	w := f.request("POST", path, body, f.tenant, user, false)
	if w.Code != want {
		t.Fatalf("%s %s: %d, want %d: %s", path, body, w.Code, want, w.Body.String())
	}
	var out signTestAnswer
	decodeInto(t, w.Body.Bytes(), &out)
	return out
}

func TestSignTestReportsEachStage(t *testing.T) {
	f := newEventFixture(t)
	signer := newDiagSigner()
	nexus.Provide[nexus.Signer](signer)
	t.Cleanup(func() { nexus.Provide[nexus.Signer](newFakeSigner()) })
	member, unlinked, stranger := f.users[1], f.users[2], f.users[3]
	f.linkEID(t, member, "УБ99112233")
	f.linkEID(t, stranger, "УБ88112233")

	expect := func(got signTestAnswer, state, stage string) {
		t.Helper()
		if got.State != state || got.Diagnostic.State != state || got.Diagnostic.Stage != stage {
			t.Fatalf("want %s/%s, got %+v", state, stage, got)
		}
	}
	start := func(body string) signTestAnswer {
		t.Helper()
		return f.signTestCall(t, "/sign-test", body, member, http.StatusAccepted)
	}
	poll := func(sessionID string) signTestAnswer {
		t.Helper()
		return f.signTestCall(t, "/sign-test/poll", `{"session_id":"`+sessionID+`"}`, member, http.StatusOK)
	}

	// The rail is off.
	signer.set(func(s *diagSigner) { s.disabled = true })
	got := f.signTestCall(t, "/sign-test", ``, member, http.StatusOK)
	expect(got, "failed", stageSignerDisabled)
	if got.Mode.SignerEnabled {
		t.Fatal("a disabled rail reported enabled")
	}
	signer.set(func(s *diagSigner) { s.disabled = false })

	// No eID identity linked.
	got = f.signTestCall(t, "/sign-test", `{}`, unlinked, http.StatusOK)
	expect(got, "failed", stageIdentityMissing)
	if !strings.Contains(got.Diagnostic.Detail, "sign in with eID") {
		t.Fatalf("identity_missing does not say what to do: %q", got.Diagnostic.Detail)
	}

	// Only this site's callback page.
	status(t, f.request("POST", "/sign-test", `{"callback_url":"https://evil.example/auth/eid/callback"}`, f.tenant, member, false), http.StatusBadRequest)

	// The rail refuses to start; the reason is shown, its secrets are not.
	signer.set(func(s *diagSigner) {
		s.startErr = errors.New(`eidsign: eID answered 401: {"error":"энэ RP-д mTLS client сертификат заавал"} https://rp.example/x?sessionToken=abc123&ok=1 Bearer s3cr3t`)
	})
	got = f.signTestCall(t, "/sign-test", `{}`, member, http.StatusOK)
	expect(got, "failed", stageStartFailed)
	if d := got.Diagnostic.Detail; !strings.Contains(d, "401") || !strings.Contains(d, "mTLS") || strings.Contains(d, "abc123") || strings.Contains(d, "s3cr3t") {
		t.Fatalf("start_failed detail %q", d)
	}
	signer.set(func(s *diagSigner) { s.startErr = nil })

	// Push flow, signed and verified.
	got = start(`{}`)
	expect(got, "signing", stageWaiting)
	if got.SessionID == "" || got.VerificationCode != "4321" || got.AppLink != "" || got.ExpiresAt == "" {
		t.Fatalf("push start %+v", got)
	}
	if got.Mode.Flow != "push" || got.Mode.RegNumber != "УБ****" || !got.Mode.SignerEnabled {
		t.Fatalf("push mode %+v", got.Mode)
	}
	signer.mu.Lock()
	request := signer.lastRequest
	signer.mu.Unlock()
	if request.DisplayText != "Туршилт: E-sdy eID гарын үсэг" || request.DocumentName != "eID туршилт" || request.RegNumber != "УБ99112233" {
		t.Fatalf("signature request %+v", request)
	}
	pushed := got.SessionID
	expect(poll(pushed), "signing", stageWaiting)
	// Another member cannot read it, by id or as their latest.
	status(t, f.request("POST", "/sign-test/poll", `{"session_id":"`+pushed+`"}`, f.tenant, stranger, false), http.StatusNotFound)
	status(t, f.request("POST", "/sign-test/poll", `{}`, f.tenant, stranger, false), http.StatusNotFound)
	status(t, f.request("POST", "/sign-test/poll", `{"session_id":"`+pushed+`"}`, f.other, member, false), http.StatusNotFound)
	signer.set(func(s *diagSigner) { s.state = nexus.SignatureCompleted })
	expect(poll(pushed), "signed", stageOK)
	// Settled: the answer stays even if the rail changes its mind.
	signer.set(func(s *diagSigner) { s.tamper = true })
	expect(poll(pushed), "signed", stageOK)

	// Device flow; an empty session id means the latest.
	signer.set(func(s *diagSigner) { s.state, s.tamper = nexus.SignatureRunning, false })
	got = start(`{"callback_url":"http://example.com/auth/eid/callback?return=%2Fmember%2Fprofile"}`)
	if got.Mode.Flow != "device" || got.AppLink == "" {
		t.Fatalf("device start %+v", got)
	}
	latest := f.signTestCall(t, "/sign-test/poll", ``, member, http.StatusOK)
	if latest.SessionID != got.SessionID {
		t.Fatalf("latest session %q, want %q", latest.SessionID, got.SessionID)
	}

	// Each way the ceremony can end without a good signature.
	for _, c := range []struct {
		stage  string
		change func(*diagSigner)
		detail string
	}{
		{stageRefused, func(s *diagSigner) { s.state = nexus.SignatureRejected }, "rejected"},
		{stagePollFailed, func(s *diagSigner) {
			s.state, s.pollErr = nexus.SignatureRunning, errors.New("eidsign: poll answered 401")
		}, "401"},
		{stageDigestUnavailable, func(s *diagSigner) {
			s.state, s.verifyErr = nexus.SignatureCompleted, errors.New("eidsign: the signature failed")
		}, "failed"},
		{stageDigestMismatch, func(s *diagSigner) { s.state, s.tamper = nexus.SignatureCompleted, true }, "different digest"},
	} {
		signer.set(func(s *diagSigner) {
			s.state, s.pollErr, s.verifyErr, s.tamper = nexus.SignatureRunning, nil, nil, false
		})
		id := start(`{}`).SessionID
		signer.set(c.change)
		got := poll(id)
		expect(got, "failed", c.stage)
		if !strings.Contains(got.Diagnostic.Detail, c.detail) {
			t.Fatalf("%s detail %q", c.stage, got.Diagnostic.Detail)
		}
		if c.stage == stageRefused && got.Diagnostic.EIDState != "rejected" {
			t.Fatalf("refused without eID's state: %+v", got.Diagnostic)
		}
	}
}

func TestSignTestStoreExpiresAndIsBounded(t *testing.T) {
	var store signTestStore
	now := time.Now()
	store.put("a", &signTestEntry{tenant: "t", user: "u", created: now})
	if _, _, ok := store.find("t", "u", "a", now.Add(signTestTTL-time.Second)); !ok {
		t.Fatal("a fresh session was not found")
	}
	if _, _, ok := store.find("t", "other", "a", now); ok {
		t.Fatal("another user found the session")
	}
	if _, _, ok := store.find("t", "u", "a", now.Add(signTestTTL+time.Second)); ok {
		t.Fatal("an expired session was found")
	}
	if _, _, ok := store.find("t", "u", "", now.Add(signTestTTL+time.Second)); ok {
		t.Fatal("an expired session was the latest")
	}
	for i := range signTestMaxKept + 50 {
		store.put(fmt.Sprint("s", i), &signTestEntry{tenant: "t", user: "u", created: now.Add(time.Duration(i) * time.Millisecond)})
	}
	if n := len(store.entries); n > signTestMaxKept {
		t.Fatalf("the store holds %d sessions", n)
	}
	if _, _, ok := store.find("t", "u", "s0", now); ok {
		t.Fatal("the oldest session survived a full store")
	}
	if id, _, ok := store.find("t", "u", "", now); !ok || id != fmt.Sprint("s", signTestMaxKept+49) {
		t.Fatalf("latest %q", id)
	}
}

func TestDiagnosticTextHidesSecrets(t *testing.T) {
	in := `Post "https://rp.example/v3?api_key=K1&access_token=T2": Authorization: Bearer B3 {"sessionSecret":"S4"} password=P5`
	out := diagnosticText(in)
	for _, secret := range []string{"K1", "T2", "B3", "S4", "P5"} {
		if strings.Contains(out, secret) {
			t.Fatalf("%q survived in %q", secret, out)
		}
	}
	if !strings.Contains(out, "rp.example") {
		t.Fatalf("the useful part was lost: %q", out)
	}
	if n := len([]rune(diagnosticText(strings.Repeat("я", 900)))); n > signTestMaxText+1 {
		t.Fatalf("detail is %d runes", n)
	}
	if maskReg("УБ99112233") != "УБ****" || maskReg("") != "" {
		t.Fatal("mask")
	}
}
