package events

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gerege-systems/open-gerege-nexus/backend/pkg/nexus"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

// The signed archive: a branch's minutes, decisions and vote protocols as PDF
// documents every required person signs with their own eID (PIN2), one after
// the other, like an e-contract.
//
// A manager (Тэргүүн, Нарийн бичиг — archive.manage) writes a draft and picks
// who signs it: «Бүх тэргүүлэгч» (every holder of the Тэргүүлэгч position) or
// members chosen by hand, in an order. «Илгээх» freezes the document: it gets
// its number, its PDF is generated once and stored as revision 0, and nothing
// in it can change afterwards. The first signer is notified; they sign the
// stored bytes; eID returns the PDF with their PAdES signature appended as an
// incremental revision, which is stored as revision 1 — and the next signer
// signs exactly those bytes. A revision that does not begin with the previous
// one byte for byte is refused: it would have broken the signatures already in
// the file. When the last signer has signed the document is «баталгаажсан».
//
// Ceremonies here never fall back to the installation's own signature
// (nexus.DocumentSignatureRequest.RailSignatureOnly): a certification by the
// server would lock the document against the next signer, and would not be
// anybody's signature.
//
// Members of the branch see everything but drafts; managers see drafts too.
// There is no public verification page: the PDF verifies on its own, in any
// reader that checks PAdES signatures.

const (
	archiveKindMinutes  = "minutes"
	archiveKindDecision = "decision"
	archiveKindProtocol = "vote_protocol"

	maxArchiveSigners = 60
	maxArchiveBody    = 20000
	maxArchivePDF     = 20 << 20
	// A ceremony nobody finished is given up after this; the signer starts again.
	archiveSessionTTL = 30 * time.Minute
	archivePageSize   = 50
)

var archiveKindTitles = map[string]string{
	archiveKindMinutes:  "Хурлын тэмдэглэл",
	archiveKindDecision: "Шийдвэр",
	archiveKindProtocol: "Санал хураалтын протокол",
}

var positionTitles = map[string]string{
	"chair": "Тэргүүн", "vice_chair": "Дэд тэргүүн", "secretary": "Нарийн бичиг",
	"auditor": "Хяналтын хороо", "board": "Тэргүүлэгч", "finance": "Санхүүч", "member": "Гишүүн",
}

// usableMember is the SQL test for a membership that may sign: access to the
// branch and a union membership that is not suspended or ended.
const usableMember = `m.active AND m.member_status NOT IN ('suspended','expired','left','alumni')`

func (m *Module) registerArchiveRoutes(r chi.Router, gate func(http.Handler) http.Handler) {
	read := gated(m.permissions, PermArchiveRead)
	manage := gated(m.permissions, PermArchiveManage)
	r.Route("/api/v1/archive", func(ar chi.Router) {
		ar.Use(gate)
		ar.With(read).Get("/", m.archiveList)
		ar.With(manage).Post("/", m.archiveCreate)
		ar.With(manage).Get("/signers", m.archiveCandidates)
		ar.Route("/{docID}", func(one chi.Router) {
			one.With(read).Get("/", m.archiveGet)
			one.With(manage).Put("/", m.archiveUpdate)
			one.With(manage).Post("/send", m.archiveSend)
			one.With(manage).Post("/cancel", m.archiveCancel)
			// Who still has to sign, changed while the document is out.
			one.With(manage).Put("/signers", m.archiveReplaceSigners)
			// Rendering a draft preview costs CPU; a stored revision costs bandwidth.
			one.With(read, nexus.RateLimit(30, 10)).Get("/pdf", m.archivePDF)
			one.With(read, nexus.RateLimit(10, 2)).Post("/sign", m.archiveSign)
			one.With(read).Post("/sign/poll", m.archivePoll)
		})
	})
}

// ─── Shapes ──────────────────────────────────────────────────────────────────

