package events

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gerege-systems/open-gerege-nexus/backend/pkg/nexus"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

// The event row is locked by every caller. Attendance and its point movement
// commit together; retrying a mark with the same status adds no second entry.
func syncPoints(ctx context.Context, tx pgx.Tx, event Event, tenant, user, actor, status, reason string) error {
	var previous int
	if err := tx.QueryRow(ctx, `SELECT points_awarded FROM events_attendance
		WHERE tenant_id=$1 AND event_id=$2 AND user_id=$3 FOR UPDATE`, tenant, event.ID, user).Scan(&previous); err != nil {
		return err
	}
	next := 0
	if status == "attended" {
		next = event.PointsValue
	}
	if next == previous {
		return nil
	}
	if _, err := tx.Exec(ctx, `UPDATE events_attendance SET points_awarded=$4
		WHERE tenant_id=$1 AND event_id=$2 AND user_id=$3`, tenant, event.ID, user, next); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `INSERT INTO events_point_entries (tenant_id,event_id,user_id,delta,reason,actor_id)
		VALUES ($1,$2,$3,$4,$5,$6)`, tenant, event.ID, user, next-previous, reason, actor)
	return err
}

// Check-in is open in a window around the event: from checkinLead before it
// starts until checkinTrail after it ends. An event without an end time is
// taken to end at the close of its day in Ulaanbaatar — and never sooner than
// checkinTrail after it starts, so an evening event still gets its window.
// A code issued outside the window could otherwise be photographed today and
// used for a meeting next month, and a code is never valid past the window.
const (
	checkinLead     = 2 * time.Hour
	checkinTrail    = 2 * time.Hour
	checkinValidity = 5 * time.Minute
)

func checkinWindow(e Event) (open, closes time.Time, err error) {
	start, err := time.Parse(time.RFC3339, e.StartsAt)
	if err != nil {
		return open, closes, err
	}
	open = start.Add(-checkinLead)
	if e.EndsAt != nil {
		end, err := time.Parse(time.RFC3339, *e.EndsAt)
		if err != nil {
			return open, closes, err
		}
		return open, end.Add(checkinTrail), nil
	}
	local := start.In(ulaanbaatar)
	closes = time.Date(local.Year(), local.Month(), local.Day()+1, 0, 0, 0, 0, ulaanbaatar)
	if floor := start.Add(checkinTrail); closes.Before(floor) {
		closes = floor
	}
	return open, closes, nil
}

func checkinOpen(e Event, now time.Time) (time.Time, bool) {
	open, closes, err := checkinWindow(e)
	return closes, err == nil && !now.Before(open) && now.Before(closes)
}

// issueCheckin shows a fresh code for the organiser's QR screen. Each
// organiser has their own code (migration 00009): a new one replaces only the
// caller's previous code, so two organisers at two doors do not invalidate
// each other's screens.
func (m *Module) issueCheckin(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	tx, event, err := m.lockEvent(r.Context(), claims.WorkspaceID, claims.UserID, id)
	if err != nil {
		eventError(w, err)
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	if event.Status != "planned" {
		nexus.Error(w, http.StatusConflict, "this event is closed")
		return
	}
	now := time.Now().UTC()
	closes, open := checkinOpen(event, now)
	if !open {
		nexus.Error(w, http.StatusConflict, ErrCheckinWindow)
		return
	}
	raw := make([]byte, 24)
	if _, err := rand.Read(raw); err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not create a check-in code")
		return
	}
	token := hex.EncodeToString(raw)
	hash := sha256.Sum256([]byte(token))
	expires := now.Add(checkinValidity)
	if closes.Before(expires) {
		expires = closes.UTC()
	}
	if _, err := tx.Exec(r.Context(), `DELETE FROM events_checkin_codes WHERE tenant_id=$1 AND event_id=$2 AND expires_at <= now()`,
		claims.WorkspaceID, id); err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not create a check-in code")
		return
	}
	if _, err := tx.Exec(r.Context(), `INSERT INTO events_checkin_codes (tenant_id,event_id,issued_by,code_hash,expires_at)
		VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (event_id,issued_by) DO UPDATE SET code_hash=EXCLUDED.code_hash, expires_at=EXCLUDED.expires_at, created_at=now()`,
		claims.WorkspaceID, id, claims.UserID, hash[:], expires); err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not create a check-in code")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not create a check-in code")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	nexus.Audit(r.Context(), claims.WorkspaceID, claims.UserID, "events.checkin.issue", id, nil)
	nexus.JSON(w, http.StatusOK, map[string]any{"event_id": id, "token": token, "expires_at": expires})
}

