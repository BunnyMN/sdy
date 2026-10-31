/*
 * Gerege Nexus
 * Copyright (c) 2026 Gerege Systems Development Team, Gerege Nomadica Foundation
 * Distributed under the Apache 2.0 License.
 *
 * Бүртгэл устгах хүсэлт — a person asking for their own account to go.
 *
 * eID sign-in opens an account on first use, so an account somebody never
 * asked for has to be one they can close (App Store guideline 5.1.1(v)); the
 * iOS member app and the web profile both call this. The lifecycle lives in
 * SQL, migration 00115, because it touches memberships, sessions and identity
 * tables that already guard themselves there:
 *
 *	POST /api/v1/profile/deletion-request  {"reason": "..."}   (reason optional)
 *	    registry.request_account_deletion: one transaction that records the
 *	    request, revokes every session and OAuth token the person holds, ends
 *	    each organisation membership with member_reason "account deletion"
 *	    (status → "left", access off), cancels pending transfers and join
 *	    requests. The caller's own session is among those revoked, so the
 *	    answer also clears the cookie: a client should treat it as sign-out.
 *
 *	GET /api/v1/profile/deletion-request
 *	    The latest request and where it stands. Mostly read as "cancelled":
 *	    see below.
 *
 *	Grace period, DeletionGrace (30 days)
 *	    Signing in again cancels the request and restores the memberships it
 *	    ended (auth.FirstTenantFor → registry.cancel_account_deletion). The
 *	    eID link is deliberately kept until the end of the grace period: it is
 *	    what recognises the returning person as the same account rather than
 *	    opening a new empty one.
 *
 *	Anonymisation
 *	    StartDeletionHousekeeping runs registry.anonymise_deleted_accounts every
 *	    six hours. It blanks name, e-mail, phone, residence and Gerege ID,
 *	    removes the eID/SSO links, sessions and notifications, and keeps the
 *	    users row and its id — dues, payments, attendance, points and votes are
 *	    the organisation's records and stay attached to it. An operator can run
 *	    the same thing by hand, e.g. to honour a request immediately:
 *
 *	        SELECT registry.anonymise_deleted_accounts();               -- due ones
 *	        SELECT registry.anonymise_deleted_accounts('0 seconds');    -- all pending
 */

package profile

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gerege-systems/open-gerege-nexus/backend/internal/kernel/async"
	"github.com/gerege-systems/open-gerege-nexus/backend/internal/kernel/httpx"
	"github.com/gerege-systems/open-gerege-nexus/backend/internal/workspace/auth"
	"github.com/gerege-systems/open-gerege-nexus/backend/pkg/nexus"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// DeletionGrace is how long a request waits before the account is anonymised.
// The SQL default in 00115 says the same; this is what the answer reports.
const DeletionGrace = 30 * 24 * time.Hour

// deletionSweepInterval is how often due requests are looked for. A request
// is honoured within six hours of its thirty days, which nobody will notice;
// sweeping more often would be a query bought for nothing.
const deletionSweepInterval = 6 * time.Hour

// DeletionRequest is the answer of both routes.
type DeletionRequest struct {
	ID          string     `json:"id,omitempty"`
	Status      string     `json:"status"` // none | pending | cancelled | completed
	RequestedAt *time.Time `json:"requested_at,omitempty"`
	// When the account will be anonymised if nobody signs in first. Only for
	// a pending request.
	ScheduledFor *time.Time `json:"scheduled_for,omitempty"`
	ProcessedAt  *time.Time `json:"processed_at,omitempty"`
	GraceDays    int        `json:"grace_days"`
}

func (d *DeletionRequest) finish() {
	d.GraceDays = int(DeletionGrace / (24 * time.Hour))
	if d.Status == "pending" && d.RequestedAt != nil {
		at := d.RequestedAt.Add(DeletionGrace)
		d.ScheduledFor = &at
	}
}

// RequestDeletion records the request and does everything the request does,
// in one transaction. Exported for tests and for an operator tool.
//
// It runs on the platform path: the request ends memberships in every
// organisation this person belongs to, which no single tenant binding can
// reach, and the table is closed to the tenant role. Whose account it is comes
// only from the caller's own session — there is no id in the route.
func (h *Handlers) RequestDeletion(ctx context.Context, userID, reason string) (DeletionRequest, error) {
	var out DeletionRequest
	var requestedAt time.Time
	var processedAt *time.Time
	err := h.db.QueryRow(nexus.WithoutWorkspace(ctx),
		`SELECT id::text, status, requested_at, processed_at
		   FROM registry.request_account_deletion($1::uuid, $2)`,
		userID, strings.TrimSpace(reason)).Scan(&out.ID, &out.Status, &requestedAt, &processedAt)
	if err != nil {
		return out, err
	}
	out.RequestedAt, out.ProcessedAt = &requestedAt, processedAt
	out.finish()
	return out, nil
}