type ArchiveDocument struct {
	ID          string  `json:"id"`
	Kind        string  `json:"kind"`
	KindTitle   string  `json:"kind_title"`
	Number      string  `json:"number"`
	Title       string  `json:"title"`
	Body        string  `json:"body"`
	EventID     *string `json:"event_id"`
	EventTitle  string  `json:"event_title"`
	MotionID    *string `json:"motion_id"`
	Status      string  `json:"status"`
	DraftReason string  `json:"draft_reason"`
	// Notice is what the system wants managers to know, e.g. a protocol signer
	// skipped for having no eID.
	Notice      string  `json:"notice"`
	CreatedBy   string  `json:"created_by"`
	CreatorName string  `json:"created_by_name"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
	IssuedAt    *string `json:"issued_at"`
	SignedAt    *string `json:"signed_at"`
	CancelledAt *string `json:"cancelled_at"`
	CancelNote  string  `json:"cancel_reason"`
	PDFSHA256   string  `json:"pdf_sha256"`
	FinalSHA256 string  `json:"final_sha256"`
	SignerCount int     `json:"signer_count"`
	SignedCount int     `json:"signed_count"`
	Revisions   int     `json:"revisions"`
	// CurrentSigner is whose turn it is while the document is out for signature.
	CurrentSigner *string `json:"current_signer"`
	MyTurn        bool    `json:"my_turn"`

	Signers  []ArchiveSigner  `json:"signers,omitempty"`
	Versions []ArchiveVersion `json:"versions,omitempty"`
	// CanManage and CanSign are for the caller, on the detail answer.
	CanManage bool `json:"can_manage"`
}

type ArchiveSigner struct {
	UserID     string  `json:"user_id"`
	Name       string  `json:"name"`
	Position   string  `json:"position_title"`
	Order      int     `json:"order"`
	Status     string  `json:"status"`
	SignedAt   *string `json:"signed_at"`
	CertName   string  `json:"cert_name"`
	CertSerial string  `json:"cert_serial"`
	CertIssuer string  `json:"cert_issuer"`
	HasEID     bool    `json:"has_eid"`
	Current    bool    `json:"current"`
	// LastError is told to the signer themselves and to managers.
	LastError string `json:"last_error,omitempty"`
	// ReplaceReason: why a manager put somebody else in this signer's place
	// (status "replaced").
	ReplaceReason string `json:"replace_reason,omitempty"`
}

type ArchiveVersion struct {
	Revision   int     `json:"revision"`
	SHA256     string  `json:"sha256"`
	Size       int     `json:"size"`
	SignerID   *string `json:"signer_user_id"`
	SignerName string  `json:"signer_name"`
	CreatedAt  string  `json:"created_at"`
}

const archiveColumns = `
	SELECT d.id::text, d.kind, COALESCE(d.number,''), d.title, d.body, d.event_id::text, COALESCE(e.title,''),
	       d.motion_id::text, d.status, d.draft_reason, d.notice, COALESCE(d.created_by::text,''), COALESCE(u.name,''),
	       d.created_at, d.updated_at, d.issued_at, d.signed_at, d.cancelled_at, d.cancel_reason,
	       COALESCE(d.pdf_sha256,''), COALESCE(d.final_sha256,''),
	       (SELECT count(*) FROM events_archive_signers s WHERE s.document_id = d.id AND s.status <> 'replaced')::int,
	       (SELECT count(*) FROM events_archive_signers s WHERE s.document_id = d.id AND s.status = 'signed')::int,
	       (SELECT count(*) FROM events_archive_versions v WHERE v.document_id = d.id)::int,
	       CASE WHEN d.status = 'signing' THEN (SELECT s.user_id::text FROM events_archive_signers s
	            WHERE s.document_id = d.id AND s.status NOT IN ('signed','replaced') ORDER BY s.sign_order LIMIT 1) END
	  FROM events_archive_documents d
	  LEFT JOIN events_events e ON e.id = d.event_id
	  LEFT JOIN registry.users u ON u.id = d.created_by
	 WHERE d.tenant_id = $1::uuid`

func scanArchive(row pgx.Row, me string) (ArchiveDocument, error) {
	var d ArchiveDocument
	var created, updated time.Time
	var issued, signed, cancelled *time.Time
	if err := row.Scan(&d.ID, &d.Kind, &d.Number, &d.Title, &d.Body, &d.EventID, &d.EventTitle,
		&d.MotionID, &d.Status, &d.DraftReason, &d.Notice, &d.CreatedBy, &d.CreatorName,
		&created, &updated, &issued, &signed, &cancelled, &d.CancelNote,
		&d.PDFSHA256, &d.FinalSHA256, &d.SignerCount, &d.SignedCount, &d.Revisions, &d.CurrentSigner); err != nil {
		return d, err
	}
	d.KindTitle = archiveKindTitles[d.Kind]
	d.CreatedAt, d.UpdatedAt = stamp(created), stamp(updated)
	d.IssuedAt, d.SignedAt, d.CancelledAt = stampPtr(issued), stampPtr(signed), stampPtr(cancelled)
	d.MyTurn = d.CurrentSigner != nil && *d.CurrentSigner == me
	return d, nil
}

type querier interface {
	QueryRow(context.Context, string, ...any) pgx.Row
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

func (m *Module) loadArchive(ctx context.Context, q querier, tenantID, me, id string, lock bool) (ArchiveDocument, error) {
	sql := archiveColumns + ` AND d.id = $2::uuid`
	if lock {
		sql += ` FOR UPDATE OF d`
	}
	return scanArchive(q.QueryRow(ctx, sql, tenantID, id), me)
}

func (m *Module) loadSigners(ctx context.Context, q querier, tenantID, docID string) ([]ArchiveSigner, error) {
	rows, err := q.Query(ctx, `SELECT s.user_id::text, COALESCE(u.name,''), s.position_title, s.sign_order, s.status,
		       s.signed_at, s.cert_name, s.cert_serial, s.cert_issuer, s.last_error, s.replace_reason,
		       EXISTS (SELECT 1 FROM registry.user_eid_identities i WHERE i.user_id = s.user_id
		               AND COALESCE(NULLIF(i.reg_number,''), NULLIF(i.civil_id,'')) IS NOT NULL)
		  FROM events_archive_signers s LEFT JOIN registry.users u ON u.id = s.user_id
		 WHERE s.tenant_id = $1::uuid AND s.document_id = $2::uuid ORDER BY s.sign_order`, tenantID, docID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]ArchiveSigner, 0, 8)
	current := false
	for rows.Next() {
		var s ArchiveSigner
		var at *time.Time
		if err := rows.Scan(&s.UserID, &s.Name, &s.Position, &s.Order, &s.Status, &at,
			&s.CertName, &s.CertSerial, &s.CertIssuer, &s.LastError, &s.ReplaceReason, &s.HasEID); err != nil {
			return nil, err
		}
		s.SignedAt = stampPtr(at)
		if !current && s.Status != "signed" && s.Status != "replaced" {
			s.Current, current = true, true
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func archiveError(w http.ResponseWriter, err error) {
	var conflict conflictError
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		nexus.Error(w, http.StatusNotFound, "no such document")
	case errors.Is(err, errForbidden):
		nexus.Error(w, http.StatusForbidden, "forbidden")
	case errors.As(err, &conflict):
		nexus.Error(w, http.StatusConflict, conflict.Error())
	default:
		nexus.Error(w, http.StatusInternalServerError, "could not change the document")
	}
}

func (m *Module) canManageArchive(ctx context.Context, claims nexus.UserClaims) bool {
	return m.has(ctx, claims, PermArchiveManage)
}

// visible: a document never issued — a draft, or a draft that was cancelled
// before it went out — is the managers' own working copy.
func visible(d ArchiveDocument, manager bool) bool { return manager || d.IssuedAt != nil }

// ─── List and read ───────────────────────────────────────────────────────────

func (m *Module) archiveList(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	manager := m.canManageArchive(r.Context(), claims)
	sql := archiveColumns
	args := []any{claims.WorkspaceID}
	add := func(clause string, value any) {
		args = append(args, value)
		sql += strings.ReplaceAll(clause, "$?", "$"+strconv.Itoa(len(args)))
	}
	if !manager {
		sql += ` AND d.issued_at IS NOT NULL`
	}
	switch kind := q.Get("kind"); kind {
	case "":
	case archiveKindMinutes, archiveKindDecision, archiveKindProtocol:
		add(` AND d.kind = $?`, kind)
	default:
		nexus.Error(w, http.StatusBadRequest, "kind must be minutes, decision or vote_protocol")
		return
	}
	switch status := q.Get("status"); status {
	case "":
	case "draft", "signing", "signed", "cancelled":
		add(` AND d.status = $?`, status)
	default:
		nexus.Error(w, http.StatusBadRequest, "status must be draft, signing, signed or cancelled")
		return
	}
	switch q.Get("mine") {
	case "":
	case "todo":
		// «Миний зурах»: out for signature and the caller is next.
		add(` AND d.status = 'signing' AND $?::uuid = (SELECT s.user_id FROM events_archive_signers s
			WHERE s.document_id = d.id AND s.status NOT IN ('signed','replaced') ORDER BY s.sign_order LIMIT 1)`, claims.UserID)
	case "signer":
		add(` AND EXISTS (SELECT 1 FROM events_archive_signers s WHERE s.document_id = d.id AND s.user_id = $?::uuid)`, claims.UserID)
	default:
		nexus.Error(w, http.StatusBadRequest, "mine must be todo or signer")
		return
	}
	if event := strings.TrimSpace(q.Get("event_id")); event != "" {
		id, ok := canonicalID(event)
		if !ok {
			nexus.Error(w, http.StatusBadRequest, errInvalidID)
			return
		}
		add(` AND d.event_id = $?::uuid`, id)
	}
	offset := pageOffset(r)
	sql += fmt.Sprintf(` ORDER BY d.created_at DESC, d.id DESC LIMIT %d OFFSET %d`, archivePageSize+1, offset)
	rows, err := m.db.Query(r.Context(), sql, args...)
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not list the archive")
		return
	}
	defer rows.Close()
	list := make([]ArchiveDocument, 0, 16)
	for rows.Next() {
		d, err := scanArchive(rows, claims.UserID)
		if err != nil {
			nexus.Error(w, http.StatusInternalServerError, "could not read a document")
			return
		}
		d.Body = "" // the list is a list
		list = append(list, d)
	}
	if rows.Err() != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not list the archive")
		return
	}
	more := len(list) > archivePageSize
	if more {
		list = list[:archivePageSize]
	}
	var todo int
	_ = m.db.QueryRow(r.Context(), `SELECT count(*) FROM events_archive_documents d WHERE d.tenant_id = $1::uuid AND d.status = 'signing'
		AND $2::uuid = (SELECT s.user_id FROM events_archive_signers s WHERE s.document_id = d.id AND s.status NOT IN ('signed','replaced') ORDER BY s.sign_order LIMIT 1)`,
		claims.WorkspaceID, claims.UserID).Scan(&todo)
	var next *int
	if more {
		n := offset + archivePageSize
		next = &n
	}
	signer, signErr := nexus.Capability[nexus.Signer]()
	nexus.JSON(w, http.StatusOK, map[string]any{
		"documents": list, "has_more": more, "next_offset": next, "todo": todo,
		"can_manage": manager, "signing_ready": signErr == nil && signer.Enabled(),
	})
}

func (m *Module) archiveGet(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	d, err := m.loadArchive(ctx, m.db, claims.WorkspaceID, claims.UserID, chi.URLParam(r, "docID"), false)
	manager := m.canManageArchive(ctx, claims)
	if err == nil && !visible(d, manager) {
		err = pgx.ErrNoRows
	}
	if err != nil {
		archiveError(w, err)
		return
	}
	if err := m.fillArchive(ctx, claims, &d, manager); err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not read the document")
		return
	}
	signer, signErr := nexus.Capability[nexus.Signer]()
	nexus.JSON(w, http.StatusOK, map[string]any{"document": d, "signing_ready": signErr == nil && signer.Enabled()})
}

// fillArchive adds the signers and the revision chain to a document.
func (m *Module) fillArchive(ctx context.Context, claims nexus.UserClaims, d *ArchiveDocument, manager bool) error {
	signers, err := m.loadSigners(ctx, m.db, claims.WorkspaceID, d.ID)
	if err != nil {
		return err
	}
	for i := range signers {
		if !manager && signers[i].UserID != claims.UserID {
			signers[i].LastError = ""
		}
		if d.Status != "signing" {
			signers[i].Current = false
		}
	}
	d.Signers = signers
	rows, err := m.db.Query(ctx, `SELECT v.revision, v.sha256, octet_length(v.pdf), s.user_id::text, COALESCE(u.name,''), v.created_at
		FROM events_archive_versions v LEFT JOIN events_archive_signers s ON s.id = v.signer_id
		LEFT JOIN registry.users u ON u.id = s.user_id
		WHERE v.tenant_id = $1::uuid AND v.document_id = $2::uuid ORDER BY v.revision`, claims.WorkspaceID, d.ID)
	if err != nil {
		return err
	}
	defer rows.Close()
	d.Versions = make([]ArchiveVersion, 0, len(signers)+1)
	for rows.Next() {
		var v ArchiveVersion
		var at time.Time
		if err := rows.Scan(&v.Revision, &v.SHA256, &v.Size, &v.SignerID, &v.SignerName, &at); err != nil {
			return err
		}
		v.CreatedAt = stamp(at)
		d.Versions = append(d.Versions, v)
	}
	d.CanManage = manager
	return rows.Err()
}

// ─── Drafts ──────────────────────────────────────────────────────────────────

type archiveInput struct {
	Kind    string   `json:"kind"`
	Title   string   `json:"title"`
	Body    string   `json:"body"`
	EventID *string  `json:"event_id"`
	Signers []string `json:"signers"`
}

func (in *archiveInput) validate(protocol bool) error {
	in.Title, in.Body = strings.TrimSpace(in.Title), strings.TrimSpace(in.Body)
	if !protocol {
		switch in.Kind {
		case archiveKindMinutes, archiveKindDecision:
		default:
			return errors.New("kind must be minutes or decision")
		}
		switch {
		case in.Title == "":
			return errors.New("title is required")
		case len([]rune(in.Title)) > 200:
			return errors.New("title is too long")
		case len([]rune(in.Body)) > maxArchiveBody:
			return errors.New("the text is too long")
		}
	}
	if in.EventID != nil {
		trimmed := strings.TrimSpace(*in.EventID)
		if trimmed == "" {
			in.EventID = nil
		} else if id, ok := canonicalID(trimmed); ok {
			in.EventID = &id
		} else {
			return errors.New("invalid event id")
		}
	}
	if len(in.Signers) > maxArchiveSigners {
		return fmt.Errorf("at most %d people can sign one document", maxArchiveSigners)
	}
	seen := map[string]bool{}
	for i, raw := range in.Signers {
		id, ok := canonicalID(raw)
		if !ok {
			return errors.New("invalid signer id")
		}
		if seen[id] {
			return errors.New("a signer is listed twice")
		}
		seen[id], in.Signers[i] = true, id
	}
	return nil
}

// setSigners replaces a draft's signers, in the order given. Each must be a
// usable member of the branch; their position is printed as it is now.
func (m *Module) setSigners(ctx context.Context, tx pgx.Tx, tenantID, docID string, signers []string) error {
	if _, err := tx.Exec(ctx, `DELETE FROM events_archive_signers WHERE tenant_id = $1 AND document_id = $2`, tenantID, docID); err != nil {
		return err
	}
	for i, user := range signers {
		var position string
		err := tx.QueryRow(ctx, `SELECT m.position FROM workspace.memberships m
			WHERE m.tenant_id = $1::uuid AND m.user_id = $2::uuid AND `+usableMember, tenantID, user).Scan(&position)
		if errors.Is(err, pgx.ErrNoRows) {
			return errConflict("every signer must be an active member of this branch")
		}
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO events_archive_signers (tenant_id, document_id, user_id, sign_order, position_title)
			VALUES ($1, $2, $3, $4, $5)`, tenantID, docID, user, i+1, positionTitles[position]); err != nil {
			return err
		}
	}
	return nil
}

