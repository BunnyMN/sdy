package pdfdoc

import (
	"strconv"
	"strings"
)

// Margins of every page, in points.
const (
	MarginX      = 56.0
	MarginTop    = 60.0
	MarginBottom = 64.0
)

// Layout flows content down A4 pages and breaks them where it has to.
type Layout struct {
	W *Writer
	// Footer is drawn at the bottom left of every page, with "Хуудас i/n" at
	// the right.
	Footer string
	y      float64
}

// NewLayout starts a document with its first page.
func NewLayout() (*Layout, error) {
	w, err := New()
	if err != nil {
		return nil, err
	}
	l := &Layout{W: w}
	l.newPage()
	return l, nil
}

// ContentWidth is the width between the margins.
func ContentWidth() float64 { return PageWidth - 2*MarginX }

func (l *Layout) newPage() {
	l.W.AddPage()
	l.y = PageHeight - MarginTop
}

// Y is the cursor, measured from the bottom of the page.
func (l *Layout) Y() float64 { return l.y }

// Ensure starts a new page unless height more points fit on this one.
func (l *Layout) Ensure(height float64) {
	if l.y-height < MarginBottom {
		l.newPage()
	}
}

// Space moves the cursor down.
func (l *Layout) Space(height float64) {
	l.y -= height
	if l.y < MarginBottom {
		l.newPage()
	}
}

// Wrap splits text into lines no wider than width.
func (l *Layout) Wrap(text string, style Style, size, width float64) []string {
	var lines []string
	for _, para := range strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n") {
		words := strings.Fields(para)
		if len(words) == 0 {
			lines = append(lines, "")
			continue
		}
		line := ""
		for _, word := range words {
			for l.W.TextWidth(word, style, size) > width {
				// A word wider than the line is cut by characters.
				runes := []rune(word)
				cut := len(runes)
				for cut > 1 && l.W.TextWidth(string(runes[:cut]), style, size) > width {
					cut--
				}
				if line != "" {
					lines = append(lines, line)
					line = ""
				}
				lines = append(lines, string(runes[:cut]))
				word = string(runes[cut:])
			}
			if word == "" {
				continue
			}
			candidate := word
			if line != "" {
				candidate = line + " " + word
			}
			if l.W.TextWidth(candidate, style, size) <= width {
				line = candidate
				continue
			}
			lines = append(lines, line)
			line = word
		}
		lines = append(lines, line)
	}
	return lines
}

// Paragraph writes wrapped text across the content width.
func (l *Layout) Paragraph(text string, style Style, size float64, c Color) {
	l.ParagraphAt(MarginX, ContentWidth(), text, style, size, c)
}

// ParagraphAt writes wrapped text in a column.
func (l *Layout) ParagraphAt(x, width float64, text string, style Style, size float64, c Color) {
	leading := size * 1.45
	for _, line := range l.Wrap(text, style, size, width) {
		l.Ensure(leading)
		l.y -= leading
		l.W.Text(x, l.y+size*0.3, style, size, c, line)
	}
}

// Centered writes one line centred on the page.
func (l *Layout) Centered(text string, style Style, size float64, c Color) {
	leading := size * 1.45
	l.Ensure(leading)
	l.y -= leading
	l.W.Text((PageWidth-l.W.TextWidth(text, style, size))/2, l.y+size*0.3, style, size, c, text)
}

// Rule draws a horizontal line across the content width.
func (l *Layout) Rule(c Color, width float64) {
	l.Ensure(8)
	l.y -= 6
	l.W.Line(MarginX, l.y, PageWidth-MarginX, l.y, width, c)
	l.y -= 6
}

// Pairs writes label–value rows, the label in a fixed column.
func (l *Layout) Pairs(rows [][2]string, labelWidth, size float64) {
	for _, row := range rows {
		lines := l.Wrap(row[1], Regular, size, ContentWidth()-labelWidth)
		leading := size * 1.5
		l.Ensure(leading * float64(len(lines)))
		for i, line := range lines {
			l.y -= leading
			if i == 0 {
				l.W.Text(MarginX, l.y+size*0.3, Regular, size, Gray, row[0])
			}
			l.W.Text(MarginX+labelWidth, l.y+size*0.3, Regular, size, Black, line)
		}
	}
}

// Column is one column of a table: its heading and its share of the width.
type Column struct {
	Title string
	Width float64 // fraction of the content width
	Right bool
}

// Table writes a table with a shaded heading row, repeated on a new page.
func (l *Layout) Table(cols []Column, rows [][]string, size float64) {
	pad := 5.0
	widths := make([]float64, len(cols))
	for i, c := range cols {
		widths[i] = c.Width * ContentWidth()
	}
	drawRow := func(cells []string, style Style, shade bool) {
		wrapped := make([][]string, len(cols))
		lines := 1
		for i := range cols {
			text := ""
			if i < len(cells) {
				text = cells[i]
			}
			wrapped[i] = l.Wrap(text, style, size, widths[i]-2*pad)
			lines = max(lines, len(wrapped[i]))
		}
		leading := size * 1.4
		height := float64(lines)*leading + 2*pad
		l.Ensure(height)
		top := l.y
		if shade {
			l.W.Rect(MarginX, top-height, ContentWidth(), height, Light)
		}
		x := MarginX
		for i, c := range cols {
			for j, line := range wrapped[i] {
				tx := x + pad
				if c.Right {
					tx = x + widths[i] - pad - l.W.TextWidth(line, style, size)
				}
				l.W.Text(tx, top-pad-float64(j+1)*leading+size*0.35, style, size, Black, line)
			}
			x += widths[i]
		}
		l.y = top - height
		l.W.Line(MarginX, l.y, PageWidth-MarginX, l.y, 0.5, Light)
	}
	heading := make([]string, len(cols))
	for i, c := range cols {
		heading[i] = c.Title
	}
	drawRow(heading, Bold, true)
	for _, row := range rows {
		before := l.W.Pages()
		l.Ensure(size*1.4 + 10)
		if l.W.Pages() != before {
			drawRow(heading, Bold, true)
		}
		drawRow(row, Regular, false)
	}
}

// Finish draws every page's footer and writes the file.
func (l *Layout) Finish(meta Meta) ([]byte, error) {
	total := l.W.Pages()
	for i := range total {
		l.W.SetPage(i)
		y := MarginBottom - 30
		l.W.Line(MarginX, y+12, PageWidth-MarginX, y+12, 0.5, Light)
		label := "Хуудас " + strconv.Itoa(i+1) + "/" + strconv.Itoa(total)
		if l.Footer != "" {
			// The footer gives way to the page number rather than run into it.
			room := ContentWidth() - l.W.TextWidth(label, Regular, 7.5) - 12
			footer := []rune(l.Footer)
			for len(footer) > 1 && l.W.TextWidth(string(footer), Regular, 7.5) > room {
				footer = footer[:len(footer)-1]
			}
			text := string(footer)
			if len(footer) < len([]rune(l.Footer)) {
				text = strings.TrimSpace(string(footer[:len(footer)-1])) + "…"
			}
			l.W.Text(MarginX, y, Regular, 7.5, Gray, text)
		}
		l.W.Text(PageWidth-MarginX-l.W.TextWidth(label, Regular, 7.5), y, Regular, 7.5, Gray, label)
	}
	return l.W.Bytes(meta)
}
