package events

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gerege-systems/open-gerege-nexus/backend/pkg/nexus"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

// Where the discussion meets the archive: every ballot is a PDF its voter
// signs, and every decided vote gets a protocol the chair and the secretary
// sign.

func (m *Module) branchName(ctx context.Context, q querier, tenantID string) string {
	var name string
	_ = q.QueryRow(ctx, `SELECT COALESCE(name,'') FROM registry.tenants WHERE id = $1::uuid`, tenantID).Scan(&name)
	return name
}

func (m *Module) ballotPDF(ctx context.Context, tenantID string, event Event, mo Motion, userID, name, choice string, at time.Time) ([]byte, error) {
	if name == "" {
		name = "—"
	}
	return renderBallot(ballotRender{
		Branch: m.branchName(ctx, m.db, tenantID), EventTitle: event.Title, EventStarts: event.StartsAt,
		MotionID: mo.ID, MotionTitle: mo.Title, MotionBody: mo.Body, ContentHash: mo.ContentHash,
		VoterName: name, VoterID: userID, Choice: choice, At: at,
	})
}

// fetchBallot asks eID for the stamped ballot and checks that it is the
// ballot that was signed with a signature appended. It answers the PDF, or why
// there is none.
func (m *Module) fetchBallot(ctx context.Context, signer nexus.Signer, regNumber, session string, ballot []byte) ([]byte, string) {
	if len(ballot) == 0 {
		return nil, "no ballot"
	}
	doc, err := signer.SignedDocument(ctx, regNumber, session)
	if err != nil {
		reason := diagnosticText(err.Error())
		slog.WarnContext(ctx, "events: eID could not return a stamped ballot", "stage", archiveStageStamp, "error", reason, "session_id", session)
		return nil, archiveStageStamp + ": " + reason
	}
	if len(doc.PDF) > 8<<20 {
		return nil, "the stamped ballot is larger than the limit"
	}
	if err := checkStamped(ballot, doc.PDF, false); err != nil {
		slog.WarnContext(ctx, "events: eID returned a ballot that is not the signed one", "stage", archiveStageIncremental, "error", err, "session_id", session)
		return nil, archiveStageIncremental + ": " + err.Error()
	}
	return doc.PDF, ""
}

// How a stamped ballot is fetched after the vote is counted: in the
// background, at most once per ballotStampRetry per vote, and only while eID
// still holds the ceremony.
const (
	ballotStampRetry   = 5 * time.Minute
	ballotStampWindow  = 30 * time.Minute
	ballotStampTimeout = 20 * time.Second
)

// attachBallotLater asks eID for a counted vote's stamped ballot without
// holding up the caller. The claim (ballot_stamp_tried_at) is what throttles
// it: two polls at once, or a poll every two seconds, ask eID once.
func (m *Module) attachBallotLater(ctx context.Context, claims nexus.UserClaims, motionID, session string) {
	bg := context.WithoutCancel(ctx)
	var ballot []byte
	err := m.db.QueryRow(bg, `UPDATE events_motion_votes SET ballot_stamp_tried_at = now()
		WHERE tenant_id = $1 AND motion_id = $2 AND user_id = $3 AND sign_session_id = $4 AND status = 'signed'
		  AND ballot_signing = 'pdf' AND ballot_signed_pdf IS NULL AND ballot_pdf IS NOT NULL
		  AND signed_at > now() - make_interval(secs => $5)
		  AND (ballot_stamp_tried_at IS NULL OR ballot_stamp_tried_at < now() - make_interval(secs => $6))
		RETURNING ballot_pdf`,
		claims.WorkspaceID, motionID, claims.UserID, session, ballotStampWindow.Seconds(), ballotStampRetry.Seconds()).Scan(&ballot)
	if err != nil {
		return // nothing to fetch, or asked too recently
	}
	m.background.Add(1)
	go func() {
		defer m.background.Done()
		fetchCtx, cancel := context.WithTimeout(bg, ballotStampTimeout)
		defer cancel()
		signer, err := nexus.Capability[nexus.Signer]()
		if err != nil || !signer.Enabled() {
			return
		}
		regNumber, _, err := m.signerIdentity(fetchCtx, claims.UserID)
		if err != nil || regNumber == "" {
			return
		}
		stamped, reason := m.fetchBallot(fetchCtx, signer, regNumber, session, ballot)
		// The write gets its own short deadline: the fetch may have used up its own.
		writeCtx, cancelWrite := context.WithTimeout(bg, 5*time.Second)
		defer cancelWrite()
		if stamped == nil {
			_, _ = m.db.Exec(writeCtx, `UPDATE events_motion_votes SET ballot_error = $5, updated_at = now()
				WHERE tenant_id = $1 AND motion_id = $2 AND user_id = $3 AND sign_session_id = $4 AND status = 'signed' AND ballot_signed_pdf IS NULL`,
				claims.WorkspaceID, motionID, claims.UserID, session, clip(reason, 300))
			return
		}
		if _, err := m.db.Exec(writeCtx, `UPDATE events_motion_votes SET ballot_signed_pdf = $5, ballot_error = '', updated_at = now()
			WHERE tenant_id = $1 AND motion_id = $2 AND user_id = $3 AND sign_session_id = $4 AND status = 'signed' AND ballot_signed_pdf IS NULL`,
			claims.WorkspaceID, motionID, claims.UserID, session, stamped); err != nil {
			slog.WarnContext(writeCtx, "events: could not store a stamped ballot", "error", err, "motion_id", motionID)
		}
	}()
}

