package access

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gerege-systems/open-gerege-nexus/backend/internal/kernel/httpx"
	"github.com/gerege-systems/open-gerege-nexus/backend/internal/workspace/auth"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
)

func (h *Handlers) HandleMembers(w http.ResponseWriter, r *http.Request) {
	c, err := auth.UserFromContext(r.Context())
	if err != nil {
		httpx.Error(w, 401, "unauthorized")
		return
	}
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if offset < 0 || offset > 100000 {
		offset = 0
	}
	search := strings.TrimSpace(r.URL.Query().Get("q"))
	if len([]rune(search)) > 100 {
		httpx.Error(w, 400, "search is too long")
		return
	}
	rows, err := h.db.Query(r.Context(), `SELECT jsonb_build_object('user_id',m.user_id,'name',u.name,'email',u.email,
		'is_primary',m.is_primary,'status',m.member_status,'member_since',m.member_since,'has_access',m.active,
		'roles',COALESCE((SELECT jsonb_agg(r.code ORDER BY r.code) FROM workspace.membership_roles mr
		JOIN workspace.roles r ON r.id=mr.role_id AND r.tenant_id=m.tenant_id AND r.active WHERE mr.membership_id=m.id),'[]'::jsonb))
		FROM workspace.memberships m JOIN registry.users u ON u.id=m.user_id
		WHERE m.tenant_id=$1 AND ($2='' OR position(lower($2) in lower(u.name||' '||u.email))>0)
		ORDER BY u.name,m.user_id LIMIT 51 OFFSET $3`, c.WorkspaceID, search, offset)
	if err != nil {
		httpx.Error(w, 500, "could not load members")
		return
	}
	defer rows.Close()
	members := make([]json.RawMessage, 0)
	for rows.Next() {
		var raw json.RawMessage
		if err := rows.Scan(&raw); err != nil {
			httpx.Error(w, 500, "could not load members")
			return
		}
		members = append(members, raw)
	}
	if rows.Err() != nil {
		httpx.Error(w, 500, "could not load members")
		return
	}
	more := len(members) > 50
	if more {
		members = members[:50]
	}
	httpx.JSON(w, 200, map[string]any{"members": members, "has_more": more, "next_offset": offset + len(members)})
}

func (h *Handlers) HandleMemberStatus(w http.ResponseWriter, r *http.Request) {
	c, err := auth.UserFromContext(r.Context())
	if err != nil {
		httpx.Error(w, 401, "unauthorized")
		return
	}
	user := chi.URLParam(r, "userID")
	if _, err := uuid.Parse(user); err != nil {
		httpx.Error(w, 400, "invalid member")
		return
	}
	var input struct {
		Status string `json:"status"`
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&input); err != nil {
		httpx.Error(w, 400, "invalid membership status")
		return
	}
	_, err = h.db.Exec(r.Context(), `SELECT registry.set_member_status($1,$2,$3,$4)`, c.WorkspaceID, user, input.Status, input.Reason)
	if err != nil {
		var pg *pgconn.PgError
		if errors.As(err, &pg) {
			codes := map[string]int{"22023": 400, "42501": 403, "P0002": 404, "55000": 409, "23505": 409}
			if status, ok := codes[pg.Code]; ok {
				httpx.Error(w, status, pg.Message)
				return
			}
		}
		httpx.Error(w, 500, "could not change membership status")
		return
	}
	h.forgetGrants(c.WorkspaceID)
	httpx.JSON(w, 200, map[string]bool{"ok": true})
}

func (h *Handlers) HandleMemberSummary(w http.ResponseWriter, r *http.Request) {
	c, err := auth.UserFromContext(r.Context())
	if err != nil {
		httpx.Error(w, 401, "unauthorized")
		return
	}
	var summary json.RawMessage
	err = h.db.QueryRow(r.Context(), `SELECT jsonb_build_object(
		'active_members',count(*) FILTER(WHERE is_primary AND member_status='active' AND active),
		'suspended_members',count(*) FILTER(WHERE member_status='suspended'),
		'expired_members',count(*) FILTER(WHERE member_status='expired'),
		'former_members',count(*) FILTER(WHERE member_status IN ('left','alumni')),
		'access_without_membership',count(*) FILTER(WHERE active AND NOT is_primary),
		'pending_applications',(SELECT count(*) FROM workspace.join_requests WHERE tenant_id=$1 AND status='PENDING'),
		'pending_transfers',CASE WHEN registry.is_transfer_admin($1) THEN
			(SELECT count(*) FROM workspace.membership_transfers WHERE tenant_id=$1 AND status='PENDING') ELSE NULL END)
		FROM workspace.memberships WHERE tenant_id=$1`, c.WorkspaceID).Scan(&summary)
	if err != nil {
		httpx.Error(w, 500, "could not load membership summary")
		return
	}
	httpx.JSON(w, 200, summary)
}
