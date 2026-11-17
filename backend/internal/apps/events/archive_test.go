package events

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"testing"

	"github.com/gerege-systems/open-gerege-nexus/backend/internal/apps/events/pdfdoc/pdfdoctest"
	"github.com/gerege-systems/open-gerege-nexus/backend/pkg/nexus"
	"github.com/google/uuid"
)

// pdfSigner stands in for eID: it takes a PDF, "signs" its SHA-256, and on
// SignedDocument appends a real incremental PAdES signature with a throwaway
// key — what eID's stamp endpoint is expected to return.
type pdfSigner struct {
	mu         sync.Mutex
	docs       map[string][]byte
	digests    map[string]string
	regs       map[string]string
	stamped    map[string][]byte
	requests   []nexus.DocumentSignatureRequest
	state      nexus.SignatureState
	stampErr   error
	rewrite    bool
	certify    bool
	tamper     bool
	digestOnly bool
	stampCalls int
}

func newPDFSigner() *pdfSigner {
	return &pdfSigner{docs: map[string][]byte{}, digests: map[string]string{}, regs: map[string]string{},
		stamped: map[string][]byte{}, state: nexus.SignatureCompleted}
}

func (s *pdfSigner) set(change func(*pdfSigner)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	change(s)
}

func (s *pdfSigner) Enabled() bool { return true }

func (s *pdfSigner) SignDigest(_ context.Context, request nexus.SignatureRequest) (nexus.SignatureSession, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id := uuid.NewString()
	s.digests[id], s.regs[id] = request.DigestHex, request.RegNumber
	return nexus.SignatureSession{SessionID: id, VerificationCode: "1234"}, nil
}

func (s *pdfSigner) SignDocument(_ context.Context, request nexus.DocumentSignatureRequest) (nexus.SignatureSession, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.digestOnly {
		return nexus.SignatureSession{}, nexus.ErrPDFSigningUnavailable
	}
	id := uuid.NewString()
	sum := sha256.Sum256(request.PDF)
	s.docs[id], s.digests[id], s.regs[id] = append([]byte(nil), request.PDF...), hex.EncodeToString(sum[:]), request.RegNumber
	s.requests = append(s.requests, request)
	session := nexus.SignatureSession{SessionID: id, VerificationCode: "5678"}
	if request.CallbackURL != "" {
		session.AppLink = "https://eid.example/app?session=" + id
	}
	return session, nil
}

func (s *pdfSigner) PollSignature(_ context.Context, reg, session string) (nexus.SignatureState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.regs[session] != reg {
		return "", errors.New("eidsign: signature session not found")
	}
	return s.state, nil
}

func (s *pdfSigner) VerifiedDigest(_ context.Context, _ string, session string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	raw, _ := hex.DecodeString(s.digests[session])
	if s.tamper {
		raw[0] ^= 0xff
	}
	return base64.StdEncoding.EncodeToString(raw), nil
}

func (s *pdfSigner) SignedDocument(_ context.Context, reg, session string) (nexus.SignedDocument, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.stampCalls++
	if s.regs[session] != reg {
		return nexus.SignedDocument{}, errors.New("eidsign: signature session not found")
	}
	if s.stampErr != nil {
		return nexus.SignedDocument{}, s.stampErr
	}
	out, ok := s.stamped[session]
	if !ok {
		var err error
		out, err = pdfdoctest.AppendSignature(s.docs[session], "Signer "+reg, s.certify)
		if err != nil {
			return nexus.SignedDocument{}, err
		}
		s.stamped[session] = out
	}
	if s.rewrite {
		out = append([]byte("%PDF-1.7\n% regenerated\n"), out[9:]...)
	}
	return nexus.SignedDocument{PDF: out, SignerName: "Signer " + reg, SignerSerial: "PNOMN-" + reg, SignerIssuer: "Test CA"}, nil
}

func (s *pdfSigner) lastRequest() nexus.DocumentSignatureRequest {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.requests[len(s.requests)-1]
}

type archiveAnswer struct {
	Document ArchiveDocument `json:"document"`
}

type signStart struct {
	SessionID        string `json:"session_id"`
	VerificationCode string `json:"verification_code"`
	AppLink          string `json:"app_link"`
	State            string `json:"state"`
}

type signPoll struct {
	State          string `json:"state"`
	DocumentStatus string `json:"document_status"`
	Reason         string `json:"reason"`
}

func (f *eventFixture) archive(t *testing.T, method, path, body, user string, want int) []byte {
	t.Helper()
	w := f.call(method, "/api/v1/archive"+path, body, f.tenant, user, false)
	if w.Code != want {
		t.Fatalf("%s %s: %d, want %d: %s", method, path, w.Code, want, w.Body.String())
	}
	return w.Body.Bytes()
}

