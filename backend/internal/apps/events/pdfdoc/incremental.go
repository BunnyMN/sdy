package pdfdoc

import (
	"bytes"
	"crypto/sha256"
	"errors"
	"fmt"
	"hash"
	"io"
	"regexp"
	"sort"
	"strconv"

	"github.com/digitorus/pdf"
)

// What a signed revision can be wrong about.
var (
	// ErrNotIncremental is a "signed" PDF that does not begin with the exact
	// bytes that were signed: it was rewritten, which invalidates every
	// signature already in it.
	ErrNotIncremental = errors.New("pdfdoc: the signed PDF is not an incremental revision of the document")
	// ErrNoNewSignature is an appended revision that does not carry exactly
	// one new signature covering the whole new file.
	ErrNoNewSignature = errors.New("pdfdoc: the appended revision does not carry exactly one signature over the whole file")
	// ErrContentChanged is an appended revision that changes what the document
	// shows or does — its pages, their content, fonts or images, its non-
	// signature annotations or its catalogue — rather than only adding a
	// signature.
	ErrContentChanged = errors.New("pdfdoc: the appended revision changes the document, not only its signatures")
	// ErrLocked is a revision whose signature forbids any further change
	// (a certification signature with DocMDP permission 1): a later signer's
	// signature would break it.
	ErrLocked = errors.New("pdfdoc: the signature locks the document against further signatures")
)

var (
	byteRange = regexp.MustCompile(`/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]`)
	docMDP    = regexp.MustCompile(`/DocMDP`)
	noChanges = regexp.MustCompile(`/P\s+1[^0-9]`)
	eofTail   = regexp.MustCompile(`%%EOF[\r\n\t ]*$`)
)

// catalogKeysASignatureMayAdd are the document catalogue's entries a
// signature revision may add or change: the form holding the signature field,
// a certification's permissions, long-term validation data (DSS/VRI), the
// version, and XMP metadata (which a signer may update and no reader shows as
// page content).
var catalogKeysASignatureMayAdd = map[string]bool{
	"AcroForm": true, "Perms": true, "DSS": true, "Extensions": true, "Version": true, "Metadata": true,
}

// CheckRevision confirms that next is previous with exactly one signature
// appended and nothing else changed:
//
//   - previous is next's exact byte prefix, and nothing follows next's final
//     %%EOF but line ends;
//   - the appended part holds exactly one signature dictionary, and its
//     /ByteRange covers all of next except the /Contents hole, which lies in
//     the appended part;
//   - the document as a reader sees it is unchanged: the same pages with the
//     same content streams, resources (fonts, images, forms) and boxes, the
//     same annotations apart from added signature widgets, and the same
//     catalogue apart from the entries a signature needs;
//   - when more signers follow, the new signature does not lock the document.
//
// A signature covers the bytes before it; a revision that only appends a
// signature leaves those bytes, and so the earlier signatures and what they
// showed, intact.
func CheckRevision(previous, next []byte, moreSigners bool) error {
	if len(next) <= len(previous) || !bytes.HasPrefix(next, previous) {
		return ErrNotIncremental
	}
	if !eofTail.Match(next) {
		return fmt.Errorf("%w: data after the final %%%%EOF", ErrNotIncremental)
	}
	appended := next[len(previous):]
	ranges := byteRange.FindAllSubmatchIndex(appended, -1)
	if len(ranges) != 1 {
		return fmt.Errorf("%w: %d signature dictionaries appended", ErrNoNewSignature, len(ranges))
	}
	var r [4]int
	m := ranges[0]
	for i := range r {
		v, err := strconv.Atoi(string(appended[m[2+2*i]:m[3+2*i]]))
		if err != nil {
			return ErrNoNewSignature
		}
		r[i] = v
	}
	if r[0] != 0 || r[1] <= len(previous) || r[2] <= r[1] || r[2]+r[3] != len(next) ||
		next[r[1]] != '<' || next[r[2]-1] != '>' {
		return fmt.Errorf("%w: the byte range %v does not cover the new file", ErrNoNewSignature, r)
	}
	for _, c := range next[r[1]+1 : r[2]-1] {
		if !isHex(c) {
			return fmt.Errorf("%w: the signature hole holds more than the signature", ErrNoNewSignature)
		}
	}
	if err := sameDocument(previous, next); err != nil {
		return err
	}
	if moreSigners && docMDP.Match(appended) && noChanges.Match(appended) {
		return ErrLocked
	}
	return nil
}

func isHex(c byte) bool {
	return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
}

// SignatureCount counts the signature dictionaries in a PDF, as /ByteRange
// arrays. A heuristic for display and tests, not a verification.
func SignatureCount(pdf []byte) int { return len(byteRange.FindAllIndex(pdf, -1)) }

