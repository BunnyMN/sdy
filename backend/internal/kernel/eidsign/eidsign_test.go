package eidsign

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// memoryCache is the session store a test needs: the platform's own is Postgres.
type memoryCache struct {
	mu     sync.Mutex
	values map[string]string
}

func newMemoryCache() *memoryCache { return &memoryCache{values: map[string]string{}} }

func (c *memoryCache) Set(_ context.Context, key string, value any) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.values[key] = value.(string)
	return nil
}

func (c *memoryCache) Get(_ context.Context, key string) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	value, ok := c.values[key]
	if !ok {
		return "", errors.New("not found")
	}
	return value, nil
}

func newTestUsecase(t *testing.T, handler http.HandlerFunc) (*usecase, *memoryCache) {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	store := newMemoryCache()
	built, err := NewUsecase(store, Config{BaseURL: server.URL, RPUUID: "rp", RPName: "Gerege Nexus", APISecret: "rp_sk"})
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	return built.(*usecase), store
}

// A citizen who is not registered as able to act for an organisation gets a
// refusal that says so. Hiding it behind a 500 sends them to support.
func TestSigningForAnOrganisationYouCannotRepresentIsRefused(t *testing.T) {
	u, _ := newTestUsecase(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	})
	_, err := u.InitDigest(context.Background(), "МА74101813", "Иргэн",
		strings.Repeat("ab", 32), "Шилжүүлэг", "")
	if !errors.Is(err, ErrNotRepresentative) {
		t.Fatalf("error is %v, want ErrNotRepresentative", err)
	}
}

// Somebody else's ceremony is answered exactly as an unknown one, so that a
// session id cannot be probed for existence — and so that a transfer cannot be
// signed with another citizen's approval.
func TestAnotherCitizensSessionIsNotFound(t *testing.T) {
	u, _ := newTestUsecase(t, func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/signature/notification/") {
			_, _ = w.Write([]byte(`{"sessionID":"eid-1","vc":{"value":"4722"}}`))
			return
		}
		_, _ = w.Write([]byte(`{"state":"COMPLETE","result":{"endResult":"OK"}}`))
	})
	ctx := context.Background()

	started, err := u.InitDigest(ctx, "МА74101813", "Иргэн", hex.EncodeToString(make([]byte, 32)), "Шилжүүлэг", "")
	if err != nil {
		t.Fatalf("initiate: %v", err)
	}

	for name, call := range map[string]func() error{
		"poll":     func() error { _, err := u.Poll(ctx, "АА00112233", started.SessionID); return err },
		"verify":   func() error { _, err := u.VerifiedDigest(ctx, "АА00112233", started.SessionID); return err },
		"download": func() error { _, err := u.Download(ctx, "АА00112233", started.SessionID); return err },
	} {
		if err := call(); !errors.Is(err, ErrSessionNotFound) {
			t.Errorf("%s answered %v, want ErrSessionNotFound", name, err)
		}
	}

	// And the owner does reach it.
	if state, err := u.Poll(ctx, "МА74101813", started.SessionID); err != nil || state != "completed" {
		t.Fatalf("the owner got %q, %v", state, err)
	}
}

func TestTheCeremonysOutcomeIsReadFromTheEndResult(t *testing.T) {
	for endResult, want := range map[string]string{
		"OK":           "completed",
		"USER_REFUSED": "rejected",
		"TIMEOUT":      "failed",
	} {
		u, _ := newTestUsecase(t, func(w http.ResponseWriter, r *http.Request) {
			if strings.Contains(r.URL.Path, "/signature/notification/") {
				_, _ = w.Write([]byte(`{"sessionID":"eid-1","vc":{"value":"4722"}}`))
				return
			}
			_, _ = w.Write([]byte(`{"state":"COMPLETE","result":{"endResult":"` + endResult + `"}}`))
		})
		ctx := context.Background()
		started, err := u.InitDigest(ctx, "МА74101813", "Иргэн", hex.EncodeToString(make([]byte, 32)), "Шилжүүлэг", "")
		if err != nil {
			t.Fatalf("%s: initiate: %v", endResult, err)
		}
		state, err := u.Poll(ctx, "МА74101813", started.SessionID)
		if err != nil {
			t.Fatalf("%s: poll: %v", endResult, err)
		}
		if state != want {
			t.Errorf("endResult %s became %q, want %q", endResult, state, want)
		}
	}
}

