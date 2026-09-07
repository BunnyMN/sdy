/*
 * Социал Демократ Монголын Залуучуудын Холбоо — дотоод систем
 * Distributed under the Apache 2.0 License.
 *
 * Package events is the union's events and attendance app (mn.sdy.events):
 * an organisation — the union itself or a provincial branch — announces an
 * event, members register for it, and whoever runs it marks who came.
 *
 * It is the first module this distribution carries, and it is written the way
 * docs/MODULES.md says a module is: it registers itself with nexus, brings its
 * own schema, and asks the platform for the two things it needs — the
 * tenant-bound database and the permission store. Nothing in here imports
 * internal/, so the same code would compile in a separate repository the day
 * that becomes the right place for it.
 *
 * Permissions are checked per route rather than by the platform's prefix rule
 * (RoutePermissionPrefix is blank), because the rule is finer than a verb: a
 * member REGISTERS for an event with the read permission — that is their own
 * row — while creating the event or marking attendance is the organiser's.
 */

package events

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"io/fs"
	"net/http"
	"strings"
	"time"

	"github.com/gerege-systems/open-gerege-nexus/backend/pkg/nexus"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

//go:embed migrations/*.sql
var schema embed.FS

const ID = "mn.sdy.events"

const (
	PermRead   = "events.read"
	PermManage = "events.manage"
)

// Module is the app.
type Module struct {
	db          nexus.DB
	permissions nexus.PermissionStore
}

// New constructs and registers the module. Called once, from apps.Bootstrap.
func New(p nexus.Platform) *Module {
	m := &Module{db: p.DB(), permissions: p.Permissions()}
	nexus.Register(m)
	migrations, err := fs.Sub(schema, "migrations")
	if err != nil {
		panic("events: embedded migrations: " + err.Error())
	}
	nexus.Migrations(m.ID(), migrations)
	return m
}

func (m *Module) ID() string      { return ID }
func (m *Module) Name() string    { return "Events" }
func (m *Module) Version() string { return "1.0.0" }

func (m *Module) Dependencies() []nexus.Dependency { return nil }

func (m *Module) Permissions() []nexus.PermissionDefinition {
	return []nexus.PermissionDefinition{
		{
			Code: PermRead, Name: "See events",
			Description:  "See the organisation's events, register for one and see who is coming",
			DefaultRoles: []string{nexus.DefaultRoleManager, nexus.DefaultRoleUser},
		},
		{
			Code: PermManage, Name: "Run events",
			Description:  "Create and edit events, add participants and mark attendance",
			DefaultRoles: []string{nexus.DefaultRoleManager},
		},
	}
}

func (m *Module) Menus() []nexus.MenuDefinition {
	return []nexus.MenuDefinition{{
		ID: "events", Label: "Events", Path: "/module/events", Icon: "calendar-days", Order: 10,
		Labels: map[string]string{
			"mn": "Арга хэмжээ", "ar": "الفعاليات", "zh": "活动", "fr": "Événements", "ru": "Мероприятия", "es": "Eventos",
		},
	}}
}

// MenuPermission gates the menu entry; RoutePermissionPrefix is deliberately
// blank — see the package comment — and every route below names its own.
func (m *Module) MenuPermission() string        { return PermRead }
func (m *Module) RoutePermissionPrefix() string { return "" }

func (m *Module) RegisterRoutes(r chi.Router, gate func(http.Handler) http.Handler) {
	read := nexus.RequirePermission(m.permissions, PermRead)
	manage := nexus.RequirePermission(m.permissions, PermManage)
	r.Route("/api/v1/events", func(er chi.Router) {
		er.Use(gate)
		er.With(read).Get("/", m.list)
		er.With(manage).Post("/", m.create)
		er.With(manage).Get("/members", m.members)
		er.Route("/{id}", func(one chi.Router) {
			one.With(read).Get("/", m.get)
			one.With(manage).Put("/", m.update)
			one.With(read).Post("/register", m.register)
			one.With(read).Delete("/register", m.withdraw)
			one.With(read).Get("/attendance", m.attendance)
			one.With(manage).Post("/attendance", m.addParticipant)
			one.With(manage).Put("/attendance/{userID}", m.mark)
		})
	})
}

// ─── Shapes ──────────────────────────────────────────────────────────────────

