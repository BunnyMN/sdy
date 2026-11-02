package push

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"math/big"
	"strings"
	"testing"
	"time"
)

func testKey(t *testing.T) (*ecdsa.PrivateKey, string) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	der, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	return key, string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}))
}

func TestTheKeyIsReadAsPEMOrBase64(t *testing.T) {
	_, text := testKey(t)
	if _, err := ParseKey(text); err != nil {
		t.Fatalf("PEM: %v", err)
	}
	if _, err := ParseKey(base64.StdEncoding.EncodeToString([]byte(text))); err != nil {
		t.Fatalf("base64: %v", err)
	}
	if _, err := ParseKey("not a key"); err == nil {
		t.Fatal("garbage accepted as a key")
	}
}

func TestTheProviderTokenVerifies(t *testing.T) {
	key, _ := testKey(t)
	token, err := ProviderToken(Config{Key: key, KeyID: "ABC123DEFG", TeamID: "T65Z28HF29"}, time.Unix(1_800_000_000, 0))
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatalf("token has %d parts", len(parts))
	}
	header, _ := base64.RawURLEncoding.DecodeString(parts[0])
	claims, _ := base64.RawURLEncoding.DecodeString(parts[1])
	var h map[string]string
	var c map[string]any
	_ = json.Unmarshal(header, &h)
	_ = json.Unmarshal(claims, &c)
	if h["alg"] != "ES256" || h["kid"] != "ABC123DEFG" || c["iss"] != "T65Z28HF29" || c["iat"] != float64(1_800_000_000) {
		t.Fatalf("header %v claims %v", h, c)
	}
	sig, _ := base64.RawURLEncoding.DecodeString(parts[2])
	if len(sig) != 64 {
		t.Fatalf("signature is %d bytes", len(sig))
	}
	digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if !ecdsa.Verify(&key.PublicKey, digest[:], new(big.Int).SetBytes(sig[:32]), new(big.Int).SetBytes(sig[32:])) {
		t.Fatal("signature does not verify")
	}
}

func TestThePayloadCarriesTheScreen(t *testing.T) {
	raw, err := Payload("n-1", "Хяналтын хороо: 5 оноо хасагдлаа", "Хурал тасалдуулсан", "/member/participation", 3)
	if err != nil {
		t.Fatal(err)
	}
	var p struct {
		Aps struct {
			Alert struct{ Title, Body string } `json:"alert"`
			Badge int                          `json:"badge"`
		} `json:"aps"`
		Path string `json:"path"`
		ID   string `json:"notification_id"`
	}
	if err := json.Unmarshal(raw, &p); err != nil {
		t.Fatal(err)
	}
	if p.Aps.Alert.Title == "" || p.Aps.Badge != 3 || p.Path != "/member/participation" || p.ID != "n-1" {
		t.Fatalf("payload %s", raw)
	}
}

func TestPushIsOffWithoutAKey(t *testing.T) {
	t.Setenv("APNS_KEY", "")
	t.Setenv("APNS_KEY_ID", "")
	t.Setenv("APNS_TEAM_ID", "")
	if _, ok, err := ConfigFromEnv(); ok || err != nil {
		t.Fatalf("ok=%v err=%v without a key", ok, err)
	}
}