// linkEIDs gives each user a registration number of their own, from their
// place in the fixture.
func (f *eventFixture) linkEIDs(t *testing.T, users ...string) {
	t.Helper()
	for _, user := range users {
		for i, u := range f.users {
			if u == user {
				f.linkEID(t, user, fmt.Sprintf("УБ%08d", i))
			}
		}
	}
}

func (f *eventFixture) setPosition(t *testing.T, user, position string) {
	t.Helper()
	if _, err := f.pool.Exec(context.Background(), `UPDATE workspace.memberships SET position = $3 WHERE tenant_id = $1 AND user_id = $2`,
		f.tenant, user, position); err != nil {
		t.Fatal(err)
	}
}

func (f *eventFixture) notifications(t *testing.T, user string) []string {
	t.Helper()
	rows, err := f.pool.Query(context.Background(), `SELECT title FROM registry.member_notifications WHERE user_id = $1 AND kind = 'archive' ORDER BY created_at, id`, user)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var title string
		if err := rows.Scan(&title); err != nil {
			t.Fatal(err)
		}
		out = append(out, title)
	}
	return out
}

func (f *eventFixture) revisions(t *testing.T, doc string) [][]byte {
	t.Helper()
	rows, err := f.pool.Query(context.Background(), `SELECT pdf FROM events_archive_versions WHERE document_id = $1 ORDER BY revision`, doc)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out [][]byte
	for rows.Next() {
		var pdf []byte
		if err := rows.Scan(&pdf); err != nil {
			t.Fatal(err)
		}
		out = append(out, pdf)
	}
	return out
}

// sign runs one signer's ceremony to its end: start, then poll.
func (f *eventFixture) sign(t *testing.T, doc, user string, wantPoll int) signPoll {
	t.Helper()
	var start signStart
	decodeInto(t, f.archive(t, "POST", "/"+doc+"/sign", `{}`, user, http.StatusAccepted), &start)
	if start.SessionID == "" || start.State != "signing" || start.VerificationCode == "" {
		t.Fatalf("sign start answered %+v", start)
	}
	var poll signPoll
	body := f.archive(t, "POST", "/"+doc+"/sign/poll", `{"session_id":"`+start.SessionID+`"}`, user, wantPoll)
	if wantPoll == http.StatusOK {
		decodeInto(t, body, &poll)
	}
	return poll
}

func useSigner(t *testing.T, s nexus.Signer) {
	t.Helper()
	nexus.Provide[nexus.Signer](s)
	t.Cleanup(func() { nexus.Provide[nexus.Signer](newFakeSigner()) })
}