type Event struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Location    string  `json:"location"`
	StartsAt    string  `json:"starts_at"`
	EndsAt      *string `json:"ends_at"`
	Capacity    *int    `json:"capacity"`
	Status      string  `json:"status"`
	CreatedBy   string  `json:"created_by"`
	CreatedAt   string  `json:"created_at"`
	// Counts, so the list can say "12 бүртгүүлсэн · 9 ирсэн" without a
	// second request per row.
	Registered int `json:"registered"`
	Attended   int `json:"attended"`
	// MyStatus is the caller's own row, or "" when they have none.
	MyStatus string `json:"my_status"`
}

type Participant struct {
	UserID       string  `json:"user_id"`
	Name         string  `json:"name"`
	Email        string  `json:"email"`
	Status       string  `json:"status"`
	Note         string  `json:"note"`
	RegisteredAt string  `json:"registered_at"`
	CheckedAt    *string `json:"checked_at"`
}

type eventInput struct {
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Location    string  `json:"location"`
	StartsAt    string  `json:"starts_at"`
	EndsAt      *string `json:"ends_at"`
	Capacity    *int    `json:"capacity"`
	Status      string  `json:"status"`
}

func (in *eventInput) validate() (start time.Time, end *time.Time, err error) {
	in.Title = strings.TrimSpace(in.Title)
	if in.Title == "" {
		return start, nil, errors.New("title is required")
	}
	if len([]rune(in.Title)) > 200 {
		return start, nil, errors.New("title is too long")
	}
	start, err = time.Parse(time.RFC3339, strings.TrimSpace(in.StartsAt))
	if err != nil {
		return start, nil, errors.New("starts_at must be an RFC 3339 timestamp")
	}
	if in.EndsAt != nil && strings.TrimSpace(*in.EndsAt) != "" {
		t, err := time.Parse(time.RFC3339, strings.TrimSpace(*in.EndsAt))
		if err != nil {
			return start, nil, errors.New("ends_at must be an RFC 3339 timestamp")
		}
		if t.Before(start) {
			return start, nil, errors.New("ends_at is before starts_at")
		}
		end = &t
	}
	if in.Capacity != nil && *in.Capacity <= 0 {
		return start, nil, errors.New("capacity must be a positive number")
	}
	switch in.Status {
	case "", "planned", "done", "cancelled":
	default:
		return start, nil, errors.New("status must be planned, done or cancelled")
	}
	return start, end, nil
}

func decode(r *http.Request, into any) error {
	return json.NewDecoder(http.MaxBytesReader(nil, r.Body, 64<<10)).Decode(into)
}

func stamp(t time.Time) string { return t.UTC().Format(time.RFC3339) }

func stampPtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := stamp(*t)
	return &s
}

// ─── Queries ─────────────────────────────────────────────────────────────────

// The one SELECT every reader of an event uses. tenant_id in the WHERE clause
// is the primary control; the policy underneath is the second.
const eventColumns = `
	SELECT e.id::text, e.title, e.description, e.location, e.starts_at, e.ends_at, e.capacity,
	       e.status, e.created_by::text, e.created_at,
	       (SELECT count(*) FROM events_attendance a WHERE a.event_id = e.id AND a.status <> 'absent')::int,
	       (SELECT count(*) FROM events_attendance a WHERE a.event_id = e.id AND a.status = 'attended')::int,
	       COALESCE((SELECT a.status FROM events_attendance a WHERE a.event_id = e.id AND a.user_id = $2::uuid), '')
	  FROM events_events e
	 WHERE e.tenant_id = $1::uuid`

func scanEvent(row pgx.Row) (Event, error) {
	var e Event
	var starts, created time.Time
	var ends *time.Time
	if err := row.Scan(&e.ID, &e.Title, &e.Description, &e.Location, &starts, &ends, &e.Capacity,
		&e.Status, &e.CreatedBy, &created, &e.Registered, &e.Attended, &e.MyStatus); err != nil {
		return e, err
	}
	e.StartsAt, e.EndsAt, e.CreatedAt = stamp(starts), stampPtr(ends), stamp(created)
	return e, nil
}

func (m *Module) loadEvent(ctx context.Context, tenantID, userID, id string) (Event, error) {
	return scanEvent(m.db.QueryRow(ctx, eventColumns+` AND e.id = $3::uuid`, tenantID, userID, id))
}

// ─── Handlers ────────────────────────────────────────────────────────────────

