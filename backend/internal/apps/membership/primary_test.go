package membership

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/gerege-systems/open-gerege-nexus/backend/pkg/nexus"
	"github.com/google/uuid"
)

func TestTransferCannotChargeTheSamePersonTwiceInOneMonth(t *testing.T) {
	f := newDuesFixture(t)
	f.prepare(t)
	if _, err := f.pool.Exec(context.Background(), `UPDATE registry.tenants SET membership_branch=true WHERE id=ANY($1::uuid[])`, []string{f.tenant, f.other}); err != nil {
		t.Fatal(err)
	}
	ctx := nexus.WithUser(nexus.WithWorkspaceID(t.Context(), f.tenant), nexus.UserClaims{WorkspaceID: f.tenant, UserID: f.users[1]})
	var transfer string
	if err := f.pool.QueryRow(ctx, `SELECT registry.request_membership_transfer($1,$2,'Moving')::text`, f.tenant, f.other).Scan(&transfer); err != nil {
		t.Fatal(err)
	}
	admin := nexus.WithUser(nexus.WithWorkspaceID(t.Context(), f.other), nexus.UserClaims{WorkspaceID: f.other, UserID: f.users[0], IsAdmin: true})
	if _, err := f.pool.Exec(admin, `SELECT registry.decide_membership_transfer($1,true)`, transfer); err != nil {
		t.Fatal(err)
	}
	status(t, f.request("PUT", "/settings", `{"enabled":true,"monthly_amount":20000,"due_day":15,"bank_name":"Bank","account_number":"TEST","account_holder":"Destination"}`, f.other, f.users[0], true), 200)
	for _, month := range []struct{ period, created string }{{"2026-09", "0"}, {"2026-10", "1"}} {
		w := f.request("POST", "/charges", `{"period":"`+month.period+`"}`, f.other, f.users[0], true)
		status(t, w, 200)
		if !strings.Contains(w.Body.String(), `"created":`+month.created) {
			t.Fatalf("unexpected destination charges: %s", w.Body.String())
		}
	}
	w := f.request("POST", "/charges", `{"period":"2026-10"}`, f.tenant, f.users[0], true)
	status(t, w, 200)
	if !strings.Contains(w.Body.String(), `"created":2`) {
		t.Fatalf("source charged departing member: %s", w.Body.String())
	}
	var months, charges int
	if err := f.pool.QueryRow(context.Background(), `SELECT count(DISTINCT period),count(*) FROM membership_dues_charges WHERE user_id=$1`, f.users[1]).Scan(&months, &charges); err != nil || months != 2 || charges != 2 {
		t.Fatalf("months=%d charges=%d error=%v", months, charges, err)
	}
	// Self-only history remains readable from the new branch; workspace access
	// to the old branch does not have to be restored to see the old obligation.
	ctx = nexus.WithUser(nexus.WithWorkspaceID(t.Context(), f.other), nexus.UserClaims{WorkspaceID: f.other, UserID: f.users[1]})
	var history string
	if err := f.pool.QueryRow(ctx, `SELECT workspace.my_dues_history(0)::text`).Scan(&history); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(history, f.tenant) || !strings.Contains(history, f.other) {
		t.Fatalf("cross-branch personal history missing: %s", history)
	}
}

func TestPartialDuesRejectionReversalAndWaiverBalance(t *testing.T) {
	f := newDuesFixture(t)
	charges := f.prepare(t)
	member := f.users[1]
	submit := func(amount int) string {
		t.Helper()
		body, _ := json.Marshal(map[string]any{"charge_id": charges[1].ID, "request_key": uuid.NewString(), "amount": amount, "reference": uuid.NewString()})
		w := f.request("POST", "/payments", string(body), f.tenant, member, false)
		status(t, w, 201)
		var result struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		return result.ID
	}
	review := func(id, action string, want int) {
		t.Helper()
		status(t, f.request("POST", "/payments/"+id+"/review", `{"action":"`+action+`","reason":"Verified statement"}`, f.tenant, f.users[0], true), want)
	}
	one, two := submit(3000), submit(7000)
	review(one, "approve", 200)
	review(two, "reject", 200)
	review(two, "reject", 200)
	review(two, "approve", 409)
	review(one, "reverse", 200)
	review(one, "reverse", 200)
	three := submit(4000)
	review(three, "approve", 200)
	status(t, f.request("POST", "/charges/"+charges[1].ID+"/waive", `{"reason":"Approved exemption"}`, f.tenant, f.users[0], true), 200)
	var total int64
	var entries int
	if err := f.pool.QueryRow(context.Background(), `SELECT coalesce(sum(delta),0),count(*) FROM membership_dues_entries WHERE user_id=$1`, member).Scan(&total, &entries); err != nil || total != 4000 || entries != 3 {
		t.Fatalf("ledger=%d entries=%d error=%v", total, entries, err)
	}
	w := f.request("GET", "/finance?period=2026-09", "", f.tenant, f.users[0], true)
	status(t, w, 200)
	var result struct {
		Totals map[string]int64 `json:"totals"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	for key, want := range map[string]int64{"charged": 30000, "received": 4000, "waived": 6000, "outstanding": 20000} {
		if result.Totals[key] != want {
			t.Fatalf("%s=%d want %d: %s", key, result.Totals[key], want, w.Body.String())
		}
	}
}
