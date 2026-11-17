package events

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gerege-systems/open-gerege-nexus/backend/pkg/nexus"
	"github.com/google/uuid"
)

func wantError(t *testing.T, w interface {
	Result() *http.Response
}, code int, message string) {
	t.Helper()
	res := w.Result()
	defer res.Body.Close()
	var e struct {
		Error string `json:"error"`
	}
	_ = json.NewDecoder(res.Body).Decode(&e)
	if res.StatusCode != code || e.Error != message {
		t.Fatalf("got %d %q, want %d %q", res.StatusCode, e.Error, code, message)
	}
}

// An organiser does not record their own attendance, change it, or confirm
// their own task: all three move their own points.
func TestOrganiserCannotAwardThemselves(t *testing.T) {
	f := newEventFixture(t)
	organiser, other := f.users[0], f.users[1]
	e := f.create(t, 5)
	path := "/" + e.ID + "/attendance"
	wantError(t, f.request("POST", path, `{"user_id":"`+organiser+`","status":"attended"}`, f.tenant, organiser, true), 403, ErrSelfAttendance)
	// Putting one's own name down is a registration, and still allowed.
	status(t, f.request("POST", path, `{"user_id":"`+organiser+`"}`, f.tenant, organiser, true), 200)
	wantError(t, f.request("POST", path, `{"user_id":"`+organiser+`","status":"attended"}`, f.tenant, organiser, true), 403, ErrSelfAttendance)
	wantError(t, f.request("PUT", path+"/"+organiser, `{"status":"attended"}`, f.tenant, organiser, true), 403, ErrSelfAttendance)
	// Another organiser records it.
	status(t, f.request("PUT", path+"/"+organiser, `{"status":"attended"}`, f.tenant, other, true), 200)
	wantError(t, f.request("PUT", path+"/"+organiser, `{"status":"absent","note":"x"}`, f.tenant, organiser, true), 403, ErrSelfAttendance)

	tasks := "/" + e.ID + "/tasks"
	w := f.request("POST", tasks, `{"title":"Бүртгэл","points":10,"slots":2}`, f.tenant, organiser, true)
	status(t, w, http.StatusCreated)
	var task Task
	decodeInto(t, w.Body.Bytes(), &task)
	status(t, f.request("POST", tasks+"/"+task.ID+"/volunteer", ``, f.tenant, organiser, true), 200)
	wantError(t, f.request("POST", tasks+"/"+task.ID+"/assignments/"+organiser+"/done", ``, f.tenant, organiser, true), 403, ErrSelfTask)
	status(t, f.request("POST", tasks+"/"+task.ID+"/assignments/"+organiser+"/done", ``, f.tenant, other, true), 200)
}

// Changing attendance that was already recorded needs a reason through the
// upsert as much as through the mark.
func TestAttendanceUpsertCorrectionNeedsAReason(t *testing.T) {
	f := newEventFixture(t)
	e := f.create(t, 5)
	pts := 10
	body, _ := json.Marshal(eventInput{Title: e.Title, StartsAt: e.StartsAt, PointsValue: &pts})
	status(t, f.request("PUT", "/"+e.ID+"/", string(body), f.tenant, f.users[0], true), 200)
	path := "/" + e.ID + "/attendance"
	user := f.users[1]
	status(t, f.request("POST", path, `{"user_id":"`+user+`","status":"attended"}`, f.tenant, f.users[0], true), 200)
	// Repeating the same outcome needs nothing.
	status(t, f.request("POST", path, `{"user_id":"`+user+`","status":"attended"}`, f.tenant, f.users[0], true), 200)
	wantError(t, f.request("POST", path, `{"user_id":"`+user+`","status":"absent"}`, f.tenant, f.users[0], true), 400, errCorrectionReason)
	if got := f.read(t, e.ID, user).MyStatus; got != "attended" {
		t.Fatalf("status = %q", got)
	}
	status(t, f.request("POST", path, `{"user_id":"`+user+`","status":"absent","note":"Left before the roll call"}`, f.tenant, f.users[0], true), 200)
	var total int
	var note string
	if err := f.pool.QueryRow(context.Background(), `SELECT COALESCE((SELECT sum(delta) FROM events_point_entries WHERE event_id=$1 AND user_id=$2),0),
		(SELECT note FROM events_attendance WHERE event_id=$1 AND user_id=$2)`, e.ID, user).Scan(&total, &note); err != nil {
		t.Fatal(err)
	}
	if total != 0 || note != "Left before the roll call" {
		t.Fatalf("total=%d note=%q", total, note)
	}
}

