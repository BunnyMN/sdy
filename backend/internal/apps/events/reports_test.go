package events

import (
	"net/http"
	"testing"
)

func TestReportedAndBlockedIssuesAreHidden(t *testing.T) {
	f := newEventFixture(t)
	e := f.prepareMeeting(t, 0)
	base := "/" + e.ID + "/motions"
	author := f.users[5]

	w := f.request("POST", base, `{"title":"Доромжилсон бичлэг","body":"..."}`, f.tenant, author, false)
	status(t, w, http.StatusCreated)
	var mo Motion
	decodeInto(t, w.Body.Bytes(), &mo)
	one := base + "/" + mo.ID

	visible := func(user string, admin bool) (bool, Motion) {
		t.Helper()
		w := f.request("GET", base, ``, f.tenant, user, admin)
		status(t, w, http.StatusOK)
		var list struct {
			Motions []Motion `json:"motions"`
		}
		decodeInto(t, w.Body.Bytes(), &list)
		for _, m := range list.Motions {
			if m.ID == mo.ID {
				return true, m
			}
		}
		return false, Motion{}
	}

	// Nobody reports their own; reporting twice keeps one report.
	status(t, f.request("POST", one+"/report", `{"reason":"self"}`, f.tenant, author, false), http.StatusBadRequest)
	for _, user := range f.users[1:3] {
		status(t, f.request("POST", one+"/report", `{"reason":"Доромжлол"}`, f.tenant, user, false), http.StatusOK)
	}
	status(t, f.request("POST", one+"/report", `{}`, f.tenant, f.users[1], false), http.StatusOK)
	if ok, m := visible(f.users[1], false); !ok || !m.ReportedByMe || m.ReportCount != 0 {
		t.Fatalf("after two reports: visible=%v reported_by_me=%v count=%d", ok, m.ReportedByMe, m.ReportCount)
	}

	// The third report hides it from members, not from managers or its author.
	status(t, f.request("POST", one+"/report", ``, f.tenant, f.users[3], false), http.StatusOK)
	if ok, _ := visible(f.users[6], false); ok {
		t.Fatal("an issue three members reported is still shown to members")
	}
	if ok, m := visible(f.users[0], true); !ok || m.ReportCount != 3 {
		t.Fatalf("manager: visible=%v count=%d, want 3", ok, m.ReportCount)
	}
	if ok, _ := visible(author, false); !ok {
		t.Fatal("the author lost sight of their own issue")
	}

	// Blocking hides the author's issues from the one who blocked, and only them.
	w = f.request("POST", base, `{"title":"Дахин","body":""}`, f.tenant, author, false)
	status(t, w, http.StatusCreated)
	decodeInto(t, w.Body.Bytes(), &mo)
	status(t, f.request("POST", "/blocks/"+f.users[1], ``, f.tenant, f.users[7], false), http.StatusNotFound)
	status(t, f.request("POST", "/blocks/"+f.users[7], ``, f.tenant, f.users[7], false), http.StatusBadRequest)
	status(t, f.request("POST", "/blocks/"+author, ``, f.tenant, f.users[7], false), http.StatusOK)
	if ok, _ := visible(f.users[7], false); ok {
		t.Fatal("a blocked member's issue is still shown to the one who blocked them")
	}
	if ok, _ := visible(f.users[8], false); !ok {
		t.Fatal("a block hid the issue from somebody else")
	}
	w = f.request("GET", "/blocks", ``, f.tenant, f.users[7], false)
	status(t, w, http.StatusOK)
	var blocked struct {
		Blocked []Blocked `json:"blocked"`
	}
	decodeInto(t, w.Body.Bytes(), &blocked)
	if len(blocked.Blocked) != 1 || blocked.Blocked[0].UserID != author {
		t.Fatalf("blocks = %+v", blocked.Blocked)
	}
	status(t, f.request("DELETE", "/blocks/"+author, ``, f.tenant, f.users[7], false), http.StatusOK)
	if ok, _ := visible(f.users[7], false); !ok {
		t.Fatal("unblocking did not bring the issue back")
	}
	// Another branch sees none of it.
	status(t, f.request("GET", "/blocks", ``, f.other, f.users[7], false), http.StatusOK)
}
