package events

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gerege-systems/open-gerege-nexus/backend/internal/apps/events/pdfdoc"
)

// What the union's PDFs say. Every input is a field: no clock, no lookup, so
// the same document renders to the same bytes (and the bytes are stored, so
// what was signed is always what is shown).

type renderSigner struct {
	Name     string
	Position string
}

// protocolPayload is a decided vote, frozen into its protocol when the vote
// closes.
type protocolPayload struct {
	EventTitle   string          `json:"event_title"`
	EventStarts  string          `json:"event_starts"`
	MotionID     string          `json:"motion_id"`
	MotionTitle  string          `json:"motion_title"`
	MotionBody   string          `json:"motion_body"`
	ContentHash  string          `json:"content_hash"`
	ProposerName string          `json:"proposer_name"`
	Result       string          `json:"result"`
	Yes          int             `json:"yes"`
	No           int             `json:"no"`
	Abstain      int             `json:"abstain"`
	Eligible     int             `json:"eligible"`
	OpenedAt     string          `json:"opened_at"`
	ClosedAt     string          `json:"closed_at"`
	Votes        []protocolVoter `json:"votes"`
}

type protocolVoter struct {
	Name     string `json:"name"`
	Choice   string `json:"choice"`
	SignedAt string `json:"signed_at"`
	Digest   string `json:"digest"`
}

type archiveRender struct {
	DocumentID string
	Branch     string
	Kind       string
	Number     string
	Title      string
	Body       string
	EventTitle string
	Author     string
	Issued     time.Time
	Signers    []renderSigner
	Protocol   *protocolPayload
	// Draft marks a preview that has not been frozen.
	Draft bool
}

var mongolianMonths = []string{"1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"}

// mongolianDate is «2026 оны 11 сарын 17» in Ulaanbaatar.
func mongolianDate(t time.Time) string {
	t = t.In(ulaanbaatar)
	return fmt.Sprintf("%d оны %s сарын %d", t.Year(), mongolianMonths[t.Month()-1], t.Day())
}

func mongolianTime(t time.Time) string {
	return mongolianDate(t) + ", " + t.In(ulaanbaatar).Format("15:04")
}

// shortTime is «2026.11.17 14:30» in Ulaanbaatar, for table cells.
func shortTime(t time.Time) string { return t.In(ulaanbaatar).Format("2006.01.02 15:04") }

func parseStamp(s string) time.Time {
	t, _ := time.Parse(time.RFC3339, s)
	return t
}

// header is the branch line, the red rule, the kind and the number.
func header(l *pdfdoc.Layout, branch, kind, number string, issued time.Time, draft bool) {
	w := l.W
	w.Rect(0, pdfdoc.PageHeight-8, pdfdoc.PageWidth, 8, pdfdoc.Accent)
	l.Paragraph(strings.ToUpper(branchOr(branch)), pdfdoc.Bold, 10, pdfdoc.Accent)
	l.Rule(pdfdoc.Accent, 1)
	l.Space(10)
	l.Centered(strings.ToUpper(kind), pdfdoc.Bold, 17, pdfdoc.Black)
	l.Space(4)
	numberText := ""
	switch {
	case draft:
		numberText = "ТӨСӨЛ — дугаар олгогдоогүй"
	case number != "":
		numberText = "№ " + number
	}
	date := ""
	if !issued.IsZero() {
		date = mongolianDate(issued)
	}
	l.Space(16)
	y := l.Y()
	w.Text(pdfdoc.MarginX, y, pdfdoc.Regular, 10, pdfdoc.Gray, numberText)
	if date != "" {
		w.Text(pdfdoc.PageWidth-pdfdoc.MarginX-w.TextWidth(date, pdfdoc.Regular, 10), y, pdfdoc.Regular, 10, pdfdoc.Gray, date)
	}
	l.Space(10)
}

func branchOr(name string) string {
	if strings.TrimSpace(name) == "" {
		return "Социал Демократ Монголын Залуучуудын Холбоо"
	}
	return name
}

