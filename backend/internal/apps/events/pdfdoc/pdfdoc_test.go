package pdfdoc

import (
	"bytes"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/digitorus/pdf"
	"github.com/gerege-systems/open-gerege-nexus/backend/internal/apps/events/pdfdoc/pdfdoctest"
	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
)

const sample = "Өнөөдрийн хурлаар Үндсэн дүрмийн өөрчлөлтийг хэлэлцэв. ЁЖЖ ӨҮ өү №"

func build(t *testing.T) []byte {
	t.Helper()
	l, err := NewLayout()
	if err != nil {
		t.Fatal(err)
	}
	l.Footer = "Баримтын ID test"
	l.Centered("ХУРЛЫН ТЭМДЭГЛЭЛ", Bold, 16, Black)
	for range 40 {
		l.Paragraph(sample, Regular, 11, Black)
	}
	l.Table([]Column{{Title: "Нэр", Width: 0.6}, {Title: "Санал", Width: 0.4, Right: true}},
		[][]string{{"Бат-Өлзий", "Зөвшөөрөв"}, {"Үүрийнцэцэг", "Татгалзав"}}, 10)
	out, err := l.Finish(Meta{Title: "Тест", Created: time.Date(2026, 11, 17, 3, 0, 0, 0, time.UTC)})
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func TestDeterministicAndValid(t *testing.T) {
	a, b := build(t), build(t)
	if !bytes.Equal(a, b) {
		t.Fatal("the same document gave different bytes")
	}
	conf := model.NewDefaultConfiguration()
	if err := api.Validate(bytes.NewReader(a), conf); err != nil {
		t.Fatalf("pdfcpu rejects the file: %v", err)
	}
	if !bytes.Contains(a, []byte("/FontFile2")) || !bytes.Contains(a, []byte("+Inter-Regular")) || !bytes.Contains(a, []byte("+Inter-Bold")) {
		t.Fatal("the fonts are not embedded")
	}
	if len(a) > 200<<10 {
		t.Fatalf("a short document is %d bytes; the font subset did not work", len(a))
	}
	if os.Getenv("PDFDOC_OUT") != "" {
		_ = os.WriteFile(os.Getenv("PDFDOC_OUT"), a, 0o600)
	}
}

func extractText(t *testing.T, data []byte) (string, int) {
	t.Helper()
	text, err := pdfdoctest.ExtractText(data)
	if err != nil {
		t.Fatal(err)
	}
	r, err := pdf.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}
	return text, r.NumPage()
}

func TestTextExtractsAsCyrillic(t *testing.T) {
	got, pages := extractText(t, build(t))
	if pages < 2 {
		t.Fatalf("pages = %d, want a page break", pages)
	}
	for _, want := range []string{"ХУРЛЫН ТЭМДЭГЛЭЛ", "Үндсэн дүрмийн", "ЁЖЖ ӨҮ өү №", "Бат-Өлзий", "Хуудас 1/"} {
		if !strings.Contains(got, want) {
			t.Fatalf("extracted text lacks %q: %.300s", want, got)
		}
	}
}

// A 20000-character text with no space (the most a document body may hold)
// is cut into lines in linear time: a slow wrap here would let anybody who
// can open a draft preview spend the server's CPU.
func TestALongWordRendersQuickly(t *testing.T) {
	word := strings.Repeat("Өөрчлөлт", 2500)
	start := time.Now()
	l, err := NewLayout()
	if err != nil {
		t.Fatal(err)
	}
	l.Paragraph(word, Regular, 10.5, Black)
	if _, err := l.Finish(Meta{}); err != nil {
		t.Fatal(err)
	}
	limit := 200 * time.Millisecond
	if raceEnabled {
		limit = 2 * time.Second
	}
	if elapsed := time.Since(start); elapsed > limit {
		t.Fatalf("a 20000-character word took %s, want under %s", elapsed, limit)
	}
	got, _ := extractText(t, mustFinish(t, word))
	if !strings.Contains(strings.ReplaceAll(got, " ", ""), word[:200]) {
		t.Fatal("the cut word lost characters")
	}
}

func mustFinish(t *testing.T, text string) []byte {
	t.Helper()
	l, err := NewLayout()
	if err != nil {
		t.Fatal(err)
	}
	l.Paragraph(text, Regular, 10.5, Black)
	out, err := l.Finish(Meta{})
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func BenchmarkLongWord(b *testing.B) {
	word := strings.Repeat("Өөрчлөлт", 2500)
	for b.Loop() {
		l, _ := NewLayout()
		l.Paragraph(word, Regular, 10.5, Black)
		_, _ = l.Finish(Meta{})
	}
}
