/*
 * Gerege Nexus
 * Copyright (c) 2026 Gerege Systems Development Team, Gerege Nomadica Foundation
 * Distributed under the Apache 2.0 License.
 */

package eidrp

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Device link v3 — the only link the eID app opens since 2026-10-02.
//
//	QR:      {base}?deviceLinkType=QR&elapsedSeconds={E}&sessionToken={T}&sessionType=auth&version=1.0&lang={L}&authCode={A}
//	Web2App: {base}?deviceLinkType=Web2App&sessionToken={T}&sessionType=auth&version=1.0&lang={L}&authCode={A}
//
// authCode = BASE64URL-NOPAD(HMAC-SHA256(base64-decode(sessionSecret), payload)),
// where payload joins with `|`: the scheme name, the signature protocol, the
// challenge, base64(rpName), base64(brokered rp name), the interactions string
// exactly as sent, the callback (always empty for QR), and the link without
// its authCode. This is eID's own contract (ca-eidmongolia-mn
// docs/DEVICE_LINK_V3.md), checked here against its golden vectors.
//
// A QR link is good for about twenty seconds after the elapsedSeconds it
// names, so a page showing one swaps it every second.

// Device link types. The eID app signs the one it was opened with into the
// approval, so a link must say truthfully how it reached the phone.
const (
	LinkQR      = "QR"
	LinkWeb2App = "Web2App"
	LinkApp2App = "App2App"
)

// DefaultLinkLang is the language of eID's /dl fallback page (ISO 639-2).
const DefaultLinkLang = "mon"

// DeviceLinkSession is what a device-link initiate leaves behind on this
// server. SessionSecret signs every link; it is never sent to a browser.
type DeviceLinkSession struct {
	Base          string
	SessionToken  string
	SessionSecret string
	RPChallenge   string
	RPName        string
	Interactions  string
	CallbackURL   string
	ReceivedAt    time.Time
}

// QRLink is the QR link for the moment `now`.
func (d *DeviceLinkSession) QRLink(now time.Time) (string, error) {
	elapsed := int(now.Sub(d.ReceivedAt) / time.Second)
	if elapsed < 0 {
		// eID refuses a link from the future; a clock step back must not make one.
		elapsed = 0
	}
	return BuildDeviceLink(d.input(LinkQR, elapsed))
}

// AppLink is the same-device link (Web2App from a phone's browser). It exists
// only for a session started with a callback, because the eID app has
// nowhere to send the citizen back to otherwise.
func (d *DeviceLinkSession) AppLink() (string, error) {
	if d.CallbackURL == "" {
		return "", errors.New("eid: a same-device link needs a session started with a callback")
	}
	return BuildDeviceLink(d.input(LinkWeb2App, 0))
}

func (d *DeviceLinkSession) input(linkType string, elapsed int) DeviceLinkInput {
	return DeviceLinkInput{
		Base: d.Base, LinkType: linkType, SessionToken: d.SessionToken, SessionSecret: d.SessionSecret,
		SessionType: "auth", Lang: DefaultLinkLang, ElapsedSeconds: elapsed,
		Challenge: d.RPChallenge, RPName: d.RPName, Interactions: d.Interactions, CallbackURL: d.CallbackURL,
	}
}

// DeviceLinkInput is one link to build. Every string is used exactly as given:
// the authCode is over these bytes, and eID recomputes it from what it sent and
// received, so a re-serialised value would fail there rather than here.
type DeviceLinkInput struct {
	Base          string
	LinkType      string // QR | Web2App | App2App
	SessionToken  string
	SessionSecret string // standard base64, padded
	SessionType   string // auth | sign | cert
	Lang          string // ISO 639-2: mon, eng
	// ElapsedSeconds is whole seconds since the initiate answer arrived. QR only.
	ElapsedSeconds int
	// Challenge is rpChallenge for auth, the digest for sign, empty for cert.
	Challenge      string
	RPName         string
	BrokeredRPName string
	Interactions   string
	// CallbackURL is the initialCallbackUrl sent at start. It is left out of a
	// QR link's authCode, so one session can offer both a QR and a button.
	CallbackURL string
	// SchemeName defaults to "smart-id".
	SchemeName string
}

var (
	linkTokenRE = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)
	linkLangRE  = regexp.MustCompile(`^[a-z]{3}$`)
)

var linkProtocols = map[string]string{"auth": "ACSP_V2", "sign": "RAW_DIGEST_SIGNATURE", "cert": ""}

// BuildDeviceLink assembles a v3 device link with its authCode. It refuses
// rather than guesses: a link the eID app cannot verify is worse than an error.
func BuildDeviceLink(in DeviceLinkInput) (string, error) {
	base := strings.TrimSpace(in.Base)
	u, err := url.Parse(base)
	if base == "" || err != nil || u.Scheme != "https" || u.Host == "" || strings.ContainsAny(base, "?#") {
		return "", fmt.Errorf("eid device link: base %q is not an https URL without query", base)
	}
	if in.LinkType != LinkQR && in.LinkType != LinkWeb2App && in.LinkType != LinkApp2App {
		return "", fmt.Errorf("eid device link: unknown link type %q", in.LinkType)
	}
	protocol, ok := linkProtocols[in.SessionType]
	if !ok {
		return "", fmt.Errorf("eid device link: unknown session type %q", in.SessionType)
	}
	if !linkTokenRE.MatchString(in.SessionToken) {
		return "", errors.New("eid device link: malformed session token")
	}
	if !linkLangRE.MatchString(in.Lang) {
		return "", fmt.Errorf("eid device link: lang %q is not ISO 639-2", in.Lang)
	}
	secret, err := base64.StdEncoding.Strict().DecodeString(in.SessionSecret)
	if err != nil || len(secret) == 0 {
		return "", errors.New("eid device link: session secret is not standard base64")
	}
	switch {
	case in.SessionType == "cert" && in.Challenge != "":
		return "", errors.New("eid device link: a cert session carries no challenge")
	case in.SessionType != "cert" && in.Challenge == "":
		return "", fmt.Errorf("eid device link: a %s session needs its challenge", in.SessionType)
	}

	qr := in.LinkType == LinkQR
	callback := in.CallbackURL
	elapsed := ""
	if qr {
		callback = ""
		if in.ElapsedSeconds < 0 {
			return "", errors.New("eid device link: negative elapsed seconds")
		}
		elapsed = "&elapsedSeconds=" + strconv.Itoa(in.ElapsedSeconds)
	} else if callback == "" {
		return "", fmt.Errorf("eid device link: a %s link needs the session's callback", in.LinkType)
	}

	scheme := in.SchemeName
	if scheme == "" {
		scheme = "smart-id"
	}
	unprotected := base + "?deviceLinkType=" + in.LinkType + elapsed +
		"&sessionToken=" + in.SessionToken + "&sessionType=" + in.SessionType +
		"&version=1.0&lang=" + in.Lang
	payload := strings.Join([]string{
		scheme,
		protocol,
		in.Challenge,
		base64.StdEncoding.EncodeToString([]byte(in.RPName)),
		base64.StdEncoding.EncodeToString([]byte(in.BrokeredRPName)),
		in.Interactions,
		callback,
		unprotected,
	}, "|")
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(payload))
	return unprotected + "&authCode=" + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}
