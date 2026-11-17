package pdfdoc

import (
	"bytes"
	"embed"
	"encoding/binary"
	"errors"
	"fmt"
	"sort"
	"sync"

	"golang.org/x/image/font"
	"golang.org/x/image/font/sfnt"
	"golang.org/x/image/math/fixed"
)

// The embedded faces. Inter is under the SIL Open Font License 1.1
// (fonts/Inter-LICENSE.txt), which allows embedding and subsetting it in a
// document; it covers the whole Cyrillic block including Mongolian Ө and Ү.
//
//go:embed fonts/Inter-Regular.ttf fonts/Inter-Bold.ttf
var fontFiles embed.FS

// face is one TrueType font: how to find a glyph, how wide it is, and the raw
// tables a subset is cut from.
type face struct {
	name       string // PostScript name, e.g. Inter-Regular
	raw        []byte
	tables     map[string][]byte
	sf         *sfnt.Font
	unitsPerEm int
	ascent     int
	descent    int
	capHeight  int
	bbox       [4]int
	numGlyphs  int
	longLoca   bool
	mu         sync.Mutex
	gids       map[rune]uint16
	widths     map[uint16]int
}

var (
	facesOnce sync.Once
	faces     [2]*face
	facesErr  error
)

// loadFaces parses both embedded fonts once per process.
func loadFaces() ([2]*face, error) {
	facesOnce.Do(func() {
		for i, spec := range []struct{ file, name string }{
			{"fonts/Inter-Regular.ttf", "Inter-Regular"},
			{"fonts/Inter-Bold.ttf", "Inter-Bold"},
		} {
			raw, err := fontFiles.ReadFile(spec.file)
			if err != nil {
				facesErr = err
				return
			}
			f, err := parseFace(spec.name, raw)
			if err != nil {
				facesErr = fmt.Errorf("pdfdoc: %s: %w", spec.name, err)
				return
			}
			faces[i] = f
		}
	})
	return faces, facesErr
}

func parseFace(name string, raw []byte) (*face, error) {
	if len(raw) < 12 {
		return nil, errors.New("font too short")
	}
	count := int(binary.BigEndian.Uint16(raw[4:6]))
	tables := make(map[string][]byte, count)
	for i := range count {
		rec := raw[12+16*i : 28+16*i]
		tag := string(rec[0:4])
		off, length := binary.BigEndian.Uint32(rec[8:12]), binary.BigEndian.Uint32(rec[12:16])
		if uint64(off)+uint64(length) > uint64(len(raw)) {
			return nil, fmt.Errorf("table %s out of range", tag)
		}
		tables[tag] = raw[off : off+length]
	}
	for _, tag := range []string{"head", "hhea", "hmtx", "maxp", "loca", "glyf"} {
		if tables[tag] == nil {
			return nil, fmt.Errorf("missing %s table", tag)
		}
	}
	sf, err := sfnt.Parse(raw)
	if err != nil {
		return nil, err
	}
	head := tables["head"]
	f := &face{
		name: name, raw: raw, tables: tables, sf: sf,
		unitsPerEm: int(binary.BigEndian.Uint16(head[18:20])),
		bbox: [4]int{i16(head[36:38]), i16(head[38:40]),
			i16(head[40:42]), i16(head[42:44])},
		longLoca:  binary.BigEndian.Uint16(head[50:52]) == 1,
		numGlyphs: int(binary.BigEndian.Uint16(tables["maxp"][4:6])),
		gids:      map[rune]uint16{},
		widths:    map[uint16]int{},
	}
	hhea := tables["hhea"]
	f.ascent = i16(hhea[4:6])
	f.descent = i16(hhea[6:8])
	f.capHeight = f.ascent * 7 / 10
	if os2 := tables["OS/2"]; len(os2) >= 90 {
		f.capHeight = i16(os2[88:90])
	}
	return f, nil
}

// glyph is the glyph for r and its advance in font units; a character the font
// lacks is drawn as '?' rather than as an empty box.
func (f *face) glyph(r rune) (uint16, int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if gid, ok := f.gids[r]; ok {
		return gid, f.widths[gid]
	}
	var buf sfnt.Buffer
	gid, err := f.sf.GlyphIndex(&buf, r)
	if (err != nil || gid == 0) && r != '?' {
		f.mu.Unlock()
		g, w := f.glyph('?')
		f.mu.Lock()
		f.gids[r] = g
		return g, w
	}
	adv, err := f.sf.GlyphAdvance(&buf, gid, fixed.I(f.unitsPerEm), font.HintingNone)
	width := 0
	if err == nil {
		width = adv.Round()
	}
	f.gids[r], f.widths[uint16(gid)] = uint16(gid), width
	return uint16(gid), width
}

// has reports whether the font draws r itself.
func (f *face) has(r rune) bool {
	var buf sfnt.Buffer
	gid, err := f.sf.GlyphIndex(&buf, r)
	return err == nil && gid != 0
}

// width is the advance of s at size points.
func (f *face) width(s string, size float64) float64 {
	units := 0
	for _, r := range s {
		_, w := f.glyph(r)
		units += w
	}
	return float64(units) * size / float64(f.unitsPerEm)
}

func (f *face) glyphRange(gid int) (int, int) {
	loca := f.tables["loca"]
	if f.longLoca {
		return int(binary.BigEndian.Uint32(loca[4*gid:])), int(binary.BigEndian.Uint32(loca[4*gid+4:]))
	}
	return 2 * int(binary.BigEndian.Uint16(loca[2*gid:])), 2 * int(binary.BigEndian.Uint16(loca[2*gid+2:]))
}

