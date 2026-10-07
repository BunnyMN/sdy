package events

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gerege-systems/open-gerege-nexus/backend/pkg/nexus"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

// Discussion: a member raises an issue (a motion) on an event; a manager
// opens the vote, which freezes the text; every member whose attendance at
// the event was confirmed may vote once, and signs that vote with their own
// eID (PIN2); a manager closes the vote, and the motion is approved when the
// signed "yes" votes outnumber the signed "no" votes. Abstentions are recorded
// and do not count either way. Decided motions and signed votes are final —
// the database refuses to change them — so each event keeps its record.

type Motion struct {
	ID           string  `json:"id"`
	EventID      string  `json:"event_id"`
	Title        string  `json:"title"`
	Body         string  `json:"body"`
	ProposerID   string  `json:"proposer_id"`
	ProposerName string  `json:"proposer_name"`
	Status       string  `json:"status"`
	ContentHash  string  `json:"content_hash"`
	OpenedAt     *string `json:"opened_at"`
	ClosedAt     *string `json:"closed_at"`
	Result       string  `json:"result"`
	Yes          int     `json:"yes"`
	No           int     `json:"no"`
	Abstain      int     `json:"abstain"`
	Note         string  `json:"note"`
	CreatedAt    string  `json:"created_at"`
	// MyVote is the caller's own vote: its choice and whether it is signed.
	MyVote *MyVote `json:"my_vote"`
}

type MyVote struct {
	Choice string `json:"choice"`
	Status string `json:"status"`
}

// The counts are the frozen ones once decided, and the live signed tally
// while the vote runs.
const motionColumns = `
	SELECT mo.id::text, mo.event_id::text, mo.title, mo.body, mo.proposer_id::text, COALESCE(u.name,''),
	       mo.status, COALESCE(mo.content_hash,''), mo.opened_at, mo.closed_at, COALESCE(mo.result,''),
	       COALESCE(mo.yes_count, (SELECT count(*) FROM events_motion_votes v WHERE v.motion_id = mo.id AND v.status = 'signed' AND v.choice = 'yes'))::int,
	       COALESCE(mo.no_count, (SELECT count(*) FROM events_motion_votes v WHERE v.motion_id = mo.id AND v.status = 'signed' AND v.choice = 'no'))::int,
	       COALESCE(mo.abstain_count, (SELECT count(*) FROM events_motion_votes v WHERE v.motion_id = mo.id AND v.status = 'signed' AND v.choice = 'abstain'))::int,
	       mo.note, mo.created_at,
	       COALESCE((SELECT v.choice FROM events_motion_votes v WHERE v.motion_id = mo.id AND v.user_id = $2::uuid), ''),
	       COALESCE((SELECT v.status FROM events_motion_votes v WHERE v.motion_id = mo.id AND v.user_id = $2::uuid), '')
	  FROM events_motions mo LEFT JOIN registry.users u ON u.id = mo.proposer_id
	 WHERE mo.tenant_id = $1::uuid`

func scanMotion(row pgx.Row) (Motion, error) {
	var mo Motion
	var opened, closed *time.Time
	var created time.Time
	var choice, voteStatus string
	if err := row.Scan(&mo.ID, &mo.EventID, &mo.Title, &mo.Body, &mo.ProposerID, &mo.ProposerName,
		&mo.Status, &mo.ContentHash, &opened, &closed, &mo.Result, &mo.Yes, &mo.No, &mo.Abstain,
		&mo.Note, &created, &choice, &voteStatus); err != nil {
		return mo, err
	}
	mo.OpenedAt, mo.ClosedAt, mo.CreatedAt = stampPtr(opened), stampPtr(closed), stamp(created)
	if choice != "" {
		mo.MyVote = &MyVote{Choice: choice, Status: voteStatus}
	}
	return mo, nil
}

func (m *Module) canManage(ctx context.Context, claims nexus.UserClaims) bool {
	// Admins pass RequirePermission without a lookup, so they pass here too.
	if claims.IsAdmin {
		return true
	}
	permissions, err := m.permissions.GetUserPermissions(ctx, claims.WorkspaceID, claims.UserID)
	return err == nil && permissions[PermManage]
}