func TestOnlyASHA256DigestIsSigned(t *testing.T) {
	u, _ := newTestUsecase(t, func(w http.ResponseWriter, _ *http.Request) {
		t.Error("a malformed digest reached eID")
	})
	for _, bad := range []string{"", "not-hex", hex.EncodeToString(make([]byte, 20))} {
		if _, err := u.InitDigest(context.Background(), "МА74101813", "Иргэн", bad, "Шилжүүлэг", ""); !errors.Is(err, ErrBadDigest) {
			t.Errorf("digest %q answered %v, want ErrBadDigest", bad, err)
		}
	}
}

// The text is Cyrillic and the field is sixty *characters*. Cutting at sixty
// bytes lands mid-letter, and the eID app refuses what it cannot decode.
func TestTheApprovalTextIsCutByCharactersNotBytes(t *testing.T) {
	long := strings.Repeat("ш", 100)
	got := []rune(clampDisplayText(long))
	if len(got) != 60 {
		t.Fatalf("kept %d characters, want 60", len(got))
	}
	if clampDisplayText("  ") == "" {
		t.Error("an empty text should fall back to something the citizen can read")
	}
}

// A client that sends a whole path as the file name must not put it on the
// public verification page.
func TestTheFileNameIsStrippedOfItsPath(t *testing.T) {
	if got := clampFileName(`C:\Users\bat\Documents\гэрээ.pdf`); got != "гэрээ.pdf" {
		t.Errorf("clampFileName = %q", got)
	}
	if got := clampFileName("/tmp/гэрээ.pdf"); got != "гэрээ.pdf" {
		t.Errorf("clampFileName = %q", got)
	}
	if got := clampFileName("гэ\x00рээ\t.pdf"); got != "гэрээ.pdf" {
		t.Errorf("control characters survived: %q", got)
	}
	if got := []rune(clampFileName(strings.Repeat("а", 200) + ".pdf")); len(got) != maxFileNameRunes {
		t.Errorf("kept %d characters, want %d", len(got), maxFileNameRunes)
	}
}

// The signature and stamp images come from URLs a user typed. Fetching one must
// not become a way to read this deployment's own network.
func TestUserSuppliedImageURLsCannotReachTheInternalNetwork(t *testing.T) {
	for _, ip := range []string{"127.0.0.1", "10.1.0.4", "169.254.169.254", "::1", "0.0.0.0"} {
		if !isDisallowedFetchIP(net.ParseIP(ip)) {
			t.Errorf("%s would be fetched", ip)
		}
	}
	if isDisallowedFetchIP(net.ParseIP("142.250.74.110")) {
		t.Error("a public address was refused")
	}

	// And a scheme other than https is refused before the client is asked.
	u, _ := newTestUsecase(t, func(http.ResponseWriter, *http.Request) {
		t.Error("a non-https image URL was fetched")
	})
	for _, bad := range []string{"http://example.mn/stamp.png", "file:///etc/passwd", "not a url"} {
		if image := u.fetchAssetImage(context.Background(), bad); image != nil {
			t.Errorf("%q returned an image", bad)
		}
	}
}

// A document can only be downloaded once the citizen has actually approved it.
func TestADocumentIsNotDownloadableBeforeItIsSigned(t *testing.T) {
	u, _ := newTestUsecase(t, func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/signature/notification/") {
			_, _ = w.Write([]byte(`{"sessionID":"eid-1","vc":{"value":"4722"}}`))
			return
		}
		_, _ = w.Write([]byte(`{"state":"RUNNING"}`))
	})
	ctx := context.Background()
	started, err := u.InitDigest(ctx, "МА74101813", "Иргэн", hex.EncodeToString(make([]byte, 32)), "Шилжүүлэг", "")
	if err != nil {
		t.Fatalf("initiate: %v", err)
	}
	if _, err := u.Download(ctx, "МА74101813", started.SessionID); !errors.Is(err, ErrNotCompleted) {
		t.Fatalf("download answered %v, want ErrNotCompleted", err)
	}
	if _, err := u.VerifiedDigest(ctx, "МА74101813", started.SessionID); !errors.Is(err, ErrNotCompleted) {
		t.Fatalf("verify answered %v, want ErrNotCompleted", err)
	}
}