func who(w http.ResponseWriter, r *http.Request) (nexus.UserClaims, bool) {
	claims, err := nexus.UserFromContext(r.Context())
	if err != nil || claims.WorkspaceID == "" {
		nexus.Error(w, http.StatusUnauthorized, "unauthorized")
		return claims, false
	}
	return claims, true
}

// list answers the organisation's events. `status=planned|done|cancelled`
// narrows it; the default is everything, upcoming first.
func (m *Module) list(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	status := r.URL.Query().Get("status")
	sql := eventColumns
	args := []any{claims.WorkspaceID, claims.UserID}
	switch status {
	case "planned", "done", "cancelled":
		sql += ` AND e.status = $3`
		args = append(args, status)
	case "":
	default:
		nexus.Error(w, http.StatusBadRequest, "status must be planned, done or cancelled")
		return
	}
	// Coming ones first, nearest at the top; then the past, most recent first.
	sql += ` ORDER BY (e.starts_at >= NOW()) DESC,
	                  CASE WHEN e.starts_at >= NOW() THEN e.starts_at END ASC,
	                  e.starts_at DESC
	          LIMIT 500`
	rows, err := m.db.Query(r.Context(), sql, args...)
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not list events")
		return
	}
	defer rows.Close()
	events := make([]Event, 0, 16)
	for rows.Next() {
		e, err := scanEvent(rows)
		if err != nil {
			nexus.Error(w, http.StatusInternalServerError, "could not read an event")
			return
		}
		events = append(events, e)
	}
	nexus.JSON(w, http.StatusOK, map[string]any{"events": events})
}

func (m *Module) get(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	e, err := m.loadEvent(r.Context(), claims.WorkspaceID, claims.UserID, chi.URLParam(r, "id"))
	if errors.Is(err, pgx.ErrNoRows) {
		nexus.Error(w, http.StatusNotFound, "no such event")
		return
	}
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not read the event")
		return
	}
	nexus.JSON(w, http.StatusOK, e)
}

func (m *Module) create(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	var in eventInput
	if err := decode(r, &in); err != nil {
		nexus.Error(w, http.StatusBadRequest, "the request could not be read")
		return
	}
	start, end, err := in.validate()
	if err != nil {
		nexus.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if in.Status == "" {
		in.Status = "planned"
	}
	var id string
	if err := m.db.QueryRow(r.Context(), `
		INSERT INTO events_events (tenant_id, title, description, location, starts_at, ends_at, capacity, status, created_by)
		VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::uuid)
		RETURNING id::text`,
		claims.WorkspaceID, in.Title, strings.TrimSpace(in.Description), strings.TrimSpace(in.Location),
		start, end, in.Capacity, in.Status, claims.UserID).Scan(&id); err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not create the event")
		return
	}
	nexus.Audit(r.Context(), claims.WorkspaceID, claims.UserID, "events.create", id,
		map[string]any{"title": in.Title, "starts_at": stamp(start)})
	e, err := m.loadEvent(r.Context(), claims.WorkspaceID, claims.UserID, id)
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not read the event back")
		return
	}
	nexus.JSON(w, http.StatusCreated, e)
}

func (m *Module) update(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	var in eventInput
	if err := decode(r, &in); err != nil {
		nexus.Error(w, http.StatusBadRequest, "the request could not be read")
		return
	}
	start, end, err := in.validate()
	if err != nil {
		nexus.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if in.Status == "" {
		in.Status = "planned"
	}
	tag, err := m.db.Exec(r.Context(), `
		UPDATE events_events
		   SET title = $3, description = $4, location = $5, starts_at = $6, ends_at = $7,
		       capacity = $8, status = $9, updated_at = NOW()
		 WHERE tenant_id = $1::uuid AND id = $2::uuid`,
		claims.WorkspaceID, id, in.Title, strings.TrimSpace(in.Description), strings.TrimSpace(in.Location),
		start, end, in.Capacity, in.Status)
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not update the event")
		return
	}
	if tag.RowsAffected() == 0 {
		nexus.Error(w, http.StatusNotFound, "no such event")
		return
	}
	nexus.Audit(r.Context(), claims.WorkspaceID, claims.UserID, "events.update", id,
		map[string]any{"title": in.Title, "status": in.Status})
	e, err := m.loadEvent(r.Context(), claims.WorkspaceID, claims.UserID, id)
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not read the event back")
		return
	}
	nexus.JSON(w, http.StatusOK, e)
}

