package eidsign

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
)

// A rail-only document is signed exactly as given, on the phone when a
// callback is named, and comes back only as eID stamped it: when the stamp
// endpoint fails there is no fallback to the server's own certification.
func TestRailOnlyDocumentNeverFallsBack(t *testing.T) {
	var mu sync.Mutex
	var startPath, digest string
	stampOK := false
	u, _ := newTestUsecase(t, func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		switch {
		case strings.Contains(r.URL.Path, "/signature/"+"device-link/"), strings.Contains(r.URL.Path, "/signature/notification/"):
			startPath = r.URL.Path
			var body struct {
				Params struct {
					Digest string `json:"digest"`
				} `json:"signatureProtocolParameters"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			digest = body.Params.Digest
			_, _ = w.Write([]byte(`{"sessionID":"eid-1","vc":{"value":"4722"},"sessionToken":"tok","sessionSecret":"c2VjcmV0","deviceLinkBase":"https://eid.example/device"}`))
		case strings.Contains(r.URL.Path, "/signature/stamp/"):
			in, _ := io.ReadAll(r.Body)
			if !stampOK {
				w.WriteHeader(http.StatusBadGateway)
				_, _ = w.Write([]byte("stamp down"))
				return
			}
			_, _ = w.Write(append(in, []byte("\n% stamped\n%%EOF\n")...))
		default:
			_, _ = w.Write([]byte(`{"state":"COMPLETE","result":{"endResult":"OK"}}`))
		}
	})
	ctx := context.Background()
	doc := []byte("%PDF-1.7\n% the document\n%%EOF\n")
	started, err := u.InitDocument(ctx, DocumentInit{
		RegNo: "МА74101813", FullName: "Иргэн", FileName: "protocol.pdf", PDF: doc,
		DisplayText: "Протокол", CallbackURL: "https://e-sdy.mn/auth/eid/callback", RailOnly: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(doc)
	if digest != base64.StdEncoding.EncodeToString(sum[:]) {
		t.Fatal("the digest sent is not the SHA-256 of the document as given")
	}
	if !strings.Contains(startPath, "device-link") || started.AppLink == "" {
		t.Fatalf("a callback must open a device-link session with an app link: %q %q", startPath, started.AppLink)
	}
	if state, err := u.Poll(ctx, "МА74101813", started.SessionID); err != nil || state != "completed" {
		t.Fatalf("poll: %q %v", state, err)
	}
	if _, err := u.Download(ctx, "МА74101813", started.SessionID); !errors.Is(err, ErrStampUnavailable) {
		t.Fatalf("download with the stamp down: %v, want ErrStampUnavailable", err)
	}
	mu.Lock()
	stampOK = true
	mu.Unlock()
	signed, err := u.Download(ctx, "МА74101813", started.SessionID)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.HasPrefix(signed.PDF, doc) || !bytes.Contains(signed.PDF, []byte("stamped")) {
		t.Fatal("the stamped document is not what eID returned")
	}
}