// Production without a permanent Document-Signer is refused at construction of
// the signer, not at the moment somebody downloads: an ephemeral key signs
// documents nobody can verify afterwards.
func TestProductionRefusesAnEphemeralDocumentSigner(t *testing.T) {
	if _, err := resolveSigner(Config{IsProduction: true}); err == nil {
		t.Fatal("production accepted a deployment with no Document-Signer")
	}
	if _, err := resolveSigner(Config{}); err != nil {
		t.Fatalf("development should fall back to a self-signed key: %v", err)
	}
}

// The signature initiate in eID's RP-API v3 shape: a raw digest signature
// with its parameters nested and the interactions as base64 JSON. The flat
// ACSP_V2/digest/hashType body eID accepted before 2026-09-28 is refused now.
func TestDigestSignatureUsesTheV3Body(t *testing.T) {
	var body map[string]any
	var path string
	u, _ := newTestUsecase(t, func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		_ = json.NewDecoder(r.Body).Decode(&body)
		_, _ = w.Write([]byte(`{"sessionID":"s-1","vc":{"type":"numeric4","value":"1234"}}`))
	})
	if _, err := u.InitDigest(context.Background(), "МА74101813", "Иргэн", strings.Repeat("ab", 32), "Санал: Зөвшөөрөв", "Санал"); err != nil {
		t.Fatal(err)
	}
	if path != "/signature/notification/etsi/PNOMN-МА74101813" {
		t.Errorf("signed at %s", path)
	}
	params, _ := body["signatureProtocolParameters"].(map[string]any)
	digest, _ := params["digest"].(string)
	raw, _ := base64.StdEncoding.DecodeString(digest)
	if body["signatureProtocol"] != "RAW_DIGEST_SIGNATURE" || len(raw) != 32 || params["signatureAlgorithm"] != "rsassa-pss" {
		t.Fatalf("body %v", body)
	}
	if _, old := body["digest"]; old {
		t.Error("the pre-v3 top-level digest was sent")
	}
	encoded, _ := body["interactions"].(string)
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || !strings.Contains(string(decoded), `"displayText60":"Санал: Зөвшөөрөв"`) {
		t.Errorf("interactions %q (%v)", decoded, err)
	}
}

// A same-device signature: the device-link endpoint, the callback in the body,
// and a Web2App link that opens the eID app — signed with the session secret,
// which itself never leaves this package.
func TestDigestSignatureOnTheDeviceOpensTheApp(t *testing.T) {
	var body map[string]any
	var path string
	u, _ := newTestUsecase(t, func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		_ = json.NewDecoder(r.Body).Decode(&body)
		_, _ = w.Write([]byte(`{"sessionID":"s-2","sessionToken":"tok_abc","sessionSecret":"c2VjcmV0LXNlY3JldA==","deviceLinkBase":"https://ca.eidmongolia.mn/dl","vc":{"type":"alphaNumeric5","value":"48213"}}`))
	})
	callback := "https://e-sdy.mn/auth/eid/callback?return=%2Fmodule%2Fevents%2Fe1"
	started, err := u.InitDigestOnDevice(context.Background(), "МА74101813", "Иргэн", strings.Repeat("ab", 32), "Санал", "Санал", callback)
	if err != nil {
		t.Fatal(err)
	}
	if path != "/signature/device-link/etsi/PNOMN-МА74101813" || body["initialCallbackUrl"] != callback {
		t.Fatalf("asked %s with %v", path, body["initialCallbackUrl"])
	}
	if started.VerificationCode != "48213" || !strings.HasPrefix(started.AppLink, "https://ca.eidmongolia.mn/dl?deviceLinkType=Web2App&sessionToken=tok_abc&sessionType=sign&") ||
		!strings.Contains(started.AppLink, "&authCode=") || strings.Contains(started.AppLink, "c2VjcmV0") {
		t.Fatalf("started %+v", started)
	}
	if _, err := u.InitDigestOnDevice(context.Background(), "МА74101813", "Иргэн", strings.Repeat("ab", 32), "Санал", "Санал", ""); err == nil {
		t.Fatal("a device-link signature started without a callback")
	}
}