// A draft goes out, each signer signs the previous signer's output in turn,
// and the result is one PDF in which every signature still verifies.
func TestArchiveDocumentIsSignedInTurn(t *testing.T) {
	f := newEventFixture(t)
	signer := newPDFSigner()
	useSigner(t, signer)
	secretary, first, second, member := f.users[0], f.users[1], f.users[2], f.users[3]
	f.grant(secretary, PermArchiveManage)
	f.linkEIDs(t, first, second)

	body := `{"kind":"minutes","title":"Тэргүүлэгчдийн хурлын тэмдэглэл","body":"Өнөөдрийн хурлаар Үндсэн дүрмийн өөрчлөлтийг хэлэлцэв.","signers":["` + first + `","` + second + `"]}`
	f.archive(t, "POST", "/", body, member, http.StatusForbidden)
	var created archiveAnswer
	decodeInto(t, f.archive(t, "POST", "/", body, secretary, http.StatusCreated), &created)
	doc := created.Document
	if doc.Status != "draft" || doc.Number != "" || len(doc.Signers) != 2 || doc.Signers[0].UserID != first {
		t.Fatalf("draft: %+v", doc)
	}

	// A draft is the managers' alone.
	f.archive(t, "GET", "/"+doc.ID, ``, member, http.StatusNotFound)
	var list struct {
		Documents []ArchiveDocument `json:"documents"`
	}
	decodeInto(t, f.archive(t, "GET", "/", ``, member, http.StatusOK), &list)
	if len(list.Documents) != 0 {
		t.Fatal("a member sees a draft in the list")
	}
	// The manager's preview is a draft PDF, rendered on the fly.
	preview := f.call("GET", "/api/v1/archive/"+doc.ID+"/pdf", ``, f.tenant, secretary, false)
	status(t, preview, http.StatusOK)
	if !bytes.HasPrefix(preview.Body.Bytes(), []byte("%PDF-")) || f.revisions(t, doc.ID) != nil {
		t.Fatal("a draft preview is a PDF and stores nothing")
	}
	// Nobody signs a draft.
	f.archive(t, "POST", "/"+doc.ID+"/sign", `{}`, first, http.StatusConflict)

	var sent archiveAnswer
	decodeInto(t, f.archive(t, "POST", "/"+doc.ID+"/send", ``, secretary, http.StatusOK), &sent)
	if sent.Document.Status != "signing" || !strings.HasSuffix(sent.Document.Number, "/001") || len(sent.Document.Versions) != 1 {
		t.Fatalf("sent: %+v", sent.Document)
	}
	f.archive(t, "POST", "/"+doc.ID+"/send", ``, secretary, http.StatusConflict)
	f.archive(t, "PUT", "/"+doc.ID, body, secretary, http.StatusConflict)
	if got := f.notifications(t, first); len(got) != 1 {
		t.Fatalf("the first signer was told %v", got)
	}
	if got := f.notifications(t, second); len(got) != 0 {
		t.Fatalf("the second signer was told before their turn: %v", got)
	}

	// Only the current signer signs.
	f.archive(t, "POST", "/"+doc.ID+"/sign", `{}`, second, http.StatusForbidden)
	f.archive(t, "POST", "/"+doc.ID+"/sign", `{}`, member, http.StatusForbidden)

	if poll := f.sign(t, doc.ID, first, http.StatusOK); poll.State != "signed" || poll.DocumentStatus != "signing" {
		t.Fatalf("first signature: %+v", poll)
	}
	revs := f.revisions(t, doc.ID)
	if len(revs) != 2 || !bytes.HasPrefix(revs[1], revs[0]) {
		t.Fatal("the first signature is not an incremental revision of the frozen PDF")
	}
	req := signer.lastRequest()
	if !req.RailSignatureOnly || !bytes.Equal(req.PDF, revs[0]) {
		t.Fatal("the first signer was not asked to sign the frozen PDF, rail-only")
	}
	if got := f.notifications(t, second); len(got) != 1 {
		t.Fatalf("the second signer was not told it is their turn: %v", got)
	}

	if poll := f.sign(t, doc.ID, second, http.StatusOK); poll.State != "signed" || poll.DocumentStatus != "signed" {
		t.Fatalf("second signature: %+v", poll)
	}
	if req := signer.lastRequest(); !bytes.Equal(req.PDF, revs[1]) {
		t.Fatal("the second signer did not sign the first signer's stamped PDF")
	}
	revs = f.revisions(t, doc.ID)
	final := revs[2]
	signatures, err := pdfdoctest.Verify(final)
	if err != nil {
		t.Fatal(err)
	}
	if len(signatures) != 2 || !signatures[0].Valid || !signatures[1].Valid {
		t.Fatalf("both signatures must verify in the final PDF: %+v", signatures)
	}

	var got archiveAnswer
	decodeInto(t, f.archive(t, "GET", "/"+doc.ID, ``, member, http.StatusOK), &got)
	sum := sha256.Sum256(final)
	if got.Document.Status != "signed" || got.Document.FinalSHA256 != hex.EncodeToString(sum[:]) ||
		got.Document.SignedCount != 2 || len(got.Document.Versions) != 3 {
		t.Fatalf("signed document: %+v", got.Document)
	}
	for _, s := range got.Document.Signers {
		if s.Status != "signed" || s.SignedAt == nil || s.CertIssuer != "Test CA" || s.Current {
			t.Fatalf("signer: %+v", s)
		}
	}
	if got := f.notifications(t, secretary); len(got) != 1 || got[0] != "Баримт бүрэн баталгаажлаа" {
		t.Fatalf("the author was told %v", got)
	}
	pdf := f.call("GET", "/api/v1/archive/"+doc.ID+"/pdf", ``, f.tenant, member, false)
	status(t, pdf, http.StatusOK)
	if !bytes.Equal(pdf.Body.Bytes(), final) || pdf.Header().Get("Content-Type") != "application/pdf" {
		t.Fatal("the download is not the final revision")
	}
	first0 := f.call("GET", "/api/v1/archive/"+doc.ID+"/pdf?revision=0", ``, f.tenant, member, false)
	if !bytes.Equal(first0.Body.Bytes(), revs[0]) {
		t.Fatal("revision 0 is not the frozen PDF")
	}

	// Final, even directly.
	f.archive(t, "POST", "/"+doc.ID+"/cancel", `{"reason":"x"}`, secretary, http.StatusConflict)
	if _, err := f.pool.Exec(context.Background(), `UPDATE events_archive_documents SET title = 'x' WHERE id = $1`, doc.ID); err == nil {
		t.Fatal("a signed document was rewritten")
	}
	if _, err := f.pool.Exec(context.Background(), `UPDATE events_archive_signers SET status = 'refused' WHERE document_id = $1`, doc.ID); err == nil {
		t.Fatal("a signature was undone")
	}
	// The next document gets the next number.
	decodeInto(t, f.archive(t, "POST", "/", body, secretary, http.StatusCreated), &created)
	decodeInto(t, f.archive(t, "POST", "/"+created.Document.ID+"/send", ``, secretary, http.StatusOK), &sent)
	if !strings.HasSuffix(sent.Document.Number, "/002") {
		t.Fatalf("second number %q", sent.Document.Number)
	}
}