func (m *Module) isActiveMember(ctx context.Context, tenantID, userID string) bool {
	var ok bool
	err := m.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM workspace.memberships
		WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND active)`, tenantID, userID).Scan(&ok)
	return err == nil && ok
}

type motionInput struct {
	Title string `json:"title"`
	Body  string `json:"body"`
}

func (in *motionInput) validate() error {
	in.Title, in.Body = strings.TrimSpace(in.Title), strings.TrimSpace(in.Body)
	switch {
	case in.Title == "":
		return errors.New("title is required")
	case len([]rune(in.Title)) > 200:
		return errors.New("title is too long")
	case len([]rune(in.Body)) > 4000:
		return errors.New("description is too long")
	}
	return nil
}

func motionError(w http.ResponseWriter, err error) {
	if errors.Is(err, pgx.ErrNoRows) {
		nexus.Error(w, http.StatusNotFound, "no such motion")
		return
	}
	nexus.Error(w, http.StatusInternalServerError, "could not read the motion")
}

func (m *Module) loadMotion(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, claims nexus.UserClaims, eventID, motionID string, lock bool) (Motion, error) {
	sql := motionColumns + ` AND mo.event_id = $3::uuid AND mo.id = $4::uuid`
	if lock {
		sql += ` FOR UPDATE OF mo`
	}
	return scanMotion(q.QueryRow(ctx, sql, claims.WorkspaceID, claims.UserID, eventID, motionID))
}

func (m *Module) motions(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	eventID := chi.URLParam(r, "id")
	event, err := m.loadEvent(r.Context(), claims.WorkspaceID, claims.UserID, eventID)
	if err != nil {
		eventError(w, err)
		return
	}
	rows, err := m.db.Query(r.Context(), motionColumns+` AND mo.event_id = $3::uuid ORDER BY mo.created_at, mo.id`,
		claims.WorkspaceID, claims.UserID, eventID)
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not list the motions")
		return
	}
	defer rows.Close()
	list := make([]Motion, 0, 8)
	for rows.Next() {
		mo, err := scanMotion(rows)
		if err != nil {
			nexus.Error(w, http.StatusInternalServerError, "could not read a motion")
			return
		}
		list = append(list, mo)
	}
	if rows.Err() != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not list the motions")
		return
	}
	signer, signErr := nexus.Capability[nexus.Signer]()
	nexus.JSON(w, http.StatusOK, map[string]any{
		"motions": list,
		// Who may vote here, and whether this installation can sign at all.
		"eligible":       event.Attended,
		"can_vote":       event.MyStatus == "attended",
		"signing_ready":  signErr == nil && signer.Enabled(),
		"vote_points":    event.VotePoints,
		"can_manage":     m.canManage(r.Context(), claims),
		"event_status":   event.Status,
		"event_attended": event.MyStatus == "attended",
		"me":             claims.UserID,
	})
}

func (m *Module) propose(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	var in motionInput
	if err := decode(r, &in); err != nil {
		nexus.Error(w, http.StatusBadRequest, "the request could not be read")
		return
	}
	if err := in.validate(); err != nil {
		nexus.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	eventID := chi.URLParam(r, "id")
	event, err := m.loadEvent(r.Context(), claims.WorkspaceID, claims.UserID, eventID)
	if err != nil {
		eventError(w, err)
		return
	}
	if event.Status == "cancelled" {
		nexus.Error(w, http.StatusConflict, "this event is cancelled")
		return
	}
	if !m.isActiveMember(r.Context(), claims.WorkspaceID, claims.UserID) {
		nexus.Error(w, http.StatusForbidden, "only members of this branch may raise an issue")
		return
	}
	var count int
	if err := m.db.QueryRow(r.Context(), `SELECT count(*) FROM events_motions WHERE tenant_id=$1 AND event_id=$2`,
		claims.WorkspaceID, eventID).Scan(&count); err != nil || count >= 100 {
		nexus.Error(w, http.StatusConflict, "this event already has the most issues it can hold")
		return
	}
	var id string
	if err := m.db.QueryRow(r.Context(), `INSERT INTO events_motions (tenant_id, event_id, title, body, proposer_id)
		VALUES ($1, $2, $3, $4, $5) RETURNING id::text`, claims.WorkspaceID, eventID, in.Title, in.Body, claims.UserID).Scan(&id); err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not record the issue")
		return
	}
	nexus.Audit(r.Context(), claims.WorkspaceID, claims.UserID, "events.motion.propose", id, map[string]any{"event_id": eventID, "title": in.Title})
	mo, err := m.loadMotion(r.Context(), m.db, claims, eventID, id, false)
	if err != nil {
		motionError(w, err)
		return
	}
	nexus.JSON(w, http.StatusCreated, mo)
}

// editMotion changes the text of a motion that is still only proposed, by the
// member who raised it or a manager. Once the vote opens the text is frozen.
func (m *Module) editMotion(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	var in motionInput
	if err := decode(r, &in); err != nil {
		nexus.Error(w, http.StatusBadRequest, "the request could not be read")
		return
	}
	if err := in.validate(); err != nil {
		nexus.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	m.changeMotion(w, r, claims, func(ctx context.Context, tx pgx.Tx, mo Motion) (string, error) {
		if mo.ProposerID != claims.UserID && !m.canManage(ctx, claims) {
			return "", errForbidden
		}
		if mo.Status != "proposed" {
			return "", errConflict("only an issue that is not yet under vote can be edited")
		}
		_, err := tx.Exec(ctx, `UPDATE events_motions SET title=$3, body=$4, updated_at=now() WHERE tenant_id=$1 AND id=$2`,
			claims.WorkspaceID, mo.ID, in.Title, in.Body)
		return "events.motion.edit", err
	})
}

func (m *Module) withdrawMotion(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	var in struct {
		Note string `json:"note"`
	}
	_ = decode(r, &in)
	note := strings.TrimSpace(in.Note)
	if len([]rune(note)) > 500 {
		nexus.Error(w, http.StatusBadRequest, "note is too long")
		return
	}
	m.changeMotion(w, r, claims, func(ctx context.Context, tx pgx.Tx, mo Motion) (string, error) {
		if mo.ProposerID != claims.UserID && !m.canManage(ctx, claims) {
			return "", errForbidden
		}
		if mo.Status != "proposed" {
			return "", errConflict("only an issue that is not yet under vote can be withdrawn")
		}
		_, err := tx.Exec(ctx, `UPDATE events_motions SET status='withdrawn', note=$3, closed_at=now(), closed_by=$4, updated_at=now()
			WHERE tenant_id=$1 AND id=$2`, claims.WorkspaceID, mo.ID, note, claims.UserID)
		return "events.motion.withdraw", err
	})
}

// openVote freezes the motion's text: its SHA-256 goes into every vote's
// signed document, so a vote is bound to the words it was cast on.
func (m *Module) openVote(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	m.changeMotion(w, r, claims, func(ctx context.Context, tx pgx.Tx, mo Motion) (string, error) {
		if mo.Status != "proposed" {
			return "", errConflict("the vote on this issue has already been opened or closed")
		}
		hash := sha256.Sum256([]byte(mo.Title + "\n\n" + mo.Body))
		_, err := tx.Exec(ctx, `UPDATE events_motions SET status='voting', content_hash=$3, opened_at=now(), opened_by=$4, updated_at=now()
			WHERE tenant_id=$1 AND id=$2`, claims.WorkspaceID, mo.ID, hex.EncodeToString(hash[:]), claims.UserID)
		return "events.motion.open", err
	})
}

// closeVote decides the motion from its signed votes: approved when "yes"
// outnumbers "no". Votes still being signed are not counted.
func (m *Module) closeVote(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	m.changeMotion(w, r, claims, func(ctx context.Context, tx pgx.Tx, mo Motion) (string, error) {
		if mo.Status != "voting" {
			return "", errConflict("this issue is not under vote")
		}
		result := "rejected"
		if mo.Yes > mo.No {
			result = "approved"
		}
		_, err := tx.Exec(ctx, `UPDATE events_motions SET status='decided', result=$3, yes_count=$4, no_count=$5, abstain_count=$6,
			closed_at=now(), closed_by=$7, updated_at=now() WHERE tenant_id=$1 AND id=$2`,
			claims.WorkspaceID, mo.ID, result, mo.Yes, mo.No, mo.Abstain, claims.UserID)
		return "events.motion.decide", err
	})
}

var errForbidden = errors.New("forbidden")

type conflictError string

func (e conflictError) Error() string  { return string(e) }
func errConflict(message string) error { return conflictError(message) }

// changeMotion runs one state change on a locked motion and answers with the
// motion as it then stands.
func (m *Module) changeMotion(w http.ResponseWriter, r *http.Request, claims nexus.UserClaims,
	change func(context.Context, pgx.Tx, Motion) (string, error)) {
	ctx := r.Context()
	eventID, motionID := chi.URLParam(r, "id"), chi.URLParam(r, "motionID")
	tx, err := m.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not change the motion")
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()
	mo, err := m.loadMotion(ctx, tx, claims, eventID, motionID, true)
	if err != nil {
		motionError(w, err)
		return
	}
	action, err := change(ctx, tx, mo)
	var conflict conflictError
	switch {
	case errors.Is(err, errForbidden):
		nexus.Error(w, http.StatusForbidden, "only the member who raised it or a manager may do this")
		return
	case errors.As(err, &conflict):
		nexus.Error(w, http.StatusConflict, conflict.Error())
		return
	case err != nil:
		nexus.Error(w, http.StatusInternalServerError, "could not change the motion")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not change the motion")
		return
	}
	nexus.Audit(ctx, claims.WorkspaceID, claims.UserID, action, motionID, map[string]any{"event_id": eventID})
	mo, err = m.loadMotion(ctx, m.db, claims, eventID, motionID, false)
	if err != nil {
		motionError(w, err)
		return
	}
	nexus.JSON(w, http.StatusOK, mo)
}

// ─── Signed votes ────────────────────────────────────────────────────────────

var choiceWords = map[string]string{"yes": "ЗӨВШӨӨРӨВ", "no": "ТАТГАЛЗАВ", "abstain": "ТҮДГЭЛЗЭВ"}
var choiceShort = map[string]string{"yes": "Зөвшөөрөв", "no": "Татгалзав", "abstain": "Түдгэлзэв"}

// voteDocument is what the voter signs. Everything that makes the vote this
// vote is in it — the branch, the event, the motion and the hash of its frozen
// text, the voter and the choice — so the signature cannot be moved to another.
func voteDocument(tenantID string, event Event, mo Motion, userID, choice string, at time.Time) string {
	return strings.Join([]string{
		"SDY — хэлэлцүүлгийн санал",
		"Салбар: " + tenantID,
		"Арга хэмжээ: " + event.Title + " (" + event.ID + ")",
		"Асуудал: " + mo.Title + " (" + mo.ID + ")",
		"Асуудлын текстийн SHA-256: " + mo.ContentHash,
		"Санал өгөгч: " + userID,
		"Санал: " + choiceWords[choice],
		"Огноо: " + at.UTC().Format(time.RFC3339),
	}, "\n")
}

// signerIdentity is who eID is asked to reach: the registration number linked
// to this account at its eID sign-in, or failing that the civil ID.
func (m *Module) signerIdentity(ctx context.Context, userID string) (id, name string, err error) {
	err = m.db.QueryRow(ctx, `SELECT COALESCE(NULLIF(e.reg_number,''), NULLIF(e.civil_id,''), ''), COALESCE(u.name,'')
		FROM registry.user_eid_identities e JOIN registry.users u ON u.id = e.user_id WHERE e.user_id = $1::uuid`, userID).Scan(&id, &name)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", nil
	}
	return id, name, err
}

func (m *Module) vote(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	var in struct {
		Choice string `json:"choice"`
	}
	if err := decode(r, &in); err != nil || choiceWords[in.Choice] == "" {
		nexus.Error(w, http.StatusBadRequest, "choice must be yes, no or abstain")
		return
	}
	ctx := r.Context()
	eventID, motionID := chi.URLParam(r, "id"), chi.URLParam(r, "motionID")
	event, err := m.loadEvent(ctx, claims.WorkspaceID, claims.UserID, eventID)
	if err != nil {
		eventError(w, err)
		return
	}
	mo, err := m.loadMotion(ctx, m.db, claims, eventID, motionID, false)
	if err != nil {
		motionError(w, err)
		return
	}
	if mo.Status != "voting" {
		nexus.Error(w, http.StatusConflict, "this issue is not under vote")
		return
	}
	if event.MyStatus != "attended" {
		nexus.Error(w, http.StatusForbidden, "only members whose attendance at this event was confirmed may vote")
		return
	}
	if mo.MyVote != nil && mo.MyVote.Status == "signed" {
		nexus.Error(w, http.StatusConflict, "you have already voted on this issue")
		return
	}
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
		nexus.Error(w, http.StatusConflict, "sign in with eID Mongolia once so your vote can be signed")
		return
	}
	document := voteDocument(claims.WorkspaceID, event, mo, claims.UserID, in.Choice, time.Now())
	digest := sha256.Sum256([]byte(document))
	digestHex := hex.EncodeToString(digest[:])
	session, err := signer.SignDigest(ctx, nexus.SignatureRequest{
		RegNumber: regNumber, FullName: name, DigestHex: digestHex,
		DisplayText:  "Санал: " + choiceShort[in.Choice] + " — " + mo.Title,
		DocumentName: "Хэлэлцүүлгийн санал",
	})
	if err != nil {
		nexus.Error(w, http.StatusBadGateway, "eID Mongolia could not start the signature")
		return
	}
	// One row per person and motion. A signed row is final (the trigger and the
	// WHERE below both say so); an unsigned one is replaced by this attempt.
	tag, err := m.db.Exec(ctx, `INSERT INTO events_motion_votes (tenant_id, motion_id, event_id, user_id, choice, status, document, digest_hex, sign_session_id)
		VALUES ($1, $2, $3, $4, $5, 'signing', $6, $7, $8)
		ON CONFLICT (motion_id, user_id) DO UPDATE SET choice=EXCLUDED.choice, status='signing', document=EXCLUDED.document,
		    digest_hex=EXCLUDED.digest_hex, sign_session_id=EXCLUDED.sign_session_id, updated_at=now()
		WHERE events_motion_votes.status <> 'signed'`,
		claims.WorkspaceID, motionID, eventID, claims.UserID, in.Choice, document, digestHex, session.SessionID)
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not record the vote")
		return
	}
	if tag.RowsAffected() == 0 {
		nexus.Error(w, http.StatusConflict, "you have already voted on this issue")
		return
	}
	nexus.JSON(w, http.StatusAccepted, map[string]any{"session_id": session.SessionID, "verification_code": session.VerificationCode, "state": "signing"})
}

// pollVote asks eID about the caller's signature and, once it is given and
// covers exactly the document this server prepared, counts the vote.
func (m *Module) pollVote(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	var in struct {
		SessionID string `json:"session_id"`
	}
	if err := decode(r, &in); err != nil || strings.TrimSpace(in.SessionID) == "" {
		nexus.Error(w, http.StatusBadRequest, "session_id is required")
		return
	}
	ctx := r.Context()
	eventID, motionID := chi.URLParam(r, "id"), chi.URLParam(r, "motionID")
	var status, digestHex string
	err := m.db.QueryRow(ctx, `SELECT status, digest_hex FROM events_motion_votes
		WHERE tenant_id=$1 AND motion_id=$2 AND event_id=$3 AND user_id=$4 AND sign_session_id=$5`,
		claims.WorkspaceID, motionID, eventID, claims.UserID, in.SessionID).Scan(&status, &digestHex)
	if errors.Is(err, pgx.ErrNoRows) {
		nexus.Error(w, http.StatusNotFound, "no such signature")
		return
	}
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not read the vote")
		return
	}
	if status != "signing" {
		nexus.JSON(w, http.StatusOK, map[string]any{"state": status})
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
	state, err := signer.PollSignature(ctx, regNumber, in.SessionID)
	if err != nil {
		nexus.Error(w, http.StatusBadGateway, "could not reach eID Mongolia")
		return
	}
	switch state {
	case nexus.SignatureRunning:
		nexus.JSON(w, http.StatusOK, map[string]any{"state": "signing"})
		return
	case nexus.SignatureCompleted:
	default:
		m.failVote(ctx, claims, motionID, in.SessionID)
		nexus.JSON(w, http.StatusOK, map[string]any{"state": "failed", "reason": string(state)})
		return
	}
	signed, err := signer.VerifiedDigest(ctx, regNumber, in.SessionID)
	want, _ := hex.DecodeString(digestHex)
	if err != nil || signed != base64.StdEncoding.EncodeToString(want) {
		// The signature is over something else. It is not a vote on this text.
		m.failVote(ctx, claims, motionID, in.SessionID)
		nexus.Error(w, http.StatusConflict, "the signature does not cover this vote")
		return
	}
	points, err := m.countVote(ctx, claims, eventID, motionID, in.SessionID)
	var conflict conflictError
	if errors.As(err, &conflict) {
		m.failVote(ctx, claims, motionID, in.SessionID)
		nexus.Error(w, http.StatusConflict, conflict.Error())
		return
	}
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not record the vote")
		return
	}
	nexus.Audit(ctx, claims.WorkspaceID, claims.UserID, "events.motion.vote", motionID, map[string]any{"event_id": eventID, "digest": digestHex})
	nexus.JSON(w, http.StatusOK, map[string]any{"state": "signed", "points": points})
}

// countVote marks the vote signed under the motion's lock, so a vote whose
// signature arrives after the vote was closed is not added to a decided count.
func (m *Module) countVote(ctx context.Context, claims nexus.UserClaims, eventID, motionID, sessionID string) (int, error) {
	tx, err := m.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var status string
	var points int
	if err := tx.QueryRow(ctx, `SELECT mo.status, e.vote_points FROM events_motions mo JOIN events_events e ON e.id = mo.event_id
		WHERE mo.tenant_id=$1 AND mo.id=$2 AND mo.event_id=$3 FOR UPDATE OF mo`, claims.WorkspaceID, motionID, eventID).Scan(&status, &points); err != nil {
		return 0, err
	}
	if status != "voting" {
		return 0, errConflict("the vote closed before your signature arrived")
	}
	tag, err := tx.Exec(ctx, `UPDATE events_motion_votes SET status='signed', signed_at=now(), points_awarded=$5, updated_at=now()
		WHERE tenant_id=$1 AND motion_id=$2 AND user_id=$3 AND sign_session_id=$4 AND status='signing'`,
		claims.WorkspaceID, motionID, claims.UserID, sessionID, points)
	if err != nil {
		return 0, err
	}
	if tag.RowsAffected() == 0 {
		return 0, errConflict("this signature has already been counted")
	}
	if points > 0 {
		if _, err := tx.Exec(ctx, `INSERT INTO events_point_entries (tenant_id,event_id,user_id,delta,reason,actor_id)
			VALUES ($1,$2,$3,$4,'motion.vote',$3)`, claims.WorkspaceID, eventID, claims.UserID, points); err != nil {
			return 0, err
		}
	}
	return points, tx.Commit(ctx)
}

func (m *Module) failVote(ctx context.Context, claims nexus.UserClaims, motionID, sessionID string) {
	_, _ = m.db.Exec(ctx, `UPDATE events_motion_votes SET status='failed', updated_at=now()
		WHERE tenant_id=$1 AND motion_id=$2 AND user_id=$3 AND sign_session_id=$4 AND status='signing'`,
		claims.WorkspaceID, motionID, claims.UserID, sessionID)
}

// votes is the signed roll of a motion: who voted what, when, and the digest
// each signed. Managers see it while the vote runs; everyone once it is decided.
func (m *Module) votes(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	eventID, motionID := chi.URLParam(r, "id"), chi.URLParam(r, "motionID")
	mo, err := m.loadMotion(ctx, m.db, claims, eventID, motionID, false)
	if err != nil {
		motionError(w, err)
		return
	}
	if mo.Status != "decided" && !m.canManage(ctx, claims) {
		nexus.Error(w, http.StatusForbidden, "the roll is published when the vote is closed")
		return
	}
	rows, err := m.db.Query(ctx, `SELECT v.user_id::text, COALESCE(u.name,''), v.choice, v.signed_at, v.digest_hex
		FROM events_motion_votes v LEFT JOIN registry.users u ON u.id = v.user_id
		WHERE v.tenant_id=$1 AND v.motion_id=$2 AND v.status='signed' ORDER BY v.signed_at, v.id`, claims.WorkspaceID, motionID)
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not list the votes")
		return
	}
	defer rows.Close()
	type vote struct {
		UserID   string `json:"user_id"`
		Name     string `json:"name"`
		Choice   string `json:"choice"`
		SignedAt string `json:"signed_at"`
		Digest   string `json:"digest"`
	}
	list := make([]vote, 0, 16)
	for rows.Next() {
		var v vote
		var at time.Time
		if err := rows.Scan(&v.UserID, &v.Name, &v.Choice, &at, &v.Digest); err != nil {
			nexus.Error(w, http.StatusInternalServerError, "could not read a vote")
			return
		}
		v.SignedAt = stamp(at)
		list = append(list, v)
	}
	if rows.Err() != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not list the votes")
		return
	}
	nexus.JSON(w, http.StatusOK, map[string]any{"votes": list, "motion": mo.ID})
}
