package events

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/gerege-systems/open-gerege-nexus/backend/pkg/nexus"
)

// The eID signature test: a member asks eID Mongolia to sign a harmless
// document with PIN2 — exactly the ceremony a discussion vote uses — and is
// told, stage by stage, where it stopped and what the rail said. A vote's
// failure is answered with one generic sentence; this is where the real reason
// is shown, to the member it happened to, so they can send it on.
//
// Nothing is recorded but an audit line: the session lives in memory for a
// quarter of an hour and is gone after a restart, which for a diagnostic is
// what it should be.

const (
	signTestTTL     = 15 * time.Minute
	signTestMaxKept = 1000
	signTestMaxText = 500
)

// The diagnostic stages, in the order a ceremony can reach them.
const (
	stageSignerDisabled    = "signer_disabled"
	stageIdentityMissing   = "identity_missing"
	stageStartFailed       = "start_failed"
	stageWaiting           = "waiting"
	stagePollFailed        = "poll_failed"
	stageRefused           = "refused"
	stageDigestUnavailable = "digest_unavailable"
	stageDigestMismatch    = "digest_mismatch"
	stageSessionMissing    = "session_missing"
	stageOK                = "ok"
)

type signTestEntry struct {
	tenant, user string
	digestHex    string
	created      time.Time
	device       bool
	regMasked    string
	// final is the settled outcome, kept so a repeated poll answers the same
	// thing without asking eID or auditing twice.
	final *signDiagnostic
}

// signTestStore is the in-memory session table. Its zero value is ready.
type signTestStore struct {
	mu      sync.Mutex
	entries map[string]*signTestEntry
}

// pruneLocked drops expired entries and, when the table is full, the oldest.
func (s *signTestStore) pruneLocked(now time.Time) {
	for id, e := range s.entries {
		if now.Sub(e.created) > signTestTTL {
			delete(s.entries, id)
		}
	}
	for len(s.entries) >= signTestMaxKept {
		oldest, at := "", now
		for id, e := range s.entries {
			if !e.created.After(at) {
				oldest, at = id, e.created
			}
		}
		delete(s.entries, oldest)
	}
}

func (s *signTestStore) put(id string, e *signTestEntry) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.entries == nil {
		s.entries = map[string]*signTestEntry{}
	}
	s.pruneLocked(e.created)
	s.entries[id] = e
}

// find is the caller's own unexpired session: the named one, or the latest.
// Somebody else's answers the same as an unknown one.
func (s *signTestStore) find(tenant, user, id string, now time.Time) (string, *signTestEntry, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if id != "" {
		e, ok := s.entries[id]
		if !ok || e.tenant != tenant || e.user != user || now.Sub(e.created) > signTestTTL {
			return "", nil, false
		}
		return id, e, true
	}
	var latestID string
	var latest *signTestEntry
	for key, e := range s.entries {
		if e.tenant != tenant || e.user != user || now.Sub(e.created) > signTestTTL {
			continue
		}
		if latest == nil || e.created.After(latest.created) {
			latestID, latest = key, e
		}
	}
	return latestID, latest, latest != nil
}

// settle records the outcome once; first reports whether this call did.
func (s *signTestStore) settle(e *signTestEntry, d signDiagnostic) (first bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if e.final != nil {
		return false
	}
	e.final = &d
	return true
}

func (s *signTestStore) settled(e *signTestEntry) *signDiagnostic {
	s.mu.Lock()
	defer s.mu.Unlock()
	return e.final
}

type signDiagnostic struct {
	State  string `json:"state"` // signing | signed | failed
	Stage  string `json:"stage"`
	Detail string `json:"detail"`
	// EIDState is eID's own word for a ceremony that ended without a signature.
	EIDState string `json:"eid_state,omitempty"`
}

type signTestMode struct {
	SignerEnabled bool `json:"signer_enabled"`
	// Flow is "device" (the eID app opened on this phone, returning to the
	// callback) or "push" (a notification to the member's phone).
	Flow      string `json:"flow"`
	RegNumber string `json:"reg_number"`
}

// maskReg keeps the first two characters — the letters of a registration
// number — and hides the rest.
func maskReg(reg string) string {
	runes := []rune(strings.TrimSpace(reg))
	if len(runes) == 0 {
		return ""
	}
	if len(runes) > 2 {
		runes = runes[:2]
	}
	return string(runes) + "****"
}

var (
	secretWords = `[a-z_\-]*(?:token|secret|password|passwd|api_?key|apikey|authorization|signature|sig|code_verifier)`
	// key=value, as in a query string or a form.
	secretParam = regexp.MustCompile(`(?i)(\b` + secretWords + `=)[^&\s"]+`)
	// "key":"value", as in a JSON body eID echoed back.
	secretJSON  = regexp.MustCompile(`(?i)("` + secretWords + `"\s*:\s*")[^"]*`)
	bearerValue = regexp.MustCompile(`(?i)\b(bearer|basic)\s+[A-Za-z0-9._~+/=\-]+`)
)

