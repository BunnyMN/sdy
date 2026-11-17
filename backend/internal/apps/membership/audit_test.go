package membership

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
)

// grantFinance gives a fixture user the branch admin role, the way the
// treasurer's position does in production: membership_finance_allowed() is
// what the RLS policies ask.
func (f *duesFixture) grantFinance(t *testing.T, user string) {
	t.Helper()
	if _, err := f.pool.Exec(context.Background(), `INSERT INTO workspace.membership_roles(membership_id,role_id)
SELECT m.id,r.id FROM workspace.memberships m JOIN workspace.roles r ON r.tenant_id=m.tenant_id AND r.code='admin'
WHERE m.user_id=$1 AND m.tenant_id=$2 ON CONFLICT DO NOTHING`, user, f.tenant); err != nil {
		t.Fatal(err)
	}
}

func (f *duesFixture) report(t *testing.T, user, charge string, amount int, want int) string {
	t.Helper()
	body, _ := json.Marshal(map[string]any{"charge_id": charge, "request_key": uuid.NewString(), "amount": amount, "reference": uuid.NewString()})
	w := f.request("POST", "/payments", string(body), f.tenant, user, user == f.users[0])
	status(t, w, want)
	var result struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &result)
	return result.ID
}

func errorOf(t *testing.T, body string) string {
	t.Helper()
	var result struct {
		Error string `json:"error"`
	}
	_ = json.Unmarshal([]byte(body), &result)
	if result.Error == "" {
		return body
	}
	return result.Error
}

// A finance holder's own transfer is decided by somebody else: approving,
// rejecting and reversing it are all refused, and so is exempting or
// un-exempting their own charge.
func TestFinanceCannotDecideTheirOwnDues(t *testing.T) {
	f := newDuesFixture(t)
	charges := f.prepare(t)
	treasurer, second := f.users[0], f.users[2]
	f.grantFinance(t, second)
	own := f.report(t, treasurer, charges[0].ID, 5000, 201)
	for _, action := range []string{"approve", "reject"} {
		w := f.request("POST", "/payments/"+own+"/review", `{"action":"`+action+`","reason":"Matched"}`, f.tenant, treasurer, true)
		status(t, w, 403)
		if !strings.Contains(w.Body.String(), ErrSelfReview) {
			t.Fatalf("self %s: %s", action, w.Body.String())
		}
	}
	status(t, f.request("POST", "/payments/"+own+"/review", `{"action":"approve","reason":"Matched"}`, f.tenant, second, true), 200)
	w := f.request("POST", "/payments/"+own+"/review", `{"action":"reverse","reason":"Bank reversed"}`, f.tenant, treasurer, true)
	status(t, w, 403)
	w = f.request("POST", "/charges/"+charges[0].ID+"/waive", `{"reason":"Exempt"}`, f.tenant, treasurer, true)
	status(t, w, 403)
	if !strings.Contains(w.Body.String(), ErrSelfWaive) {
		t.Fatal(w.Body.String())
	}
	status(t, f.request("POST", "/charges/"+charges[0].ID+"/waive", `{"reason":"Board decision"}`, f.tenant, second, true), 200)
	status(t, f.request("POST", "/charges/"+charges[0].ID+"/unwaive", `{"reason":"Mistake"}`, f.tenant, treasurer, true), 403)
	var entries int
	if err := f.pool.QueryRow(context.Background(), `SELECT count(*) FROM membership_dues_entries WHERE tenant_id=$1`, f.tenant).Scan(&entries); err != nil || entries != 1 {
		t.Fatalf("entries=%d err=%v", entries, err)
	}
}

// An exemption is refused while a transfer report is still waiting for a
// decision, and once withdrawn the charge asks for its balance again.
func TestWaiverWaitsForPendingReportsAndCanBeWithdrawn(t *testing.T) {
	f := newDuesFixture(t)
	charges := f.prepare(t)
	member, charge := f.users[1], charges[1].ID
	pending := f.report(t, member, charge, 4000, 201)
	w := f.request("POST", "/charges/"+charge+"/waive", `{"reason":"Exempt"}`, f.tenant, f.users[0], true)
	status(t, w, 409)
	if errorOf(t, w.Body.String()) != ErrWaivePending {
		t.Fatal(w.Body.String())
	}
	status(t, f.request("POST", "/payments/"+pending+"/review", `{"action":"approve","reason":"Matched"}`, f.tenant, f.users[0], true), 200)
	status(t, f.request("POST", "/charges/"+charge+"/waive", `{"reason":"Exempt"}`, f.tenant, f.users[0], true), 200)
	f.report(t, member, charge, 1000, 409)
	status(t, f.request("POST", "/charges/"+charge+"/unwaive", `{"reason":""}`, f.tenant, f.users[0], true), 400)
	status(t, f.request("POST", "/charges/"+charge+"/unwaive", `{"reason":"Exemption was granted by mistake"}`, f.tenant, member, false), 403)
	status(t, f.request("POST", "/charges/"+charge+"/unwaive", `{"reason":"Exemption was granted by mistake"}`, f.tenant, f.users[0], true), 200)
	status(t, f.request("POST", "/charges/"+charge+"/unwaive", `{"reason":"Again"}`, f.tenant, f.users[0], true), 404)
	var waived bool
	var reason string
	if err := f.pool.QueryRow(context.Background(), `SELECT waived,waiver_reason FROM membership_dues_charges WHERE id=$1`, charge).Scan(&waived, &reason); err != nil || waived || reason != "" {
		t.Fatalf("waived=%v reason=%q err=%v", waived, reason, err)
	}
	f.report(t, member, charge, 6000, 201)
}

// Reports for one charge are checked against the balance one at a time: of
// many full-amount reports sent at once, exactly one is accepted.
func TestConcurrentReportsCannotExceedTheBalance(t *testing.T) {
	f := newDuesFixture(t)
	charges := f.prepare(t)
	var wg sync.WaitGroup
	results := make(chan int, 8)
	for range 8 {
		wg.Go(func() {
			body, _ := json.Marshal(map[string]any{"charge_id": charges[1].ID, "request_key": uuid.NewString(), "amount": 10000, "reference": uuid.NewString()})
			results <- f.request("POST", "/payments", string(body), f.tenant, f.users[1], false).Code
		})
	}
	wg.Wait()
	close(results)
	counts := map[int]int{}
	for code := range results {
		counts[code]++
	}
	if counts[201] != 1 || counts[409] != 7 {
		t.Fatal(counts)
	}
}

// The charges and the payments page independently.
func TestMyDuesPagesEachListOnItsOwn(t *testing.T) {
	f := newDuesFixture(t)
	charges := f.prepare(t)
	for range 55 {
		f.report(t, f.users[1], charges[1].ID, 1, 201)
	}
	get := func(query string) map[string]any {
		t.Helper()
		w := f.request("GET", "/mine"+query, "", f.tenant, f.users[1], false)
		status(t, w, 200)
		var result map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		return result
	}
	first := get("")
	if first["charges_has_more"] != false || first["payments_has_more"] != true || first["next_charges_offset"] != nil || first["next_payments_offset"] != float64(50) {
		t.Fatalf("first page: %v", first)
	}
	if len(first["payments"].([]any)) != 50 || len(first["charges"].([]any)) != 1 {
		t.Fatal("first page sizes")
	}
	second := get("?charges_offset=1&payments_offset=50")
	if len(second["payments"].([]any)) != 5 || len(second["charges"].([]any)) != 0 || second["has_more"] != false {
		t.Fatalf("second page: %v", second)
	}
}