func (m *Module) myBallot(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	m.sendBallot(w, r, claims, claims.UserID)
}

// ballot is anyone's ballot, where the roll is visible: managers always, every
// member once the vote is decided (votes).
func (m *Module) ballot(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	user := chi.URLParam(r, "userID")
	if user != claims.UserID {
		mo, err := m.loadMotion(r.Context(), m.db, claims, chi.URLParam(r, "id"), chi.URLParam(r, "motionID"), false)
		if err != nil {
			motionError(w, err)
			return
		}
		if mo.Status != "decided" && !m.canManage(r.Context(), claims) {
			nexus.Error(w, http.StatusForbidden, "the roll is published when the vote is closed")
			return
		}
	}
	m.sendBallot(w, r, claims, user)
}

// sendBallot answers a signed vote's ballot: eID's stamped PDF when there is
// one (X-Ballot-Signature: pades), otherwise the ballot whose digest the voter
// signed (digest).
func (m *Module) sendBallot(w http.ResponseWriter, r *http.Request, claims nexus.UserClaims, user string) {
	var ballot, stamped []byte
	err := m.db.QueryRow(r.Context(), `SELECT ballot_pdf, ballot_signed_pdf FROM events_motion_votes
		WHERE tenant_id = $1::uuid AND event_id = $2::uuid AND motion_id = $3::uuid AND user_id = $4::uuid AND status = 'signed'`,
		claims.WorkspaceID, chi.URLParam(r, "id"), chi.URLParam(r, "motionID"), user).Scan(&ballot, &stamped)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && ballot == nil) {
		nexus.Error(w, http.StatusNotFound, "no signed ballot")
		return
	}
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not read the ballot")
		return
	}
	name := "sdy-ballot-" + chi.URLParam(r, "motionID")[:8] + "-" + user[:8] + ".pdf"
	if stamped != nil {
		w.Header().Set("X-Ballot-Signature", "pades")
		writePDF(w, r, stamped, name)
		return
	}
	w.Header().Set("X-Ballot-Signature", "digest")
	writePDF(w, r, ballot, name)
}

// ─── Protocols ───────────────────────────────────────────────────────────────

// protocolOnClose makes the protocol of a vote that has just been decided,
// inside the closing transaction but in a savepoint of its own.
func (m *Module) protocolOnClose(ctx context.Context, tx pgx.Tx, claims nexus.UserClaims, eventID, motionID string) {
	sp, err := tx.Begin(ctx)
	if err != nil {
		slog.WarnContext(ctx, "events: no savepoint for the vote protocol", "error", err, "motion_id", motionID)
		return
	}
	id, err := m.createProtocol(ctx, sp, claims, eventID, motionID)
	if err != nil {
		_ = sp.Rollback(ctx)
		slog.WarnContext(ctx, "events: could not make the vote protocol", "error", err, "motion_id", motionID)
		return
	}
	if err := sp.Commit(ctx); err != nil {
		slog.WarnContext(ctx, "events: could not keep the vote protocol", "error", err, "motion_id", motionID)
		return
	}
	nexus.Audit(ctx, claims.WorkspaceID, claims.UserID, "events.archive.protocol", id, map[string]any{"motion_id": motionID})
}