// sameDocument reads both revisions as a reader would and compares what they
// show. Object numbers, object streams and cross-reference formats do not
// matter; only the resolved content does.
func sameDocument(previous, next []byte) (err error) {
	defer func() {
		// The reader panics on some malformed input; malformed is a refusal.
		if p := recover(); p != nil {
			err = fmt.Errorf("%w: unreadable revision (%v)", ErrContentChanged, p)
		}
	}()
	before, err := readDocument(previous)
	if err != nil {
		return err
	}
	after, err := readDocument(next)
	if err != nil {
		return err
	}
	if len(before.pages) != len(after.pages) {
		return fmt.Errorf("%w: %d pages became %d", ErrContentChanged, len(before.pages), len(after.pages))
	}
	for i := range before.pages {
		b, a := before.pages[i], after.pages[i]
		if b.content != a.content {
			return fmt.Errorf("%w: page %d's content or resources changed", ErrContentChanged, i+1)
		}
		if !sameAnnotations(b, a) {
			return fmt.Errorf("%w: page %d gained or changed an annotation that is not a signature", ErrContentChanged, i+1)
		}
	}
	for key, sum := range before.catalog {
		if !catalogKeysASignatureMayAdd[key] && after.catalog[key] != sum {
			return fmt.Errorf("%w: the catalogue entry /%s changed", ErrContentChanged, key)
		}
	}
	for key := range after.catalog {
		if _, had := before.catalog[key]; !had && !catalogKeysASignatureMayAdd[key] {
			return fmt.Errorf("%w: the catalogue gained /%s", ErrContentChanged, key)
		}
	}
	return nil
}

type pageView struct {
	content string
	// annots are the fingerprints of the annotations that are not signature
	// widgets; widgets counts the signature widgets.
	annots  []string
	widgets int
}

type documentView struct {
	pages   []pageView
	catalog map[string]string
}

func readDocument(data []byte) (documentView, error) {
	var view documentView
	r, err := pdf.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return view, fmt.Errorf("%w: %w", ErrContentChanged, err)
	}
	root := r.Trailer().Key("Root")
	view.catalog = map[string]string{}
	for _, key := range root.Keys() {
		if key == "Pages" {
			continue // compared page by page below
		}
		view.catalog[key] = fingerprint(root.Key(key), 0)
	}
	for i := 1; i <= r.NumPage(); i++ {
		page := r.Page(i)
		h := sha256.New()
		for _, key := range []string{"Contents", "MediaBox", "CropBox", "Rotate", "UserUnit"} {
			_, _ = io.WriteString(h, key+"="+fingerprint(page.V.Key(key), 0)+";")
		}
		_, _ = io.WriteString(h, "Resources="+fingerprint(page.Resources(), 0))
		pv := pageView{content: string(h.Sum(nil))}
		annots := page.V.Key("Annots")
		for j := 0; j < annots.Len(); j++ {
			a := annots.Index(j)
			if a.Key("Subtype").Name() == "Widget" && (a.Key("FT").Name() == "Sig" || a.Key("Parent").Key("FT").Name() == "Sig") {
				pv.widgets++
				continue
			}
			pv.annots = append(pv.annots, fingerprint(a, 0))
		}
		sort.Strings(pv.annots)
		view.pages = append(view.pages, pv)
	}
	return view, nil
}

func sameAnnotations(before, after pageView) bool {
	if after.widgets < before.widgets || len(before.annots) != len(after.annots) {
		return false
	}
	for i := range before.annots {
		if before.annots[i] != after.annots[i] {
			return false
		}
	}
	return true
}

// fingerprintDepth bounds the walk: real resources nest a few levels, and the
// bound is what ends a cycle of references.
const fingerprintDepth = 10

// fingerprint is a hash of a value as resolved: dictionaries by sorted key
// (without /Parent, which points back up), arrays in order, streams by their
// dictionary and decoded bytes.
func fingerprint(v pdf.Value, depth int) string {
	h := sha256.New()
	writeValue(h, v, depth)
	return string(h.Sum(nil))
}

func writeValue(h hash.Hash, v pdf.Value, depth int) {
	if depth > fingerprintDepth {
		_, _ = io.WriteString(h, "…")
		return
	}
	switch v.Kind() {
	case pdf.Null:
		_, _ = io.WriteString(h, "null")
	case pdf.Bool, pdf.Integer, pdf.Real, pdf.Name, pdf.String:
		_, _ = fmt.Fprintf(h, "%d:%s", v.Kind(), v.String())
	case pdf.Array:
		_, _ = io.WriteString(h, "[")
		for i := 0; i < v.Len(); i++ {
			writeValue(h, v.Index(i), depth+1)
			_, _ = io.WriteString(h, ",")
		}
		_, _ = io.WriteString(h, "]")
	case pdf.Dict, pdf.Stream:
		keys := v.Keys()
		sort.Strings(keys)
		_, _ = io.WriteString(h, "<<")
		for _, key := range keys {
			if key == "Parent" || key == "Length" {
				continue
			}
			_, _ = io.WriteString(h, "/"+key+" ")
			writeValue(h, v.Key(key), depth+1)
		}
		_, _ = io.WriteString(h, ">>")
		if v.Kind() == pdf.Stream {
			rc := v.Reader()
			_, _ = io.Copy(h, rc)
			_ = rc.Close()
		}
	}
}