func TestArchiveIsTheBranchesOwn(t *testing.T) {
	f := newEventFixture(t)
	useSigner(t, newPDFSigner())
	secretary, first := f.users[0], f.users[1]
	f.grant(secretary, PermArchiveManage)
	var created archiveAnswer
	decodeInto(t, f.archive(t, "POST", "/", `{"kind":"decision","title":"Шийдвэр","signers":["`+first+`"]}`, secretary, http.StatusCreated), &created)
	f.archive(t, "POST", "/"+created.Document.ID+"/send", ``, secretary, http.StatusOK)

	// The other branch: no such document, in the API or under its RLS binding.
	w := f.call("GET", "/api/v1/archive/"+created.Document.ID, ``, f.other, first, false)
	status(t, w, http.StatusNotFound)
	w = f.call("GET", "/api/v1/archive/", ``, f.other, first, false)
	status(t, w, http.StatusOK)
	if strings.Contains(w.Body.String(), created.Document.ID) {
		t.Fatal("another branch lists the document")
	}
	ctx := nexus.WithWorkspaceID(context.Background(), f.other)
	var count int
	if err := f.pool.QueryRow(ctx, `SELECT count(*) FROM events_archive_versions`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("RLS shows another branch %d revisions (%v)", count, err)
	}
	ctx = nexus.WithWorkspaceID(context.Background(), f.tenant)
	if err := f.pool.QueryRow(ctx, `SELECT count(*) FROM events_archive_versions`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("RLS hides the branch's own revisions: %d (%v)", count, err)
	}
	if _, err := f.pool.Exec(ctx, `DELETE FROM events_archive_versions`); err == nil {
		t.Fatal("the tenant role deleted a revision")
	}

	// Signers must be the branch's usable members.
	stranger := uuid.NewString()
	f.archive(t, "POST", "/", `{"kind":"decision","title":"Шийдвэр","signers":["`+stranger+`"]}`, secretary, http.StatusConflict)
	if _, err := f.pool.Exec(context.Background(), `UPDATE workspace.memberships SET active = false WHERE tenant_id = $1 AND user_id = $2`,
		f.tenant, f.users[5]); err != nil {
		t.Fatal(err)
	}
	f.archive(t, "POST", "/", `{"kind":"decision","title":"Шийдвэр","signers":["`+f.users[5]+`"]}`, secretary, http.StatusConflict)
	f.archive(t, "POST", "/", `{"kind":"vote_protocol","title":"Шийдвэр"}`, secretary, http.StatusBadRequest)
	f.archive(t, "POST", "/", `{"kind":"decision","title":"Шийдвэр","signers":["`+first+`","`+first+`"]}`, secretary, http.StatusBadRequest)
	// A draft with no signers cannot go out.
	decodeInto(t, f.archive(t, "POST", "/", `{"kind":"decision","title":"Хоосон"}`, secretary, http.StatusCreated), &created)
	f.archive(t, "POST", "/"+created.Document.ID+"/send", ``, secretary, http.StatusConflict)
	f.archive(t, "POST", "/"+created.Document.ID+"/cancel", ``, secretary, http.StatusOK)
}

func TestArchiveCeremonyFailuresCanBeRetried(t *testing.T) {
	f := newEventFixture(t)
	signer := newPDFSigner()
	useSigner(t, signer)
	secretary, first, second := f.users[0], f.users[1], f.users[2]
	f.grant(secretary, PermArchiveManage)
	f.linkEIDs(t, first)
	var created archiveAnswer
	decodeInto(t, f.archive(t, "POST", "/", `{"kind":"decision","title":"Шийдвэр","signers":["`+first+`","`+second+`"]}`, secretary, http.StatusCreated), &created)
	doc := created.Document.ID
	f.archive(t, "POST", "/"+doc+"/send", ``, secretary, http.StatusOK)

	// Refused on the phone: failed, and a new ceremony may start.
	signer.set(func(s *pdfSigner) { s.state = nexus.SignatureRejected })
	if poll := f.sign(t, doc, first, http.StatusOK); poll.State != "failed" {
		t.Fatalf("refused: %+v", poll)
	}
	// The stamp is unavailable: no fallback, the signer stays signing, and the
	// same ceremony completes once eID can stamp again.
	signer.set(func(s *pdfSigner) {
		s.state = nexus.SignatureCompleted
		s.stampErr = fmt.Errorf("%w: eID stamp answered 502", nexus.ErrSignedDocumentUnavailable)
	})
	var start signStart
	decodeInto(t, f.archive(t, "POST", "/"+doc+"/sign", `{}`, first, http.StatusAccepted), &start)
	f.archive(t, "POST", "/"+doc+"/sign/poll", `{"session_id":"`+start.SessionID+`"}`, first, http.StatusBadGateway)
	if len(f.revisions(t, doc)) != 1 {
		t.Fatal("a revision was stored without eID's stamp")
	}
	var lastError string
	_ = f.pool.QueryRow(context.Background(), `SELECT last_error FROM events_archive_signers WHERE document_id = $1 AND user_id = $2`, doc, first).Scan(&lastError)
	if !strings.HasPrefix(lastError, archiveStageStamp) {
		t.Fatalf("the stamp failure was not recorded: %q", lastError)
	}
	signer.set(func(s *pdfSigner) { s.stampErr = nil })
	var poll signPoll
	decodeInto(t, f.archive(t, "POST", "/"+doc+"/sign/poll", `{"session_id":"`+start.SessionID+`"}`, first, http.StatusOK), &poll)
	if poll.State != "signed" {
		t.Fatalf("retry after the stamp came back: %+v", poll)
	}

	// A signer without a linked eID is told so.
	f.archive(t, "POST", "/"+doc+"/sign", `{}`, second, http.StatusConflict)
	// A signature over something else is not this document's.
	f.linkEIDs(t, f.users[9], second)
	signer.set(func(s *pdfSigner) { s.tamper = true })
	f.sign(t, doc, second, http.StatusConflict)
	signer.set(func(s *pdfSigner) { s.tamper = false })

	// A manager cancels a document out for signature, with a reason.
	f.archive(t, "POST", "/"+doc+"/cancel", `{}`, secretary, http.StatusBadRequest)
	f.archive(t, "POST", "/"+doc+"/cancel", `{"reason":"Буруу хавсралт"}`, secretary, http.StatusOK)
	f.archive(t, "POST", "/"+doc+"/sign", `{}`, second, http.StatusConflict)
}