// register is a member putting their own name down. Refused for an event that
// is over or cancelled, and for a full one — capacity counts everybody who is
// not marked absent.
func (m *Module) register(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	e, err := m.loadEvent(r.Context(), claims.WorkspaceID, claims.UserID, id)
	if errors.Is(err, pgx.ErrNoRows) {
		nexus.Error(w, http.StatusNotFound, "no such event")
		return
	}
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not read the event")
		return
	}
	if e.Status != "planned" {
		nexus.Error(w, http.StatusConflict, "this event is not taking registrations")
		return
	}
	if e.MyStatus != "" {
		nexus.JSON(w, http.StatusOK, map[string]any{"status": e.MyStatus, "changed": false})
		return
	}
	if e.Capacity != nil && e.Registered >= *e.Capacity {
		nexus.Error(w, http.StatusConflict, "this event is full")
		return
	}
	if _, err := m.db.Exec(r.Context(), `
		INSERT INTO events_attendance (tenant_id, event_id, user_id)
		VALUES ($1::uuid, $2::uuid, $3::uuid)
		ON CONFLICT (event_id, user_id) DO NOTHING`,
		claims.WorkspaceID, id, claims.UserID); err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not register")
		return
	}
	nexus.Audit(r.Context(), claims.WorkspaceID, claims.UserID, "events.register", id, nil)
	nexus.JSON(w, http.StatusOK, map[string]any{"status": "registered", "changed": true})
}

// withdraw takes the member's own name off again — only while it is still a
// registration. A row somebody marked attended or absent is the organiser's
// record of what happened, not the member's to erase.
func (m *Module) withdraw(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	tag, err := m.db.Exec(r.Context(), `
		DELETE FROM events_attendance
		 WHERE tenant_id = $1::uuid AND event_id = $2::uuid AND user_id = $3::uuid AND status = 'registered'`,
		claims.WorkspaceID, id, claims.UserID)
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not withdraw")
		return
	}
	if tag.RowsAffected() > 0 {
		nexus.Audit(r.Context(), claims.WorkspaceID, claims.UserID, "events.withdraw", id, nil)
	}
	nexus.JSON(w, http.StatusOK, map[string]any{"status": "", "changed": tag.RowsAffected() > 0})
}

// attendance lists who registered and who came. registry.users is under
// person isolation, which admits colleagues — and everybody on this list is a
// member of the organisation, so every name resolves.
func (m *Module) attendance(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	var exists bool
	if err := m.db.QueryRow(r.Context(),
		`SELECT EXISTS (SELECT 1 FROM events_events WHERE tenant_id = $1::uuid AND id = $2::uuid)`,
		claims.WorkspaceID, id).Scan(&exists); err != nil || !exists {
		nexus.Error(w, http.StatusNotFound, "no such event")
		return
	}
	rows, err := m.db.Query(r.Context(), `
		SELECT a.user_id::text, COALESCE(u.name, ''), COALESCE(u.email, ''), a.status, a.note, a.registered_at, a.checked_at
		  FROM events_attendance a
		  LEFT JOIN registry.users u ON u.id = a.user_id
		 WHERE a.tenant_id = $1::uuid AND a.event_id = $2::uuid
		 ORDER BY CASE a.status WHEN 'attended' THEN 0 WHEN 'registered' THEN 1 ELSE 2 END, u.name, a.registered_at`,
		claims.WorkspaceID, id)
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not list the participants")
		return
	}
	defer rows.Close()
	people := make([]Participant, 0, 32)
	for rows.Next() {
		var p Participant
		var registered time.Time
		var checked *time.Time
		if err := rows.Scan(&p.UserID, &p.Name, &p.Email, &p.Status, &p.Note, &registered, &checked); err != nil {
			nexus.Error(w, http.StatusInternalServerError, "could not read a participant")
			return
		}
		p.RegisteredAt, p.CheckedAt = stamp(registered), stampPtr(checked)
		people = append(people, p)
	}
	nexus.JSON(w, http.StatusOK, map[string]any{"participants": people})
}

