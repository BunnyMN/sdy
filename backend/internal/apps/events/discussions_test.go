package events

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"testing"

	"github.com/gerege-systems/open-gerege-nexus/backend/pkg/nexus"
	"github.com/google/uuid"
)

// fakeSigner stands in for eID: it remembers the digest each session was
// asked to sign and, unless told to tamper, reports that digest as signed.
type fakeSigner struct {
	mu      sync.Mutex
	digests map[string]string
	tamper  map[string]bool
	regs    map[string]string
}

func newFakeSigner() *fakeSigner {
	return &fakeSigner{digests: map[string]string{}, tamper: map[string]bool{}, regs: map[string]string{}}
}

func (s *fakeSigner) Enabled() bool { return true }
func (s *fakeSigner) SignDigest(_ context.Context, request nexus.SignatureRequest) (nexus.SignatureSession, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id := uuid.NewString()
	s.digests[id], s.regs[id] = request.DigestHex, request.RegNumber
	return nexus.SignatureSession{SessionID: id, VerificationCode: "1234"}, nil
}
func (s *fakeSigner) PollSignature(_ context.Context, reg, session string) (nexus.SignatureState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.regs[session] != reg {
		return nexus.SignatureFailed, nil
	}
	return nexus.SignatureCompleted, nil
}
func (s *fakeSigner) VerifiedDigest(_ context.Context, _ string, session string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	raw, _ := hex.DecodeString(s.digests[session])
	if s.tamper[session] {
		raw[0] ^= 0xff
	}
	return base64.StdEncoding.EncodeToString(raw), nil
}
func (s *fakeSigner) SignDocument(context.Context, nexus.DocumentSignatureRequest) (nexus.SignatureSession, error) {
	return nexus.SignatureSession{}, nexus.ErrPDFSigningUnavailable
}
func (s *fakeSigner) SignedDocument(context.Context, string, string) (nexus.SignedDocument, error) {
	return nexus.SignedDocument{}, nexus.ErrPDFSigningUnavailable
}

func decodeInto(t *testing.T, body []byte, into any) {
	t.Helper()
	if err := json.Unmarshal(body, into); err != nil {
		t.Fatal(err, string(body))
	}
}

// prepareMeeting makes an event where users[1..3] attended and users[4] only
// registered, and gives users[1..4] a linked eID identity.
func (f *eventFixture) prepareMeeting(t *testing.T, votePoints int) Event {
	t.Helper()
	ctx := context.Background()
	in := eventInput{Title: "Хурал", StartsAt: "2026-10-01T10:00:00+08:00", Status: "planned", VotePoints: &votePoints}
	body, _ := json.Marshal(in)
	w := f.request("POST", "/", string(body), f.tenant, f.users[0], true)
	status(t, w, http.StatusCreated)
	var e Event
	decodeInto(t, w.Body.Bytes(), &e)
	for i, user := range f.users[1:5] {
		attendance := "attended"
		if i == 3 {
			attendance = "registered"
		}
		status(t, f.request("POST", "/"+e.ID+"/attendance", `{"user_id":"`+user+`","status":"`+attendance+`"}`, f.tenant, f.users[0], true), 200)
		if _, err := f.pool.Exec(ctx, `INSERT INTO registry.user_eid_identities (user_id, reg_number, person_etsi) VALUES ($1, $2, $3)
			ON CONFLICT (user_id) DO NOTHING`, user, "УБ0000000"+string(rune('1'+i)), "PNOMN-"+user); err != nil {
			t.Fatal(err)
		}
	}
	return e
}