// A cancelled event's list is closed; a PUT without a status keeps the one
// the event has.
func TestCancelledEventsAndStatusLessEdits(t *testing.T) {
	f := newEventFixture(t)
	e := f.create(t, 5)
	user := f.users[1]
	status(t, f.request("POST", "/"+e.ID+"/register", "", f.tenant, user, false), 200)
	status(t, f.request("PUT", "/"+e.ID+"/", `{"title":"Cancelled","starts_at":"2026-10-01T02:00:00Z","status":"cancelled"}`, f.tenant, f.users[0], true), 200)
	status(t, f.request("PUT", "/"+e.ID+"/", `{"title":"Renamed","starts_at":"2026-10-01T02:00:00Z"}`, f.tenant, f.users[0], true), 200)
	if got := f.read(t, e.ID, user); got.Status != "cancelled" || got.Title != "Renamed" {
		t.Fatalf("status-less PUT: %+v", got)
	}
	wantError(t, f.request("PUT", "/"+e.ID+"/attendance/"+user, `{"status":"attended"}`, f.tenant, f.users[0], true), 409, ErrEventCancelled)
	wantError(t, f.request("POST", "/"+e.ID+"/attendance", `{"user_id":"`+f.users[2]+`"}`, f.tenant, f.users[0], true), 409, ErrEventCancelled)
	status(t, f.request("PUT", "/"+e.ID+"/", `{"title":"Done","starts_at":"2026-10-01T02:00:00Z","status":"done"}`, f.tenant, f.users[0], true), 200)
	// A done event's attendance is still the organiser's to record.
	status(t, f.request("PUT", "/"+e.ID+"/attendance/"+user, `{"status":"attended"}`, f.tenant, f.users[0], true), 200)
}

// Only people with access whose membership here is not suspended or ended
// can be put on a list.
func TestOnlyActiveMembersCanBeAdded(t *testing.T) {
	f := newEventFixture(t)
	e := f.create(t, 5)
	ctx := context.Background()
	gone, suspended := f.users[1], f.users[2]
	if _, err := f.pool.Exec(ctx, `UPDATE workspace.memberships SET active=false,deactivated_at=now() WHERE tenant_id=$1 AND user_id=$2`, f.tenant, gone); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, `UPDATE workspace.memberships SET is_primary=true,member_status='suspended' WHERE tenant_id=$1 AND user_id=$2`, f.tenant, suspended); err != nil {
		t.Fatal(err)
	}
	for _, user := range []string{gone, suspended} {
		status(t, f.request("POST", "/"+e.ID+"/attendance", `{"user_id":"`+user+`"}`, f.tenant, f.users[0], true), 400)
	}
	status(t, f.request("POST", "/"+e.ID+"/attendance", `{"user_id":"`+f.users[3]+`"}`, f.tenant, f.users[0], true), 200)
}

func issueCode(t *testing.T, f *eventFixture, eventID, organiser string) string {
	t.Helper()
	w := f.request("POST", "/"+eventID+"/check-in-code", "", f.tenant, organiser, true)
	status(t, w, 200)
	var code struct {
		Token string `json:"token"`
	}
	decodeInto(t, w.Body.Bytes(), &code)
	return code.Token
}

// Two organisers' screens are both valid; a new code replaces only its own
// issuer's previous one; an organiser does not check in with their own code.
func TestCheckinCodesArePerOrganiser(t *testing.T) {
	f := newEventFixture(t)
	e := f.create(t, 10)
	status(t, f.request("PUT", "/"+e.ID+"/", `{"title":"Doors","starts_at":"`+startsSoon()+`"}`, f.tenant, f.users[0], true), 200)
	first, second := f.users[0], f.users[1]
	for _, user := range f.users[1:6] {
		status(t, f.request("POST", "/"+e.ID+"/register", "", f.tenant, user, false), 200)
	}
	a := issueCode(t, f, e.ID, first)
	b := issueCode(t, f, e.ID, second)
	checkin := func(user, token string) *httptestRecorder {
		return f.request("POST", "/"+e.ID+"/check-in", `{"token":"`+token+`"}`, f.tenant, user, false)
	}
	status(t, checkin(f.users[2], a), 200)
	status(t, checkin(f.users[3], b), 200)
	// first refreshes their screen: their old code stops, second's does not.
	a2 := issueCode(t, f, e.ID, first)
	status(t, checkin(f.users[4], a), 409)
	status(t, checkin(f.users[4], a2), 200)
	status(t, checkin(f.users[5], b), 200)
	wantError(t, checkin(second, b), 403, ErrSelfCheckin)
	status(t, checkin(second, a2), 200)
}