// addParticipant is the organiser putting a member's name down for them —
// somebody who signed the paper list at the door, say.
func (m *Module) addParticipant(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	var in struct {
		UserID string `json:"user_id"`
		Status string `json:"status"`
	}
	if err := decode(r, &in); err != nil || strings.TrimSpace(in.UserID) == "" {
		nexus.Error(w, http.StatusBadRequest, "user_id is required")
		return
	}
	if in.Status == "" {
		in.Status = "registered"
	}
	if !validAttendance(in.Status) {
		nexus.Error(w, http.StatusBadRequest, "status must be registered, attended or absent")
		return
	}
	if !m.isMember(r.Context(), claims.WorkspaceID, in.UserID) {
		nexus.Error(w, http.StatusBadRequest, "that person is not a member of this organisation")
		return
	}
	var checked *time.Time
	var checkedBy *string
	if in.Status != "registered" {
		now := time.Now()
		checked, checkedBy = &now, &claims.UserID
	}
	tag, err := m.db.Exec(r.Context(), `
		INSERT INTO events_attendance (tenant_id, event_id, user_id, status, checked_at, checked_by)
		SELECT $1::uuid, $2::uuid, $3::uuid, $4, $5, $6::uuid
		 WHERE EXISTS (SELECT 1 FROM events_events WHERE tenant_id = $1::uuid AND id = $2::uuid)
		ON CONFLICT (event_id, user_id) DO UPDATE
		   SET status = EXCLUDED.status, checked_at = EXCLUDED.checked_at, checked_by = EXCLUDED.checked_by`,
		claims.WorkspaceID, id, in.UserID, in.Status, checked, checkedBy)
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not add the participant")
		return
	}
	if tag.RowsAffected() == 0 {
		nexus.Error(w, http.StatusNotFound, "no such event")
		return
	}
	nexus.Audit(r.Context(), claims.WorkspaceID, claims.UserID, "events.attendance.add", id,
		map[string]any{"user_id": in.UserID, "status": in.Status})
	nexus.JSON(w, http.StatusOK, map[string]any{"status": in.Status})
}

// mark records what happened to one participant: came, did not, or back to
// merely registered (a mistake undone).
func (m *Module) mark(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	id, userID := chi.URLParam(r, "id"), chi.URLParam(r, "userID")
	var in struct {
		Status string `json:"status"`
		Note   string `json:"note"`
	}
	if err := decode(r, &in); err != nil || !validAttendance(in.Status) {
		nexus.Error(w, http.StatusBadRequest, "status must be registered, attended or absent")
		return
	}
	if len([]rune(in.Note)) > 500 {
		nexus.Error(w, http.StatusBadRequest, "note is too long")
		return
	}
	var checked *time.Time
	var checkedBy *string
	if in.Status != "registered" {
		now := time.Now()
		checked, checkedBy = &now, &claims.UserID
	}
	tag, err := m.db.Exec(r.Context(), `
		UPDATE events_attendance
		   SET status = $4, note = $5, checked_at = $6, checked_by = $7::uuid
		 WHERE tenant_id = $1::uuid AND event_id = $2::uuid AND user_id = $3::uuid`,
		claims.WorkspaceID, id, userID, in.Status, strings.TrimSpace(in.Note), checked, checkedBy)
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not record attendance")
		return
	}
	if tag.RowsAffected() == 0 {
		nexus.Error(w, http.StatusNotFound, "that person is not on this event's list")
		return
	}
	nexus.Audit(r.Context(), claims.WorkspaceID, claims.UserID, "events.attendance.mark", id,
		map[string]any{"user_id": userID, "status": in.Status})
	nexus.JSON(w, http.StatusOK, map[string]any{"status": in.Status})
}

// members lists the organisation's people, for the organiser picking a name.
// Through the platform's directory rail rather than a query of its own, so the
// answer is the same one Access control gives.
func (m *Module) members(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	directory, err := nexus.People()
	if err != nil {
		nexus.Error(w, http.StatusServiceUnavailable, "the directory is not available")
		return
	}
	people, err := directory.People(r.Context(), []string{claims.WorkspaceID})
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not list the members")
		return
	}
	out := make([]map[string]any, 0, len(people))
	for _, p := range people {
		if !p.Active {
			continue
		}
		out = append(out, map[string]any{"user_id": p.UserID, "name": p.Name, "email": p.Email})
	}
	nexus.JSON(w, http.StatusOK, map[string]any{"members": out})
}

func (m *Module) isMember(ctx context.Context, tenantID, userID string) bool {
	var ok bool
	err := m.db.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM workspace.memberships WHERE tenant_id = $1::uuid AND user_id = $2::uuid)`,
		tenantID, userID).Scan(&ok)
	return err == nil && ok
}

func validAttendance(status string) bool {
	switch status {
	case "registered", "attended", "absent":
		return true
	}
	return false
}
