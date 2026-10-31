/*
 * Gerege Nexus
 * Copyright (c) 2026 Gerege Systems Development Team, Gerege Nomadica Foundation
 * Distributed under the Apache 2.0 License.
 *
 * Профайлын зураг — a person's own profile photo.
 *
 *	PUT    /api/v1/profile/photo   body: the JPEG itself (Content-Type: image/jpeg)
 *	GET    /api/v1/profile/photo   the JPEG, or 404 when there is none
 *	DELETE /api/v1/profile/photo
 *
 * The caller's own photo only: there is no id in the route. The upload is
 * decoded and encoded again before it is stored, so what is kept is pixels
 * and nothing else — no EXIF, no GPS position, no camera serial — and a file
 * that only claims to be a JPEG never reaches the table. The iOS app sends a
 * 512×512 square; anything up to MaxPhotoSide on a side is accepted and
 * scaled down to that square's size.
 *
 * Stored in registry.user_photos (migration 00116), which forgets the photo
 * when an account deletion is completed.
 */

package profile

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/jpeg"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/gerege-systems/open-gerege-nexus/backend/internal/kernel/httpx"
	"github.com/gerege-systems/open-gerege-nexus/backend/internal/workspace/auth"
	"github.com/gerege-systems/open-gerege-nexus/backend/pkg/nexus"
	"github.com/jackc/pgx/v5"
	"golang.org/x/image/draw"
)

const (
	// MaxPhotoBytes is the largest upload read. A 512×512 JPEG is ~60 KB.
	MaxPhotoBytes = 2 << 20
	// MaxPhotoSide refuses images whose pixels alone would be a memory
	// problem to decode, before decoding them.
	MaxPhotoSide = 4096
	// MinPhotoSide is too small to be a face.
	MinPhotoSide = 64
	// StoredPhotoSide is the longest side kept.
	StoredPhotoSide = 512
)

var errNotAPhoto = errors.New("not a usable JPEG photo")

// normalisePhoto decodes a JPEG, scales it so neither side exceeds
// StoredPhotoSide, and encodes it again without any metadata.
func normalisePhoto(raw []byte) ([]byte, error) {
	cfg, format, err := image.DecodeConfig(bytes.NewReader(raw))
	if err != nil || format != "jpeg" {
		return nil, errNotAPhoto
	}
	if cfg.Width < MinPhotoSide || cfg.Height < MinPhotoSide || cfg.Width > MaxPhotoSide || cfg.Height > MaxPhotoSide {
		return nil, errNotAPhoto
	}
	src, err := jpeg.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, errNotAPhoto
	}
	w, h := cfg.Width, cfg.Height
	if w > StoredPhotoSide || h > StoredPhotoSide {
		if w >= h {
			h, w = h*StoredPhotoSide/w, StoredPhotoSide
		} else {
			w, h = w*StoredPhotoSide/h, StoredPhotoSide
		}
	}
	dst := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.CatmullRom.Scale(dst, dst.Bounds(), src, src.Bounds(), draw.Src, nil)
	var out bytes.Buffer
	if err := jpeg.Encode(&out, dst, &jpeg.Options{Quality: 85}); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

// SavePhoto replaces the person's photo.
func (h *Handlers) SavePhoto(ctx context.Context, userID string, photo []byte) (time.Time, error) {
	var at time.Time
	err := h.db.QueryRow(nexus.WithoutWorkspace(ctx),
		`INSERT INTO registry.user_photos (user_id, content) VALUES ($1::uuid, $2)
		 ON CONFLICT (user_id) DO UPDATE SET content = EXCLUDED.content, updated_at = now()
		 RETURNING updated_at`, userID, photo).Scan(&at)
	return at, err
}

// Photo reads the person's photo; ok is false when there is none.
func (h *Handlers) Photo(ctx context.Context, userID string) (photo []byte, at time.Time, ok bool, err error) {
	err = h.db.QueryRow(nexus.WithoutWorkspace(ctx),
		`SELECT content, updated_at FROM registry.user_photos WHERE user_id = $1::uuid`, userID).Scan(&photo, &at)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, time.Time{}, false, nil
	}
	return photo, at, err == nil, err
}

// DeletePhoto removes the person's photo. Removing none is not an error.
func (h *Handlers) DeletePhoto(ctx context.Context, userID string) error {
	_, err := h.db.Exec(nexus.WithoutWorkspace(ctx), `DELETE FROM registry.user_photos WHERE user_id = $1::uuid`, userID)
	return err
}

// HandlePutPhoto is PUT /api/v1/profile/photo.
func (h *Handlers) HandlePutPhoto(w http.ResponseWriter, r *http.Request) {
	claims, err := auth.UserFromContext(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	// A photo is the person's own choice, not an operator's on their behalf.
	if claims.ImpersonatedBy != "" {
		httpx.Error(w, http.StatusForbidden, "not available while impersonating")
		return
	}
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, MaxPhotoBytes))
	if err != nil {
		httpx.Error(w, http.StatusRequestEntityTooLarge, "Зураг хэт том байна")
		return
	}
	photo, err := normalisePhoto(raw)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "Зургийг уншиж чадсангүй. JPEG зураг сонгоно уу.")
		return
	}
	at, err := h.SavePhoto(r.Context(), claims.UserID, photo)
	if err != nil {
		slog.Error("could not save a profile photo", "user_id", claims.UserID, "error", err)
		httpx.Error(w, http.StatusInternalServerError, "could not save the photo")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"updated_at": at})
}

// HandleGetPhoto is GET /api/v1/profile/photo.
func (h *Handlers) HandleGetPhoto(w http.ResponseWriter, r *http.Request) {
	claims, err := auth.UserFromContext(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	photo, at, ok, err := h.Photo(r.Context(), claims.UserID)
	if err != nil {
		slog.Error("could not read a profile photo", "user_id", claims.UserID, "error", err)
		httpx.Error(w, http.StatusInternalServerError, "could not load the photo")
		return
	}
	if !ok {
		httpx.Error(w, http.StatusNotFound, "no photo")
		return
	}
	etag := `"` + strconv.FormatInt(at.UnixMicro(), 36) + `"`
	w.Header().Set("ETag", etag)
	// Personal: kept by the person's own client only, and checked each time.
	w.Header().Set("Cache-Control", "private, no-cache")
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Content-Length", strconv.Itoa(len(photo)))
	_, _ = w.Write(photo)
}

// HandleDeletePhoto is DELETE /api/v1/profile/photo.
func (h *Handlers) HandleDeletePhoto(w http.ResponseWriter, r *http.Request) {
	claims, err := auth.UserFromContext(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if claims.ImpersonatedBy != "" {
		httpx.Error(w, http.StatusForbidden, "not available while impersonating")
		return
	}
	if err := h.DeletePhoto(r.Context(), claims.UserID); err != nil {
		slog.Error("could not delete a profile photo", "user_id", claims.UserID, "error", err)
		httpx.Error(w, http.StatusInternalServerError, "could not delete the photo")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
