package eidrp

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"
)

// testdata/devicelink_golden.json is eID Mongolia's own vector file
// (gerege-systems/eid-mongolia-sdk test/fixtures, from ca-eidmongolia-mn): SK's
// published Smart-ID examples plus eID's. The iOS, Android and TypeScript
// clients read the same file, so a link that matches it is a link the app
// accepts. It is copied unchanged and must stay that way.
func TestDeviceLinksMatchEIDGoldenVectors(t *testing.T) {
	raw, err := os.ReadFile("testdata/devicelink_golden.json")
	if err != nil {
		t.Fatal(err)
	}
	var file struct {
		Vectors []struct {
			Name  string `json:"name"`
			Input struct {
				DeviceLinkBase      string `json:"deviceLinkBase"`
				SchemeName          string `json:"schemeName"`
				SessionSecret       string `json:"sessionSecret"`
				DeviceLinkType      string `json:"deviceLinkType"`
				ElapsedSeconds      *int   `json:"elapsedSeconds"`
				SessionToken        string `json:"sessionToken"`
				SessionType         string `json:"sessionType"`
				Lang                string `json:"lang"`
				RPChallengeOrDigest string `json:"rpChallengeOrDigest"`
				RelyingPartyName    string `json:"relyingPartyName"`
				BrokeredRPName      string `json:"brokeredRpName"`
				Interactions        string `json:"interactions"`
				InitialCallbackURL  string `json:"initialCallbackUrl"`
			} `json:"input"`
			DeviceLink string `json:"deviceLink"`
		} `json:"vectors"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatal(err)
	}
	if len(file.Vectors) == 0 {
		t.Fatal("no vectors")
	}
	for _, v := range file.Vectors {
		in := v.Input
		elapsed := 0
		if in.ElapsedSeconds != nil {
			elapsed = *in.ElapsedSeconds
		}
		got, err := BuildDeviceLink(DeviceLinkInput{
			Base: in.DeviceLinkBase, LinkType: in.DeviceLinkType, SessionToken: in.SessionToken,
			SessionSecret: in.SessionSecret, SessionType: in.SessionType, Lang: in.Lang,
			ElapsedSeconds: elapsed, Challenge: in.RPChallengeOrDigest, RPName: in.RelyingPartyName,
			BrokeredRPName: in.BrokeredRPName, Interactions: in.Interactions,
			CallbackURL: in.InitialCallbackURL, SchemeName: in.SchemeName,
		})
		if err != nil {
			t.Errorf("%s: %v", v.Name, err)
			continue
		}
		if got != v.DeviceLink {
			t.Errorf("%s:\n got  %s\n want %s", v.Name, got, v.DeviceLink)
		}
	}
}

// A QR link names the seconds since the session started; the app rejects one
// that is stale or from the future, so the count comes from the initiate's
// arrival and never goes below zero.
func TestQRLinkCountsSecondsFromTheInitiate(t *testing.T) {
	start := time.Date(2026, 10, 7, 9, 0, 0, 0, time.UTC)
	d := &DeviceLinkSession{
		Base: "https://ca.eidmongolia.mn/dl", SessionToken: "tok_123", SessionSecret: "c2VjcmV0LXNlY3JldC1zZWNyZXQ=",
		RPChallenge: "Y2hhbGxlbmdl", RPName: "SDY Mongolia", Interactions: "W10=", ReceivedAt: start,
	}
	for at, want := range map[time.Duration]string{
		7*time.Second + 900*time.Millisecond: "elapsedSeconds=7&",
		-3 * time.Second:                     "elapsedSeconds=0&",
	} {
		link, err := d.QRLink(start.Add(at))
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(link, want) || !strings.Contains(link, "deviceLinkType=QR") {
			t.Errorf("at %v: %s", at, link)
		}
	}
	if _, err := d.AppLink(); err == nil {
		t.Error("a session without a callback produced a same-device link")
	}
	d.CallbackURL = "https://e-sdy.mn/auth/eid/callback"
	if link, err := d.AppLink(); err != nil || !strings.Contains(link, "deviceLinkType=Web2App") || strings.Contains(link, "elapsedSeconds") {
		t.Errorf("app link %q, %v", link, err)
	}
}

func TestBuildDeviceLinkRefusesWhatTheAppCannotVerify(t *testing.T) {
	good := DeviceLinkInput{
		Base: "https://ca.eidmongolia.mn/dl", LinkType: LinkQR, SessionToken: "tok", SessionSecret: "c2VjcmV0",
		SessionType: "auth", Lang: "mon", Challenge: "Y2g=", RPName: "SDY", Interactions: "W10=",
	}
	if _, err := BuildDeviceLink(good); err != nil {
		t.Fatalf("good input: %v", err)
	}
	for name, mutate := range map[string]func(*DeviceLinkInput){
		"http base":       func(in *DeviceLinkInput) { in.Base = "http://ca.eidmongolia.mn/dl" },
		"base with query": func(in *DeviceLinkInput) { in.Base = "https://ca.eidmongolia.mn/dl?x=1" },
		"token":           func(in *DeviceLinkInput) { in.SessionToken = "a b" },
		"secret":          func(in *DeviceLinkInput) { in.SessionSecret = "not base64!" },
		"lang":            func(in *DeviceLinkInput) { in.Lang = "mn" },
		"no challenge":    func(in *DeviceLinkInput) { in.Challenge = "" },
		"web2app no cb":   func(in *DeviceLinkInput) { in.LinkType = LinkWeb2App },
		"type":            func(in *DeviceLinkInput) { in.LinkType = "dl" },
	} {
		in := good
		mutate(&in)
		if _, err := BuildDeviceLink(in); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
}
