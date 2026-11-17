// Package pdfdoc writes the union's signed documents — ballots, minutes,
// decisions and vote protocols — as small, deterministic PDF files.
//
// Deterministic is the requirement everything here serves: the bytes a member
// signs with PIN2 are the bytes that are stored, and the same input must give
// the same file, so there is no clock, no random id and no map iteration on
// the way out. The file is a classic PDF 1.7 with a cross-reference table
// (no object streams), which is what an incremental PAdES signature appends
// to without rewriting anything that came before it.
//
// Text is Inter (SIL OFL 1.1, fonts/Inter-LICENSE.txt), embedded as a subset
// CID font with a ToUnicode map, so Cyrillic including Ө and Ү renders and can
// be searched and copied in any reader.
package pdfdoc

import (
	"bytes"
	"compress/zlib"
	"crypto/sha256"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
)

// A4 in points.
const (
	PageWidth  = 595.28
	PageHeight = 841.89
)

// Style picks a face.
type Style int

const (
	Regular Style = iota
	Bold
)

// Color is RGB in 0..1.
type Color struct{ R, G, B float64 }

var (
	Black  = Color{0.1, 0.1, 0.12}
	Gray   = Color{0.42, 0.44, 0.48}
	Light  = Color{0.9, 0.91, 0.93}
	Accent = Color{0.612, 0.114, 0.145} // the logo's red, #9c1d25
	White  = Color{1, 1, 1}
)

// Meta is the document information dictionary.
type Meta struct {
	Title   string
	Subject string
	Author  string
	// Created is the document's date, written into the file; the zero time
	// writes none. It is an input, never the clock, so the bytes are stable.
	Created time.Time
}

// Writer collects pages.
type Writer struct {
	faces [2]*face
	pages []*bytes.Buffer
	// current is the page drawing calls go to.
	current int
	used    [2]map[uint16]rune
}

// New starts an empty document.
func New() (*Writer, error) {
	fs, err := loadFaces()
	if err != nil {
		return nil, err
	}
	return &Writer{faces: fs, used: [2]map[uint16]rune{{}, {}}}, nil
}

// AddPage starts a new page; drawing calls go to the last page.
func (w *Writer) AddPage() {
	w.pages = append(w.pages, &bytes.Buffer{})
	w.current = len(w.pages) - 1
}

// SetPage sends drawing calls to page i (from 0).
func (w *Writer) SetPage(i int) {
	if i >= 0 && i < len(w.pages) {
		w.current = i
	}
}

// Pages is how many pages there are.
func (w *Writer) Pages() int { return len(w.pages) }

func (w *Writer) page() *bytes.Buffer {
	if len(w.pages) == 0 {
		w.AddPage()
	}
	return w.pages[w.current]
}

// RuneWidth is the width of one character in points.
func (w *Writer) RuneWidth(r rune, style Style, size float64) float64 {
	_, units := w.faces[style].glyph(r)
	return float64(units) * size / float64(w.faces[style].unitsPerEm)
}

// TextWidth is the width of s in points.
func (w *Writer) TextWidth(s string, style Style, size float64) float64 {
	return w.faces[style].width(s, size)
}

func num(v float64) string {
	s := strconv.FormatFloat(v, 'f', 2, 64)
	s = strings.TrimRight(strings.TrimRight(s, "0"), ".")
	if s == "" || s == "-" {
		return "0"
	}
	return s
}

// Text draws s with its baseline at (x, y), y measured from the bottom.
func (w *Writer) Text(x, y float64, style Style, size float64, c Color, s string) {
	if s == "" {
		return
	}
	f := w.faces[style]
	var hex strings.Builder
	for _, r := range s {
		gid, _ := f.glyph(r)
		if f.has(r) {
			w.used[style][gid] = r
		} else {
			w.used[style][gid] = '?'
		}
		fmt.Fprintf(&hex, "%04X", gid)
	}
	fmt.Fprintf(w.page(), "BT %s %s %s rg /F%d %s Tf %s %s Td <%s> Tj ET\n",
		num(c.R), num(c.G), num(c.B), style+1, num(size), num(x), num(y), hex.String())
}

