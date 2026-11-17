package pdfdoc

import (
	"bytes"
	"errors"
	"fmt"
	"regexp"
	"strconv"
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

// appendUpdate adds an incremental update that (re)defines one object, the
// way any PDF editor appends a change.
func appendUpdate(t *testing.T, prev []byte, objNum int, object string) []byte {
	t.Helper()
	startxref := regexp.MustCompile(`startxref\s+(\d+)\s+%%EOF\s*$`).FindSubmatch(prev)
	size := regexp.MustCompile(`/Size (\d+)`).FindAllSubmatch(prev, -1)
	root := regexp.MustCompile(`/Root (\d+) 0 R`).FindAllSubmatch(prev, -1)
	if startxref == nil || size == nil || root == nil {
		t.Fatal("cannot find the trailer to update")
	}
	var b bytes.Buffer
	b.Write(prev)
	off := b.Len()
	fmt.Fprintf(&b, "%d 0 obj\n%s\nendobj\n", objNum, object)
	xref := b.Len()
	fmt.Fprintf(&b, "xref\n0 1\n0000000000 65535 f \n%d 1\n%010d 00000 n \ntrailer\n<< /Size %s /Root %s 0 R /Prev %s >>\nstartxref\n%d\n%%%%EOF\n",
		objNum, off, size[len(size)-1][1], root[len(root)-1][1], startxref[1], xref)
	return b.Bytes()
}

// A revision that signs and also replaces what a page shows is refused,
// though its signature is valid and its bytes are an append.
func TestCheckRevisionRefusesAChangedPage(t *testing.T) {
	original := build(t)
	contents := regexp.MustCompile(`/Contents (\d+) 0 R`).FindSubmatch(original)
	obj, _ := strconv.Atoi(string(contents[1]))
	forged := appendUpdate(t, original, obj, "<< /Length 44 >>\nstream\nBT /F1 30 Tf 100 700 Td <0024> Tj ET 0 0 m\nendstream")
	signed := appendSignature(t, forged, "Тэргүүн", false)
	if err := CheckRevision(original, signed, false); !errors.Is(err, ErrContentChanged) {
		t.Fatalf("a changed page: %v, want ErrContentChanged", err)
	}
	// And a catalogue that gains an action to run on opening.
	opened := appendUpdate(t, original, 1, "<< /Type /Catalog /Pages 2 0 R /OpenAction << /S /URI /URI (https://example.com) >> >>")
	if err := CheckRevision(original, appendSignature(t, opened, "Тэргүүн", false), false); !errors.Is(err, ErrContentChanged) {
		t.Fatalf("a catalogue with an OpenAction: %v, want ErrContentChanged", err)
	}
}

func TestCheckRevisionRefusesTwoSignaturesOrTrailingData(t *testing.T) {
	original := build(t)
	twice := appendSignature(t, appendSignature(t, original, "Нэг", false), "Хоёр", false)
	if err := CheckRevision(original, twice, true); !errors.Is(err, ErrNoNewSignature) {
		t.Fatalf("two signatures in one revision: %v, want ErrNoNewSignature", err)
	}
	signed := appendSignature(t, original, "Нэг", false)
	trailing := append(append([]byte(nil), signed...), []byte("garbage after the end")...)
	if err := CheckRevision(original, trailing, false); !errors.Is(err, ErrNotIncremental) {
		t.Fatalf("data after %%%%EOF: %v, want ErrNotIncremental", err)
	}
	// Even a line end after the signature is outside what was signed.
	if err := CheckRevision(original, append(append([]byte(nil), signed...), '\n'), false); !errors.Is(err, ErrNoNewSignature) {
		t.Fatalf("an unsigned line end: %v, want ErrNoNewSignature", err)
	}
}