func (m *Module) checkEvent(ctx context.Context, tenantID string, eventID *string) error {
	if eventID == nil {
		return nil
	}
	var ok bool
	if err := m.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM events_events WHERE tenant_id = $1::uuid AND id = $2::uuid)`,
		tenantID, *eventID).Scan(&ok); err != nil {
		return err
	}
	if !ok {
		return errConflict("no such event in this branch")
	}
	return nil
}

func (m *Module) archiveCreate(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	var in archiveInput
	if err := decode(r, &in); err != nil {
		nexus.Error(w, http.StatusBadRequest, "the request could not be read")
		return
	}
	if err := in.validate(false); err != nil {
		nexus.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	ctx := r.Context()
	if err := m.checkEvent(ctx, claims.WorkspaceID, in.EventID); err != nil {
		archiveError(w, err)
		return
	}
	tx, err := m.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		archiveError(w, err)
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var id string
	if err := tx.QueryRow(ctx, `INSERT INTO events_archive_documents (tenant_id, kind, title, body, event_id, created_by)
		VALUES ($1, $2, $3, $4, $5, $6) RETURNING id::text`,
		claims.WorkspaceID, in.Kind, in.Title, in.Body, in.EventID, claims.UserID).Scan(&id); err != nil {
		archiveError(w, err)
		return
	}
	if err := m.setSigners(ctx, tx, claims.WorkspaceID, id, in.Signers); err != nil {
		archiveError(w, err)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		archiveError(w, err)
		return
	}
	nexus.Audit(ctx, claims.WorkspaceID, claims.UserID, "events.archive.create", id, map[string]any{"kind": in.Kind, "signers": len(in.Signers)})
	m.answerArchive(w, r, claims, id, http.StatusCreated)
}

func (m *Module) answerArchive(w http.ResponseWriter, r *http.Request, claims nexus.UserClaims, id string, code int) {
	d, err := m.loadArchive(r.Context(), m.db, claims.WorkspaceID, claims.UserID, id, false)
	if err == nil {
		err = m.fillArchive(r.Context(), claims, &d, m.canManageArchive(r.Context(), claims))
	}
	if err != nil {
		archiveError(w, err)
		return
	}
	nexus.JSON(w, code, map[string]any{"document": d})
}

// archiveUpdate changes a draft. A vote protocol's text is the vote's own and
// only its signers can be chosen.
func (m *Module) archiveUpdate(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	var in archiveInput
	if err := decode(r, &in); err != nil {
		nexus.Error(w, http.StatusBadRequest, "the request could not be read")
		return
	}
	ctx := r.Context()
	id := chi.URLParam(r, "docID")
	tx, err := m.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		archiveError(w, err)
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()
	d, err := m.loadArchive(ctx, tx, claims.WorkspaceID, claims.UserID, id, true)
	if err != nil {
		archiveError(w, err)
		return
	}
	if d.Status != "draft" {
		archiveError(w, errConflict("only a draft can be edited"))
		return
	}
	protocol := d.Kind == archiveKindProtocol
	if protocol {
		in.Kind, in.Title, in.Body, in.EventID = d.Kind, d.Title, d.Body, d.EventID
	}
	if err := in.validate(protocol); err != nil {
		nexus.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if !protocol {
		if err := m.checkEvent(ctx, claims.WorkspaceID, in.EventID); err != nil {
			archiveError(w, err)
			return
		}
		if _, err := tx.Exec(ctx, `UPDATE events_archive_documents SET kind = $3, title = $4, body = $5, event_id = $6, updated_at = now()
			WHERE tenant_id = $1 AND id = $2`, claims.WorkspaceID, id, in.Kind, in.Title, in.Body, in.EventID); err != nil {
			archiveError(w, err)
			return
		}
	}
	if err := m.setSigners(ctx, tx, claims.WorkspaceID, id, in.Signers); err != nil {
		archiveError(w, err)
		return
	}
	if _, err := tx.Exec(ctx, `UPDATE events_archive_documents SET draft_reason = '', notice = '', updated_at = now()
		WHERE tenant_id = $1 AND id = $2 AND $3`, claims.WorkspaceID, id, len(in.Signers) > 0); err != nil {
		archiveError(w, err)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		archiveError(w, err)
		return
	}
	nexus.Audit(ctx, claims.WorkspaceID, claims.UserID, "events.archive.edit", id, map[string]any{"signers": len(in.Signers)})
	m.answerArchive(w, r, claims, id, http.StatusOK)
}

// archiveCandidates is who can be asked to sign: the «Бүх тэргүүлэгч»
// preset, the chair and secretary, and members found by name.
func (m *Module) archiveCandidates(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	type candidate struct {
		UserID   string `json:"user_id"`
		Name     string `json:"name"`
		Email    string `json:"email"`
		Position string `json:"position"`
		Title    string `json:"position_title"`
		HasEID   bool   `json:"has_eid"`
	}
	list := func(where string, args ...any) ([]candidate, error) {
		rows, err := m.db.Query(ctx, `SELECT m.user_id::text, COALESCE(u.name,''), COALESCE(u.email,''), m.position,
			EXISTS (SELECT 1 FROM registry.user_eid_identities i WHERE i.user_id = m.user_id
			        AND COALESCE(NULLIF(i.reg_number,''), NULLIF(i.civil_id,'')) IS NOT NULL)
			FROM workspace.memberships m JOIN registry.users u ON u.id = m.user_id
			WHERE m.tenant_id = $1::uuid AND `+usableMember+where, append([]any{claims.WorkspaceID}, args...)...)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		out := make([]candidate, 0, 16)
		for rows.Next() {
			var c candidate
			if err := rows.Scan(&c.UserID, &c.Name, &c.Email, &c.Position, &c.HasEID); err != nil {
				return nil, err
			}
			c.Title = positionTitles[c.Position]
			out = append(out, c)
		}
		return out, rows.Err()
	}
	board, err := list(` AND m.position = 'board' ORDER BY u.name, m.user_id`)
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not list the members")
		return
	}
	officers, err := list(` AND m.position IN ('chair','secretary') ORDER BY CASE m.position WHEN 'chair' THEN 1 ELSE 2 END`)
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not list the members")
		return
	}
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if len([]rune(query)) > 100 {
		query = string([]rune(query)[:100])
	}
	pattern := "%" + strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(query) + "%"
	members, err := list(` AND (u.name ILIKE $2 OR u.email ILIKE $2)
		ORDER BY CASE m.position WHEN 'chair' THEN 1 WHEN 'vice_chair' THEN 2 WHEN 'secretary' THEN 3 WHEN 'board' THEN 4 ELSE 5 END, u.name, m.user_id LIMIT 50`, pattern)
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not list the members")
		return
	}
	nexus.JSON(w, http.StatusOK, map[string]any{"board": board, "officers": officers, "members": members})
}

// ─── Freezing ────────────────────────────────────────────────────────────────

func (m *Module) archiveSend(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	id := chi.URLParam(r, "docID")
	tx, err := m.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		archiveError(w, err)
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := m.freeze(ctx, tx, claims.WorkspaceID, id); err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			var conflict conflictError
			if !errors.As(err, &conflict) {
				slog.WarnContext(ctx, "events: archive document could not be frozen", "error", err, "document_id", id)
			}
		}
		archiveError(w, err)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		archiveError(w, err)
		return
	}
	nexus.Audit(ctx, claims.WorkspaceID, claims.UserID, "events.archive.send", id, nil)
	m.answerArchive(w, r, claims, id, http.StatusOK)
}

// freeze numbers a draft, renders its PDF once, stores it as revision 0 and
// sends it to its first signer (the notification trigger does the sending).
func (m *Module) freeze(ctx context.Context, tx pgx.Tx, tenantID, id string) error {
	d, err := m.loadArchive(ctx, tx, tenantID, "", id, true)
	if err != nil {
		return err
	}
	if d.Status != "draft" {
		return errConflict("only a draft can be sent for signature")
	}
	signers, err := m.loadSigners(ctx, tx, tenantID, id)
	if err != nil {
		return err
	}
	if len(signers) == 0 {
		return errConflict("choose who signs the document first")
	}
	for _, s := range signers {
		var ok bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM workspace.memberships m
			WHERE m.tenant_id = $1::uuid AND m.user_id = $2::uuid AND `+usableMember+`)`, tenantID, s.UserID).Scan(&ok); err != nil {
			return err
		}
		if !ok {
			return errConflict("every signer must be an active member of this branch")
		}
	}
	issued := time.Now().UTC().Truncate(time.Second)
	year := issued.In(ulaanbaatar).Year()
	var seq int
	if err := tx.QueryRow(ctx, `INSERT INTO events_archive_counters (tenant_id, year, last) VALUES ($1, $2, 1)
		ON CONFLICT (tenant_id, year) DO UPDATE SET last = events_archive_counters.last + 1 RETURNING last`,
		tenantID, year).Scan(&seq); err != nil {
		return err
	}
	d.Number = fmt.Sprintf("%d/%03d", year, seq)
	issuedStamp := stamp(issued)
	d.IssuedAt = &issuedStamp
	input, err := m.renderInput(ctx, tx, tenantID, d, signers)
	if err != nil {
		return err
	}
	pdf, err := renderArchive(input)
	if err != nil {
		return err
	}
	if len(pdf) > maxArchivePDF {
		return errConflict("the document is too large")
	}
	sum := sha256.Sum256(pdf)
	digest := hex.EncodeToString(sum[:])
	if _, err := tx.Exec(ctx, `INSERT INTO events_archive_versions (tenant_id, document_id, revision, pdf, sha256)
		VALUES ($1, $2, 0, $3, $4)`, tenantID, id, pdf, digest); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE events_archive_documents SET status = 'signing', number = $3, issued_at = $4,
		pdf_sha256 = $5, draft_reason = '', updated_at = now() WHERE tenant_id = $1 AND id = $2`,
		tenantID, id, d.Number, issued, digest)
	return err
}

// renderInput gathers what the PDF says, from the database as it stands.
func (m *Module) renderInput(ctx context.Context, q querier, tenantID string, d ArchiveDocument, signers []ArchiveSigner) (archiveRender, error) {
	in := archiveRender{
		DocumentID: d.ID, Kind: d.Kind, Number: d.Number, Title: d.Title, Body: d.Body,
		EventTitle: d.EventTitle, Author: d.CreatorName,
	}
	if d.IssuedAt != nil {
		in.Issued, _ = time.Parse(time.RFC3339, *d.IssuedAt)
	}
	_ = q.QueryRow(ctx, `SELECT COALESCE(name,'') FROM registry.tenants WHERE id = $1::uuid`, tenantID).Scan(&in.Branch)
	for _, s := range signers {
		if s.Status == "replaced" {
			continue
		}
		in.Signers = append(in.Signers, renderSigner{Name: s.Name, Position: s.Position})
	}
	if d.Kind == archiveKindProtocol {
		var raw []byte
		if err := q.QueryRow(ctx, `SELECT payload FROM events_archive_documents WHERE tenant_id = $1::uuid AND id = $2::uuid`,
			tenantID, d.ID).Scan(&raw); err != nil {
			return in, err
		}
		var p protocolPayload
		if err := json.Unmarshal(raw, &p); err != nil {
			return in, err
		}
		in.Protocol = &p
	}
	return in, nil
}

func (m *Module) archiveCancel(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	var in struct {
		Reason string `json:"reason"`
	}
	_ = decode(r, &in)
	in.Reason = strings.TrimSpace(in.Reason)
	if len([]rune(in.Reason)) > 500 {
		nexus.Error(w, http.StatusBadRequest, "the reason is too long")
		return
	}
	ctx := r.Context()
	id := chi.URLParam(r, "docID")
	tx, err := m.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		archiveError(w, err)
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()
	d, err := m.loadArchive(ctx, tx, claims.WorkspaceID, claims.UserID, id, true)
	if err != nil {
		archiveError(w, err)
		return
	}
	if d.Status != "draft" && d.Status != "signing" {
		archiveError(w, errConflict("a signed or cancelled document cannot be cancelled"))
		return
	}
	if d.Status == "signing" && in.Reason == "" {
		nexus.Error(w, http.StatusBadRequest, "give a reason for cancelling a document out for signature")
		return
	}
	if _, err := tx.Exec(ctx, `UPDATE events_archive_documents SET status = 'cancelled', cancelled_at = now(), cancelled_by = $3,
		cancel_reason = $4, updated_at = now() WHERE tenant_id = $1 AND id = $2`, claims.WorkspaceID, id, claims.UserID, in.Reason); err != nil {
		archiveError(w, err)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		archiveError(w, err)
		return
	}
	nexus.Audit(ctx, claims.WorkspaceID, claims.UserID, "events.archive.cancel", id, map[string]any{"from": d.Status, "reason": in.Reason})
	m.answerArchive(w, r, claims, id, http.StatusOK)
}

// ─── The PDF ─────────────────────────────────────────────────────────────────

// archivePDF answers one revision of the document (the latest by default). A
// draft has none stored, so a manager gets a preview marked as a draft.
func (m *Module) archivePDF(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	id := chi.URLParam(r, "docID")
	manager := m.canManageArchive(ctx, claims)
	d, err := m.loadArchive(ctx, m.db, claims.WorkspaceID, claims.UserID, id, false)
	if err == nil && !visible(d, manager) {
		err = pgx.ErrNoRows
	}
	if err != nil {
		archiveError(w, err)
		return
	}
	name := "archive-" + strings.ReplaceAll(d.Number, "/", "-")
	if d.Revisions == 0 {
		signers, err := m.loadSigners(ctx, m.db, claims.WorkspaceID, id)
		if err != nil {
			archiveError(w, err)
			return
		}
		input, err := m.renderInput(ctx, m.db, claims.WorkspaceID, d, signers)
		if err != nil {
			archiveError(w, err)
			return
		}
		input.Draft = true
		pdf, err := renderArchive(input)
		if err != nil {
			nexus.Error(w, http.StatusInternalServerError, "could not render the document")
			return
		}
		writePDF(w, r, pdf, "archive-draft-"+d.ID[:8]+".pdf")
		return
	}
	sql := `SELECT pdf, revision FROM events_archive_versions WHERE tenant_id = $1::uuid AND document_id = $2::uuid`
	args := []any{claims.WorkspaceID, id}
	if raw := r.URL.Query().Get("revision"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 0 || n > maxArchiveSigners {
			nexus.Error(w, http.StatusBadRequest, "revision must be a number")
			return
		}
		sql += ` AND revision = $3`
		args = append(args, n)
	}
	var pdf []byte
	var revision int
	if err := m.db.QueryRow(ctx, sql+` ORDER BY revision DESC LIMIT 1`, args...).Scan(&pdf, &revision); err != nil {
		archiveError(w, err)
		return
	}
	writePDF(w, r, pdf, fmt.Sprintf("%s-r%d.pdf", name, revision))
}

// writePDF sends a stored PDF: inline when ?inline=1 (the browser's viewer),
// a download otherwise.
func writePDF(w http.ResponseWriter, r *http.Request, pdf []byte, filename string) {
	disposition := "attachment"
	if r.URL.Query().Get("inline") == "1" {
		disposition = "inline"
		// The member area previews the PDF in a frame on the same site; the
		// platform's DENY would leave that frame empty. Nothing else changes:
		// only this site may frame it, and the document runs no script.
		w.Header().Set("X-Frame-Options", "SAMEORIGIN")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'self'")
	}
	sum := sha256.Sum256(pdf)
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", disposition+`; filename="`+filename+`"`)
	w.Header().Set("Content-Length", strconv.Itoa(len(pdf)))
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Document-SHA256", hex.EncodeToString(sum[:]))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(pdf)
}

// archiveReplaceSigners changes who still has to sign a document that is out
// for signature: the signers who have not signed are marked replaced (kept,
// with the reason) and the given people follow those who have signed, in the
// order given. The signatures already in the PDF stay; the PDF's printed list
// is the one at issue, and the change is audited and shown with the document.
func (m *Module) archiveReplaceSigners(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	var in struct {
		Signers []string `json:"signers"`
		Reason  string   `json:"reason"`
	}
	if err := decode(r, &in); err != nil {
		nexus.Error(w, http.StatusBadRequest, "the request could not be read")
		return
	}
	in.Reason = strings.TrimSpace(in.Reason)
	switch {
	case in.Reason == "":
		nexus.Error(w, http.StatusBadRequest, "give a reason for changing the signers")
		return
	case len([]rune(in.Reason)) > 500:
		nexus.Error(w, http.StatusBadRequest, "the reason is too long")
		return
	case len(in.Signers) == 0:
		nexus.Error(w, http.StatusBadRequest, "name who signs instead")
		return
	}
	check := archiveInput{Signers: in.Signers}
	if err := check.validate(true); err != nil {
		nexus.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	ctx := r.Context()
	id := chi.URLParam(r, "docID")
	tx, err := m.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		archiveError(w, err)
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()
	d, err := m.loadArchive(ctx, tx, claims.WorkspaceID, claims.UserID, id, true)
	if err != nil {
		archiveError(w, err)
		return
	}
	if d.Status != "signing" {
		archiveError(w, errConflict(errArchiveNotOutForSigns))
		return
	}
	signers, err := m.loadSigners(ctx, tx, claims.WorkspaceID, id)
	if err != nil {
		archiveError(w, err)
		return
	}
	signed, last, open := map[string]bool{}, 0, 0
	var replaced []string
	for _, s := range signers {
		last = max(last, s.Order)
		switch s.Status {
		case "signed":
			signed[s.UserID] = true
		case "replaced":
		default:
			open++
			replaced = append(replaced, s.UserID)
		}
	}
	for _, user := range check.Signers {
		if signed[user] {
			archiveError(w, errConflict("a new signer has already signed this document"))
			return
		}
	}
	if last+len(check.Signers) > maxArchiveSigners {
		archiveError(w, errConflict("too many signers"))
		return
	}
	// The open signers out, then the new ones in, after those who signed. The
	// first one inserted is the new current signer and is notified by the
	// insert trigger. Somebody being replaced may be named again: their old
	// row stays replaced and a new one takes the turn.
	if _, err := tx.Exec(ctx, `UPDATE events_archive_signers SET status = 'replaced', replaced_at = now(), replaced_by = $3,
		replace_reason = $4, updated_at = now()
		WHERE tenant_id = $1::uuid AND document_id = $2::uuid AND status NOT IN ('signed','replaced')`,
		claims.WorkspaceID, id, claims.UserID, in.Reason); err != nil {
		archiveError(w, err)
		return
	}
	if _, err := tx.Exec(ctx, `UPDATE events_archive_documents SET notice = '', updated_at = now() WHERE tenant_id = $1 AND id = $2`,
		claims.WorkspaceID, id); err != nil {
		archiveError(w, err)
		return
	}
	for i, user := range check.Signers {
		var position string
		err := tx.QueryRow(ctx, `SELECT m.position FROM workspace.memberships m
			WHERE m.tenant_id = $1::uuid AND m.user_id = $2::uuid AND `+usableMember, claims.WorkspaceID, user).Scan(&position)
		if errors.Is(err, pgx.ErrNoRows) {
			archiveError(w, errConflict("every signer must be an active member of this branch"))
			return
		}
		if err != nil {
			archiveError(w, err)
			return
		}
		if _, err := tx.Exec(ctx, `INSERT INTO events_archive_signers (tenant_id, document_id, user_id, sign_order, position_title)
			VALUES ($1, $2, $3, $4, $5)`, claims.WorkspaceID, id, user, last+i+1, positionTitles[position]); err != nil {
			archiveError(w, err)
			return
		}
	}
	if err := tx.Commit(ctx); err != nil {
		archiveError(w, err)
		return
	}
	nexus.Audit(ctx, claims.WorkspaceID, claims.UserID, "events.archive.replace_signers", id, map[string]any{
		"replaced": replaced, "signers": check.Signers, "reason": in.Reason, "open_before": open})
	m.answerArchive(w, r, claims, id, http.StatusOK)
}
