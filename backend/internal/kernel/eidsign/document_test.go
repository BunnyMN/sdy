package eidsign

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"
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
			_, _ = fmt.Fprintf(w, `{"state":"COMPLETE","result":{"endResult":"OK"},"cert":{"value":%q}}`, testCertificate(t))
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
	// The certificate eID reported is carried through, issuer included.
	if signed.SignerName != "БАТ ДОРЖ" || signed.SignerSerial != "PNOMN-МА74101813" || signed.SignerIssuer != "eID Mongolia Test CA" {
		t.Fatalf("signer from the certificate: %q %q %q", signed.SignerName, signed.SignerSerial, signed.SignerIssuer)
	}
}

// testCertificate is a self-signed certificate naming a signer and an issuer, base64 DER.
func testCertificate(t *testing.T) string {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	template := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "БАТ ДОРЖ", SerialNumber: "PNOMN-МА74101813"},
		Issuer:       pkix.Name{CommonName: "eID Mongolia Test CA"},
		NotBefore:    time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour),
	}
	parent := &x509.Certificate{SerialNumber: big.NewInt(2), Subject: pkix.Name{CommonName: "eID Mongolia Test CA"}}
	der, err := x509.CreateCertificate(rand.Reader, template, parent, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString(der)
}
