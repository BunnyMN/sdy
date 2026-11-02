package devices

import (
	"encoding/base64"
	"testing"
)

func TestPushTokenEncryptionDoesNotPersistPlaintext(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i + 1)
	}
	t.Setenv("PUSH_TOKEN_ENCRYPTION_KEY", base64.StdEncoding.EncodeToString(key))
	got, err := encryptPushToken("fcm-secret-token-value")
	if err != nil {
		t.Fatal(err)
	}
	if got == "fcm-secret-token-value" {
		t.Fatal("token was not encrypted")
	}
	if _, err = base64.StdEncoding.DecodeString(got); err != nil {
		t.Fatal("ciphertext is not transport-safe base64")
	}
}
func TestPushTokenEncryptionRequiresKey(t *testing.T) {
	t.Setenv("PUSH_TOKEN_ENCRYPTION_KEY", "")
	if _, err := encryptPushToken("token"); err == nil {
		t.Fatal("missing encryption key accepted")
	}
}

func TestPushTokenRoundTrips(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i + 7)
	}
	t.Setenv("PUSH_TOKEN_ENCRYPTION_KEY", base64.StdEncoding.EncodeToString(key))
	sealed, err := encryptPushToken("apns-device-token-0123456789abcdef")
	if err != nil {
		t.Fatal(err)
	}
	opened, err := DecryptPushToken(sealed)
	if err != nil || opened != "apns-device-token-0123456789abcdef" {
		t.Fatalf("opened %q, %v", opened, err)
	}
	if _, err := DecryptPushToken("bm90IGEgdG9rZW4="); err == nil {
		t.Fatal("garbage decrypted")
	}
}
