package events

import (
	"context"
	"net/http"
	"testing"
)

func TestTheCommitteeWarnsAndDeductsPoints(t *testing.T) {
	f := newEventFixture(t)
	auditor, member, other := f.users[0], f.users[1], f.users[2]

	// An ordinary member neither decides nor reads the committee's list.
	status(t, f.request("POST", "/sanctions", `{"user_id":"`+other+`","points":5,"reason":"x"}`, f.tenant, member, false), http.StatusForbidden)
	status(t, f.request("GET", "/sanctions", ``, f.tenant, member, false), http.StatusForbidden)

	// Nobody decides about themselves; a reason is required.
	status(t, f.request("POST", "/sanctions", `{"user_id":"`+auditor+`","points":5,"reason":"x"}`, f.tenant, auditor, true), http.StatusForbidden)
	status(t, f.request("POST", "/sanctions", `{"user_id":"`+member+`","points":5,"reason":"  "}`, f.tenant, auditor, true), http.StatusBadRequest)
	status(t, f.request("POST", "/sanctions", `{"user_id":"`+member+`","points":-3,"reason":"x"}`, f.tenant, auditor, true), http.StatusBadRequest)

	w := f.request("POST", "/sanctions", `{"user_id":"`+member+`","points":7,"reason":"Хурлыг тасалдуулсан"}`, f.tenant, auditor, true)
	status(t, w, http.StatusCreated)
	var s Sanction
	decodeInto(t, w.Body.Bytes(), &s)
	if s.Points != 7 || s.UserID != member || s.ActorID != auditor || s.EventID != nil {
		t.Fatalf("sanction = %+v", s)
	}
	// A warning without points writes no point entry.
	status(t, f.request("POST", "/sanctions", `{"user_id":"`+member+`","points":0,"reason":"Сануулга"}`, f.tenant, auditor, true), http.StatusCreated)

	var total, entries int
	if err := f.pool.QueryRow(context.Background(), `SELECT COALESCE(sum(delta),0), count(*) FROM workspace.events_point_entries
		WHERE tenant_id=$1 AND user_id=$2`, f.tenant, member).Scan(&total, &entries); err != nil {
		t.Fatal(err)
	}
	if total != -7 || entries != 1 {
		t.Fatalf("points total=%d entries=%d, want -7 and 1", total, entries)
	}

	// The member reads both decisions, and their points page shows the deduction.
	w = f.request("GET", "/sanctions/mine", ``, f.tenant, member, false)
	status(t, w, http.StatusOK)
	var mine struct {
		Sanctions []Sanction `json:"sanctions"`
	}
	decodeInto(t, w.Body.Bytes(), &mine)
	if len(mine.Sanctions) != 2 {
		t.Fatalf("member sees %d decisions, want 2", len(mine.Sanctions))
	}
	w = f.request("GET", "/points", ``, f.tenant, member, false)
	status(t, w, http.StatusOK)
	var points struct {
		Total   int `json:"total"`
		Entries []struct {
			Title string `json:"title"`
			Delta int    `json:"delta"`
		} `json:"entries"`
	}
	decodeInto(t, w.Body.Bytes(), &points)
	if points.Total != -7 || len(points.Entries) != 1 || points.Entries[0].Delta != -7 || points.Entries[0].Title == "" {
		t.Fatalf("points = %+v", points)
	}

	// Another branch sees none of it.
	w = f.request("GET", "/sanctions", ``, f.other, auditor, true)
	status(t, w, http.StatusOK)
	var theirs struct {
		Sanctions []Sanction `json:"sanctions"`
	}
	decodeInto(t, w.Body.Bytes(), &theirs)
	if len(theirs.Sanctions) != 0 {
		t.Fatalf("another branch sees %d decisions", len(theirs.Sanctions))
	}
}
