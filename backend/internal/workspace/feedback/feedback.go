/*
 * Gerege Nexus
 * Copyright (c) 2026 Gerege Systems Development Team, Gerege Nomadica Foundation
 * Distributed under the Apache 2.0 License.
 */

// Package feedback is the front page's open suggestion box: anybody, signed in
// or not, may tell the platform what they think of it.
//
// It writes, and during the pilot it also reads back in public: everybody sees
// what everybody else said, so a suggestion is made once rather than fifty
// times. Contact details are never part of that answer — they were given to
// the team, not to the page. Moderating is the console's — see
// internal/operator/feedback — and a submission it dismisses leaves the list.
package feedback

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gerege-systems/open-gerege-nexus/backend/internal/kernel/httpx"
	"github.com/jackc/pgx/v5/pgxpool"
)

// The limits are the column lengths in migration 00114, counted in characters
// the way PostgreSQL counts varchar.
const (
	minMessage = 5
	maxMessage = 2000
	maxName    = 100
	maxContact = 120
	maxPage    = 200
)

var categories = map[string]bool{"idea": true, "request": true, "bug": true, "other": true}

// Submission is what the form sends.
//
// Website is a honeypot: the form hides it from people, so a value in it is a
// script filling in every field it finds. The answer is the same 201 either
// way, so the script learns nothing.
type Submission struct {
	Category string `json:"category"`
	Message  string `json:"message"`
	Name     string `json:"name"`
	Contact  string `json:"contact"`
	Page     string `json:"page"`
	Website  string `json:"website"`
}

// InvalidError is a submission the form should have refused.
type InvalidError struct{ Reason string }

func (e *InvalidError) Error() string { return e.Reason }

// Service records submissions.
type Service struct{ db *pgxpool.Pool }

// New builds it. It performs no I/O.
func New(db *pgxpool.Pool) *Service { return &Service{db: db} }

// Submit validates and stores one submission.
func (s *Service) Submit(ctx context.Context, in Submission) error {
	in.Category = strings.TrimSpace(in.Category)
	in.Message = strings.TrimSpace(in.Message)
	in.Name = strings.TrimSpace(in.Name)
	in.Contact = strings.TrimSpace(in.Contact)
	in.Page = strings.TrimSpace(in.Page)

	if in.Category == "" {
		in.Category = "idea"
	}
	if !categories[in.Category] {
		return &InvalidError{"Ангилал буруу байна."}
	}
	switch n := utf8.RuneCountInString(in.Message); {
	case n < minMessage:
		return &InvalidError{"Саналаа арай дэлгэрэнгүй бичнэ үү."}
	case n > maxMessage:
		return &InvalidError{fmt.Sprintf("Санал %d тэмдэгтээс ихгүй байна.", maxMessage)}
	}
	if utf8.RuneCountInString(in.Name) > maxName {
		return &InvalidError{"Нэр хэт урт байна."}
	}
	if utf8.RuneCountInString(in.Contact) > maxContact {
		return &InvalidError{"Холбоо барих мэдээлэл хэт урт байна."}
	}
	if utf8.RuneCountInString(in.Page) > maxPage {
		in.Page = string([]rune(in.Page)[:maxPage])
	}

	if _, err := s.db.Exec(ctx,
		`INSERT INTO registry.public_feedback (category, message, name, contact, page)
		 VALUES ($1, $2, $3, $4, $5)`,
		in.Category, in.Message, in.Name, in.Contact, in.Page); err != nil {
		return fmt.Errorf("feedback: store a submission: %w", err)
	}
	return nil
}

// Public is one submission as the front page shows it: no contact, no page.
type Public struct {
	ID        string    `json:"id"`
	Category  string    `json:"category"`
	Message   string    `json:"message"`
	Name      string    `json:"name"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

// maxList is the most one request may ask for.
const maxList = 50

// List returns what people said, newest first, leaving out what the console
// dismissed, and how many there are in all.
func (s *Service) List(ctx context.Context, limit, offset int) ([]Public, int, error) {
	rows, err := s.db.Query(ctx,
		`SELECT id::text, category, message, name, status, created_at
		   FROM registry.public_feedback
		  WHERE status <> 'dismissed'
		  ORDER BY created_at DESC, id LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("feedback: list: %w", err)
	}
	defer rows.Close()
	items := make([]Public, 0, limit)
	for rows.Next() {
		var it Public
		if err := rows.Scan(&it.ID, &it.Category, &it.Message, &it.Name, &it.Status, &it.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("feedback: read: %w", err)
		}
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	var total int
	if err := s.db.QueryRow(ctx,
		`SELECT count(*) FROM registry.public_feedback WHERE status <> 'dismissed'`).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("feedback: count: %w", err)
	}
	return items, total, nil
}

// HandleList is GET /api/v1/feedback: the open list, in pages.
func (s *Service) HandleList(w http.ResponseWriter, r *http.Request) {
	limit, offset := 20, 0
	if n, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && n > 0 {
		limit = min(n, maxList)
	}
	if n, err := strconv.Atoi(r.URL.Query().Get("offset")); err == nil && n > 0 {
		offset = n
	}
	items, total, err := s.List(r.Context(), limit, offset)
	if err != nil {
		slog.Error("could not list feedback", "error", err)
		httpx.Error(w, http.StatusInternalServerError, "Саналуудыг уншиж чадсангүй.")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"feedback": items, "total": total})
}

// HandleSubmit is POST /api/v1/feedback. Unauthenticated on purpose: the
// people whose opinion is wanted most are the ones who have not signed in yet.
// The route's rate limit is what stands between it and a flood.
func (s *Service) HandleSubmit(w http.ResponseWriter, r *http.Request) {
	var in Submission
	if err := httpx.DecodeLimited(r, &in, 16<<10); err != nil {
		httpx.Error(w, http.StatusBadRequest, "Хүсэлтийг уншиж чадсангүй.")
		return
	}
	if in.Website != "" {
		httpx.JSON(w, http.StatusCreated, map[string]string{"status": "received"})
		return
	}
	if err := s.Submit(r.Context(), in); err != nil {
		var invalid *InvalidError
		if errors.As(err, &invalid) {
			httpx.Error(w, http.StatusBadRequest, invalid.Reason)
			return
		}
		slog.Error("could not store feedback", "error", err)
		httpx.Error(w, http.StatusInternalServerError, "Санал хадгалахад алдаа гарлаа. Дахин оролдоно уу.")
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]string{"status": "received"})
}