// diagnosticText is an error as the member may see it: trimmed, bounded, and
// with anything shaped like a credential replaced.
func diagnosticText(text string) string {
	text = strings.TrimSpace(text)
	text = bearerValue.ReplaceAllString(text, "$1 ***")
	text = secretParam.ReplaceAllString(text, "${1}***")
	text = secretJSON.ReplaceAllString(text, "${1}***")
	if runes := []rune(text); len(runes) > signTestMaxText {
		text = string(runes[:signTestMaxText]) + "…"
	}
	return text
}

func errText(err error) string {
	if err == nil {
		return ""
	}
	return diagnosticText(err.Error())
}

// signTestDocument is what the member signs. It says what it is, so that
// nobody could present it as a vote or a decision.
func signTestDocument(tenantID, userID, name string, at time.Time) string {
	return strings.Join([]string{
		"E-sdy — eID гарын үсгийн туршилт",
		"Салбар: " + tenantID,
		"Гишүүн: " + name + " (" + userID + ")",
		"Огноо: " + at.In(ulaanbaatar).Format("2006-01-02 15:04:05") + " (Улаанбаатар)",
		"Энэ бол туршилт; ямар нэг санал, шийдвэр биш.",
	}, "\n")
}

func (m *Module) signTestFailed(ctx context.Context, claims nexus.UserClaims, sessionID string, mode signTestMode, d signDiagnostic) {
	slog.WarnContext(ctx, "events: eID sign test did not succeed",
		"stage", d.Stage, "error", d.Detail, "eid_state", d.EIDState, "session_id", sessionID,
		"flow", mode.Flow, "reg_number", mode.RegNumber, "tenant_id", claims.WorkspaceID)
}

// signTest starts a test ceremony.
func (m *Module) signTest(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	var in struct {
		CallbackURL string `json:"callback_url"`
	}
	if err := decode(r, &in); err != nil && !errors.Is(err, io.EOF) {
		nexus.Error(w, http.StatusBadRequest, "the request could not be read")
		return
	}
	callback, err := sameSiteCallback(r, in.CallbackURL)
	if err != nil {
		nexus.Error(w, http.StatusBadRequest, "invalid callback URL")
		return
	}
	ctx := r.Context()
	if !claims.IsAdmin && !m.isActiveMember(ctx, claims.WorkspaceID, claims.UserID) {
		nexus.Error(w, http.StatusForbidden, "only members of this branch may run the test")
		return
	}
	mode := signTestMode{Flow: "push"}
	if callback != "" {
		mode.Flow = "device"
	}
	answer := func(code int, sessionID string, d signDiagnostic, extra map[string]any) {
		if d.State == "failed" {
			m.signTestFailed(ctx, claims, sessionID, mode, d)
		}
		nexus.Audit(ctx, claims.WorkspaceID, claims.UserID, "events.sign_test", sessionID, map[string]any{
			"phase": "start", "stage": d.Stage, "flow": mode.Flow, "signer_enabled": mode.SignerEnabled,
		})
		body := map[string]any{"diagnostic": d, "mode": mode, "state": d.State}
		for k, v := range extra {
			body[k] = v
		}
		nexus.JSON(w, code, body)
	}

	signer, capErr := nexus.Capability[nexus.Signer]()
	mode.SignerEnabled = capErr == nil && signer.Enabled()
	if !mode.SignerEnabled {
		detail := "this installation has no eID signing rail configured (EID_RP_UUID / EID_RP_SECRET)"
		if capErr != nil {
			detail = errText(capErr)
		}
		answer(http.StatusOK, "", signDiagnostic{State: "failed", Stage: stageSignerDisabled, Detail: detail}, nil)
		return
	}
	regNumber, name, err := m.signerIdentity(ctx, claims.UserID)
	mode.RegNumber = maskReg(regNumber)
	if err != nil {
		answer(http.StatusOK, "", signDiagnostic{State: "failed", Stage: stageIdentityMissing,
			Detail: "could not read the eID identity: " + errText(err)}, nil)
		return
	}
	if regNumber == "" {
		answer(http.StatusOK, "", signDiagnostic{State: "failed", Stage: stageIdentityMissing,
			Detail: "no eID-linked registration number on this account; sign in with eID Mongolia once"}, nil)
		return
	}
	now := time.Now()
	digest := sha256.Sum256([]byte(signTestDocument(claims.WorkspaceID, claims.UserID, name, now)))
	digestHex := hex.EncodeToString(digest[:])
	session, err := signer.SignDigest(ctx, nexus.SignatureRequest{
		RegNumber: regNumber, FullName: name, DigestHex: digestHex,
		DisplayText:  "Туршилт: E-sdy eID гарын үсэг",
		DocumentName: "eID туршилт",
		CallbackURL:  callback,
	})
	if err != nil {
		answer(http.StatusOK, "", signDiagnostic{State: "failed", Stage: stageStartFailed, Detail: errText(err)}, nil)
		return
	}
	if session.SessionID == "" {
		answer(http.StatusOK, "", signDiagnostic{State: "failed", Stage: stageStartFailed,
			Detail: "eID started a ceremony but returned no session id"}, nil)
		return
	}
	detail := "eID has asked for PIN2"
	if mode.Flow == "device" && session.AppLink == "" {
		detail = "eID started the ceremony but returned no app link for this phone"
	}
	m.signTests.put(session.SessionID, &signTestEntry{tenant: claims.WorkspaceID, user: claims.UserID,
		digestHex: digestHex, created: now, device: mode.Flow == "device", regMasked: mode.RegNumber})
	answer(http.StatusAccepted, session.SessionID, signDiagnostic{State: "signing", Stage: stageWaiting, Detail: detail},
		map[string]any{
			"session_id":        session.SessionID,
			"verification_code": session.VerificationCode,
			"app_link":          session.AppLink,
			"expires_at":        stamp(now.Add(signTestTTL)),
		})
}

