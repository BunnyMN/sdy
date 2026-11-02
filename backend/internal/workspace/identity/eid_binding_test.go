package identity

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gerege-systems/open-gerege-nexus/backend/internal/workspace/auth"
)

// Only the browser or app that started a device-link session may finish it.
func TestAnEIDSessionIsFinishedOnlyWhereItStarted(t *testing.T) {
	session := "session-123"
	good := eidBinding(session)
	if good == eidBinding("another-session") {
		t.Fatal("two sessions share a binding")
	}
	poll := func(cookie, bearer bool) *http.Request {
		r := httptest.NewRequest(http.MethodPost, "/api/v1/auth/eid/poll", nil)
		if cookie {
			r.AddCookie(&http.Cookie{Name: eidBindingCookie, Value: good})
		}
		if bearer {
			r.Header.Set(auth.SessionTransportHeader, "bearer")
		}
		return r
	}
	for name, c := range map[string]struct {
		r         *http.Request
		presented string
		want      bool
	}{
		"the starting browser's cookie":               {poll(true, false), "", true},
		"the binding in the body (app)":               {poll(false, true), good, true},
		"a browser without it (a forwarded link)":     {poll(false, false), "", false},
		"a wrong binding":                             {poll(false, true), eidBinding("other"), false},
		"an app from before bindings (App Store 1.0)": {poll(false, true), "", true},
	} {
		if got := boundToCaller(c.r, session, c.presented); got != c.want {
			t.Errorf("%s: %v, want %v", name, got, c.want)
		}
	}
}
