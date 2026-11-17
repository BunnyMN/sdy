package events

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gerege-systems/open-gerege-nexus/backend/internal/apps/events/pdfdoc"
	"github.com/gerege-systems/open-gerege-nexus/backend/pkg/nexus"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

// Signing one archive document, in turn. The HTTP shape is the vote's —
// POST …/sign answers {session_id, verification_code, app_link, state}, POST
// …/sign/poll answers {state} — so the apps reuse the same PIN2 screens.
//
// What is signed is the latest stored revision, byte for byte; what is stored
// afterwards is eID's stamped PDF, and only if it is that revision with one
// signature appended. Every failure is logged with its stage, like the sign
// test (signtest.go), and the reason is kept on the signer's row.

// Archive signing stages, for the log and for last_error.
const (
	archiveStageStart        = "start_failed"
	archiveStagePoll         = "poll_failed"
	archiveStageRefused      = "refused"
	archiveStageDigest       = "digest_mismatch"
	archiveStageStamp        = "stamp_failed"
	archiveStageIncremental  = "not_incremental"
	archiveStageLocked       = "locked_by_signature"
	archiveStageExpired      = "expired"
	archiveStageStore        = "store_failed"
	errArchiveNotYourTurn    = "it is not your turn to sign this document"
	errArchiveNotOutForSigns = "this document is not out for signature"
)

// currentSigner is the signer whose turn it is, locked with the document.
type currentSigner struct {
	id, userID, status, session, digest string
	order, baseRevision                 int
	started                             *time.Time
}

func (m *Module) lockCurrentSigner(ctx context.Context, tx pgx.Tx, tenantID, docID string) (ArchiveDocument, currentSigner, error) {
	var s currentSigner
	d, err := m.loadArchive(ctx, tx, tenantID, "", docID, true)
	if err != nil {
		return d, s, err
	}
	if d.Status != "signing" {
		return d, s, errConflict(errArchiveNotOutForSigns)
	}
	var base *int
	err = tx.QueryRow(ctx, `SELECT id::text, user_id::text, status, COALESCE(sign_session_id,''), COALESCE(digest_hex,''),
		sign_order, base_revision, session_started_at
		FROM events_archive_signers WHERE tenant_id = $1::uuid AND document_id = $2::uuid AND status <> 'signed'
		ORDER BY sign_order LIMIT 1 FOR UPDATE`, tenantID, docID).
		Scan(&s.id, &s.userID, &s.status, &s.session, &s.digest, &s.order, &base, &s.started)
	if base != nil {
		s.baseRevision = *base
	}
	return d, s, err
}

func (m *Module) latestRevision(ctx context.Context, q querier, tenantID, docID string) ([]byte, int, error) {
	var pdf []byte
	var revision int
	err := q.QueryRow(ctx, `SELECT pdf, revision FROM events_archive_versions WHERE tenant_id = $1::uuid AND document_id = $2::uuid
		ORDER BY revision DESC LIMIT 1`, tenantID, docID).Scan(&pdf, &revision)
	return pdf, revision, err
}

func archiveFileName(d ArchiveDocument) string {
	return "sdy-" + d.Kind + "-" + strings.ReplaceAll(d.Number, "/", "-") + ".pdf"
}

