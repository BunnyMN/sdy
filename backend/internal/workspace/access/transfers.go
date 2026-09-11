package access

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gerege-systems/open-gerege-nexus/backend/internal/kernel/httpx"
	"github.com/gerege-systems/open-gerege-nexus/backend/internal/workspace/auth"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
)

func (h *Handlers) HandleTransferRequests(w http.ResponseWriter, r *http.Request) {
	claims, err := auth.UserFromContext(r.Context())
	if err != nil || !claims.IsAdmin {
		httpx.Error(w, 403, "transfer_admin_required")
		return
	}
	rows, err := h.db.Query(r.Context(), `SELECT jsonb_build_object(
 'id',r.id,'user_id',r.user_id,'name',r.requester_name,'email',r.requester_email,
 'from_tenant_id',r.from_tenant_id,'from_name',src.name,'tenant_id',r.tenant_id,'to_name',dest.name,
 'message',r.message,'status',r.status,'created_at',r.created_at)
 FROM workspace.membership_transfers r JOIN registry.tenants src ON src.id=r.from_tenant_id
 JOIN registry.tenants dest ON dest.id=r.tenant_id
 WHERE r.tenant_id=$1 AND r.status='PENDING' ORDER BY r.created_at,r.id`, claims.WorkspaceID)
	if err != nil {
		httpx.Error(w, 500, "could not load transfers")
		return
	}
	defer rows.Close()
	requests := make([]json.RawMessage, 0)
	for rows.Next() {
		var entry json.RawMessage
		if err := rows.Scan(&entry); err != nil {
			httpx.Error(w, 500, "could not load transfers")
			return
		}
		requests = append(requests, entry)
	}
	if rows.Err() != nil {
		httpx.Error(w, 500, "could not load transfers")
		return
	}
	httpx.JSON(w, 200, map[string]any{"requests": requests})
}

func (h *Handlers) HandleDecideTransfer(w http.ResponseWriter, r *http.Request) {
	claims, err := auth.UserFromContext(r.Context())
	if err != nil || !claims.IsAdmin {
		httpx.Error(w, 403, "transfer_admin_required")
		return
	}
	id := chi.URLParam(r, "id")
	if _, err := uuid.Parse(id); err != nil {
		httpx.Error(w, 400, "invalid request id")
		return
	}
	var body struct {
		Accept *bool `json:"accept"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<12)).Decode(&body); err != nil || body.Accept == nil {
		httpx.Error(w, 400, "transfer_decision_required")
		return
	}
	if *body.Accept {
		if err := h.authn.CheckUserQuota(r.Context(), claims.WorkspaceID); err != nil {
			httpx.Error(w, 409, err.Error())
			return
		}
	}
	_, err = h.db.Exec(r.Context(), `SELECT registry.decide_membership_transfer($1,$2)`, id, *body.Accept)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) {
			codes := map[string]int{"22023": 400, "42501": 403, "P0002": 404, "55000": 409}
			if status, ok := codes[pgErr.Code]; ok {
				httpx.Error(w, status, pgErr.Message)
				return
			}
		}
		httpx.Error(w, 500, "could not decide transfer")
		return
	}
	h.forgetGrants(claims.WorkspaceID)
	httpx.JSON(w, 200, map[string]any{"ok": true})
}
