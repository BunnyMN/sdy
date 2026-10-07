package eid

import (
	"context"
	"strings"
	"testing"
	"time"

	coreeid "github.com/gerege-systems/open-gerege-nexus/backend/internal/kernel/eidrp"
)

type qrOnlyClient struct {
	coreeid.Client
	callback string
}

func (c *qrOnlyClient) QRInitiate(_ context.Context, _, callbackURL, _ string) (*coreeid.StartResult, error) {
	c.callback = callbackURL
	return &coreeid.StartResult{SessionID: "s-qr", VerificationCode: "48213", DeviceLink: &coreeid.DeviceLinkSession{
		Base: "https://ca.eidmongolia.mn/dl", SessionToken: "tok", SessionSecret: "c2VjcmV0LXNlY3JldA==",
		RPChallenge: "Y2hhbGxlbmdl", RPName: "SDY Mongolia", Interactions: "W10=", CallbackURL: callbackURL,
		ReceivedAt: time.Now(),
	}}, nil
}

// The browser gets ready-made v3 links, a second apart, and never the secret
// that signs them; a phone also gets the same-device link.
func TestDeviceLinkStartHandsOutLinksNotTheSecret(t *testing.T) {
	svc := &EIDService{rpClient: &qrOnlyClient{}, links: map[string]*coreeid.DeviceLinkSession{}}

	started, err := svc.StartDeviceLink(context.Background(), "https://e-sdy.mn/auth/eid/callback")
	if err != nil {
		t.Fatal(err)
	}
	if len(started.QRLinks) != QRBatch || started.DeviceLinkURL != started.QRLinks[0] {
		t.Fatalf("%d links, first %q", len(started.QRLinks), started.DeviceLinkURL)
	}
	for i, link := range []string{started.QRLinks[0], started.QRLinks[5]} {
		want := []string{"elapsedSeconds=0&", "elapsedSeconds=5&"}[i]
		if !strings.HasPrefix(link, "https://ca.eidmongolia.mn/dl?deviceLinkType=QR&") || !strings.Contains(link, want) {
			t.Errorf("link %d: %s", i, link)
		}
	}
	if !strings.Contains(started.AppLink, "deviceLinkType=Web2App") {
		t.Errorf("app link %q", started.AppLink)
	}
	for _, link := range append(started.QRLinks, started.AppLink) {
		if strings.Contains(link, "c2VjcmV0LXNlY3JldA") {
			t.Fatal("the session secret reached a link")
		}
	}

	more, ok, err := svc.QRLinks("s-qr")
	if err != nil || !ok || len(more) != QRBatch {
		t.Fatalf("refill: %d links, ok=%v, err=%v", len(more), ok, err)
	}
	if _, ok, _ := svc.QRLinks("someone-else"); ok {
		t.Error("links were made for a session this server did not start")
	}
}

// Without a callback (a desktop showing a QR) there is no same-device link.
func TestDeviceLinkStartWithoutCallbackHasNoAppLink(t *testing.T) {
	svc := &EIDService{rpClient: &qrOnlyClient{}, links: map[string]*coreeid.DeviceLinkSession{}}
	started, err := svc.StartDeviceLink(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	if started.AppLink != "" || len(started.QRLinks) == 0 {
		t.Errorf("%+v", started)
	}
}