// Rect fills a rectangle.
func (w *Writer) Rect(x, y, width, height float64, c Color) {
	fmt.Fprintf(w.page(), "%s %s %s rg %s %s %s %s re f\n", num(c.R), num(c.G), num(c.B), num(x), num(y), num(width), num(height))
}

// Line strokes a line.
func (w *Writer) Line(x1, y1, x2, y2, width float64, c Color) {
	fmt.Fprintf(w.page(), "%s %s %s RG %s w %s %s m %s %s l S\n", num(c.R), num(c.G), num(c.B), num(width), num(x1), num(y1), num(x2), num(y2))
}

// pdfString is a PDF text string: UTF-16BE with a byte-order mark, as hex.
func pdfString(s string) string {
	var b strings.Builder
	b.WriteString("<FEFF")
	for _, r := range s {
		if r > 0xFFFF {
			r -= 0x10000
			fmt.Fprintf(&b, "%04X%04X", 0xD800+(r>>10), 0xDC00+(r&0x3FF))
			continue
		}
		fmt.Fprintf(&b, "%04X", r)
	}
	b.WriteString(">")
	return b.String()
}

func deflate(data []byte) []byte {
	var out bytes.Buffer
	zw, _ := zlib.NewWriterLevel(&out, zlib.BestCompression)
	_, _ = zw.Write(data)
	_ = zw.Close()
	return out.Bytes()
}

type objects struct {
	buf     bytes.Buffer
	offsets []int
}

func (o *objects) reserve() int {
	o.offsets = append(o.offsets, 0)
	return len(o.offsets)
}

func (o *objects) write(id int, body string) {
	o.offsets[id-1] = o.buf.Len()
	fmt.Fprintf(&o.buf, "%d 0 obj\n%s\nendobj\n", id, body)
}

func (o *objects) stream(id int, dict string, data []byte) {
	o.offsets[id-1] = o.buf.Len()
	fmt.Fprintf(&o.buf, "%d 0 obj\n<< %s /Length %d >>\nstream\n", id, dict, len(data))
	o.buf.Write(data)
	o.buf.WriteString("\nendstream\nendobj\n")
}

// Bytes writes the file.
func (w *Writer) Bytes(meta Meta) ([]byte, error) {
	if len(w.pages) == 0 {
		w.AddPage()
	}
	var o objects
	o.buf.WriteString("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n")
	catalog, pagesID := o.reserve(), o.reserve()
	fontIDs := [2]int{}
	for style := range w.faces {
		fontIDs[style] = w.writeFont(&o, Style(style))
	}
	kids := make([]string, 0, len(w.pages))
	for _, content := range w.pages {
		pageID, contentID := o.reserve(), o.reserve()
		o.stream(contentID, "/Filter /FlateDecode", deflate(content.Bytes()))
		o.write(pageID, fmt.Sprintf("<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %s %s] /Resources << /Font << /F1 %d 0 R /F2 %d 0 R >> >> /Contents %d 0 R >>",
			pagesID, num(PageWidth), num(PageHeight), fontIDs[0], fontIDs[1], contentID))
		kids = append(kids, fmt.Sprintf("%d 0 R", pageID))
	}
	o.write(pagesID, fmt.Sprintf("<< /Type /Pages /Kids [%s] /Count %d >>", strings.Join(kids, " "), len(kids)))
	o.write(catalog, fmt.Sprintf("<< /Type /Catalog /Pages %d 0 R /Lang (mn-MN) /ViewerPreferences << /DisplayDocTitle true >> >>", pagesID))
	info := o.reserve()
	infoDict := "<< /Producer (E-sdy pdfdoc)"
	if meta.Title != "" {
		infoDict += " /Title " + pdfString(meta.Title)
	}
	if meta.Subject != "" {
		infoDict += " /Subject " + pdfString(meta.Subject)
	}
	if meta.Author != "" {
		infoDict += " /Author " + pdfString(meta.Author)
	}
	if !meta.Created.IsZero() {
		infoDict += " /CreationDate (D:" + meta.Created.UTC().Format("20060102150405") + "Z)"
	}
	o.write(info, infoDict+" >>")

	// The file id is the hash of everything before it: stable for the same
	// content, different for any other.
	id := sha256.Sum256(o.buf.Bytes())
	xref := o.buf.Len()
	fmt.Fprintf(&o.buf, "xref\n0 %d\n0000000000 65535 f \n", len(o.offsets)+1)
	for _, off := range o.offsets {
		fmt.Fprintf(&o.buf, "%010d 00000 n \n", off)
	}
	fmt.Fprintf(&o.buf, "trailer\n<< /Size %d /Root %d 0 R /Info %d 0 R /ID [<%X> <%X>] >>\nstartxref\n%d\n%%%%EOF\n",
		len(o.offsets)+1, catalog, info, id[:16], id[:16], xref)
	return o.buf.Bytes(), nil
}

