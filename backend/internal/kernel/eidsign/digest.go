/*
 * Gerege Nexus
 * Copyright (c) 2026 Gerege Systems Development Team, Gerege Nomadica Foundation
 * Distributed under the Apache 2.0 License.
 */

package eidsign

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"log/slog"
	"strings"
)

// Signing something that is not a document.
//
// The digest flow has no PDF: the citizen's phone shows displayText and nothing
// else — "50000 MNT → …1234" — and their PIN2 is consent to exactly that. So
// the caller carries a duty the document flow does not put on it: displayText
// must actually describe what is being approved, because it is the whole of
// what the citizen gets to read.
//
// A wallet transfer is the shape of it:
//
//	the app:  canonical transfer → SHA-256 → digestHex → initiate
//	the citizen: reads the amount and the recipient, enters PIN2
//	the server: recomputes the hash when the transfer is submitted and compares

// digestSize is SHA-256's, in bytes. Only SHA-256 is signed — eID is told
// hashType=SHA256 — so anything else is refused rather than sent.
const digestSize = 32

func (u *usecase) InitDigest(ctx context.Context, regNo, fullName, digestHex, displayText, docName string) (InitResult, error) {
	return u.initDigest(ctx, regNo, fullName, digestHex, displayText, docName, "")
}

func (u *usecase) InitDigestOnDevice(ctx context.Context, regNo, fullName, digestHex, displayText, docName, callbackURL string) (InitResult, error) {
	if strings.TrimSpace(callbackURL) == "" {
		return InitResult{}, errors.New("eidsign: a device-link signature needs a callback")
	}
	return u.initDigest(ctx, regNo, fullName, digestHex, displayText, docName, strings.TrimSpace(callbackURL))
}

func (u *usecase) initDigest(ctx context.Context, regNo, fullName, digestHex, displayText, docName, callbackURL string) (InitResult, error) {
	if strings.TrimSpace(regNo) == "" {
		return InitResult{}, ErrNoRegNumber
	}
	raw, err := hex.DecodeString(strings.TrimSpace(digestHex))
	if err != nil || len(raw) != digestSize {
		return InitResult{}, ErrBadDigest
	}
	digestB64 := base64.StdEncoding.EncodeToString(raw)

	// docName is what the public verification page shows. The caller knows what
	// it asked to have signed — a contract's name, "Шилжүүлэг" — so it says so.
	// Left empty it is omitted entirely, and eID falls back to guessing from
	// the interaction text, which for this flow is generic and yields "—".
	started, err := u.startV3Signature(ctx, toEtsi(regNo), digestB64, "", displayText, docName, callbackURL)
	if err != nil {
		return InitResult{}, err
	}
	v3SessionID, code := started.SessionID, started.Code

	sessionID := randID()
	// No document is stored, so this session can never be downloaded.
	if err := u.saveState(ctx, sessionID, signState{
		RegNo:       regNo,
		FullName:    fullName,
		DocHashB64:  digestB64,
		V3SessionID: v3SessionID,
		State:       "running",
	}); err != nil {
		return InitResult{}, err
	}
	slog.InfoContext(ctx, "eidsign: a digest ceremony has started", "session_id", sessionID)
	return InitResult{SessionID: sessionID, DocumentHash: digestB64, VerificationCode: code, AppLink: started.AppLink}, nil
}

// VerifiedDigest returns the digest the citizen signed.
//
// A running session is polled once before being refused. The moment a citizen
// enters PIN2 the app sends its transfer, and the stored state has often not
// caught up yet; without this, a legitimate transfer is turned away for a
// signature that had in fact just been given.
func (u *usecase) VerifiedDigest(ctx context.Context, ownerRegNo, sessionID string) (string, error) {
	st, err := u.loadState(ctx, sessionID)
	if err != nil {
		return "", ErrSessionNotFound
	}
	// Whose signature this is. Somebody else's session answers the same as an
	// unknown one — signing a transfer with another citizen's approval is the
	// thing this stops.
	if st.RegNo != ownerRegNo {
		return "", ErrSessionNotFound
	}

	if st.State == "running" {
		if _, err := u.Poll(ctx, ownerRegNo, sessionID); err != nil {
			return "", err
		}
		if st, err = u.loadState(ctx, sessionID); err != nil {
			return "", ErrSessionNotFound
		}
	}

	switch st.State {
	case "completed":
		if st.DocHashB64 == "" {
			return "", errors.New("eidsign: the ceremony completed without a digest")
		}
		return st.DocHashB64, nil
	case "rejected":
		return "", ErrRefused
	case "running":
		return "", ErrNotCompleted
	default:
		return "", ErrFailed
	}
}

// clampDisplayText fits the text into eID's displayText60.
//
// Counted in runes, not bytes: the text is Cyrillic, and sixty bytes is about
// thirty letters — and cutting mid-letter produces something the app refuses.
func clampDisplayText(text string) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return "Gerege — гарын үсэг"
	}
	if runes := []rune(text); len(runes) > 60 {
		return string(runes[:60])
	}
	return text
}

// maxFileNameRunes is what fits on the public verification page.
const maxFileNameRunes = 120

// clampFileName makes an uploaded file's name safe to send: no path (clients
// sometimes send a whole one), no control characters, and not too long. An
// empty result means the field is left out.
func clampFileName(name string) string {
	if i := strings.LastIndexAny(name, `/\`); i >= 0 {
		name = name[i+1:]
	}
	name = strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return -1
		}
		return r
	}, name)
	name = strings.TrimSpace(name)
	if runes := []rune(name); len(runes) > maxFileNameRunes {
		return strings.TrimSpace(string(runes[:maxFileNameRunes]))
	}
	return name
}