// createProtocol records a decided motion as a vote protocol. Its signers
// are the branch's Тэргүүн and Нарийн бичиг as they are now; a vacant position,
// or a holder without eID, is skipped (with a notice), and with neither it
// stays a draft (draft_reason 'no_signers') for an administrator to give
// signers to. With signers it goes out at once.
func (m *Module) createProtocol(ctx context.Context, tx pgx.Tx, claims nexus.UserClaims, eventID, motionID string) (string, error) {
	mo, err := m.loadMotion(ctx, tx, claims, eventID, motionID, false)
	if err != nil {
		return "", err
	}
	if mo.Status != "decided" {
		return "", errConflict("only a decided vote has a protocol")
	}
	var exists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM events_archive_documents WHERE tenant_id = $1::uuid AND motion_id = $2::uuid
		AND status <> 'cancelled')`, claims.WorkspaceID, motionID).Scan(&exists); err != nil {
		return "", err
	}
	if exists {
		return "", errConflict("this vote already has a protocol")
	}
	event, err := scanEvent(tx.QueryRow(ctx, eventColumns+` AND e.id = $3::uuid`, claims.WorkspaceID, claims.UserID, eventID))
	if err != nil {
		return "", err
	}
	payload := protocolPayload{
		EventTitle: event.Title, EventStarts: event.StartsAt, MotionID: mo.ID, MotionTitle: mo.Title, MotionBody: mo.Body,
		ContentHash: mo.ContentHash, ProposerName: mo.ProposerName, Result: mo.Result,
		Yes: mo.Yes, No: mo.No, Abstain: mo.Abstain, Eligible: event.Attended,
	}
	if mo.OpenedAt != nil {
		payload.OpenedAt = *mo.OpenedAt
	}
	if mo.ClosedAt != nil {
		payload.ClosedAt = *mo.ClosedAt
	}
	rows, err := tx.Query(ctx, `SELECT COALESCE(u.name,''), v.choice, v.signed_at, v.digest_hex
		FROM events_motion_votes v LEFT JOIN registry.users u ON u.id = v.user_id
		WHERE v.tenant_id = $1::uuid AND v.motion_id = $2::uuid AND v.status = 'signed' ORDER BY v.signed_at, v.id`, claims.WorkspaceID, motionID)
	if err != nil {
		return "", err
	}
	for rows.Next() {
		var v protocolVoter
		var at time.Time
		if err := rows.Scan(&v.Name, &v.Choice, &at, &v.Digest); err != nil {
			rows.Close()
			return "", err
		}
		v.SignedAt = stamp(at)
		payload.Votes = append(payload.Votes, v)
	}
	rows.Close()
	if rows.Err() != nil {
		return "", rows.Err()
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	// The chair and the secretary as they are now. Somebody inactive is not
	// asked; somebody without a linked eID could never sign, so they are
	// skipped too — and the document says so, for a manager to see and to
	// name a signer in their place.
	var officers, skipped []string
	officerRows, err := tx.Query(ctx, `SELECT m.user_id::text, m.position, COALESCE(u.name,''),
		EXISTS (SELECT 1 FROM registry.user_eid_identities i WHERE i.user_id = m.user_id
		        AND COALESCE(NULLIF(i.reg_number,''), NULLIF(i.civil_id,'')) IS NOT NULL)
		FROM workspace.memberships m LEFT JOIN registry.users u ON u.id = m.user_id
		WHERE m.tenant_id = $1::uuid AND m.position IN ('chair','secretary') AND `+usableMember+`
		ORDER BY CASE m.position WHEN 'chair' THEN 1 ELSE 2 END, m.user_id`, claims.WorkspaceID)
	if err != nil {
		return "", err
	}
	for officerRows.Next() {
		var id, position, name string
		var hasEID bool
		if err := officerRows.Scan(&id, &position, &name, &hasEID); err != nil {
			officerRows.Close()
			return "", err
		}
		if !hasEID {
			skipped = append(skipped, positionTitles[position]+" "+name)
			continue
		}
		officers = append(officers, id)
	}
	officerRows.Close()
	if officerRows.Err() != nil {
		return "", officerRows.Err()
	}
	draftReason, notice := "", ""
	if len(officers) == 0 {
		draftReason = "no_signers"
	}
	if len(skipped) > 0 {
		notice = clip("eID холбоогүй тул гарын үсэг зурагчаас алгассан: "+strings.Join(skipped, ", ")+
			". Түүний оронд хэн зурахыг сонгоно уу.", 300)
	}
	var id string
	if err := tx.QueryRow(ctx, `INSERT INTO events_archive_documents (tenant_id, kind, title, body, event_id, motion_id, payload, created_by, draft_reason, notice)
		VALUES ($1, 'vote_protocol', $2, '', $3, $4, $5, $6, $7, $8) RETURNING id::text`,
		claims.WorkspaceID, clip(mo.Title, 200), eventID, motionID, raw, claims.UserID, draftReason, notice).Scan(&id); err != nil {
		return "", err
	}
	if err := m.setSigners(ctx, tx, claims.WorkspaceID, id, officers); err != nil {
		return "", err
	}
	if len(officers) > 0 {
		if err := m.freeze(ctx, tx, claims.WorkspaceID, id); err != nil {
			return "", err
		}
	}
	return id, nil
}

// ensureProtocol makes a decided vote's protocol when closing could not.
func (m *Module) ensureProtocol(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	tx, err := m.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		archiveError(w, err)
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()
	eventID, motionID := chi.URLParam(r, "id"), chi.URLParam(r, "motionID")
	// One maker at a time per motion: the partial unique index would refuse a
	// second protocol anyway, and the lock turns that into a clean 409.
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended('events.protocol:'||$1::uuid::text,0))`, motionID); err != nil {
		archiveError(w, err)
		return
	}
	id, err := m.createProtocol(ctx, tx, claims, eventID, motionID)
	if errors.Is(err, pgx.ErrNoRows) {
		motionError(w, err)
		return
	}
	if err != nil {
		archiveError(w, err)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		archiveError(w, err)
		return
	}
	nexus.Audit(ctx, claims.WorkspaceID, claims.UserID, "events.archive.protocol", id, map[string]any{"motion_id": motionID})
	m.answerArchive(w, r, claims, id, http.StatusCreated)
}
