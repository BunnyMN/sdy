/*
 * Gerege Nexus
 * Copyright (c) 2026 Gerege Systems Development Team, Gerege Nomadica Foundation
 * Distributed under the Apache 2.0 License.
 *
 * Push — a member's notifications (registry.member_notifications) delivered to
 * their phone through APNs.
 *
 * Woken by every new notification (LISTEN, migration 00121) and every thirty
 * seconds besides, registry.claim_pushes (migration 00120) hands over the
 * notifications nobody has sent yet, each with the person's registered device
 * tokens, and marks them sent. A notification is attempted once: one that
 * fails is still in the person's list in the app, which is where it always
 * was. A token APNs says is gone is forgotten.
 *
 * Off until configured. With no APNs key the loop does not start and nothing
 * is marked, so turning it on later sends only what is new (claim_pushes
 * skips anything older than fifteen minutes).
 *
 *	APNS_KEY      the .p8 key, PEM or base64 of the PEM
 *	APNS_KEY_ID   its ten-character id
 *	APNS_TEAM_ID  the Apple Developer team id
 *	APNS_TOPIC    the app's bundle id (default mn.esdy.member)
 *
 * A token registered with app_id "<topic>:sandbox" (a development build) is
 * sent through the APNs sandbox; every other through production.
 */

package push

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math/big"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gerege-systems/open-gerege-nexus/backend/internal/kernel/async"
	"github.com/gerege-systems/open-gerege-nexus/backend/internal/workspace/devices"
	"github.com/gerege-systems/open-gerege-nexus/backend/pkg/nexus"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	productionHost = "https://api.push.apple.com"
	sandboxHost    = "https://api.sandbox.push.apple.com"
	// fallbackInterval is how often delivery runs without being woken.
	fallbackInterval = 30 * time.Second
	batch            = 100
)

// Config is the APNs credential. Zero means push is off.
type Config struct {
	Key    *ecdsa.PrivateKey
	KeyID  string
	TeamID string
	Topic  string
}

// ConfigFromEnv reads the APNs credential; ok is false when it is not set.
func ConfigFromEnv() (Config, bool, error) {
	raw := strings.TrimSpace(os.Getenv("APNS_KEY"))
	keyID, teamID := strings.TrimSpace(os.Getenv("APNS_KEY_ID")), strings.TrimSpace(os.Getenv("APNS_TEAM_ID"))
	if raw == "" || keyID == "" || teamID == "" {
		return Config{}, false, nil
	}
	key, err := ParseKey(raw)
	if err != nil {
		return Config{}, false, err
	}
	topic := strings.TrimSpace(os.Getenv("APNS_TOPIC"))
	if topic == "" {
		topic = "mn.esdy.member"
	}
	return Config{Key: key, KeyID: keyID, TeamID: teamID, Topic: topic}, true, nil
}

// ParseKey reads a .p8 key, as PEM or as base64 of the PEM (one line fits an
// environment file).
func ParseKey(raw string) (*ecdsa.PrivateKey, error) {
	text := raw
	if !strings.Contains(text, "BEGIN") {
		decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(text))
		if err != nil {
			return nil, errors.New("APNS_KEY is neither PEM nor base64")
		}
		text = string(decoded)
	}
	block, _ := pem.Decode([]byte(text))
	if block == nil {
		return nil, errors.New("APNS_KEY holds no PEM block")
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("APNS_KEY: %w", err)
	}
	key, ok := parsed.(*ecdsa.PrivateKey)
	if !ok {
		return nil, errors.New("APNS_KEY is not an EC key")
	}
	return key, nil
}

type Sender struct {
	db     *pgxpool.Pool
	cfg    Config
	client *http.Client
	hosts  map[bool]string

	mu       sync.Mutex
	token    string
	issuedAt time.Time

	running sync.Mutex
}

func New(db *pgxpool.Pool, cfg Config) *Sender {
	return &Sender{db: db, cfg: cfg, client: &http.Client{Timeout: 15 * time.Second},
		hosts: map[bool]string{false: productionHost, true: sandboxHost}}
}