// checkIn is a registered member scanning an organiser's code. A code is
// good for any number of members until it expires — it is on a screen in the
// room — but each member's attendance and points move once: the update below
// only takes a row that is still 'registered', and the event row lock
// serialises a member's concurrent scans.
func (m *Module) checkIn(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	var input struct {
		Token string `json:"token"`
	}
	if err := decode(r, &input); err != nil || len(input.Token) != 48 {
		nexus.Error(w, http.StatusBadRequest, "invalid check-in code")
		return
	}
	id := chi.URLParam(r, "id")
	tx, event, err := m.lockEvent(r.Context(), claims.WorkspaceID, claims.UserID, id)
	if err != nil {
		eventError(w, err)
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	if event.MyStatus == "attended" {
		nexus.JSON(w, http.StatusOK, map[string]any{"status": "attended", "changed": false})
		return
	}
	if event.Status != "planned" || event.MyStatus != "registered" {
		nexus.Error(w, http.StatusConflict, "register for an open event before checking in")
		return
	}
	if _, open := checkinOpen(event, time.Now()); !open {
		nexus.Error(w, http.StatusConflict, ErrCheckinWindow)
		return
	}
	hash := sha256.Sum256([]byte(input.Token))
	var issuer string
	err = tx.QueryRow(r.Context(), `SELECT issued_by::text FROM events_checkin_codes
		WHERE tenant_id=$1 AND event_id=$2 AND code_hash=$3 AND expires_at > now()`, claims.WorkspaceID, id, hash[:]).Scan(&issuer)
	if errors.Is(err, pgx.ErrNoRows) {
		nexus.Error(w, http.StatusConflict, "the check-in code is invalid or expired")
		return
	}
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not check the code")
		return
	}
	// The organiser showing the code does not check themselves in with it:
	// another organiser's code, or another organiser's mark, records them.
	if issuer == claims.UserID {
		nexus.Error(w, http.StatusForbidden, ErrSelfCheckin)
		return
	}
	if _, err := tx.Exec(r.Context(), `UPDATE events_attendance SET status='attended',checked_at=now(),checked_by=$3
		WHERE tenant_id=$1 AND event_id=$2 AND user_id=$3 AND status='registered'`, claims.WorkspaceID, id, claims.UserID); err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not record attendance")
		return
	}
	if err := syncPoints(r.Context(), tx, event, claims.WorkspaceID, claims.UserID, claims.UserID, "attended", "self.checkin"); err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not record participation points")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not record attendance")
		return
	}
	nexus.Audit(r.Context(), claims.WorkspaceID, claims.UserID, "events.checkin", id, map[string]any{"issued_by": issuer})
	nexus.JSON(w, http.StatusOK, map[string]any{"status": "attended", "changed": true, "points": event.PointsValue})
}

func pageOffset(r *http.Request) int {
	offset, err := strconv.Atoi(r.URL.Query().Get("offset"))
	if err != nil || offset < 0 || offset > 100000 {
		return 0
	}
	return offset
}

func (m *Module) myParticipation(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	type item struct {
		EventID  string    `json:"event_id"`
		Title    string    `json:"title"`
		StartsAt time.Time `json:"starts_at"`
		Status   string    `json:"status"`
		Points   int       `json:"points"`
	}
	offset := pageOffset(r)
	rows, err := m.db.Query(r.Context(), `SELECT e.id::text,e.title,e.starts_at,a.status,a.points_awarded
		FROM events_attendance a JOIN events_events e ON e.id=a.event_id AND e.tenant_id=a.tenant_id
		WHERE a.tenant_id=$1 AND a.user_id=$2 ORDER BY e.starts_at DESC,e.id LIMIT 51 OFFSET $3`, claims.WorkspaceID, claims.UserID, offset)
	if err != nil {
		nexus.Error(w, 500, "could not load participation")
		return
	}
	defer rows.Close()
	items := make([]item, 0, 51)
	for rows.Next() {
		var one item
		if err := rows.Scan(&one.EventID, &one.Title, &one.StartsAt, &one.Status, &one.Points); err != nil {
			nexus.Error(w, 500, "could not load participation")
			return
		}
		items = append(items, one)
	}
	if rows.Err() != nil {
		nexus.Error(w, 500, "could not load participation")
		return
	}
	more := len(items) > 50
	if more {
		items = items[:50]
	}
	nexus.JSON(w, 200, map[string]any{"items": items, "has_more": more, "next_offset": offset + len(items)})
}