func TestArchiveRefusesARevisionThatIsNotIncremental(t *testing.T) {
	f := newEventFixture(t)
	signer := newPDFSigner()
	useSigner(t, signer)
	secretary, first, second := f.users[0], f.users[1], f.users[2]
	f.grant(secretary, PermArchiveManage)
	f.linkEIDs(t, first, second)
	var created archiveAnswer
	decodeInto(t, f.archive(t, "POST", "/", `{"kind":"minutes","title":"Тэмдэглэл","signers":["`+first+`","`+second+`"]}`, secretary, http.StatusCreated), &created)
	doc := created.Document.ID
	f.archive(t, "POST", "/"+doc+"/send", ``, secretary, http.StatusOK)

	signer.set(func(s *pdfSigner) { s.rewrite = true })
	f.sign(t, doc, first, http.StatusBadGateway)
	// A certification that forbids changes, with a signer still to come.
	signer.set(func(s *pdfSigner) { s.rewrite, s.certify = false, true })
	f.sign(t, doc, first, http.StatusBadGateway)
	if len(f.revisions(t, doc)) != 1 {
		t.Fatal("a rewritten or locking revision was stored")
	}
	var status_, lastError string
	_ = f.pool.QueryRow(context.Background(), `SELECT status, last_error FROM events_archive_signers WHERE document_id = $1 AND user_id = $2`,
		doc, first).Scan(&status_, &lastError)
	if status_ != "refused" || lastError != archiveStageLocked {
		t.Fatalf("signer after a locking revision: %s %q", status_, lastError)
	}
	signer.set(func(s *pdfSigner) { s.certify = false })
	if poll := f.sign(t, doc, first, http.StatusOK); poll.State != "signed" {
		t.Fatalf("a good signature after the refused ones: %+v", poll)
	}
}

