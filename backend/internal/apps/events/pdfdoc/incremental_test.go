package pdfdoc

import (
	"bytes"
	"errors"
	"testing"

	"github.com/gerege-systems/open-gerege-nexus/backend/internal/apps/events/pdfdoc/pdfdoctest"
)

func appendSignature(t *testing.T, in []byte, name string, certify bool) []byte {
	t.Helper()
	out, err := pdfdoctest.AppendSignature(in, name, certify)
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func verifyAll(t *testing.T, data []byte) []pdfdoctest.Verified {
	t.Helper()
	out, err := pdfdoctest.Verify(data)
	if err != nil {
		t.Fatal(err)
	}
	return out
}

// Two people sign one after the other, the second over the first's output.
// Both signatures must still verify afterwards: this is the whole premise of a
// document every board member signs.
func TestTwoSequentialSignaturesStayValid(t *testing.T) {
	original := build(t)
	first := appendSignature(t, original, "Тэргүүн", false)
	if err := CheckRevision(original, first, true); err != nil {
		t.Fatal(err)
	}
	second := appendSignature(t, first, "Нарийн бичиг", false)
	if err := CheckRevision(first, second, false); err != nil {
		t.Fatal(err)
	}
	signers := verifyAll(t, second)
	if len(signers) != 2 {
		t.Fatalf("signatures = %d, want 2", len(signers))
	}
	for _, s := range signers {
		if !s.Valid {
			t.Fatalf("signature of %q is no longer valid after the next one was appended", s.Name)
		}
	}
	// The check is real: one changed byte in the first revision breaks both.
	tampered := append([]byte(nil), second...)
	at := bytes.Index(tampered, []byte("/Producer"))
	tampered[at+2] ^= 0x01
	for _, s := range verifyAll(t, tampered) {
		if s.Valid {
			t.Fatalf("signature of %q survived a change to the signed bytes", s.Name)
		}
	}
	if SignatureCount(second) != 2 {
		t.Fatalf("SignatureCount = %d", SignatureCount(second))
	}
}

func TestCheckRevisionRefusesARewrite(t *testing.T) {
	original := build(t)
	signed := appendSignature(t, original, "Тэргүүн", false)

	// The same signature over a file that was regenerated, not appended to.
	rewritten := append([]byte("%PDF-1.7\n% rewritten\n"), signed[9:]...)
	if err := CheckRevision(original, rewritten, false); !errors.Is(err, ErrNotIncremental) {
		t.Fatalf("rewrite: %v, want ErrNotIncremental", err)
	}
	if err := CheckRevision(original, original, false); !errors.Is(err, ErrNotIncremental) {
		t.Fatalf("unchanged: %v, want ErrNotIncremental", err)
	}
	padded := append(append([]byte(nil), original...), []byte("\n% nothing\n%%EOF\n")...)
	if err := CheckRevision(original, padded, false); !errors.Is(err, ErrNoNewSignature) {
		t.Fatalf("no signature: %v, want ErrNoNewSignature", err)
	}
	certified := appendSignature(t, original, "Сервер", true)
	if err := CheckRevision(original, certified, true); !errors.Is(err, ErrLocked) {
		t.Fatalf("certification P=1 with signers to come: %v, want ErrLocked", err)
	}
	if err := CheckRevision(original, certified, false); err != nil {
		t.Fatalf("the last signer may certify: %v", err)
	}
}