func (m *Module) myPoints(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	type entry struct {
		ID        string    `json:"id"`
		EventID   string    `json:"event_id"`
		Title     string    `json:"title"`
		Delta     int       `json:"delta"`
		Reason    string    `json:"reason"`
		CreatedAt time.Time `json:"created_at"`
	}
	var total int64
	if err := m.db.QueryRow(r.Context(), `SELECT COALESCE(sum(delta),0) FROM events_point_entries WHERE tenant_id=$1 AND user_id=$2`, claims.WorkspaceID, claims.UserID).Scan(&total); err != nil {
		nexus.Error(w, 500, "could not load points")
		return
	}
	offset := pageOffset(r)
	// A sanction (00007) belongs to no event.
	rows, err := m.db.Query(r.Context(), `SELECT p.id::text,COALESCE(p.event_id::text,''),COALESCE(e.title,'Хяналтын хорооны шийдвэр'),p.delta,p.reason,p.created_at
		FROM events_point_entries p LEFT JOIN events_events e ON e.id=p.event_id AND e.tenant_id=p.tenant_id
		WHERE p.tenant_id=$1 AND p.user_id=$2 ORDER BY p.created_at DESC,p.id LIMIT 51 OFFSET $3`, claims.WorkspaceID, claims.UserID, offset)
	if err != nil {
		nexus.Error(w, 500, "could not load points")
		return
	}
	defer rows.Close()
	entries := make([]entry, 0, 51)
	for rows.Next() {
		var one entry
		if err := rows.Scan(&one.ID, &one.EventID, &one.Title, &one.Delta, &one.Reason, &one.CreatedAt); err != nil {
			nexus.Error(w, 500, "could not load points")
			return
		}
		entries = append(entries, one)
	}
	if rows.Err() != nil {
		nexus.Error(w, 500, "could not load points")
		return
	}
	more := len(entries) > 50
	if more {
		entries = entries[:50]
	}
	nexus.JSON(w, 200, map[string]any{"total": total, "entries": entries, "has_more": more, "next_offset": offset + len(entries)})
}

func (m *Module) summary(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	period := r.URL.Query().Get("period")
	var start, end any
	if period != "" {
		zone := time.FixedZone("Asia/Ulaanbaatar", 8*60*60)
		month, err := time.ParseInLocation("2006-01", period, zone)
		if err != nil || month.Year() < 2000 || month.Year() > 2100 {
			nexus.Error(w, 400, "period must be YYYY-MM")
			return
		}
		start, end = month, month.AddDate(0, 1, 0)
	}
	var events, registrations, attended, members, points int64
	err := m.db.QueryRow(r.Context(), `WITH selected AS (
		SELECT id FROM events_events WHERE tenant_id=$1 AND ($2::timestamptz IS NULL OR starts_at >= $2) AND ($3::timestamptz IS NULL OR starts_at < $3)
	), attendance AS (SELECT a.* FROM events_attendance a JOIN selected e ON e.id=a.event_id WHERE a.tenant_id=$1)
	SELECT (SELECT count(*) FROM selected), (SELECT count(*) FROM attendance),
		(SELECT count(*) FROM attendance WHERE status='attended'),
		(SELECT count(DISTINCT user_id) FROM attendance WHERE status='attended'),
		(SELECT COALESCE(sum(p.delta),0) FROM events_point_entries p JOIN selected e ON e.id=p.event_id WHERE p.tenant_id=$1)`, claims.WorkspaceID, start, end).Scan(&events, &registrations, &attended, &members, &points)
	if err != nil {
		nexus.Error(w, 500, "could not load the participation summary")
		return
	}
	nexus.JSON(w, 200, map[string]any{"events": events, "registrations": registrations, "attended": attended, "active_members": members, "points": points})
}
