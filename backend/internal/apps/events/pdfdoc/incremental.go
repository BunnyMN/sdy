package pdfdoc

import (
	"bytes"
	"errors"
	"regexp"
)

// What a signed revision can be wrong about.
var (
	// ErrNotIncremental is a "signed" PDF that does not begin with the exact
	// bytes that were signed: it was rewritten, which invalidates every
	// signature already in it.
	ErrNotIncremental = errors.New("pdfdoc: the signed PDF is not an incremental revision of the document")
	// ErrNoNewSignature is an appended revision that carries no signature.
	ErrNoNewSignature = errors.New("pdfdoc: the appended revision carries no signature")
	// ErrLocked is a revision whose signature forbids any further change
	// (a certification signature with DocMDP permission 1): a later signer's
	// signature would break it.
	ErrLocked = errors.New("pdfdoc: the signature locks the document against further signatures")
)

var (
	byteRange = regexp.MustCompile(`/ByteRange\s*\[`)
	docMDP    = regexp.MustCompile(`/DocMDP`)
	noChanges = regexp.MustCompile(`/P\s+1[^0-9]`)
)

// CheckRevision confirms that next is previous with one signed incremental
// revision appended: previous is its exact prefix, the appended part holds a
// signature dictionary and ends the file, and — when more signers follow —
// the new signature does not lock the document.
//
// This is what makes a chain of signers safe. A signature covers the bytes
// before it; a later revision that only appends leaves those bytes, and so the
// earlier signatures, intact. A rewritten file would not.
func CheckRevision(previous, next []byte, moreSigners bool) error {
	if len(next) <= len(previous) || !bytes.HasPrefix(next, previous) {
		return ErrNotIncremental
	}
	appended := next[len(previous):]
	if !byteRange.Match(appended) || !bytes.Contains(appended, []byte("%%EOF")) {
		return ErrNoNewSignature
	}
	if moreSigners && docMDP.Match(appended) && noChanges.Match(appended) {
		return ErrLocked
	}
	return nil
}

// SignatureCount counts the signature dictionaries in a PDF, as /ByteRange
// arrays. A heuristic for display and tests, not a verification.
func SignatureCount(pdf []byte) int { return len(byteRange.FindAllIndex(pdf, -1)) }