func (m *Module) archiveSign(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	var in struct {
		CallbackURL string `json:"callback_url"`
	}
	_ = decode(r, &in)
	callback, err := sameSiteCallback(r, in.CallbackURL)
	if err != nil {
		nexus.Error(w, http.StatusBadRequest, "invalid callback URL")
		return
	}
	ctx := r.Context()
	docID := chi.URLParam(r, "docID")

	// Check and read under the lock, then let go of it before asking eID:
	// that is a network call, and the row must not wait on somebody's phone.
	tx, err := m.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		archiveError(w, err)
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()
	d, current, err := m.lockCurrentSigner(ctx, tx, claims.WorkspaceID, docID)
	if errors.Is(err, pgx.ErrNoRows) && d.ID != "" {
		err = errConflict(errArchiveNotOutForSigns)
	}
	if err != nil {
		archiveError(w, err)
		return
	}
	if current.userID != claims.UserID {
		nexus.Error(w, http.StatusForbidden, errArchiveNotYourTurn)
		return
	}
	if !m.isMember(ctx, claims.WorkspaceID, claims.UserID) {
		nexus.Error(w, http.StatusForbidden, "only an active member of this branch may sign")
		return
	}
	pdf, revision, err := m.latestRevision(ctx, tx, claims.WorkspaceID, docID)
	if err != nil {
		archiveError(w, err)
		return
	}
	_ = tx.Rollback(ctx)

	signer, err := nexus.Capability[nexus.Signer]()
	if err != nil || !signer.Enabled() {
		nexus.Error(w, http.StatusServiceUnavailable, "eID signing is not available on this installation")
		return
	}
	regNumber, name, err := m.signerIdentity(ctx, claims.UserID)
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not read your eID identity")
		return
	}
	if regNumber == "" {
		nexus.Error(w, http.StatusConflict, "sign in with eID Mongolia once so you can sign documents")
		return
	}
	sum := sha256.Sum256(pdf)
	digest := hex.EncodeToString(sum[:])
	session, err := signer.SignDocument(ctx, nexus.DocumentSignatureRequest{
		RegNumber: regNumber, FullName: name, FileName: archiveFileName(d), PDF: pdf,
		DisplayText:       clip("Гарын үсэг: "+d.Number+" "+d.Title, 60),
		CallbackURL:       callback,
		RailSignatureOnly: true,
	})
	if err != nil {
		reason := diagnosticText(err.Error())
		slog.WarnContext(ctx, "events: eID could not start an archive signature", "stage", archiveStageStart, "error", reason,
			"document_id", docID, "revision", revision, "device", callback != "")
		m.recordSignerError(ctx, claims.WorkspaceID, current.id, archiveStageStart+": "+reason)
		if errors.Is(err, nexus.ErrPDFSigningUnavailable) {
			nexus.Error(w, http.StatusServiceUnavailable, "this installation cannot sign PDF documents")
			return
		}
		nexus.Error(w, http.StatusBadGateway, "eID Mongolia could not start the signature")
		return
	}
	// The session is recorded only if nothing moved meanwhile: the same signer
	// is still next and the latest revision is still the one sent to eID.
	tag, err := m.db.Exec(ctx, `UPDATE events_archive_signers s SET status = 'signing', sign_session_id = $4, session_started_at = now(),
		base_revision = $5, digest_hex = $6, attempts = s.attempts + 1, last_error = '', updated_at = now()
		WHERE s.tenant_id = $1::uuid AND s.id = $2::uuid AND s.user_id = $3::uuid AND s.status <> 'signed'
		  AND (SELECT d.status FROM events_archive_documents d WHERE d.id = s.document_id) = 'signing'
		  AND (SELECT max(v.revision) FROM events_archive_versions v WHERE v.document_id = s.document_id) = $5`,
		claims.WorkspaceID, current.id, claims.UserID, session.SessionID, revision, digest)
	if err != nil {
		archiveError(w, err)
		return
	}
	if tag.RowsAffected() == 0 {
		nexus.Error(w, http.StatusConflict, "the document changed while the signature was starting; try again")
		return
	}
	nexus.JSON(w, http.StatusAccepted, map[string]any{"session_id": session.SessionID, "verification_code": session.VerificationCode,
		"app_link": session.AppLink, "state": "signing"})
}

func clip(s string, n int) string {
	if runes := []rune(strings.TrimSpace(s)); len(runes) > n {
		return string(runes[:n])
	}
	return strings.TrimSpace(s)
}

func (m *Module) recordSignerError(ctx context.Context, tenantID, signerID, reason string) {
	_, _ = m.db.Exec(ctx, `UPDATE events_archive_signers SET last_error = $3, updated_at = now()
		WHERE tenant_id = $1::uuid AND id = $2::uuid AND status <> 'signed'`, tenantID, signerID, clip(reason, 300))
}

// refuseSigner ends a ceremony that cannot finish; the signer may start again.
func (m *Module) refuseSigner(ctx context.Context, tenantID, signerID, session, reason string) {
	_, _ = m.db.Exec(ctx, `UPDATE events_archive_signers SET status = 'refused', last_error = $4, updated_at = now()
		WHERE tenant_id = $1::uuid AND id = $2::uuid AND sign_session_id = $3 AND status = 'signing'`,
		tenantID, signerID, session, clip(reason, 300))
}