// Codes are issued and accepted only around the event.
func TestCheckinOnlyAroundTheEvent(t *testing.T) {
	f := newEventFixture(t)
	e := f.create(t, 10)
	user := f.users[1]
	status(t, f.request("POST", "/"+e.ID+"/register", "", f.tenant, user, false), 200)
	far := time.Now().Add(72 * time.Hour).UTC().Format(time.RFC3339)
	status(t, f.request("PUT", "/"+e.ID+"/", `{"title":"Later","starts_at":"`+far+`"}`, f.tenant, f.users[0], true), 200)
	wantError(t, f.request("POST", "/"+e.ID+"/check-in-code", "", f.tenant, f.users[0], true), 409, ErrCheckinWindow)
	status(t, f.request("PUT", "/"+e.ID+"/", `{"title":"Now","starts_at":"`+startsSoon()+`"}`, f.tenant, f.users[0], true), 200)
	token := issueCode(t, f, e.ID, f.users[0])
	// The event is moved away after the code was shown: the code no longer works.
	status(t, f.request("PUT", "/"+e.ID+"/", `{"title":"Later","starts_at":"`+far+`"}`, f.tenant, f.users[0], true), 200)
	wantError(t, f.request("POST", "/"+e.ID+"/check-in", `{"token":"`+token+`"}`, f.tenant, user, false), 409, ErrCheckinWindow)

	start := time.Date(2026, 11, 20, 20, 0, 0, 0, ulaanbaatar)
	for _, tc := range []struct {
		name string
		end  *time.Time
		at   time.Time
		open bool
	}{
		{"too early", nil, start.Add(-3 * time.Hour), false},
		{"lead", nil, start.Add(-90 * time.Minute), true},
		{"evening without end runs past midnight", nil, start.Add(3*time.Hour + 30*time.Minute), true},
		{"after end of day", nil, start.Add(5 * time.Hour), false},
		{"trail after end", ptr(start.Add(3 * time.Hour)), start.Add(4*time.Hour + 30*time.Minute), true},
		{"past trail", ptr(start.Add(3 * time.Hour)), start.Add(5*time.Hour + 1), false},
	} {
		ev := Event{StartsAt: stamp(start)}
		if tc.end != nil {
			ev.EndsAt = stampPtr(tc.end)
		}
		if _, open := checkinOpen(ev, tc.at); open != tc.open {
			t.Errorf("%s: open=%v", tc.name, open)
		}
	}
}

func ptr[T any](v T) *T { return &v }

// The same decision sent twice with one Idempotency-Key is recorded once.
func TestSanctionIdempotencyKey(t *testing.T) {
	f := newEventFixture(t)
	auditor, member := f.users[0], f.users[1]
	body := `{"user_id":"` + member + `","points":7,"reason":"Хурлыг тасалдуулсан"}`
	send := func(key, body string) *httptestRecorder {
		return f.requestWithHeader("POST", "/sanctions", body, IdempotencyHeader, key, auditor)
	}
	status(t, send("not-a-uuid", body), 400)
	key := uuid.NewString()
	results := make(chan *httptestRecorder, 6)
	var wg sync.WaitGroup
	for range 6 {
		wg.Go(func() { results <- send(key, body) })
	}
	wg.Wait()
	close(results)
	ids := map[string]bool{}
	codes := map[int]int{}
	for w := range results {
		codes[w.Code]++
		var s Sanction
		decodeInto(t, w.Body.Bytes(), &s)
		ids[s.ID] = true
	}
	if codes[201] != 1 || codes[200] != 5 || len(ids) != 1 {
		t.Fatalf("codes=%v ids=%v", codes, ids)
	}
	wantError(t, send(key, strings.Replace(body, "7", "8", 1)), 409, ErrIdempotencyReuse)
	var total, entries int
	if err := f.pool.QueryRow(context.Background(), `SELECT COALESCE(sum(delta),0),count(*) FROM events_point_entries WHERE tenant_id=$1 AND user_id=$2`, f.tenant, member).Scan(&total, &entries); err != nil {
		t.Fatal(err)
	}
	if total != -7 || entries != 1 {
		t.Fatalf("total=%d entries=%d", total, entries)
	}
	// Without the header every request is a new decision, as before.
	status(t, send("", body), 201)
	status(t, send(uuid.NewString(), body), 201)
}

