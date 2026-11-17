package events

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
)

// The three kinds of PDF, rendered from realistic input and validated by a
// second PDF implementation (pdfcpu). With ARCHIVE_SAMPLES_DIR set they are
// written there too, for a person to look at.
func TestSamplePDFsAreValid(t *testing.T) {
	issued := time.Date(2026, 11, 17, 6, 30, 0, 0, time.UTC)
	signers := []renderSigner{{Name: "Бат-Өлзий Ганбаатар", Position: "Тэргүүн"}, {Name: "Үүрийнцэцэг Батсүх", Position: "Нарийн бичиг"},
		{Name: "Өлзийсайхан Дорж", Position: "Тэргүүлэгч"}, {Name: "Түвшинжаргал Эрдэнэ", Position: "Тэргүүлэгч"}}
	minutes, err := renderArchive(archiveRender{
		DocumentID: "6f1c2a7e-0d3b-4f4e-9a51-7c2d8e9b0a11", Branch: "СДМЗХ — Дархан-Уул аймгийн салбар зөвлөл",
		Kind: archiveKindMinutes, Number: "2026/014", Title: "Тэргүүлэгчдийн ээлжит хурлын тэмдэглэл", Issued: issued,
		EventTitle: "Тэргүүлэгчдийн 11 дүгээр сарын хурал",
		Body: "Хуралд тэргүүлэгч 9 хүнээс 7 нь оролцов. Хурлыг салбарын Тэргүүн Бат-Өлзий даргалав.\n\n" +
			"Хэлэлцсэн асуудал:\n1. Өвлийн сайн үйлсийн аянг зохион байгуулах тухай.\n2. Гишүүний хураамжийн тайлан.\n3. Үүрэг хариуцлагын хуваарь.\n\n" +
			"Шийдвэрлэсэн нь: Өвлийн аяныг 12 дугаар сарын 1-нээс 20-ны хооронд зохион байгуулж, хариуцагчаар Үүрийнцэцэгийг томилов. " +
			"Хураамжийн тайланг хүлээн авч, өр төлбөртэй гишүүдэд мэдэгдэл хүргүүлэхийг Санхүүчид даалгав.",
		Signers: signers,
	})
	if err != nil {
		t.Fatal(err)
	}
	votes := []protocolVoter{}
	names := []string{"Ганзориг", "Сарангэрэл", "Өнөрбаяр", "Үүрцайх", "Энхтуяа", "Мөнх-Эрдэнэ", "Хулан"}
	choices := []string{"yes", "yes", "no", "yes", "abstain", "yes", "no"}
	for i, n := range names {
		votes = append(votes, protocolVoter{Name: n, Choice: choices[i], SignedAt: stamp(issued.Add(time.Duration(i) * time.Minute)),
			Digest: "9f2c4e1ab07d33e5c1f0a9e88b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c"})
	}
	protocol, err := renderArchive(archiveRender{
		DocumentID: "0b7a9c2e-5d41-4c8a-b3e2-1f6d7e8a9b20", Branch: "СДМЗХ — Дархан-Уул аймгийн салбар зөвлөл",
		Kind: archiveKindProtocol, Number: "2026/015", Title: "Гишүүний хураамжийг 5000₮ болгох", Issued: issued.Add(time.Hour),
		EventTitle: "Тэргүүлэгчдийн 11 дүгээр сарын хурал", Signers: signers[:2],
		Protocol: &protocolPayload{
			MotionID: "c3d4", MotionTitle: "Гишүүний хураамжийг 5000₮ болгох", MotionBody: "Сарын хураамжийг 2027 оны 1 дүгээр сараас эхлэн 5000₮ болгох.",
			ContentHash: "4a1b7c9d2e3f405162738495a6b7c8d9e0f1a2b3c4d5e6f708192a3b4c5d6e7f", ProposerName: "Ганзориг", Result: "approved",
			Yes: 4, No: 2, Abstain: 1, Eligible: 9, OpenedAt: stamp(issued.Add(-time.Hour)), ClosedAt: stamp(issued.Add(10 * time.Minute)), Votes: votes,
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	ballot, err := renderBallot(ballotRender{
		Branch: "СДМЗХ — Дархан-Уул аймгийн салбар зөвлөл", EventTitle: "Тэргүүлэгчдийн 11 дүгээр сарын хурал", EventStarts: stamp(issued),
		MotionID: "c3d4e5f6-0000-4000-8000-000000000001", MotionTitle: "Гишүүний хураамжийг 5000₮ болгох",
		MotionBody: "Сарын хураамжийг 2027 оны 1 дүгээр сараас эхлэн 5000₮ болгох.", ContentHash: "4a1b7c9d2e3f405162738495a6b7c8d9e0f1a2b3c4d5e6f708192a3b4c5d6e7f",
		VoterName: "Өнөрбаяр Түмэн", VoterID: "a1b2c3d4-0000-4000-8000-000000000002", Choice: "yes", At: issued,
	})
	if err != nil {
		t.Fatal(err)
	}
	conf := model.NewDefaultConfiguration()
	for name, pdf := range map[string][]byte{"minutes.pdf": minutes, "protocol.pdf": protocol, "ballot.pdf": ballot} {
		if err := api.Validate(bytes.NewReader(pdf), conf); err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if dir := os.Getenv("ARCHIVE_SAMPLES_DIR"); dir != "" {
			if err := os.WriteFile(filepath.Join(dir, name), pdf, 0o600); err != nil {
				t.Fatal(err)
			}
		}
	}
}