func (m *Module) archivePoll(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	var in struct {
		SessionID string `json:"session_id"`
	}
	_ = decode(r, &in)
	ctx := r.Context()
	docID := chi.URLParam(r, "docID")
	var signerID, status, session, digest, lastError string
	var base *int
	var started *time.Time
	var docStatus string
	err := m.db.QueryRow(ctx, `SELECT s.id::text, s.status, COALESCE(s.sign_session_id,''), COALESCE(s.digest_hex,''), s.base_revision,
		s.session_started_at, s.last_error, d.status
		FROM events_archive_signers s JOIN events_archive_documents d ON d.id = s.document_id
		WHERE s.tenant_id = $1::uuid AND s.document_id = $2::uuid AND s.user_id = $3::uuid`,
		claims.WorkspaceID, docID, claims.UserID).Scan(&signerID, &status, &session, &digest, &base, &started, &lastError, &docStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		nexus.Error(w, http.StatusNotFound, "no such signature")
		return
	}
	if err != nil {
		archiveError(w, err)
		return
	}
	answer := func(state string, extra map[string]any) {
		out := map[string]any{"state": state, "document_status": docStatus}
		for k, v := range extra {
			out[k] = v
		}
		nexus.JSON(w, http.StatusOK, out)
	}
	if want := strings.TrimSpace(in.SessionID); want != "" && want != session && status != "signed" {
		nexus.Error(w, http.StatusNotFound, "no such signature")
		return
	}
	switch status {
	case "signed":
		answer("signed", nil)
		return
	case "refused":
		answer("failed", map[string]any{"reason": lastError})
		return
	case "pending":
		answer("pending", nil)
		return
	}
	if docStatus != "signing" || base == nil {
		answer("failed", map[string]any{"reason": "the document is no longer out for signature"})
		return
	}
	signer, err := nexus.Capability[nexus.Signer]()
	if err != nil {
		nexus.Error(w, http.StatusServiceUnavailable, "eID signing is not available on this installation")
		return
	}
	regNumber, _, err := m.signerIdentity(ctx, claims.UserID)
	if err != nil || regNumber == "" {
		nexus.Error(w, http.StatusConflict, "your eID identity is not linked")
		return
	}
	stale := started != nil && time.Since(*started) > archiveSessionTTL
	logFail := func(stage, detail string) {
		slog.WarnContext(ctx, "events: archive signature failed", "stage", stage, "error", detail,
			"document_id", docID, "session_id", session, "revision", *base)
	}
	state, err := signer.PollSignature(ctx, regNumber, session)
	if err != nil {
		detail := diagnosticText(err.Error())
		if stale {
			logFail(archiveStageExpired, detail)
			m.refuseSigner(ctx, claims.WorkspaceID, signerID, session, archiveStageExpired)
			answer("failed", map[string]any{"reason": archiveStageExpired})
			return
		}
		logFail(archiveStagePoll, detail)
		m.recordSignerError(ctx, claims.WorkspaceID, signerID, archiveStagePoll+": "+detail)
		nexus.Error(w, http.StatusBadGateway, "could not reach eID Mongolia")
		return
	}
	switch state {
	case nexus.SignatureRunning:
		if stale {
			m.refuseSigner(ctx, claims.WorkspaceID, signerID, session, archiveStageExpired)
			answer("failed", map[string]any{"reason": archiveStageExpired})
			return
		}
		answer("signing", nil)
		return
	case nexus.SignatureCompleted:
	default:
		logFail(archiveStageRefused, string(state))
		m.refuseSigner(ctx, claims.WorkspaceID, signerID, session, archiveStageRefused+": "+string(state))
		answer("failed", map[string]any{"reason": string(state)})
		return
	}
	verified, err := signer.VerifiedDigest(ctx, regNumber, session)
	want, _ := hex.DecodeString(digest)
	if err != nil || verified != base64.StdEncoding.EncodeToString(want) {
		detail := "eID signed a different digest"
		if err != nil {
			detail = diagnosticText(err.Error())
		}
		logFail(archiveStageDigest, detail)
		m.refuseSigner(ctx, claims.WorkspaceID, signerID, session, archiveStageDigest)
		nexus.Error(w, http.StatusConflict, "the signature does not cover this document")
		return
	}
	previous, revision, err := m.latestRevision(ctx, m.db, claims.WorkspaceID, docID)
	if err != nil {
		archiveError(w, err)
		return
	}
	if revision != *base {
		// Somebody else's signature landed first; this one covers an old revision.
		m.refuseSigner(ctx, claims.WorkspaceID, signerID, session, "the document changed")
		answer("failed", map[string]any{"reason": "the document changed"})
		return
	}
	signed, err := signer.SignedDocument(ctx, regNumber, session)
	if err != nil {
		detail := diagnosticText(err.Error())
		logFail(archiveStageStamp, detail)
		if stale {
			m.refuseSigner(ctx, claims.WorkspaceID, signerID, session, archiveStageStamp+": "+detail)
			answer("failed", map[string]any{"reason": archiveStageStamp})
			return
		}
		// The ceremony is complete and still held: asking again may work.
		m.recordSignerError(ctx, claims.WorkspaceID, signerID, archiveStageStamp+": "+detail)
		nexus.Error(w, http.StatusBadGateway, "eID could not return the signed PDF; try again")
		return
	}
	var remaining int
	if err := m.db.QueryRow(ctx, `SELECT count(*) FROM events_archive_signers WHERE tenant_id = $1::uuid AND document_id = $2::uuid
		AND status <> 'signed' AND id <> $3::uuid`, claims.WorkspaceID, docID, signerID).Scan(&remaining); err != nil {
		archiveError(w, err)
		return
	}
	if err := checkStamped(previous, signed.PDF, remaining > 0); err != nil {
		stage := archiveStageIncremental
		if errors.Is(err, pdfdoc.ErrLocked) {
			stage = archiveStageLocked
		}
		logFail(stage, err.Error())
		m.refuseSigner(ctx, claims.WorkspaceID, signerID, session, stage)
		nexus.Error(w, http.StatusBadGateway, "eID returned a PDF that is not an added signature on this document")
		return
	}
	finished, err := m.storeSignature(ctx, claims, docID, signerID, session, *base, signed)
	var conflict conflictError
	switch {
	case errors.As(err, &conflict):
		// A second poll that raced this one already stored the same signature.
		answer("signed", nil)
		return
	case err != nil:
		logFail(archiveStageStore, err.Error())
		nexus.Error(w, http.StatusInternalServerError, "could not record the signature")
		return
	}
	nexus.Audit(ctx, claims.WorkspaceID, claims.UserID, "events.archive.sign", docID, map[string]any{
		"revision": *base + 1, "digest": digest, "finished": finished, "cert_serial": signed.SignerSerial})
	if finished {
		docStatus = "signed"
	}
	answer("signed", nil)
}

