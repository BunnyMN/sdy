// Package member serves the caller's union record and in-app inbox.
package member

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/gerege-systems/open-gerege-nexus/backend/internal/kernel/httpx"
	"github.com/gerege-systems/open-gerege-nexus/backend/pkg/nexus"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handlers struct{ db *pgxpool.Pool }

func New(db *pgxpool.Pool) *Handlers { return &Handlers{db: db} }

func (h *Handlers) Routes(r chi.Router) {
	r.Get("/member-record", h.record)
	r.Put("/member-record", h.save)
	r.Get("/notifications", h.notifications)
	r.Post("/notifications/read-all", h.readAll)
	r.Post("/notifications/{id}/read", h.read)
}

type Profile struct {
	Phone                string `json:"phone"`
	Residence            string `json:"residence"`
	NotificationsEnabled bool   `json:"notifications_enabled"`
}

func caller(w http.ResponseWriter, r *http.Request) (string, bool) {
	c, err := nexus.UserFromContext(r.Context())
	if err != nil || c.UserID == "" {
		httpx.Error(w, 401, "unauthorized")
		return "", false
	}
	w.Header().Set("Cache-Control", "no-store")
	return c.UserID, true
}

func page(r *http.Request) int {
	n, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if n < 0 || n > 100000 {
		return 0
	}
	return n
}

func (h *Handlers) record(w http.ResponseWriter, r *http.Request) {
	user, ok := caller(w, r)
	if !ok {
		return
	}
	var record map[string]json.RawMessage
	var raw []byte
	if err := h.db.QueryRow(r.Context(), `SELECT registry.my_member_record()`).Scan(&raw); err != nil {
		httpx.Error(w, 500, "could not load membership record")
		return
	}
	if err := json.Unmarshal(raw, &record); err != nil {
		httpx.Error(w, 500, "could not load membership record")
		return
	}
	profile := Profile{NotificationsEnabled: true}
	err := h.db.QueryRow(r.Context(), `SELECT phone,residence,notifications_enabled FROM registry.member_profiles WHERE user_id=$1`, user).
		Scan(&profile.Phone, &profile.Residence, &profile.NotificationsEnabled)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		httpx.Error(w, 500, "could not load member profile")
		return
	}
	offset := page(r)
	rows, err := h.db.Query(r.Context(), `SELECT jsonb_build_object('id',h.id,'tenant_id',h.tenant_id,'branch',t.name,
		'from_status',h.from_status,'status',h.to_status,'is_primary',h.is_primary,'member_since',h.member_since,
		'reason',h.reason,'created_at',h.created_at) FROM workspace.membership_history h
		JOIN registry.tenants t ON t.id=h.tenant_id WHERE h.user_id=$1 ORDER BY h.created_at DESC,h.id DESC LIMIT 51 OFFSET $2`, user, offset)
	if err != nil {
		httpx.Error(w, 500, "could not load membership history")
		return
	}
	defer rows.Close()
	history := make([]json.RawMessage, 0)
	for rows.Next() {
		var entry json.RawMessage
		if err := rows.Scan(&entry); err != nil {
			httpx.Error(w, 500, "could not load membership history")
			return
		}
		history = append(history, entry)
	}
	if rows.Err() != nil {
		httpx.Error(w, 500, "could not load membership history")
		return
	}
	more := len(history) > 50
	if more {
		history = history[:50]
	}
	httpx.JSON(w, 200, map[string]any{"memberships": record["memberships"], "profile": profile, "history": history, "has_more": more, "next_offset": offset + len(history)})
}

func (h *Handlers) save(w http.ResponseWriter, r *http.Request) {
	user, ok := caller(w, r)
	if !ok {
		return
	}
	var input Profile
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		httpx.Error(w, 400, "invalid member profile")
		return
	}
	input.Phone, input.Residence = strings.TrimSpace(input.Phone), strings.TrimSpace(input.Residence)
	validPhone := len([]rune(input.Phone)) <= 32
	for _, c := range input.Phone {
		if !unicode.IsDigit(c) && !strings.ContainsRune(" +-()", c) {
			validPhone = false
		}
	}
	if !validPhone || len([]rune(input.Residence)) > 200 {
		httpx.Error(w, 400, "invalid phone or residence")
		return
	}
	_, err := h.db.Exec(r.Context(), `INSERT INTO registry.member_profiles(user_id,phone,residence,notifications_enabled)
		VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET phone=EXCLUDED.phone,residence=EXCLUDED.residence,
		notifications_enabled=EXCLUDED.notifications_enabled,updated_at=now()`, user, input.Phone, input.Residence, input.NotificationsEnabled)
	if err != nil {
		httpx.Error(w, 500, "could not save member profile")
		return
	}
	httpx.JSON(w, 200, input)
}

type Notification struct {
	ID        string     `json:"id"`
	Kind      string     `json:"kind"`
	Title     string     `json:"title"`
	Body      string     `json:"body"`
	Path      string     `json:"path"`
	CreatedAt time.Time  `json:"created_at"`
	ReadAt    *time.Time `json:"read_at"`
}

func (h *Handlers) notifications(w http.ResponseWriter, r *http.Request) {
	user, ok := caller(w, r)
	if !ok {
		return
	}
	offset := page(r)
	rows, err := h.db.Query(r.Context(), `SELECT id::text,kind,title,body,path,created_at,read_at
		FROM registry.member_notifications WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET $2`, user, offset)
	if err != nil {
		httpx.Error(w, 500, "could not load notifications")
		return
	}
	defer rows.Close()
	items := make([]Notification, 0)
	for rows.Next() {
		var n Notification
		if err := rows.Scan(&n.ID, &n.Kind, &n.Title, &n.Body, &n.Path, &n.CreatedAt, &n.ReadAt); err != nil {
			httpx.Error(w, 500, "could not load notifications")
			return
		}
		items = append(items, n)
	}
	if rows.Err() != nil {
		httpx.Error(w, 500, "could not load notifications")
		return
	}
	rows.Close()
	var unread int
	if err := h.db.QueryRow(r.Context(), `SELECT count(*) FROM registry.member_notifications WHERE user_id=$1 AND read_at IS NULL`, user).Scan(&unread); err != nil {
		httpx.Error(w, 500, "could not load unread count")
		return
	}
	more := len(items) > 50
	if more {
		items = items[:50]
	}
	httpx.JSON(w, 200, map[string]any{"items": items, "unread": unread, "has_more": more, "next_offset": offset + len(items)})
}

func (h *Handlers) read(w http.ResponseWriter, r *http.Request) {
	user, ok := caller(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if _, err := uuid.Parse(id); err != nil {
		httpx.Error(w, 400, "invalid notification")
		return
	}
	tag, err := h.db.Exec(r.Context(), `UPDATE registry.member_notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2`, id, user)
	if err != nil {
		httpx.Error(w, 500, "could not mark notification read")
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, 404, "notification not found")
		return
	}
	httpx.JSON(w, 200, map[string]bool{"ok": true})
}

func (h *Handlers) readAll(w http.ResponseWriter, r *http.Request) {
	user, ok := caller(w, r)
	if !ok {
		return
	}
	if _, err := h.db.Exec(r.Context(), `UPDATE registry.member_notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL`, user); err != nil {
		httpx.Error(w, 500, "could not mark notifications read")
		return
	}
	httpx.JSON(w, 200, map[string]bool{"ok": true})
}