// signerBlock lists who must sign, each with a line for the signature that
// lives in the PDF itself.
func signerBlock(l *pdfdoc.Layout, signers []renderSigner) {
	l.Space(18)
	// Keep the block on one page when it fits on one.
	l.Ensure(min(80+24*float64(len(signers)), pdfdoc.PageHeight-pdfdoc.MarginTop-pdfdoc.MarginBottom-40))
	l.Paragraph("Гарын үсэг зурах хүмүүс", pdfdoc.Bold, 11, pdfdoc.Black)
	l.Paragraph("Баримтыг доорх хүн бүр eID Mongolia-ийн баталгаажсан тоон гарын үсгээр (PIN2) дарааллаар нь зурна. "+
		"Гарын үсэг бүр PDF дотор хадгалагдах бөгөөд Adobe Acrobat Reader зэрэг программаар шалгагдана.", pdfdoc.Regular, 8.5, pdfdoc.Gray)
	l.Space(6)
	rows := make([][]string, 0, len(signers))
	for i, s := range signers {
		position := s.Position
		if position == "" {
			position = "Гишүүн"
		}
		rows = append(rows, []string{strconv.Itoa(i + 1), s.Name, position, "eID тоон гарын үсэг"})
	}
	l.Table([]pdfdoc.Column{{Title: "№", Width: 0.07}, {Title: "Нэр", Width: 0.4}, {Title: "Албан тушаал", Width: 0.25},
		{Title: "Гарын үсэг", Width: 0.28}}, rows, 9.5)
}

var resultWords = map[string]string{"approved": "БАТЛАГДСАН", "rejected": "БАТЛАГДААГҮЙ"}

// renderArchive draws a minutes, a decision or a vote protocol.
func renderArchive(in archiveRender) ([]byte, error) {
	l, err := pdfdoc.NewLayout()
	if err != nil {
		return nil, err
	}
	kindTitle := archiveKindTitles[in.Kind]
	l.Footer = "Баримтын ID " + in.DocumentID + " · " + branchOr(in.Branch)
	header(l, in.Branch, kindTitle, in.Number, in.Issued, in.Draft)
	l.Paragraph(in.Title, pdfdoc.Bold, 13, pdfdoc.Black)
	l.Space(6)
	var rows [][2]string
	if in.EventTitle != "" {
		rows = append(rows, [2]string{"Арга хэмжээ", in.EventTitle})
	}
	if in.Protocol == nil && len(rows) > 0 {
		l.Pairs(rows, 140, 10)
	}
	if p := in.Protocol; p != nil {
		rows = append(rows, [2]string{"Асуудал", p.MotionTitle})
		if p.ProposerName != "" {
			rows = append(rows, [2]string{"Дэвшүүлсэн", p.ProposerName})
		}
		if p.OpenedAt != "" {
			rows = append(rows, [2]string{"Санал хураалт нээсэн", mongolianTime(parseStamp(p.OpenedAt))})
		}
		if p.ClosedAt != "" {
			rows = append(rows, [2]string{"Хаасан", mongolianTime(parseStamp(p.ClosedAt))})
		}
		rows = append(rows, [2]string{"Текстийн SHA-256", p.ContentHash})
		l.Pairs(rows, 140, 10)
		if p.MotionBody != "" {
			l.Space(8)
			l.Paragraph(p.MotionBody, pdfdoc.Regular, 10.5, pdfdoc.Black)
		}
		l.Space(14)
		l.Paragraph("Үр дүн: "+resultWords[p.Result], pdfdoc.Bold, 13, pdfdoc.Accent)
		l.Space(6)
		voted := p.Yes + p.No + p.Abstain
		l.Table([]pdfdoc.Column{{Title: "Санал өгөх эрхтэй", Width: 0.2, Right: true}, {Title: "Санал өгсөн", Width: 0.2, Right: true},
			{Title: "Зөвшөөрсөн", Width: 0.2, Right: true}, {Title: "Татгалзсан", Width: 0.2, Right: true}, {Title: "Түдгэлзсэн", Width: 0.2, Right: true}},
			[][]string{{strconv.Itoa(p.Eligible), strconv.Itoa(voted), strconv.Itoa(p.Yes), strconv.Itoa(p.No), strconv.Itoa(p.Abstain)}}, 10)
		l.Space(4)
		l.Paragraph("Зөвшөөрсөн санал татгалзсанаас олон бол асуудал батлагдана; түдгэлзсэн санал аль талд ч тоологдохгүй. "+
			"Санал бүрийг санал өгөгч eID тоон гарын үсгээр зурсан.", pdfdoc.Regular, 8.5, pdfdoc.Gray)
		l.Space(14)
		l.Paragraph("Санал өгсөн гишүүд", pdfdoc.Bold, 11, pdfdoc.Black)
		l.Space(4)
		rows2 := make([][]string, 0, len(p.Votes))
		for i, v := range p.Votes {
			rows2 = append(rows2, []string{strconv.Itoa(i + 1), v.Name, choiceShort[v.Choice], shortTime(parseStamp(v.SignedAt)), shortDigest(v.Digest)})
		}
		if len(rows2) == 0 {
			rows2 = append(rows2, []string{"", "Зурсан санал алга", "", "", ""})
		}
		l.Table([]pdfdoc.Column{{Title: "№", Width: 0.07}, {Title: "Нэр", Width: 0.33}, {Title: "Санал", Width: 0.16},
			{Title: "Зурсан цаг", Width: 0.22}, {Title: "SHA-256", Width: 0.22}}, rows2, 9)
	} else if in.Body != "" {
		l.Space(8)
		l.Paragraph(in.Body, pdfdoc.Regular, 10.5, pdfdoc.Black)
	}
	signerBlock(l, in.Signers)
	meta := pdfdoc.Meta{Title: kindTitle + " № " + in.Number + " — " + in.Title, Subject: kindTitle, Author: branchOr(in.Branch), Created: in.Issued}
	if in.Draft {
		meta.Title = "ТӨСӨЛ — " + in.Title
	}
	return l.Finish(meta)
}