// components are the glyphs a composite glyph is built from.
func (f *face) components(gid int) []int {
	start, end := f.glyphRange(gid)
	glyf := f.tables["glyf"]
	if end-start < 10 || end > len(glyf) {
		return nil
	}
	g := glyf[start:end]
	if i16(g[0:2]) >= 0 {
		return nil
	}
	var out []int
	for p := 10; p+4 <= len(g); {
		flags := binary.BigEndian.Uint16(g[p:])
		out = append(out, int(binary.BigEndian.Uint16(g[p+2:])))
		p += 4
		if flags&0x0001 != 0 {
			p += 4
		} else {
			p += 2
		}
		switch {
		case flags&0x0008 != 0:
			p += 2
		case flags&0x0040 != 0:
			p += 4
		case flags&0x0080 != 0:
			p += 8
		}
		if flags&0x0020 == 0 {
			break
		}
	}
	return out
}

// subset is a TrueType font that keeps every glyph id but carries outlines only
// for the glyphs used (and what they are composed of). Keeping the ids means
// the PDF can map CIDs to glyphs one to one, and a document costs tens of
// kilobytes of font rather than four hundred.
func (f *face) subset(used []uint16) []byte {
	keep := map[int]bool{0: true}
	var walk func(int)
	walk = func(gid int) {
		if gid < 0 || gid >= f.numGlyphs || keep[gid] && gid != 0 {
			return
		}
		keep[gid] = true
		for _, c := range f.components(gid) {
			walk(c)
		}
	}
	for _, g := range used {
		walk(int(g))
	}
	glyf := f.tables["glyf"]
	var newGlyf bytes.Buffer
	loca := make([]byte, 4*(f.numGlyphs+1))
	for gid := range f.numGlyphs {
		binary.BigEndian.PutUint32(loca[4*gid:], uint32(newGlyf.Len())) // #nosec G115 -- a font is far below 4 GB
		if keep[gid] {
			start, end := f.glyphRange(gid)
			if start <= end && end <= len(glyf) {
				newGlyf.Write(glyf[start:end])
				for newGlyf.Len()%4 != 0 {
					newGlyf.WriteByte(0)
				}
			}
		}
	}
	binary.BigEndian.PutUint32(loca[4*f.numGlyphs:], uint32(newGlyf.Len())) // #nosec G115 -- as above

	head := append([]byte(nil), f.tables["head"]...)
	binary.BigEndian.PutUint32(head[8:12], 0)
	binary.BigEndian.PutUint16(head[50:52], 1)
	post := make([]byte, 32)
	copy(post, f.tables["post"])
	binary.BigEndian.PutUint32(post[0:4], 0x00030000)

	tables := map[string][]byte{
		"head": head, "hhea": f.tables["hhea"], "hmtx": f.tables["hmtx"], "maxp": f.tables["maxp"],
		"loca": loca, "glyf": newGlyf.Bytes(), "post": post,
	}
	for _, tag := range []string{"cvt ", "fpgm", "prep", "OS/2", "cmap", "name"} {
		if t := f.tables[tag]; t != nil {
			tables[tag] = t
		}
	}
	return assembleFont(tables)
}

// i16 reads a signed 16-bit font field: the bits are a two's-complement
// int16 by the TrueType specification, so the conversion is the reading.
func i16(b []byte) int {
	return int(int16(binary.BigEndian.Uint16(b))) // #nosec G115 -- a signed field, reinterpreted on purpose
}

func checksum(b []byte) uint32 {
	var sum uint32
	for i := 0; i < len(b); i += 4 {
		var word [4]byte
		copy(word[:], b[i:])
		sum += binary.BigEndian.Uint32(word[:])
	}
	return sum
}

func assembleFont(tables map[string][]byte) []byte {
	tags := make([]string, 0, len(tables))
	for tag := range tables {
		tags = append(tags, tag)
	}
	sort.Strings(tags)
	n := len(tags)
	entrySelector := 0
	for 1<<(entrySelector+1) <= n {
		entrySelector++
	}
	searchRange := (1 << entrySelector) * 16
	var out bytes.Buffer
	header := make([]byte, 12+16*n)
	binary.BigEndian.PutUint32(header[0:], 0x00010000)
	binary.BigEndian.PutUint16(header[4:], uint16(n))                 // #nosec G115 -- a dozen tables
	binary.BigEndian.PutUint16(header[6:], uint16(searchRange))       // #nosec G115 -- as above
	binary.BigEndian.PutUint16(header[8:], uint16(entrySelector))     // #nosec G115 -- as above
	binary.BigEndian.PutUint16(header[10:], uint16(n*16-searchRange)) // #nosec G115 -- a dozen tables
	offset := len(header)
	var body bytes.Buffer
	headOffset := 0
	for i, tag := range tags {
		t := tables[tag]
		rec := header[12+16*i:]
		copy(rec[0:4], tag)
		binary.BigEndian.PutUint32(rec[4:], checksum(t))
		binary.BigEndian.PutUint32(rec[8:], uint32(offset+body.Len())) // #nosec G115 -- small font
		binary.BigEndian.PutUint32(rec[12:], uint32(len(t)))           // #nosec G115 -- small font
		if tag == "head" {
			headOffset = offset + body.Len()
		}
		body.Write(t)
		for body.Len()%4 != 0 {
			body.WriteByte(0)
		}
	}
	out.Write(header)
	out.Write(body.Bytes())
	file := out.Bytes()
	binary.BigEndian.PutUint32(file[headOffset+8:], 0xB1B0AFBA-checksum(file))
	return file
}