// checkStamped is pdfdoc.CheckRevision with the size limit.
func checkStamped(previous, signed []byte, moreSigners bool) error {
	if len(signed) > maxArchivePDF {
		return errors.New("the signed PDF is larger than the limit")
	}
	if !bytes.HasPrefix(signed, previous) {
		return pdfdoc.ErrNotIncremental
	}
	return pdfdoc.CheckRevision(previous, signed, moreSigners)
}

// storeSignature appends the revision under the document's lock, after
// checking once more that this signer's ceremony is still the current one and
// that nothing was appended since it started.
func (m *Module) storeSignature(ctx context.Context, claims nexus.UserClaims, docID, signerID, session string, base int, signed nexus.SignedDocument) (bool, error) {
	tx, err := m.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	_, current, err := m.lockCurrentSigner(ctx, tx, claims.WorkspaceID, docID)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, errConflict("already signed")
	}
	if err != nil {
		return false, err
	}
	if current.id != signerID || current.session != session || current.status != "signing" || current.baseRevision != base {
		return false, errConflict("already signed")
	}
	_, latest, err := m.latestRevision(ctx, tx, claims.WorkspaceID, docID)
	if err != nil {
		return false, err
	}
	if latest != base {
		return false, errConflict("already signed")
	}
	sum := sha256.Sum256(signed.PDF)
	digest := hex.EncodeToString(sum[:])
	if _, err := tx.Exec(ctx, `INSERT INTO events_archive_versions (tenant_id, document_id, revision, signer_id, pdf, sha256)
		VALUES ($1, $2, $3, $4, $5, $6)`, claims.WorkspaceID, docID, base+1, signerID, signed.PDF, digest); err != nil {
		return false, err
	}
	if _, err := tx.Exec(ctx, `UPDATE events_archive_signers SET status = 'signed', signed_at = now(), last_error = '',
		cert_name = $3, cert_serial = $4, cert_issuer = $5, updated_at = now() WHERE tenant_id = $1::uuid AND id = $2::uuid`,
		claims.WorkspaceID, signerID, clip(signed.SignerName, 200), clip(signed.SignerSerial, 100), clip(signed.SignerIssuer, 200)); err != nil {
		return false, err
	}
	var remaining int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM events_archive_signers WHERE tenant_id = $1::uuid AND document_id = $2::uuid AND status <> 'signed'`,
		claims.WorkspaceID, docID).Scan(&remaining); err != nil {
		return false, err
	}
	if remaining == 0 {
		if _, err := tx.Exec(ctx, `UPDATE events_archive_documents SET status = 'signed', signed_at = now(), final_sha256 = $3, updated_at = now()
			WHERE tenant_id = $1::uuid AND id = $2::uuid`, claims.WorkspaceID, docID, digest); err != nil {
			return false, err
		}
	}
	return remaining == 0, tx.Commit(ctx)
}