// Two polls of one finished ceremony store one revision; two people cannot be
// signing at the same time.
func TestArchiveSigningIsRaceSafe(t *testing.T) {
	f := newEventFixture(t)
	signer := newPDFSigner()
	useSigner(t, signer)
	secretary, first, second := f.users[0], f.users[1], f.users[2]
	f.grant(secretary, PermArchiveManage)
	f.linkEIDs(t, first, second)
	var created archiveAnswer
	decodeInto(t, f.archive(t, "POST", "/", `{"kind":"minutes","title":"Тэмдэглэл","signers":["`+first+`","`+second+`"]}`, secretary, http.StatusCreated), &created)
	doc := created.Document.ID
	f.archive(t, "POST", "/"+doc+"/send", ``, secretary, http.StatusOK)

	// Both signers press «Гарын үсэг зурах» at once, again and again: only
	// the one whose turn it is starts a ceremony.
	var wg sync.WaitGroup
	for range 3 {
		for _, user := range []string{first, second} {
			wg.Add(1)
			go func() {
				defer wg.Done()
				w := f.call("POST", "/api/v1/archive/"+doc+"/sign", `{}`, f.tenant, user, false)
				if user == second && w.Code != http.StatusForbidden {
					t.Errorf("the second signer, out of turn: %d", w.Code)
				}
				if user == first && w.Code != http.StatusAccepted {
					t.Errorf("the first signer: %d %s", w.Code, w.Body.String())
				}
			}()
		}
	}
	wg.Wait()
	var session string
	if err := f.pool.QueryRow(context.Background(), `SELECT sign_session_id FROM events_archive_signers WHERE document_id = $1 AND user_id = $2`,
		doc, first).Scan(&session); err != nil {
		t.Fatal(err)
	}
	// Then the ceremony that stands is polled six times at once.
	codes := make([]int, 6)
	states := make([]string, 6)
	for i := range codes {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			w := f.call("POST", "/api/v1/archive/"+doc+"/sign/poll", `{"session_id":"`+session+`"}`, f.tenant, first, false)
			codes[i] = w.Code
			var p signPoll
			_ = json.Unmarshal(w.Body.Bytes(), &p)
			states[i] = p.State
		}(i)
	}
	wg.Wait()
	for i, code := range codes {
		if code != http.StatusOK || states[i] != "signed" {
			t.Fatalf("poll %d: %d %q", i, code, states[i])
		}
	}
	if revs := f.revisions(t, doc); len(revs) != 2 {
		t.Fatalf("%d revisions after concurrent polls, want 2", len(revs))
	}
	var events int
	_ = f.pool.QueryRow(context.Background(), `SELECT count(*) FROM registry.member_notifications WHERE user_id = $1 AND kind = 'archive'`, second).Scan(&events)
	if events != 1 {
		t.Fatalf("the second signer was told %d times", events)
	}
}

// Closing a vote makes its protocol, signed by the chair and the secretary.
func TestClosingAVoteMakesItsProtocol(t *testing.T) {
	f := newEventFixture(t)
	signer := newPDFSigner()
	useSigner(t, signer)
	e := f.prepareMeeting(t, 0)
	chair, secretary := f.users[6], f.users[7]
	f.setPosition(t, chair, "chair")
	f.setPosition(t, secretary, "secretary")
	f.linkEIDs(t, chair, secretary)

	base := "/" + e.ID + "/motions"
	var mo Motion
	w := f.request("POST", base, `{"title":"Хураамжийг өөрчлөх","body":"Сарын хураамжийг 5000₮ болгох."}`, f.tenant, f.users[1], false)
	status(t, w, http.StatusCreated)
	decodeInto(t, w.Body.Bytes(), &mo)
	one := base + "/" + mo.ID
	status(t, f.request("POST", one+"/open", ``, f.tenant, f.users[0], true), http.StatusOK)
	for i, choice := range []string{"yes", "yes", "no"} {
		user := f.users[1+i]
		w := f.request("POST", one+"/vote", `{"choice":"`+choice+`"}`, f.tenant, user, false)
		status(t, w, http.StatusAccepted)
		var start signStart
		decodeInto(t, w.Body.Bytes(), &start)
		w = f.request("POST", one+"/vote/poll", `{"session_id":"`+start.SessionID+`"}`, f.tenant, user, false)
		status(t, w, http.StatusOK)
	}
	w = f.request("POST", one+"/close", ``, f.tenant, f.users[0], true)
	status(t, w, http.StatusOK)
	decodeInto(t, w.Body.Bytes(), &mo)
	if mo.ProtocolID == nil {
		t.Fatal("the decided motion names no protocol")
	}
	var got archiveAnswer
	decodeInto(t, f.archive(t, "GET", "/"+*mo.ProtocolID, ``, f.users[2], http.StatusOK), &got)
	d := got.Document
	if d.Kind != archiveKindProtocol || d.Status != "signing" || len(d.Signers) != 2 ||
		d.Signers[0].UserID != chair || d.Signers[0].Position != "Тэргүүн" || d.Signers[1].UserID != secretary {
		t.Fatalf("protocol: %+v", d)
	}
	if got := f.notifications(t, chair); len(got) != 1 {
		t.Fatalf("the chair was told %v", got)
	}
	revs := f.revisions(t, d.ID)
	text := pdfText(t, revs[0])
	for _, want := range []string{"САНАЛ ХУРААЛТЫН ПРОТОКОЛ", "Хураамжийг өөрчлөх", "БАТЛАГДСАН", "Зөвшөөрөв", "Тэргүүн", "Нарийн бичиг"} {
		if !strings.Contains(text, want) {
			t.Fatalf("the protocol PDF lacks %q", want)
		}
	}
	f.sign(t, d.ID, chair, http.StatusOK)
	if poll := f.sign(t, d.ID, secretary, http.StatusOK); poll.DocumentStatus != "signed" {
		t.Fatalf("protocol after both: %+v", poll)
	}
	// One protocol per vote.
	status(t, f.request("POST", one+"/protocol", ``, f.tenant, f.users[0], true), http.StatusConflict)

	// With no chair or secretary it waits as a draft, saying why.
	f.setPosition(t, chair, "member")
	f.setPosition(t, secretary, "member")
	w = f.request("POST", base, `{"title":"Дараагийн асуудал"}`, f.tenant, f.users[1], false)
	decodeInto(t, w.Body.Bytes(), &mo)
	status(t, f.request("POST", base+"/"+mo.ID+"/open", ``, f.tenant, f.users[0], true), http.StatusOK)
	w = f.request("POST", base+"/"+mo.ID+"/close", ``, f.tenant, f.users[0], true)
	decodeInto(t, w.Body.Bytes(), &mo)
	if mo.ProtocolID != nil {
		t.Fatal("a draft protocol is linked to the motion")
	}
	var reason, docID string
	if err := f.pool.QueryRow(context.Background(), `SELECT id::text, draft_reason FROM events_archive_documents WHERE motion_id = $1`, mo.ID).
		Scan(&docID, &reason); err != nil || reason != "no_signers" {
		t.Fatalf("protocol without officers: %q (%v)", reason, err)
	}
	// An administrator gives it signers; the text stays the vote's.
	f.grant(f.users[0], PermArchiveManage)
	var edited archiveAnswer
	decodeInto(t, f.archive(t, "PUT", "/"+docID, `{"title":"Өөр гарчиг","signers":["`+f.users[8]+`"]}`, f.users[0], http.StatusOK), &edited)
	if edited.Document.Title != "Дараагийн асуудал" || edited.Document.DraftReason != "" || len(edited.Document.Signers) != 1 {
		t.Fatalf("edited protocol: %+v", edited.Document)
	}
}

