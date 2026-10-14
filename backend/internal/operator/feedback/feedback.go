/*
 * Gerege Nexus
 * Copyright (c) 2026 Gerege Systems Development Team, Gerege Nomadica Foundation
 * Distributed under the Apache 2.0 License.
 */

// Package feedback is the console's view of the front page's suggestion box:
// reading what people said, and marking where each one stands.
//
// It stands on internal/operator/operator, which decides who is asking and
// records what they did; nothing in this plane stands on this package. The
// writing half is internal/workspace/feedback.
package feedback

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gerege-systems/open-gerege-nexus/backend/internal/kernel/httpx"
	"github.com/gerege-systems/open-gerege-nexus/backend/internal/operator/operator"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Deps are what this screen needs of the deployment.
type Deps struct {
	DB *pgxpool.Pool
}

// Service is this screen.
type Service struct {
	op *operator.Console
	db *pgxpool.Pool
}

// New builds it. It performs no I/O.
func New(op *operator.Console, deps Deps) *Service {
	return &Service{op: op, db: deps.DB}
}

// Item is one submission.
type Item struct {
	ID         string     `json:"id"`
	Category   string     `json:"category"`
	Message    string     `json:"message"`
	Name       string     `json:"name"`
	Contact    string     `json:"contact"`
	Page       string     `json:"page"`
	Status     string     `json:"status"`
	CreatedAt  time.Time  `json:"created_at"`
	ReviewedAt *time.Time `json:"reviewed_at"`
}

var statuses = map[string]bool{"new": true, "seen": true, "planned": true, "done": true, "dismissed": true}

// ErrNotFound is a submission that does not exist.
var ErrNotFound = errors.New("feedback not found")

// List returns submissions newest first, optionally of one status.
func (s *Service) List(ctx context.Context, status string, limit int) ([]Item, map[string]int, error) {
	ctx = operator.Scoped(ctx)
	rows, err := s.db.Query(ctx,
		`SELECT id::text, category, message, name, contact, page, status, created_at, reviewed_at
		   FROM registry.public_feedback
		  WHERE $1 = '' OR status = $1
		  ORDER BY created_at DESC, id LIMIT $2`, status, limit)
	if err != nil {
		return nil, nil, fmt.Errorf("control plane: list feedback: %w", err)
	}
	defer rows.Close()
	items := make([]Item, 0, 16)
	for rows.Next() {
		var it Item
		if err := rows.Scan(&it.ID, &it.Category, &it.Message, &it.Name, &it.Contact,
			&it.Page, &it.Status, &it.CreatedAt, &it.ReviewedAt); err != nil {
			return nil, nil, fmt.Errorf("control plane: read feedback: %w", err)
		}
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	counts := map[string]int{}
	countRows, err := s.db.Query(ctx, `SELECT status, count(*) FROM registry.public_feedback GROUP BY status`)
	if err != nil {
		return nil, nil, fmt.Errorf("control plane: count feedback: %w", err)
	}
	defer countRows.Close()
	for countRows.Next() {
		var st string
		var n int
		if err := countRows.Scan(&st, &n); err != nil {
			return nil, nil, err
		}
		counts[st] = n
	}
	return items, counts, countRows.Err()
}

// SetStatus moves one submission along.
func (s *Service) SetStatus(ctx context.Context, sess operator.Session, id, status string) error {
	if !statuses[status] {
		return fmt.Errorf("%q is not a feedback status", status)
	}
	return s.op.Record(ctx, sess, operator.Change{
		Action:     "feedback.status",
		TargetType: "feedback",
		TargetID:   id,
		After:      map[string]any{"status": status},
	}, func(ctx context.Context, tx pgx.Tx) error {
		tag, err := tx.Exec(ctx,
			`UPDATE registry.public_feedback SET status = $2, reviewed_at = now() WHERE id = $1::uuid`,
			id, status)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return nil
	})
}

func fail(w http.ResponseWriter, err error, doing string) {
	if errors.Is(err, ErrNotFound) {
		httpx.Error(w, http.StatusNotFound, err.Error())
		return
	}
	operator.Fail(w, err, doing)
}

func (s *Service) handleList(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	if status != "" && !statuses[status] {
		httpx.Error(w, http.StatusBadRequest, "unknown status")
		return
	}
	limit := 200
	if n, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && n > 0 && n < limit {
		limit = n
	}
	items, counts, err := s.List(r.Context(), status, limit)
	if err != nil {
		fail(w, err, "could not read the feedback")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"feedback": items, "counts": counts})
}

func (s *Service) handleSetStatus(w http.ResponseWriter, r *http.Request) {
	sess, _ := operator.SessionFrom(r.Context())
	var body struct {
		Status string `json:"status"`
	}
	if !operator.Decode(w, r, &body) {
		return
	}
	if !statuses[body.Status] {
		httpx.Error(w, http.StatusBadRequest, "unknown status")
		return
	}
	if err := s.SetStatus(r.Context(), sess, chi.URLParam(r, "id"), body.Status); err != nil {
		fail(w, err, "could not update the feedback")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": body.Status})
}

// Routes are this screen's, mounted on the console's signed-in group.
func (s *Service) Routes(r chi.Router) {
	r.With(s.op.RequireCapability(operator.CapTenantRead)).Get("/feedback", s.handleList)
	r.With(s.op.RequireCapability(operator.CapSupport)).Post("/feedback/{id}/status", s.handleSetStatus)
}