func shortDigest(d string) string {
	if len(d) > 12 {
		return d[:12] + "…"
	}
	return d
}

// ballotRender is one member's ballot.
type ballotRender struct {
	Branch      string
	EventTitle  string
	EventStarts string
	MotionID    string
	MotionTitle string
	MotionBody  string
	ContentHash string
	VoterName   string
	VoterID     string
	Choice      string
	At          time.Time
}

// renderBallot draws «Саналын хуудас»: the motion, the frozen text's hash,
// the voter and the choice. The voter signs this PDF with PIN2.
func renderBallot(in ballotRender) ([]byte, error) {
	l, err := pdfdoc.NewLayout()
	if err != nil {
		return nil, err
	}
	l.Footer = "Асуудал " + in.MotionID + " · Санал өгөгч " + in.VoterID
	header(l, in.Branch, "Саналын хуудас", "", in.At, false)
	rows := [][2]string{{"Арга хэмжээ", in.EventTitle}}
	if in.EventStarts != "" {
		rows = append(rows, [2]string{"Огноо", mongolianTime(parseStamp(in.EventStarts))})
	}
	rows = append(rows, [2]string{"Асуудал", in.MotionTitle})
	l.Pairs(rows, 120, 10.5)
	if in.MotionBody != "" {
		l.Space(6)
		l.Paragraph(in.MotionBody, pdfdoc.Regular, 10, pdfdoc.Black)
	}
	l.Space(6)
	l.Pairs([][2]string{{"Текстийн SHA-256", in.ContentHash}}, 120, 8.5)
	l.Space(22)
	l.Ensure(90)
	top := l.Y()
	l.W.Rect(pdfdoc.MarginX, top-70, pdfdoc.ContentWidth(), 70, pdfdoc.Light)
	l.W.Text(pdfdoc.MarginX+16, top-26, pdfdoc.Regular, 10, pdfdoc.Gray, "Санал өгөгч: "+in.VoterName)
	choice := choiceWords[in.Choice]
	l.W.Text(pdfdoc.MarginX+16, top-54, pdfdoc.Bold, 20, pdfdoc.Accent, choice)
	l.Space(84)
	l.Paragraph("Санал өгсөн цаг: "+mongolianTime(in.At), pdfdoc.Regular, 10, pdfdoc.Black)
	l.Space(10)
	l.Paragraph("Энэ саналын хуудсыг санал өгөгч өөрийн eID Mongolia-ийн баталгаажсан тоон гарын үсгээр (PIN2) зурна. "+
		"Гарын үсэг PDF дотор хадгалагдах бөгөөд саналын хуудас нь зөвхөн дээрх асуудал, дээрх текст, дээрх сонголтод хамаарна.",
		pdfdoc.Regular, 8.5, pdfdoc.Gray)
	return l.Finish(pdfdoc.Meta{Title: "Саналын хуудас — " + in.MotionTitle, Subject: "Саналын хуудас",
		Author: branchOr(in.Branch), Created: in.At})
}