// DeletionStatus is the person's latest request, or status "none".
func (h *Handlers) DeletionStatus(ctx context.Context, userID string) (DeletionRequest, error) {
	var out DeletionRequest
	var requestedAt time.Time
	var processedAt *time.Time
	err := h.db.QueryRow(nexus.WithoutWorkspace(ctx),
		`SELECT id::text, status, requested_at, processed_at
		   FROM registry.account_deletion_requests
		  WHERE user_id = $1::uuid
		  ORDER BY requested_at DESC, id LIMIT 1`, userID).
		Scan(&out.ID, &out.Status, &requestedAt, &processedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		out = DeletionRequest{Status: "none"}
		out.finish()
		return out, nil
	}
	if err != nil {
		return out, err
	}
	out.RequestedAt, out.ProcessedAt = &requestedAt, processedAt
	out.finish()
	return out, nil
}

// AnonymiseDueAccounts anonymises every request older than grace and reports
// how many. See the file comment for what is kept.
func (h *Handlers) AnonymiseDueAccounts(ctx context.Context, grace time.Duration) (int, error) {
	var done int
	err := h.db.QueryRow(nexus.WithoutWorkspace(ctx),
		`SELECT registry.anonymise_deleted_accounts(make_interval(secs => $1))`,
		grace.Seconds()).Scan(&done)
	return done, err
}

// HandleRequestDeletion is POST /api/v1/profile/deletion-request.
func (h *Handlers) HandleRequestDeletion(w http.ResponseWriter, r *http.Request) {
	claims, err := auth.UserFromContext(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	// The body is optional: an empty request is a request with no reason.
	var req struct {
		Reason string `json:"reason"`
	}
	if err := httpx.DecodeLimited(r, &req, 8<<10); err != nil && !errors.Is(err, io.EOF) {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len([]rune(strings.TrimSpace(req.Reason))) > 500 {
		httpx.Error(w, http.StatusBadRequest, "Шалтгаан 500 тэмдэгтээс хэтрэхгүй байна")
		return
	}
	// An impersonating operator acts as the person but is not them, and this
	// is not a decision anybody makes on somebody else's behalf.
	if claims.ImpersonatedBy != "" {
		httpx.Error(w, http.StatusForbidden, "not available while impersonating")
		return
	}

	out, err := h.RequestDeletion(r.Context(), claims.UserID, req.Reason)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "22023" {
			httpx.Error(w, http.StatusBadRequest, "Шалтгаан 500 тэмдэгтээс хэтрэхгүй байна")
			return
		}
		slog.Error("could not record an account deletion request", "user_id", claims.UserID, "error", err)
		httpx.Error(w, http.StatusInternalServerError, "could not record the request")
		return
	}
	// The session that made this request was revoked with the rest.
	auth.ClearSessionCookie(w)
	slog.Info("account deletion requested", "user_id", claims.UserID, "request_id", out.ID)
	httpx.JSON(w, http.StatusAccepted, out)
}

// HandleDeletionStatus is GET /api/v1/profile/deletion-request.
func (h *Handlers) HandleDeletionStatus(w http.ResponseWriter, r *http.Request) {
	claims, err := auth.UserFromContext(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	out, err := h.DeletionStatus(r.Context(), claims.UserID)
	if err != nil {
		slog.Error("could not read an account deletion request", "user_id", claims.UserID, "error", err)
		httpx.Error(w, http.StatusInternalServerError, "could not load the request")
		return
	}
	httpx.JSON(w, http.StatusOK, out)
}

// StartDeletionHousekeeping anonymises due requests until ctx is cancelled.
// Several replicas may run it at once: the SQL takes each request with FOR
// UPDATE SKIP LOCKED, so no account is processed twice.
func (h *Handlers) StartDeletionHousekeeping(ctx context.Context) {
	async.Go("account-deletion-sweep", func() {
		ticker := time.NewTicker(deletionSweepInterval)
		defer ticker.Stop()
		for {
			sweepCtx, cancel := context.WithTimeout(ctx, time.Minute)
			done, err := h.AnonymiseDueAccounts(sweepCtx, DeletionGrace)
			cancel()
			if err != nil {
				slog.Warn("profile: could not anonymise deleted accounts", "error", err)
			} else if done > 0 {
				slog.Info("profile: anonymised deleted accounts", "count", done)
			}
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	})
}