func TestDiscussionVotesAreSignedAndDecidedByMajority(t *testing.T) {
	f := newEventFixture(t)
	signer := newFakeSigner()
	nexus.Provide[nexus.Signer](signer)
	e := f.prepareMeeting(t, 5)
	base := "/" + e.ID + "/motions"

	w := f.request("POST", base, `{"title":"Хураамжийг 5000 болгох","body":"Сарын хураамж"}`, f.tenant, f.users[5], false)
	status(t, w, http.StatusCreated)
	var mo Motion
	decodeInto(t, w.Body.Bytes(), &mo)
	one := base + "/" + mo.ID

	// Not under vote yet; the proposer may edit, another member may not.
	status(t, f.request("POST", one+"/vote", `{"choice":"yes"}`, f.tenant, f.users[1], false), http.StatusConflict)
	status(t, f.request("PUT", one, `{"title":"Хураамжийг 5000₮ болгох","body":"Сарын хураамж"}`, f.tenant, f.users[2], false), http.StatusForbidden)
	status(t, f.request("PUT", one, `{"title":"Хураамжийг 5000₮ болгох","body":"Сарын хураамж"}`, f.tenant, f.users[5], false), http.StatusOK)
	status(t, f.request("POST", one+"/open", ``, f.tenant, f.users[5], false), http.StatusForbidden)
	status(t, f.request("POST", one+"/open", ``, f.tenant, f.users[0], true), http.StatusOK)
	status(t, f.request("PUT", one, `{"title":"Өөр","body":""}`, f.tenant, f.users[0], true), http.StatusConflict)

	vote := func(user, choice string, tamper bool) int {
		t.Helper()
		w := f.request("POST", one+"/vote", `{"choice":"`+choice+`"}`, f.tenant, user, false)
		if w.Code != http.StatusAccepted {
			return w.Code
		}
		var started struct {
			SessionID string `json:"session_id"`
		}
		decodeInto(t, w.Body.Bytes(), &started)
		if tamper {
			signer.mu.Lock()
			signer.tamper[started.SessionID] = true
			signer.mu.Unlock()
		}
		return f.request("POST", one+"/vote/poll", `{"session_id":"`+started.SessionID+`"}`, f.tenant, user, false).Code
	}
	if code := vote(f.users[4], "yes", false); code != http.StatusForbidden {
		t.Fatalf("a member who only registered voted: %d", code)
	}
	if code := vote(f.users[1], "yes", false); code != http.StatusOK {
		t.Fatalf("vote: %d", code)
	}
	if code := vote(f.users[1], "no", false); code != http.StatusConflict {
		t.Fatalf("a second vote was accepted: %d", code)
	}
	if code := vote(f.users[2], "no", false); code != http.StatusOK {
		t.Fatalf("vote: %d", code)
	}
	if code := vote(f.users[3], "yes", true); code != http.StatusConflict {
		t.Fatalf("a signature over another document was counted: %d", code)
	}
	if code := vote(f.users[3], "abstain", false); code != http.StatusOK {
		t.Fatalf("a retry after a failed signature: %d", code)
	}
	// The roll is published once decided; managers see it before.
	status(t, f.request("GET", one+"/votes", ``, f.tenant, f.users[2], false), http.StatusForbidden)
	status(t, f.request("GET", one+"/votes", ``, f.tenant, f.users[0], true), http.StatusOK)

	w = f.request("POST", one+"/close", ``, f.tenant, f.users[0], true)
	status(t, w, http.StatusOK)
	decodeInto(t, w.Body.Bytes(), &mo)
	if mo.Status != "decided" || mo.Result != "rejected" || mo.Yes != 1 || mo.No != 1 || mo.Abstain != 1 {
		t.Fatalf("one yes and one no is not a majority: %+v", mo)
	}
	status(t, f.request("GET", one+"/votes", ``, f.tenant, f.users[2], false), http.StatusOK)

	// History: a decided motion and a signed vote do not change, even directly.
	if _, err := f.pool.Exec(context.Background(), `UPDATE events_motions SET result='approved' WHERE id=$1`, mo.ID); err == nil {
		t.Fatal("a decided motion was rewritten")
	}
	if _, err := f.pool.Exec(context.Background(), `UPDATE events_motion_votes SET choice='yes' WHERE motion_id=$1 AND status='signed'`, mo.ID); err == nil {
		t.Fatal("a signed vote was rewritten")
	}
	var signed int
	var document string
	if err := f.pool.QueryRow(context.Background(), `SELECT count(*) FILTER (WHERE status='signed'), max(document)
		FROM events_motion_votes WHERE motion_id=$1`, mo.ID).Scan(&signed, &document); err != nil || signed != 3 {
		t.Fatalf("signed votes %d (%v)", signed, err)
	}
	if !strings.Contains(document, mo.ContentHash) || !strings.Contains(document, mo.ID) {
		t.Fatal("the signed document does not name the motion and its frozen text")
	}
	var points int
	if err := f.pool.QueryRow(context.Background(), `SELECT COALESCE(sum(delta),0) FROM events_point_entries
		WHERE tenant_id=$1 AND user_id=$2 AND reason='motion.vote'`, f.tenant, f.users[1]).Scan(&points); err != nil || points != 5 {
		t.Fatalf("vote points %d (%v)", points, err)
	}

	// A second motion, approved, and one withdrawn by its proposer.
	w = f.request("POST", base, `{"title":"Цэвэрлэгээ хийх"}`, f.tenant, f.users[1], false)
	status(t, w, http.StatusCreated)
	decodeInto(t, w.Body.Bytes(), &mo)
	two := base + "/" + mo.ID
	status(t, f.request("POST", two+"/open", ``, f.tenant, f.users[0], true), http.StatusOK)
	vote(f.users[1], "yes", false)
	vote(f.users[2], "yes", false)
	w = f.request("POST", two+"/close", ``, f.tenant, f.users[0], true)
	decodeInto(t, w.Body.Bytes(), &mo)
	if mo.Result != "approved" {
		t.Fatalf("two yes votes did not approve: %+v", mo)
	}
	w = f.request("POST", base, `{"title":"Буцаах санал"}`, f.tenant, f.users[2], false)
	decodeInto(t, w.Body.Bytes(), &mo)
	status(t, f.request("POST", base+"/"+mo.ID+"/withdraw", `{"note":"Давхардсан"}`, f.tenant, f.users[2], false), http.StatusOK)

	// Another branch sees none of it.
	w = f.request("GET", base, ``, f.other, f.users[1], false)
	if w.Code == http.StatusOK && strings.Contains(w.Body.String(), "Цэвэрлэгээ") {
		t.Fatal("another branch read this branch's discussion")
	}
}

