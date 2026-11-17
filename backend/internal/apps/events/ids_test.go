package events

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
)

// spellings are the forms PostgreSQL reads as the same uuid as id.
func spellings(id string) []string {
	return []string{strings.ToUpper(id), "{" + id + "}", strings.ReplaceAll(id, "-", ""), " " + strings.ToUpper(id) + " "}
}

// No other spelling of one's own id gets past a self-action guard: the
// organiser's attendance and task, and the committee's decision about itself.
func TestSelfGuardsHoldForEverySpellingOfTheID(t *testing.T) {
	f := newEventFixture(t)
	organiser, other := f.users[0], f.users[1]
	e := f.create(t, 5)
	path := "/" + e.ID + "/attendance"
	status(t, f.request("POST", path, `{"user_id":"`+organiser+`"}`, f.tenant, organiser, true), 200)
	tasks := "/" + e.ID + "/tasks"
	w := f.request("POST", tasks, `{"title":"Бүртгэл","points":10,"slots":2}`, f.tenant, organiser, true)
	status(t, w, http.StatusCreated)
	var task Task
	decodeInto(t, w.Body.Bytes(), &task)
	status(t, f.request("POST", tasks+"/"+task.ID+"/volunteer", ``, f.tenant, organiser, true), 200)

	for _, spelled := range spellings(organiser) {
		t.Run(spelled, func(t *testing.T) {
			wantError(t, f.request("POST", path, `{"user_id":"`+spelled+`","status":"attended"}`, f.tenant, organiser, true), 403, ErrSelfAttendance)
			wantError(t, f.request("POST", "/sanctions", `{"user_id":"`+spelled+`","points":5,"reason":"x"}`, f.tenant, organiser, true), 403,
				"a decision about yourself is for the rest of the committee")
			// In a path, a form that is not a plain uuid is refused outright,
			// and a plain one in capitals is the caller's own id.
			urlForm := strings.TrimSpace(spelled)
			if strings.ContainsAny(urlForm, "{}") {
				return
			}
			wantError(t, f.request("PUT", path+"/"+urlForm, `{"status":"attended"}`, f.tenant, organiser, true), 403, ErrSelfAttendance)
			wantError(t, f.request("POST", tasks+"/"+task.ID+"/assignments/"+urlForm+"/done", ``, f.tenant, organiser, true), 403, ErrSelfTask)
		})
	}
	var points int
	if err := f.pool.QueryRow(context.Background(), `SELECT COALESCE(sum(delta),0) FROM events_point_entries WHERE tenant_id=$1 AND user_id=$2`, f.tenant, organiser).Scan(&points); err != nil || points != 0 {
		t.Fatalf("organiser awarded themselves %d points (%v)", points, err)
	}
	// Another organiser, with any spelling, is served and stored canonically.
	status(t, f.request("PUT", path+"/"+strings.ToUpper(organiser), `{"status":"attended"}`, f.tenant, other, true), 200)
	status(t, f.request("POST", path, `{"user_id":"{`+strings.ToUpper(f.users[2])+`}"}`, f.tenant, organiser, true), 200)
	if got := f.read(t, e.ID, f.users[2]).MyStatus; got != "registered" {
		t.Fatalf("braced id not stored as the member: %q", got)
	}
	status(t, f.request("PUT", path+"/not-a-uuid", `{"status":"attended"}`, f.tenant, other, true), 400)
	status(t, f.request("POST", path, `{"user_id":"not-a-uuid"}`, f.tenant, other, true), 400)
	// The permission gate still answers first.
	status(t, f.request("PUT", path+"/not-a-uuid", `{"status":"attended"}`, f.tenant, f.users[3], false), 403)
}

// A resend that spells the member's id differently is still the same decision.
func TestSanctionReplayIgnoresTheSpellingOfIDs(t *testing.T) {
	f := newEventFixture(t)
	auditor, member := f.users[0], f.users[1]
	key := uuid.NewString()
	status(t, f.requestWithHeader("POST", "/sanctions", `{"user_id":"`+member+`","points":4,"reason":"Хоцорсон"}`, IdempotencyHeader, key, auditor), 201)
	for _, spelled := range spellings(member) {
		w := f.requestWithHeader("POST", "/sanctions", `{"user_id":"`+spelled+`","points":4,"reason":"Хоцорсон"}`, IdempotencyHeader, strings.ToUpper(key), auditor)
		status(t, w, 200)
		if w.Header().Get("Idempotent-Replayed") != "true" {
			t.Fatalf("%s: not a replay", spelled)
		}
	}
	var entries int
	if err := f.pool.QueryRow(context.Background(), `SELECT count(*) FROM events_point_entries WHERE tenant_id=$1 AND user_id=$2`, f.tenant, member).Scan(&entries); err != nil || entries != 1 {
		t.Fatalf("entries=%d err=%v", entries, err)
	}
}
