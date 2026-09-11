package person

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gerege-systems/open-gerege-nexus/backend/internal/kernel/httpx"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
)

func (s *Store) HandleMyTransfers(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `SELECT * FROM registry.my_membership_transfers()`)
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

func (s *Store) HandleRequestTransfer(w http.ResponseWriter, r *http.Request) {
	var body struct {
		FromTenantID string `json:"from_tenant_id"`
		Slug         string `json:"slug"`
		Message      string `json:"message"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<12)).Decode(&body); err != nil {
		httpx.Error(w, 400, "malformed request body")
		return
	}
	if _, err := uuid.Parse(body.FromTenantID); err != nil {
		httpx.Error(w, 400, "transfer_source_unavailable")
		return
	}
	var id string
	err := s.db.QueryRow(r.Context(), `SELECT registry.request_membership_transfer($1,$2,$3)::text`, body.FromTenantID, body.Slug, body.Message).Scan(&id)
	if transferError(w, err) {
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "id": id})
}

func (s *Store) HandleCancelTransfer(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if _, err := uuid.Parse(id); err != nil {
		httpx.Error(w, 400, "invalid request id")
		return
	}
	_, err := s.db.Exec(r.Context(), `SELECT registry.cancel_membership_transfer($1)`, id)
	if transferError(w, err) {
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
}

func transferError(w http.ResponseWriter, err error) bool {
	if err == nil {
		return false
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		codes := map[string]int{"22023": 400, "42501": 403, "P0002": 404, "55000": 409, "23505": 409}
		if status, ok := codes[pgErr.Code]; ok {
			httpx.Error(w, status, pgErr.Message)
			return true
		}
	}
	httpx.Error(w, 500, "could not save transfer request")
	return true
}