// pollSignTest asks eID how the caller's test ceremony stands and, once it
// completed, checks the signature covers the document this server prepared —
// the same check a vote is counted on.
func (m *Module) pollSignTest(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	var in struct {
		SessionID string `json:"session_id"`
	}
	_ = decode(r, &in)
	ctx := r.Context()
	sessionID, entry, found := m.signTests.find(claims.WorkspaceID, claims.UserID, strings.TrimSpace(in.SessionID), time.Now())
	if !found {
		nexus.JSON(w, http.StatusNotFound, map[string]any{
			"error": "no such sign test", "state": "failed",
			"diagnostic": signDiagnostic{State: "failed", Stage: stageSessionMissing,
				Detail: "the test session is unknown, belongs to someone else, or expired after 15 minutes"},
		})
		return
	}
	mode := signTestMode{Flow: "push", RegNumber: entry.regMasked}
	if entry.device {
		mode.Flow = "device"
	}
	answer := func(d signDiagnostic) {
		if d.State != "signing" && m.signTests.settle(entry, d) {
			if d.State == "failed" {
				m.signTestFailed(ctx, claims, sessionID, mode, d)
			}
			nexus.Audit(ctx, claims.WorkspaceID, claims.UserID, "events.sign_test", sessionID, map[string]any{
				"phase": "outcome", "stage": d.Stage, "eid_state": d.EIDState, "flow": mode.Flow,
			})
		}
		nexus.JSON(w, http.StatusOK, map[string]any{"session_id": sessionID, "state": d.State, "diagnostic": d, "mode": mode})
	}
	signer, capErr := nexus.Capability[nexus.Signer]()
	mode.SignerEnabled = capErr == nil && signer.Enabled()
	if final := m.signTests.settled(entry); final != nil {
		answer(*final)
		return
	}
	if !mode.SignerEnabled {
		answer(signDiagnostic{State: "failed", Stage: stageSignerDisabled, Detail: "eID signing is no longer configured on this installation"})
		return
	}
	regNumber, _, err := m.signerIdentity(ctx, claims.UserID)
	if err != nil || regNumber == "" {
		detail := "the eID identity is no longer linked to this account"
		if err != nil {
			detail = "could not read the eID identity: " + errText(err)
		}
		answer(signDiagnostic{State: "failed", Stage: stageIdentityMissing, Detail: detail})
		return
	}
	state, err := signer.PollSignature(ctx, regNumber, sessionID)
	if err != nil {
		answer(signDiagnostic{State: "failed", Stage: stagePollFailed, Detail: errText(err)})
		return
	}
	switch state {
	case nexus.SignatureRunning:
		answer(signDiagnostic{State: "signing", Stage: stageWaiting, Detail: "eID reports the ceremony is still running"})
		return
	case nexus.SignatureCompleted:
	default:
		answer(signDiagnostic{State: "failed", Stage: stageRefused, EIDState: string(state),
			Detail: diagnosticText("eID ended the ceremony without a signature: " + string(state))})
		return
	}
	signed, err := signer.VerifiedDigest(ctx, regNumber, sessionID)
	if err != nil {
		answer(signDiagnostic{State: "failed", Stage: stageDigestUnavailable, Detail: errText(err)})
		return
	}
	want, _ := hex.DecodeString(entry.digestHex)
	if expected := base64.StdEncoding.EncodeToString(want); signed != expected {
		answer(signDiagnostic{State: "failed", Stage: stageDigestMismatch,
			Detail: diagnosticText("eID signed a different digest: expected " + expected + ", got " + signed)})
		return
	}
	answer(signDiagnostic{State: "signed", Stage: stageOK, Detail: "the digest eID signed matches the test document"})
}