func (w *Writer) writeFont(o *objects, style Style) int {
	f := w.faces[style]
	used := w.used[style]
	gids := make([]uint16, 0, len(used))
	for g := range used {
		gids = append(gids, g)
	}
	sort.Slice(gids, func(i, j int) bool { return gids[i] < gids[j] })

	// The subset tag is six capitals derived from the glyphs, so it is the
	// same for the same text.
	h := sha256.New()
	for _, g := range gids {
		_, _ = fmt.Fprintf(h, "%d,", g)
	}
	sum := h.Sum(nil)
	tag := make([]byte, 6)
	for i := range tag {
		tag[i] = 'A' + sum[i]%26
	}
	baseFont := string(tag) + "+" + f.name

	type0, cid, descriptor, file, toUnicode := o.reserve(), o.reserve(), o.reserve(), o.reserve(), o.reserve()
	scale := func(v int) int { return v * 1000 / f.unitsPerEm }
	fontData := f.subset(gids)
	o.stream(file, fmt.Sprintf("/Filter /FlateDecode /Length1 %d", len(fontData)), deflate(fontData))
	o.write(descriptor, fmt.Sprintf("<< /Type /FontDescriptor /FontName /%s /Flags 4 /FontBBox [%d %d %d %d] /ItalicAngle 0 /Ascent %d /Descent %d /CapHeight %d /StemV %d /FontFile2 %d 0 R >>",
		baseFont, scale(f.bbox[0]), scale(f.bbox[1]), scale(f.bbox[2]), scale(f.bbox[3]),
		scale(f.ascent), scale(f.descent), scale(f.capHeight), map[Style]int{Regular: 80, Bold: 140}[style], file))

	var widths strings.Builder
	for _, g := range gids {
		f.mu.Lock()
		adv := f.widths[g]
		f.mu.Unlock()
		fmt.Fprintf(&widths, "%d [%d] ", g, scale(adv))
	}
	o.write(cid, fmt.Sprintf("<< /Type /Font /Subtype /CIDFontType2 /BaseFont /%s /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor %d 0 R /DW 0 /W [%s] /CIDToGIDMap /Identity >>",
		baseFont, descriptor, strings.TrimSpace(widths.String())))

	var cmap strings.Builder
	cmap.WriteString("/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n")
	for start := 0; start < len(gids); start += 100 {
		end := min(start+100, len(gids))
		fmt.Fprintf(&cmap, "%d beginbfchar\n", end-start)
		for _, g := range gids[start:end] {
			r := used[g]
			if r > 0xFFFF {
				r -= 0x10000
				fmt.Fprintf(&cmap, "<%04X> <%04X%04X>\n", g, 0xD800+(r>>10), 0xDC00+(r&0x3FF))
				continue
			}
			fmt.Fprintf(&cmap, "<%04X> <%04X>\n", g, r)
		}
		cmap.WriteString("endbfchar\n")
	}
	cmap.WriteString("endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n")
	o.stream(toUnicode, "/Filter /FlateDecode", deflate([]byte(cmap.String())))
	o.write(type0, fmt.Sprintf("<< /Type /Font /Subtype /Type0 /BaseFont /%s /Encoding /Identity-H /DescendantFonts [%d 0 R] /ToUnicode %d 0 R >>",
		baseFont, cid, toUnicode))
	return type0
}