func pdfText(t *testing.T, pdf []byte) string {
	t.Helper()
	text, err := pdfdoctest.ExtractText(pdf)
	if err != nil {
		t.Fatal(err)
	}
	return text
}

// A ballot is a PDF the voter signs; the vote's HTTP shape is what the apps
// already speak.
func TestBallotsArePDFsTheVoterSigns(t *testing.T) {
	f := newEventFixture(t)
	signer := newPDFSigner()
	useSigner(t, signer)
	e := f.prepareMeeting(t, 3)
	base := "/" + e.ID + "/motions"
	var mo Motion
	w := f.request("POST", base, `{"title":"Өдөрлөг зохион байгуулах"}`, f.tenant, f.users[1], false)
	decodeInto(t, w.Body.Bytes(), &mo)
	one := base + "/" + mo.ID
	status(t, f.request("POST", one+"/open", ``, f.tenant, f.users[0], true), http.StatusOK)

	w = f.request("POST", one+"/vote", `{"choice":"yes","callback_url":"http://example.com/auth/eid/callback"}`, f.tenant, f.users[1], false)
	status(t, w, http.StatusAccepted)
	var started map[string]any
	decodeInto(t, w.Body.Bytes(), &started)
	for _, key := range []string{"session_id", "verification_code", "app_link", "state"} {
		if _, ok := started[key]; !ok || len(started) != 4 {
			t.Fatalf("vote answered %v", started)
		}
	}
	if req := signer.lastRequest(); !req.RailSignatureOnly || req.CallbackURL == "" || !bytes.HasPrefix(req.PDF, []byte("%PDF-")) {
		t.Fatal("the ballot did not go to eID as a rail-only PDF on the device")
	}
	w = f.request("POST", one+"/vote/poll", `{"session_id":"`+started["session_id"].(string)+`"}`, f.tenant, f.users[1], false)
	status(t, w, http.StatusOK)
	var polled map[string]any
	decodeInto(t, w.Body.Bytes(), &polled)
	if polled["state"] != "signed" || polled["points"] != float64(3) || len(polled) != 2 {
		t.Fatalf("poll answered %v", polled)
	}
	var ballot, stamped []byte
	var digest string
	if err := f.pool.QueryRow(context.Background(), `SELECT ballot_pdf, ballot_signed_pdf, digest_hex FROM events_motion_votes WHERE motion_id = $1 AND user_id = $2`,
		mo.ID, f.users[1]).Scan(&ballot, &stamped, &digest); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(ballot)
	if digest != hex.EncodeToString(sum[:]) || !bytes.HasPrefix(stamped, ballot) {
		t.Fatal("the digest is not the ballot PDF's, or the stamped ballot is not that PDF signed")
	}
	if text := pdfText(t, ballot); !strings.Contains(text, "САНАЛЫН ХУУДАС") || !strings.Contains(text, "ЗӨВШӨӨРӨВ") || !strings.Contains(text, "Өдөрлөг") {
		t.Fatalf("ballot text: %.200s", text)
	}

	own := f.request("GET", one+"/ballot", ``, f.tenant, f.users[1], false)
	status(t, own, http.StatusOK)
	if own.Header().Get("X-Ballot-Signature") != "pades" || !bytes.Equal(own.Body.Bytes(), stamped) {
		t.Fatal("the voter's own ballot is not the stamped PDF")
	}
	status(t, f.request("GET", one+"/votes/"+f.users[1]+"/ballot", ``, f.tenant, f.users[2], false), http.StatusForbidden)
	status(t, f.request("GET", one+"/votes/"+f.users[1]+"/ballot", ``, f.tenant, f.users[0], true), http.StatusOK)
	status(t, f.request("GET", one+"/ballot", ``, f.tenant, f.users[2], false), http.StatusNotFound)

	// eID's stamp is down: the vote counts on its confirmed digest, and the
	// stamped ballot is attached when a later poll can get it.
	signer.set(func(s *pdfSigner) { s.stampErr = nexus.ErrSignedDocumentUnavailable })
	w = f.request("POST", one+"/vote", `{"choice":"no"}`, f.tenant, f.users[2], false)
	decodeInto(t, w.Body.Bytes(), &started)
	session := started["session_id"].(string)
	w = f.request("POST", one+"/vote/poll", `{"session_id":"`+session+`"}`, f.tenant, f.users[2], false)
	decodeInto(t, w.Body.Bytes(), &polled)
	if polled["state"] != "signed" {
		t.Fatalf("a vote without its stamp: %v", polled)
	}
	unstamped := f.request("GET", one+"/ballot", ``, f.tenant, f.users[2], false)
	if unstamped.Header().Get("X-Ballot-Signature") != "digest" {
		t.Fatal("an unstamped ballot is served as stamped")
	}
	signer.set(func(s *pdfSigner) { s.stampErr = nil })
	status(t, f.request("POST", one+"/vote/poll", `{"session_id":"`+session+`"}`, f.tenant, f.users[2], false), http.StatusOK)
	if later := f.request("GET", one+"/ballot", ``, f.tenant, f.users[2], false); later.Header().Get("X-Ballot-Signature") != "pades" {
		t.Fatal("the stamped ballot was not attached later")
	}
	// Attaching it changed nothing the vote says, and nothing else may change.
	if _, err := f.pool.Exec(context.Background(), `UPDATE events_motion_votes SET ballot_signed_pdf = 'x' WHERE motion_id = $1 AND user_id = $2`,
		mo.ID, f.users[2]); err == nil {
		t.Fatal("a stamped ballot was replaced")
	}

	// A rail that signs only digests still signs the ballot's digest.
	signer.set(func(s *pdfSigner) { s.digestOnly = true })
	w = f.request("POST", one+"/vote", `{"choice":"abstain"}`, f.tenant, f.users[3], false)
	status(t, w, http.StatusAccepted)
	decodeInto(t, w.Body.Bytes(), &started)
	status(t, f.request("POST", one+"/vote/poll", `{"session_id":"`+started["session_id"].(string)+`"}`, f.tenant, f.users[3], false), http.StatusOK)
	var mode string
	_ = f.pool.QueryRow(context.Background(), `SELECT ballot_signing FROM events_motion_votes WHERE motion_id = $1 AND user_id = $2`, mo.ID, f.users[3]).Scan(&mode)
	if mode != "digest" {
		t.Fatalf("ballot signing mode %q", mode)
	}

	w = f.request("GET", base, ``, f.tenant, f.users[1], false)
	var listed struct {
		Motions []Motion `json:"motions"`
	}
	decodeInto(t, w.Body.Bytes(), &listed)
	if mv := listed.Motions[0].MyVote; mv == nil || !mv.Ballot || !mv.Stamped {
		t.Fatalf("my vote: %+v", mv)
	}
	status(t, f.request("POST", one+"/close", ``, f.tenant, f.users[0], true), http.StatusOK)
	status(t, f.request("GET", one+"/votes/"+f.users[1]+"/ballot", ``, f.tenant, f.users[2], false), http.StatusOK)
}

func TestArchivePDFsAreDeterministic(t *testing.T) {
	in := archiveRender{
		DocumentID: "00000000-0000-0000-0000-000000000001", Branch: "СДМЗХ — Дархан-Уул", Kind: archiveKindMinutes,
		Number: "2026/014", Title: "Тэргүүлэгчдийн хурал", Body: "Өнөөдөр Үндсэн дүрмийг хэлэлцэв.",
		Signers: []renderSigner{{Name: "Бат-Өлзий", Position: "Тэргүүн"}},
	}
	a, err := renderArchive(in)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := renderArchive(in)
	if !bytes.Equal(a, b) {
		t.Fatal("the same document rendered differently")
	}
	in.Body += "."
	c, _ := renderArchive(in)
	if bytes.Equal(a, c) {
		t.Fatal("a different text rendered the same bytes")
	}
	text := pdfText(t, a)
	for _, want := range []string{"ХУРЛЫН ТЭМДЭГЛЭЛ", "№ 2026/014", "Бат-Өлзий", "Үндсэн дүрмийг"} {
		if !strings.Contains(text, want) {
			t.Fatalf("lacks %q: %.300s", want, text)
		}
	}
}
