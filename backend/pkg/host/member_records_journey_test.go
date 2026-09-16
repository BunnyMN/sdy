package host

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

func assertSDYMemberRecordAPI(t *testing.T, admin, manager, member string, do func(string, string, string, string, int) *httptest.ResponseRecorder) {
	t.Helper()
	do(member, "PUT", "/api/v1/me/member-record", `{"phone":"99112233","residence":"Дархан","notifications_enabled":true}`, 200)
	w := do(member, "GET", "/api/v1/me/member-record", "", 200)
	if !strings.Contains(w.Body.String(), "99112233") || !strings.Contains(w.Body.String(), `"is_primary":true`) {
		t.Fatal(w.Body.String())
	}
	other := do(manager, "GET", "/api/v1/me/member-record?user_id="+member, "", 200)
	if strings.Contains(other.Body.String(), "99112233") {
		t.Fatal("another person's profile exposed")
	}
	do(member, "PUT", "/api/v1/me/member-record", `{"user_id":"`+manager+`","phone":"99112233"}`, 400)
	do(member, "GET", "/api/v1/membership/members", "", 403)
	do(member, "GET", "/api/v1/membership/summary", "", 403)
	do(manager, "GET", "/api/v1/membership/members", "", 200)
	summary := do(manager, "GET", "/api/v1/membership/summary", "", 200)
	if !strings.Contains(summary.Body.String(), `"active_members":1`) {
		t.Fatalf("work roles counted as membership: %s", summary.Body.String())
	}
	do(manager, "POST", "/api/v1/membership/members/"+member+"/status", `{"status":"suspended","reason":"Not permitted"}`, 403)
	do(admin, "POST", "/api/v1/membership/members/"+member+"/status", `{"status":"suspended","reason":""}`, 400)
	notifications := do(member, "GET", "/api/v1/me/notifications", "", 200)
	var inbox struct {
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
		Unread int `json:"unread"`
	}
	if err := json.Unmarshal(notifications.Body.Bytes(), &inbox); err != nil || len(inbox.Items) == 0 || inbox.Unread == 0 {
		t.Fatalf("notifications missing: %s %v", notifications.Body.String(), err)
	}
	do(manager, "POST", "/api/v1/me/notifications/"+inbox.Items[0].ID+"/read", `{}`, 404)
	do(member, "POST", "/api/v1/me/notifications/"+inbox.Items[0].ID+"/read", `{}`, 200)
	do(member, "POST", "/api/v1/me/notifications/read-all", `{}`, 200)
	read := do(member, "GET", "/api/v1/me/notifications", "", 200)
	if !strings.Contains(read.Body.String(), `"unread":0`) {
		t.Fatal(read.Body.String())
	}
}
