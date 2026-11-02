package events

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gerege-systems/open-gerege-nexus/backend/pkg/nexus"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

// Reporting and blocking: what members write in a discussion reaches every
// other member of the branch, so any of them can report an issue to the
// organiser and stop seeing what one person raises. An issue not yet under
// vote that hideAfterReports members reported is hidden from members until a
// manager looks at it; a manager opening the vote has moderated it.

const hideAfterReports = 3

// report records the caller's report of one issue. Reporting twice is not an
// error: the first report stands.
func (m *Module) report(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	var in struct {
		Reason string `json:"reason"`
	}
	_ = decode(r, &in)
	reason := strings.TrimSpace(in.Reason)
	if len([]rune(reason)) > 500 {
		nexus.Error(w, http.StatusBadRequest, "reason is too long")
		return
	}
	eventID, motionID := chi.URLParam(r, "id"), chi.URLParam(r, "motionID")
	mo, err := m.loadMotion(r.Context(), m.db, claims, eventID, motionID, false)
	if err != nil {
		motionError(w, err)
		return
	}
	if mo.ProposerID == claims.UserID {
		nexus.Error(w, http.StatusBadRequest, "you cannot report your own issue")
		return
	}
	if !m.isActiveMember(r.Context(), claims.WorkspaceID, claims.UserID) {
		nexus.Error(w, http.StatusForbidden, "only members of this branch may report an issue")
		return
	}
	if _, err := m.db.Exec(r.Context(), `INSERT INTO events_motion_reports (tenant_id, motion_id, event_id, reporter_id, reason)
		VALUES ($1, $2, $3, $4, $5) ON CONFLICT (motion_id, reporter_id) DO NOTHING`,
		claims.WorkspaceID, mo.ID, eventID, claims.UserID, reason); err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not record the report")
		return
	}
	nexus.Audit(r.Context(), claims.WorkspaceID, claims.UserID, "events.motion.report", mo.ID, map[string]any{"event_id": eventID})
	nexus.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// Blocked is one person the caller has blocked.
type Blocked struct {
	UserID    string `json:"user_id"`
	Name      string `json:"name"`
	BlockedAt string `json:"blocked_at"`
}

func (m *Module) blocks(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	rows, err := m.db.Query(r.Context(), `SELECT b.blocked_id::text, COALESCE(u.name,''), b.created_at
		FROM events_member_blocks b LEFT JOIN registry.users u ON u.id = b.blocked_id
		WHERE b.tenant_id = $1::uuid AND b.user_id = $2::uuid ORDER BY b.created_at DESC`, claims.WorkspaceID, claims.UserID)
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not list the blocked members")
		return
	}
	defer rows.Close()
	list := make([]Blocked, 0, 4)
	for rows.Next() {
		var b Blocked
		var at time.Time
		if err := rows.Scan(&b.UserID, &b.Name, &at); err != nil {
			nexus.Error(w, http.StatusInternalServerError, "could not list the blocked members")
			return
		}
		b.BlockedAt = stamp(at)
		list = append(list, b)
	}
	if rows.Err() != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not list the blocked members")
		return
	}
	nexus.JSON(w, http.StatusOK, map[string]any{"blocked": list})
}

// block hides what one member raises from the caller. Only someone who raised
// an issue in this branch can be blocked — the id is not a way to probe for
// users.
func (m *Module) block(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	target := chi.URLParam(r, "userID")
	if target == claims.UserID {
		nexus.Error(w, http.StatusBadRequest, "you cannot block yourself")
		return
	}
	var known string
	err := m.db.QueryRow(r.Context(), `SELECT proposer_id::text FROM events_motions
		WHERE tenant_id = $1::uuid AND proposer_id::text = $2 LIMIT 1`, claims.WorkspaceID, target).Scan(&known)
	if errors.Is(err, pgx.ErrNoRows) {
		nexus.Error(w, http.StatusNotFound, "no such member")
		return
	}
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not block the member")
		return
	}
	if _, err := m.db.Exec(r.Context(), `INSERT INTO events_member_blocks (tenant_id, user_id, blocked_id)
		VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, claims.WorkspaceID, claims.UserID, known); err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not block the member")
		return
	}
	nexus.Audit(r.Context(), claims.WorkspaceID, claims.UserID, "events.member.block", known, nil)
	nexus.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (m *Module) unblock(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	if _, err := m.db.Exec(r.Context(), `DELETE FROM events_member_blocks
		WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND blocked_id::text = $3`,
		claims.WorkspaceID, claims.UserID, chi.URLParam(r, "userID")); err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not unblock the member")
		return
	}
	nexus.Audit(r.Context(), claims.WorkspaceID, claims.UserID, "events.member.unblock", chi.URLParam(r, "userID"), nil)
	nexus.JSON(w, http.StatusOK, map[string]any{"ok": true})
}