// Start runs delivery until ctx ends: at once when a notification is written
// (LISTEN member_notifications, migration 00121), and every thirty seconds too,
// in case the listening connection is down.
func (s *Sender) Start(ctx context.Context) {
	async.Go("push-delivery-listen", func() {
		for ctx.Err() == nil {
			if err := s.listen(ctx); err != nil && ctx.Err() == nil {
				slog.Warn("push: listener stopped; retrying", "error", err)
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(5 * time.Second):
			}
		}
	})
	async.Go("push-delivery-poll", func() {
		ticker := time.NewTicker(fallbackInterval)
		defer ticker.Stop()
		for {
			s.round(ctx)
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	})
}

// listen holds one connection on LISTEN and delivers whenever it is woken.
func (s *Sender) listen(ctx context.Context) error {
	conn, err := s.db.Acquire(nexus.WithoutWorkspace(ctx))
	if err != nil {
		return err
	}
	// The connection is not handed back carrying a LISTEN: closed instead.
	defer func() { _ = conn.Hijack().Close(context.Background()) }()
	if _, err := conn.Exec(ctx, "LISTEN member_notifications"); err != nil {
		return err
	}
	for {
		if _, err := conn.Conn().WaitForNotification(ctx); err != nil {
			return err
		}
		s.round(ctx)
	}
}

// round delivers one batch; the two loops never run it at the same time.
func (s *Sender) round(ctx context.Context) {
	s.running.Lock()
	defer s.running.Unlock()
	runCtx, cancel := context.WithTimeout(ctx, time.Minute)
	defer cancel()
	if sent, err := s.Deliver(runCtx); err != nil {
		if ctx.Err() == nil {
			slog.Warn("push: delivery round failed", "error", err)
		}
	} else if sent > 0 {
		slog.Info("push: delivered", "count", sent)
	}
}

type due struct {
	notificationID, userID, title, body, path string
	unread                                    int
	tokenHash, ciphertext, appID              string
}

// Deliver sends one batch and reports how many pushes APNs accepted.
func (s *Sender) Deliver(ctx context.Context) (int, error) {
	rows, err := s.db.Query(nexus.WithoutWorkspace(ctx), `SELECT notification_id::text, user_id::text, title, body, path, unread,
		token_hash, token_ciphertext, app_id FROM registry.claim_pushes($1)`, batch)
	if err != nil {
		return 0, err
	}
	var list []due
	for rows.Next() {
		var d due
		if err := rows.Scan(&d.notificationID, &d.userID, &d.title, &d.body, &d.path, &d.unread, &d.tokenHash, &d.ciphertext, &d.appID); err != nil {
			rows.Close()
			return 0, err
		}
		list = append(list, d)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	sent := 0
	for _, d := range list {
		device, err := devices.DecryptPushToken(d.ciphertext)
		if err != nil {
			slog.Warn("push: unreadable token", "user_id", d.userID, "error", err)
			continue
		}
		gone, err := s.send(ctx, device, strings.HasSuffix(d.appID, ":sandbox"), d)
		switch {
		case gone:
			if _, err := s.db.Exec(nexus.WithoutWorkspace(ctx), `SELECT registry.forget_push_token($1)`, d.tokenHash); err != nil {
				slog.Warn("push: could not forget a dead token", "error", err)
			}
		case err != nil:
			slog.Warn("push: not delivered", "user_id", d.userID, "notification_id", d.notificationID, "error", err)
		default:
			sent++
		}
	}
	return sent, nil
}

// Payload is what the phone receives; path opens the screen it is about.
func Payload(title, body, path string, badge int) ([]byte, error) {
	return json.Marshal(map[string]any{
		"aps": map[string]any{
			"alert": map[string]string{"title": title, "body": body},
			"sound": "default",
			"badge": badge,
		},
		"path": path,
	})
}

// send reports gone when APNs says the token will never work again.
func (s *Sender) send(ctx context.Context, device string, sandbox bool, d due) (gone bool, err error) {
	payload, err := Payload(d.title, d.body, d.path, d.unread)
	if err != nil {
		return false, err
	}
	jwt, err := s.bearer()
	if err != nil {
		return false, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.hosts[sandbox]+"/3/device/"+device, bytes.NewReader(payload))
	if err != nil {
		return false, err
	}
	req.Header.Set("authorization", "bearer "+jwt)
	req.Header.Set("apns-topic", s.cfg.Topic)
	req.Header.Set("apns-push-type", "alert")
	req.Header.Set("apns-priority", "10")
	req.Header.Set("apns-collapse-id", d.notificationID[:min(len(d.notificationID), 64)])
	res, err := s.client.Do(req)
	if err != nil {
		return false, err
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode == http.StatusOK {
		return false, nil
	}
	var reason struct {
		Reason string `json:"reason"`
	}
	_ = json.NewDecoder(io.LimitReader(res.Body, 4096)).Decode(&reason)
	switch {
	case res.StatusCode == http.StatusGone, reason.Reason == "BadDeviceToken", reason.Reason == "DeviceTokenNotForTopic":
		return true, fmt.Errorf("apns %d %s", res.StatusCode, reason.Reason)
	default:
		return false, fmt.Errorf("apns %d %s", res.StatusCode, reason.Reason)
	}
}

// bearer is the provider token, reused for fifty minutes (APNs refuses one
// older than an hour and one renewed more than every twenty minutes).
func (s *Sender) bearer() (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.token != "" && time.Since(s.issuedAt) < 50*time.Minute {
		return s.token, nil
	}
	token, err := ProviderToken(s.cfg, time.Now())
	if err != nil {
		return "", err
	}
	s.token, s.issuedAt = token, time.Now()
	return token, nil
}

// ProviderToken is the ES256 JWT APNs authenticates a provider with.
func ProviderToken(cfg Config, at time.Time) (string, error) {
	enc := base64.RawURLEncoding
	header, _ := json.Marshal(map[string]string{"alg": "ES256", "kid": cfg.KeyID})
	claims, _ := json.Marshal(map[string]any{"iss": cfg.TeamID, "iat": at.Unix()})
	signing := enc.EncodeToString(header) + "." + enc.EncodeToString(claims)
	digest := sha256.Sum256([]byte(signing))
	r, sig, err := ecdsa.Sign(rand.Reader, cfg.Key, digest[:])
	if err != nil {
		return "", err
	}
	raw := make([]byte, 64)
	fill(raw[:32], r)
	fill(raw[32:], sig)
	return signing + "." + enc.EncodeToString(raw), nil
}

func fill(dst []byte, n *big.Int) {
	b := n.Bytes()
	copy(dst[len(dst)-len(b):], b)
}