// An organiser reviews the reported issues and dismisses the reports, which
// shows a hidden issue to members again.
func TestReportedIssuesCanBeReviewedAndDismissed(t *testing.T) {
	f := newEventFixture(t)
	e := f.prepareMeeting(t, 0)
	base := "/" + e.ID + "/motions"
	w := f.request("POST", base, `{"title":"Маргаантай","body":"..."}`, f.tenant, f.users[5], false)
	status(t, w, http.StatusCreated)
	var mo Motion
	decodeInto(t, w.Body.Bytes(), &mo)
	for _, user := range f.users[1:4] {
		status(t, f.request("POST", base+"/"+mo.ID+"/report", `{"reason":"Доромжлол"}`, f.tenant, user, false), 200)
	}
	visible := func() bool {
		w := f.request("GET", base, ``, f.tenant, f.users[6], false)
		status(t, w, 200)
		return strings.Contains(w.Body.String(), mo.ID)
	}
	if visible() {
		t.Fatal("reported issue still visible")
	}
	status(t, f.request("GET", "/reported", ``, f.tenant, f.users[6], false), 403)
	w = f.request("GET", "/reported", ``, f.tenant, f.users[0], true)
	status(t, w, 200)
	var list struct {
		Issues []ReportedIssue `json:"issues"`
	}
	decodeInto(t, w.Body.Bytes(), &list)
	if len(list.Issues) != 1 || list.Issues[0].MotionID != mo.ID || list.Issues[0].ReportCount != 3 || !list.Issues[0].Hidden ||
		len(list.Issues[0].Reports) != 3 || list.Issues[0].Reports[0].Reason != "Доромжлол" {
		t.Fatalf("reported: %+v", list.Issues)
	}
	if strings.Contains(w.Body.String(), f.users[1]) {
		t.Fatal("the review exposes who reported")
	}
	status(t, f.request("POST", base+"/"+mo.ID+"/reports/dismiss", `{"reason":"Not abusive"}`, f.tenant, f.users[6], false), 403)
	w = f.request("POST", base+"/"+mo.ID+"/reports/dismiss", `{"reason":"Not abusive"}`, f.tenant, f.users[0], true)
	status(t, w, 200)
	if !strings.Contains(w.Body.String(), `"dismissed":3`) {
		t.Fatal(w.Body.String())
	}
	if !visible() {
		t.Fatal("dismissed issue still hidden")
	}
	w = f.request("GET", "/reported", ``, f.tenant, f.users[0], true)
	decodeInto(t, w.Body.Bytes(), &list)
	if len(list.Issues) != 0 {
		t.Fatalf("still listed: %+v", list.Issues)
	}
	var resolvedBy string
	if err := f.pool.QueryRow(context.Background(), `SELECT DISTINCT resolved_by::text FROM events_motion_reports WHERE motion_id=$1`, mo.ID).Scan(&resolvedBy); err != nil || resolvedBy != f.users[0] {
		t.Fatalf("resolved_by=%q err=%v", resolvedBy, err)
	}
	status(t, f.request("POST", "/"+uuid.NewString()+"/motions/"+mo.ID+"/reports/dismiss", `{}`, f.tenant, f.users[0], true), 404)
}

// The 100-issue cap holds under concurrent proposals.
func TestMotionCapHoldsUnderConcurrency(t *testing.T) {
	f := newEventFixture(t)
	e := f.create(t, 5)
	if _, err := f.pool.Exec(context.Background(), `INSERT INTO events_motions (tenant_id,event_id,title,proposer_id)
		SELECT $1,$2,'Issue '||g,$3 FROM generate_series(1,$4::int - 1) g`, f.tenant, e.ID, f.users[0], maxMotionsPerEvent); err != nil {
		t.Fatal(err)
	}
	results := make(chan int, 10)
	var wg sync.WaitGroup
	for _, user := range f.users[1:11] {
		wg.Go(func() {
			results <- f.request("POST", "/"+e.ID+"/motions", `{"title":"Last one","body":""}`, f.tenant, user, false).Code
		})
	}
	wg.Wait()
	close(results)
	codes := map[int]int{}
	for c := range results {
		codes[c]++
	}
	var count int
	if err := f.pool.QueryRow(context.Background(), `SELECT count(*) FROM events_motions WHERE event_id=$1`, e.ID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if codes[201] != 1 || codes[409] != 9 || count != maxMotionsPerEvent {
		t.Fatalf("codes=%v count=%d", codes, count)
	}
}

func (f *eventFixture) requestWithHeader(method, path, body, header, value, user string) *httptestRecorder {
	r := newRequest(method, "/api/v1/events"+path, body)
	if value != "" {
		r.Header.Set(header, value)
	}
	ctx := nexus.WithUser(nexus.WithWorkspaceID(r.Context(), f.tenant), nexus.UserClaims{WorkspaceID: f.tenant, UserID: user, IsAdmin: true})
	w := newRecorder()
	f.router.ServeHTTP(w, r.WithContext(ctx))
	return w
}

type httptestRecorder = httptest.ResponseRecorder

func newRequest(method, path, body string) *http.Request {
	return httptest.NewRequest(method, path, strings.NewReader(body))
}
func newRecorder() *httptest.ResponseRecorder { return httptest.NewRecorder() }
