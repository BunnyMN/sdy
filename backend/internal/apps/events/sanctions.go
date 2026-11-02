package events

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gerege-systems/open-gerege-nexus/backend/pkg/nexus"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Sanctions: the branch's control committee (Хяналтын хороо, events.discipline)
// warns a member and may deduct points, with a reason. Anybody in the branch —
// a board member or an officer as much as an ordinary member — but never
// oneself. A decision is history (migration 00007): it is not edited or
// removed, and the member is notified.

type Sanction struct {
	ID         string  `json:"id"`
	UserID     string  `json:"user_id"`
	UserName   string  `json:"user_name"`
	ActorID    string  `json:"actor_id"`
	ActorName  string  `json:"actor_name"`
	EventID    *string `json:"event_id"`
	EventTitle string  `json:"event_title"`
	Points     int     `json:"points"`
	Reason     string  `json:"reason"`
	CreatedAt  string  `json:"created_at"`
}

const sanctionColumns = `SELECT s.id::text, s.user_id::text, COALESCE(u.name,''), s.actor_id::text, COALESCE(a.name,''),
	s.event_id::text, COALESCE(e.title,''), s.points, s.reason, s.created_at
	FROM events_sanctions s
	LEFT JOIN registry.users u ON u.id = s.user_id
	LEFT JOIN registry.users a ON a.id = s.actor_id
	LEFT JOIN events_events e ON e.id = s.event_id AND e.tenant_id = s.tenant_id
	WHERE s.tenant_id = $1::uuid`

func scanSanctions(rows pgx.Rows) ([]Sanction, error) {
	defer rows.Close()
	out := make([]Sanction, 0, 16)
	for rows.Next() {
		var s Sanction
		var at time.Time
		if err := rows.Scan(&s.ID, &s.UserID, &s.UserName, &s.ActorID, &s.ActorName, &s.EventID, &s.EventTitle,
			&s.Points, &s.Reason, &at); err != nil {
			return nil, err
		}
		s.CreatedAt = stamp(at)
		out = append(out, s)
	}
	return out, rows.Err()
}

// has reports whether the caller holds one permission here. Administrators
// hold every one, as they do at the route gate.
func (m *Module) has(ctx context.Context, claims nexus.UserClaims, code string) bool {
	if claims.IsAdmin {
		return true
	}
	permissions, err := m.permissions.GetUserPermissions(ctx, claims.WorkspaceID, claims.UserID)
	return err == nil && permissions[code]
}

type sanctionInput struct {
	UserID  string  `json:"user_id"`
	EventID *string `json:"event_id"`
	Points  int     `json:"points"`
	Reason  string  `json:"reason"`
}

func (in *sanctionInput) validate() error {
	in.Reason = strings.TrimSpace(in.Reason)
	switch {
	case in.UserID == "":
		return errors.New("choose the member")
	case in.Points < 0 || in.Points > 10000:
		return errors.New("points must be between 0 and 10000")
	case in.Reason == "":
		return errors.New("a reason is required")
	case len([]rune(in.Reason)) > 500:
		return errors.New("reason is too long")
	}
	if in.EventID != nil && strings.TrimSpace(*in.EventID) == "" {
		in.EventID = nil
	}
	if _, err := uuid.Parse(in.UserID); err != nil {
		return errors.New("choose the member")
	}
	if in.EventID != nil {
		if _, err := uuid.Parse(*in.EventID); err != nil {
			return errors.New("no such event")
		}
	}
	return nil
}

func (m *Module) sanction(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	var in sanctionInput
	if err := decode(r, &in); err != nil {
		nexus.Error(w, http.StatusBadRequest, "the request could not be read")
		return
	}
	if err := in.validate(); err != nil {
		nexus.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if in.UserID == claims.UserID {
		nexus.Error(w, http.StatusForbidden, "a decision about yourself is for the rest of the committee")
		return
	}
	ctx := r.Context()
	if !m.isActiveMember(ctx, claims.WorkspaceID, in.UserID) {
		nexus.Error(w, http.StatusNotFound, "no such member in this branch")
		return
	}
	if in.EventID != nil {
		if _, err := m.loadEvent(ctx, claims.WorkspaceID, claims.UserID, *in.EventID); err != nil {
			eventError(w, err)
			return
		}
	}
	tx, err := m.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not record the decision")
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var entry *string
	if in.Points > 0 {
		var id string
		if err := tx.QueryRow(ctx, `INSERT INTO events_point_entries (tenant_id,event_id,user_id,delta,reason,actor_id)
			VALUES ($1,$2,$3,$4,'sanction',$5) RETURNING id::text`,
			claims.WorkspaceID, in.EventID, in.UserID, -in.Points, claims.UserID).Scan(&id); err != nil {
			nexus.Error(w, http.StatusInternalServerError, "could not record the decision")
			return
		}
		entry = &id
	}
	var id string
	if err := tx.QueryRow(ctx, `INSERT INTO events_sanctions (tenant_id,user_id,actor_id,event_id,points,reason,point_entry_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id::text`,
		claims.WorkspaceID, in.UserID, claims.UserID, in.EventID, in.Points, in.Reason, entry).Scan(&id); err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not record the decision")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not record the decision")
		return
	}
	nexus.Audit(ctx, claims.WorkspaceID, claims.UserID, "events.sanction", id,
		map[string]any{"user_id": in.UserID, "points": in.Points, "event_id": in.EventID})
	rows, err := m.db.Query(ctx, sanctionColumns+` AND s.id = $2::uuid`, claims.WorkspaceID, id)
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not read the decision")
		return
	}
	list, err := scanSanctions(rows)
	if err != nil || len(list) != 1 {
		nexus.Error(w, http.StatusInternalServerError, "could not read the decision")
		return
	}
	nexus.JSON(w, http.StatusCreated, list[0])
}

// sanctions lists the branch's decisions, newest first, for the committee.
func (m *Module) sanctions(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	offset := pageOffset(r)
	rows, err := m.db.Query(r.Context(), sanctionColumns+` ORDER BY s.created_at DESC, s.id LIMIT 51 OFFSET $2`, claims.WorkspaceID, offset)
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not list the decisions")
		return
	}
	list, err := scanSanctions(rows)
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not list the decisions")
		return
	}
	more := len(list) > 50
	if more {
		list = list[:50]
	}
	nexus.JSON(w, http.StatusOK, map[string]any{"sanctions": list, "has_more": more, "next_offset": offset + len(list)})
}

// mySanctions is the member's own record of decisions about them.
func (m *Module) mySanctions(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	rows, err := m.db.Query(r.Context(), sanctionColumns+` AND s.user_id = $2::uuid ORDER BY s.created_at DESC, s.id LIMIT 100`,
		claims.WorkspaceID, claims.UserID)
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not list the decisions")
		return
	}
	list, err := scanSanctions(rows)
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not list the decisions")
		return
	}
	nexus.JSON(w, http.StatusOK, map[string]any{"sanctions": list})
}
