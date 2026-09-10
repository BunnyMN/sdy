package events

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"testing"
)

func TestCheckinAwardsPointsOnceAndCorrectionsKeepHistory(t *testing.T) {
	f := newEventFixture(t)
	e := f.create(t, 2)
	user := f.users[1]
	status(t, f.request("PUT", "/"+e.ID+"/", `{"title":"Points","starts_at":"2026-10-01T02:00:00Z","points_value":10}`, f.tenant, f.users[0], true), 200)
	status(t, f.request("POST", "/"+e.ID+"/register", "", f.tenant, user, false), 200)
	status(t, f.request("POST", "/"+e.ID+"/check-in-code", "", f.tenant, user, false), 403)
	issued := f.request("POST", "/"+e.ID+"/check-in-code", "", f.tenant, f.users[0], true)
	status(t, issued, 200)
	var code struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(issued.Body.Bytes(), &code); err != nil {
		t.Fatal(err)
	}
	status(t, f.request("POST", "/"+e.ID+"/check-in", `{"token":"`+strings.Repeat("0", 48)+`"}`, f.tenant, user, false), 409)
	status(t, f.request("POST", "/"+e.ID+"/check-in", `{"token":"`+code.Token+`"}`, f.other, user, false), 404)
	status(t, f.request("POST", "/"+e.ID+"/check-in", `{"token":"`+code.Token+`"}`, f.tenant, f.users[2], false), 409)
	var wg sync.WaitGroup
	errors := make(chan string, 8)
	for range 8 {
		wg.Go(func() {
			w := f.request("POST", "/"+e.ID+"/check-in", `{"token":"`+code.Token+`"}`, f.tenant, user, false)
			if w.Code != 200 {
				errors <- fmt.Sprintf("%d: %s", w.Code, w.Body.String())
			}
		})
	}
	wg.Wait()
	close(errors)
	for err := range errors {
		t.Error(err)
	}
	check := func(total, entries int) {
		t.Helper()
		var gotTotal, gotEntries int
		if err := f.pool.QueryRow(context.Background(), `SELECT COALESCE(sum(delta),0),count(*) FROM events_point_entries WHERE event_id=$1 AND user_id=$2`, e.ID, user).Scan(&gotTotal, &gotEntries); err != nil {
			t.Fatal(err)
		}
		if gotTotal != total || gotEntries != entries {
			t.Fatalf("points=%d entries=%d; want %d/%d", gotTotal, gotEntries, total, entries)
		}
	}
	check(10, 1)
	status(t, f.request("PUT", "/"+e.ID+"/", `{"title":"Points","starts_at":"2026-10-01T02:00:00Z","points_value":20}`, f.tenant, f.users[0], true), 409)
	status(t, f.request("PUT", "/"+e.ID+"/attendance/"+user, `{"status":"attended"}`, f.tenant, f.users[0], true), 200)
	check(10, 1)
	status(t, f.request("PUT", "/"+e.ID+"/attendance/"+user, `{"status":"absent","note":"Correction"}`, f.tenant, f.users[0], true), 200)
	check(0, 2)
	status(t, f.request("PUT", "/"+e.ID+"/attendance/"+user, `{"status":"attended"}`, f.tenant, f.users[0], true), 200)
	check(10, 3)
	other := f.request("GET", "/points", "", f.tenant, f.users[2], false)
	status(t, other, 200)
	if strings.Contains(other.Body.String(), e.ID) {
		t.Fatal("another member saw point history")
	}
	mine := f.request("GET", "/mine", "", f.tenant, user, false)
	status(t, mine, 200)
	if !strings.Contains(mine.Body.String(), `"points":10`) {
		t.Fatal(mine.Body.String())
	}
	status(t, f.request("GET", "/summary", "", f.tenant, user, false), 403)
}

func TestExpiredCheckinCodeDoesNotChangeAttendanceOrPoints(t *testing.T) {
	f := newEventFixture(t)
	e := f.create(t, 1)
	user := f.users[1]
	status(t, f.request("POST", "/"+e.ID+"/register", "", f.tenant, user, false), 200)
	issued := f.request("POST", "/"+e.ID+"/check-in-code", "", f.tenant, f.users[0], true)
	status(t, issued, 200)
	var code struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(issued.Body.Bytes(), &code); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(context.Background(), `UPDATE events_events SET checkin_expires_at=now()-interval '1 second' WHERE id=$1`, e.ID); err != nil {
		t.Fatal(err)
	}
	status(t, f.request("POST", "/"+e.ID+"/check-in", `{"token":"`+code.Token+`"}`, f.tenant, user, false), 409)
	if f.read(t, e.ID, user).MyStatus != "registered" {
		t.Fatal("expired code changed attendance")
	}
}