func TestTasksAwardPointsOnceAndFeedTheLeaderboard(t *testing.T) {
	f := newEventFixture(t)
	nexus.Provide[nexus.Signer](newFakeSigner())
	e := f.prepareMeeting(t, 0)
	base := "/" + e.ID + "/tasks"

	status(t, f.request("POST", base, `{"title":"Бүртгэл","points":10,"slots":1}`, f.tenant, f.users[1], false), http.StatusForbidden)
	w := f.request("POST", base, `{"title":"Бүртгэл","points":10,"slots":1}`, f.tenant, f.users[0], true)
	status(t, w, http.StatusCreated)
	var task Task
	decodeInto(t, w.Body.Bytes(), &task)
	one := base + "/" + task.ID

	status(t, f.request("POST", one+"/assign", `{"user_id":"`+f.users[1]+`"}`, f.tenant, f.users[0], true), http.StatusOK)
	status(t, f.request("POST", one+"/assign", `{"user_id":"`+f.users[1]+`"}`, f.tenant, f.users[0], true), http.StatusConflict)
	status(t, f.request("POST", one+"/respond", `{"accept":true}`, f.tenant, f.users[1], false), http.StatusOK)
	status(t, f.request("POST", one+"/volunteer", ``, f.tenant, f.users[2], false), http.StatusConflict)
	status(t, f.request("POST", one+"/assignments/"+f.users[1]+"/done", ``, f.tenant, f.users[1], false), http.StatusForbidden)
	status(t, f.request("POST", one+"/assignments/"+f.users[1]+"/done", ``, f.tenant, f.users[0], true), http.StatusOK)
	status(t, f.request("POST", one+"/assignments/"+f.users[1]+"/done", ``, f.tenant, f.users[0], true), http.StatusConflict)
	status(t, f.request("PUT", one, `{"title":"Бүртгэл","points":20,"slots":1}`, f.tenant, f.users[0], true), http.StatusConflict)
	status(t, f.request("DELETE", one, ``, f.tenant, f.users[0], true), http.StatusConflict)

	ledger := func(user string) int {
		t.Helper()
		var points int
		if err := f.pool.QueryRow(context.Background(), `SELECT COALESCE(sum(delta),0) FROM events_point_entries WHERE tenant_id=$1 AND user_id=$2`,
			f.tenant, user).Scan(&points); err != nil {
			t.Fatal(err)
		}
		return points
	}
	if got := ledger(f.users[1]); got != 10 {
		t.Fatalf("points after confirmation %d", got)
	}
	status(t, f.request("POST", one+"/assignments/"+f.users[1]+"/undo", ``, f.tenant, f.users[0], true), http.StatusOK)
	if got := ledger(f.users[1]); got != 0 {
		t.Fatalf("points after undo %d", got)
	}
	status(t, f.request("POST", one+"/assignments/"+f.users[1]+"/done", ``, f.tenant, f.users[0], true), http.StatusOK)

	// A second task, volunteered for.
	w = f.request("POST", base, `{"title":"Зохион байгуулалт","points":3,"slots":2}`, f.tenant, f.users[0], true)
	decodeInto(t, w.Body.Bytes(), &task)
	status(t, f.request("POST", base+"/"+task.ID+"/volunteer", ``, f.tenant, f.users[2], false), http.StatusOK)
	status(t, f.request("POST", base+"/"+task.ID+"/assignments/"+f.users[2]+"/done", ``, f.tenant, f.users[0], true), http.StatusOK)

	w = f.request("GET", "/leaderboard?period=all", ``, f.tenant, f.users[2], false)
	status(t, w, http.StatusOK)
	var board struct {
		Standings []Standing `json:"standings"`
		Me        *Standing  `json:"me"`
	}
	decodeInto(t, w.Body.Bytes(), &board)
	if len(board.Standings) < 2 || board.Standings[0].UserID != f.users[1] || board.Standings[0].Points != 10 || board.Standings[0].Tasks != 1 {
		t.Fatalf("leaderboard %+v", board.Standings)
	}
	if board.Me == nil || board.Me.UserID != f.users[2] || board.Me.Rank != 2 || board.Me.Points != 3 || board.Me.Attended != 1 {
		t.Fatalf("my standing %+v", board.Me)
	}
	status(t, f.request("GET", "/leaderboard?period=week", ``, f.tenant, f.users[2], false), http.StatusBadRequest)

	w = f.request("GET", "/leaderboard?period=all", ``, f.other, f.users[2], false)
	status(t, w, http.StatusOK)
	decodeInto(t, w.Body.Bytes(), &board)
	if len(board.Standings) != 0 {
		t.Fatalf("another branch's leaderboard holds this branch's people: %+v", board.Standings)
	}
}
