package membership

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gerege-systems/open-gerege-nexus/backend/pkg/nexus"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type Settings struct {
	Enabled       bool   `json:"enabled"`
	MonthlyAmount int64  `json:"monthly_amount"`
	DueDay        int    `json:"due_day"`
	BankName      string `json:"bank_name"`
	AccountNumber string `json:"account_number"`
	AccountHolder string `json:"account_holder"`
	Instructions  string `json:"instructions"`
}

func (m *Module) settings(ctx context.Context, tenant string) (Settings, error) {
	s := Settings{DueDay: 15}
	err := m.db.QueryRow(ctx, `SELECT enabled,monthly_amount,due_day,bank_name,account_number,account_holder,instructions
		FROM membership_dues_settings WHERE tenant_id=$1`, tenant).Scan(&s.Enabled, &s.MonthlyAmount, &s.DueDay, &s.BankName, &s.AccountNumber, &s.AccountHolder, &s.Instructions)
	if errors.Is(err, pgx.ErrNoRows) {
		err = nil
	}
	return s, err
}
func (m *Module) getSettings(w http.ResponseWriter, r *http.Request) {
	c, ok := who(w, r)
	if !ok {
		return
	}
	s, err := m.settings(r.Context(), c.WorkspaceID)
	if fail(w, err) {
		return
	}
	nexus.JSON(w, 200, s)
}
func (m *Module) saveSettings(w http.ResponseWriter, r *http.Request) {
	c, ok := who(w, r)
	if !ok {
		return
	}
	var s Settings
	if !decode(w, r, &s) {
		return
	}
	s.BankName = strings.TrimSpace(s.BankName)
	s.AccountNumber = strings.TrimSpace(s.AccountNumber)
	s.AccountHolder = strings.TrimSpace(s.AccountHolder)
	s.Instructions = strings.TrimSpace(s.Instructions)
	if s.MonthlyAmount < 0 || s.MonthlyAmount > 1000000000 || s.DueDay < 1 || s.DueDay > 28 || !validText(s.BankName, 100) || !validText(s.AccountNumber, 64) || !validText(s.AccountHolder, 200) || !validText(s.Instructions, 2000) ||
		(s.Enabled && (s.MonthlyAmount == 0 || s.BankName == "" || s.AccountNumber == "" || s.AccountHolder == "")) {
		nexus.Error(w, 400, "enter the monthly amount, due day (1–28), and receiving bank account")
		return
	}
	_, err := m.db.Exec(r.Context(), `INSERT INTO membership_dues_settings(tenant_id,enabled,monthly_amount,due_day,bank_name,account_number,account_holder,instructions)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(tenant_id) DO UPDATE SET
		enabled=EXCLUDED.enabled,monthly_amount=EXCLUDED.monthly_amount,due_day=EXCLUDED.due_day,
		bank_name=EXCLUDED.bank_name,account_number=EXCLUDED.account_number,account_holder=EXCLUDED.account_holder,instructions=EXCLUDED.instructions`, c.WorkspaceID, s.Enabled, s.MonthlyAmount, s.DueDay, s.BankName, s.AccountNumber, s.AccountHolder, s.Instructions)
	if fail(w, err) {
		return
	}
	nexus.Audit(r.Context(), c.WorkspaceID, c.UserID, "membership.dues.settings", c.WorkspaceID, nil)
	nexus.JSON(w, 200, s)
}
func parsePeriod(raw string) (time.Time, error) { return time.Parse("2006-01", raw) }
func (m *Module) createCharges(w http.ResponseWriter, r *http.Request) {
	c, ok := who(w, r)
	if !ok {
		return
	}
	var input struct {
		Period string `json:"period"`
	}
	if !decode(w, r, &input) {
		return
	}
	period, err := parsePeriod(input.Period)
	if err != nil || period.Year() < 2000 || period.Year() > 2100 {
		nexus.Error(w, 400, "period must be YYYY-MM")
		return
	}
	tx, err := m.db.Begin(r.Context())
	if fail(w, err) {
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	var enabled bool
	var amount int64
	var day int
	err = tx.QueryRow(r.Context(), `SELECT enabled,monthly_amount,due_day FROM membership_dues_settings WHERE tenant_id=$1 FOR SHARE`, c.WorkspaceID).Scan(&enabled, &amount, &day)
	if errors.Is(err, pgx.ErrNoRows) || (!enabled && err == nil) {
		nexus.Error(w, 409, "configure dues before creating charges")
		return
	}
	if fail(w, err) {
		return
	}
	due := period.AddDate(0, 0, day-1)
	tag, err := tx.Exec(r.Context(), `INSERT INTO membership_dues_charges(tenant_id,user_id,period,amount,due_date)
		SELECT $1,m.user_id,$2,$3,$4 FROM workspace.memberships m
		WHERE m.tenant_id=$1 AND m.active AND m.is_primary AND m.member_status='active'
		ON CONFLICT DO NOTHING`, c.WorkspaceID, period, amount, due)
	if fail(w, err) || fail(w, tx.Commit(r.Context())) {
		return
	}
	nexus.Audit(r.Context(), c.WorkspaceID, c.UserID, "membership.dues.charge", c.WorkspaceID, map[string]any{"period": input.Period, "created": tag.RowsAffected(), "amount": amount})
	nexus.JSON(w, 200, map[string]any{"created": tag.RowsAffected()})
}

type Charge struct {
	ID           string `json:"id"`
	UserID       string `json:"user_id"`
	Name         string `json:"name"`
	Period       string `json:"period"`
	Amount       int64  `json:"amount"`
	Paid         int64  `json:"paid"`
	Balance      int64  `json:"balance"`
	DueDate      string `json:"due_date"`
	Waived       bool   `json:"waived"`
	WaiverReason string `json:"waiver_reason"`
}

const paidSQL = `COALESCE((SELECT sum(e.delta) FROM membership_dues_entries e JOIN membership_dues_payments p
 ON p.id=e.payment_id AND p.tenant_id=e.tenant_id WHERE p.charge_id=c.id AND p.tenant_id=c.tenant_id),0)`

func (m *Module) charges(ctx context.Context, tenant, user, period string, start int) ([]Charge, bool, error) {
	rows, err := m.db.Query(ctx, `SELECT c.id::text,c.user_id::text,COALESCE(u.name,''),to_char(c.period,'YYYY-MM'),c.amount,`+paidSQL+`,c.due_date::text,c.waived,c.waiver_reason
		FROM membership_dues_charges c LEFT JOIN registry.users u ON u.id=c.user_id
		WHERE c.tenant_id=$1 AND ($2='' OR c.user_id::text=$2) AND ($3='' OR to_char(c.period,'YYYY-MM')=$3)
		ORDER BY c.period DESC,c.id LIMIT 51 OFFSET $4`, tenant, user, period, start)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	items := make([]Charge, 0, 51)
	for rows.Next() {
		var c Charge
		if err := rows.Scan(&c.ID, &c.UserID, &c.Name, &c.Period, &c.Amount, &c.Paid, &c.DueDate, &c.Waived, &c.WaiverReason); err != nil {
			return nil, false, err
		}
		if !c.Waived {
			c.Balance = max(c.Amount-c.Paid, 0)
		}
		items = append(items, c)
	}
	more := len(items) > 50
	if more {
		items = items[:50]
	}
	return items, more, rows.Err()
}

type Payment struct {
	ID         string    `json:"id"`
	ChargeID   string    `json:"charge_id"`
	UserID     string    `json:"user_id"`
	Name       string    `json:"name"`
	Amount     int64     `json:"amount"`
	Reference  string    `json:"reference"`
	Status     string    `json:"status"`
	ReviewNote string    `json:"review_note"`
	CreatedAt  time.Time `json:"created_at"`
}

func (m *Module) payments(ctx context.Context, tenant, user, period string, start int) ([]Payment, bool, error) {
	rows, err := m.db.Query(ctx, `SELECT p.id::text,p.charge_id::text,p.user_id::text,COALESCE(u.name,''),p.amount,p.reference,p.status,p.review_note,p.created_at
		FROM membership_dues_payments p LEFT JOIN registry.users u ON u.id=p.user_id
		WHERE p.tenant_id=$1 AND ($2='' OR p.user_id::text=$2) AND ($3='' OR EXISTS (SELECT 1 FROM membership_dues_charges c WHERE c.tenant_id=p.tenant_id AND c.id=p.charge_id AND to_char(c.period,'YYYY-MM')=$3)) ORDER BY p.created_at DESC,p.id LIMIT 51 OFFSET $4`, tenant, user, period, start)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	items := make([]Payment, 0, 51)
	for rows.Next() {
		var p Payment
		if err := rows.Scan(&p.ID, &p.ChargeID, &p.UserID, &p.Name, &p.Amount, &p.Reference, &p.Status, &p.ReviewNote, &p.CreatedAt); err != nil {
			return nil, false, err
		}
		items = append(items, p)
	}
	more := len(items) > 50
	if more {
		items = items[:50]
	}
	return items, more, rows.Err()
}
func (m *Module) mine(w http.ResponseWriter, r *http.Request) {
	c, ok := who(w, r)
	if !ok {
		return
	}
	start := offset(r)
	charges, more, err := m.charges(r.Context(), c.WorkspaceID, c.UserID, "", start)
	if fail(w, err) {
		return
	}
	payments, pMore, err := m.payments(r.Context(), c.WorkspaceID, c.UserID, "", start)
	if fail(w, err) {
		return
	}
	nexus.JSON(w, 200, map[string]any{"charges": charges, "payments": payments, "has_more": more || pMore, "next_offset": start + 50})
}
func (m *Module) finance(w http.ResponseWriter, r *http.Request) {
	c, ok := who(w, r)
	if !ok {
		return
	}
	start := offset(r)
	period := r.URL.Query().Get("period")
	if period != "" {
		if _, err := parsePeriod(period); err != nil {
			nexus.Error(w, 400, "period must be YYYY-MM")
			return
		}
	}
	charges, more, err := m.charges(r.Context(), c.WorkspaceID, "", period, start)
	if fail(w, err) {
		return
	}
	payments, pMore, err := m.payments(r.Context(), c.WorkspaceID, "", period, start)
	if fail(w, err) {
		return
	}
	var charged, received, outstanding, waived int64
	err = m.db.QueryRow(r.Context(), `SELECT COALESCE(sum(amount),0),COALESCE(sum(paid),0),
		COALESCE(sum(CASE WHEN waived THEN 0 ELSE greatest(amount-paid,0) END),0),
		COALESCE(sum(CASE WHEN waived THEN greatest(amount-paid,0) ELSE 0 END),0)
		FROM(SELECT c.amount,c.waived,`+paidSQL+` AS paid FROM membership_dues_charges c WHERE c.tenant_id=$1 AND ($2='' OR to_char(c.period,'YYYY-MM')=$2)) totals`, c.WorkspaceID, period).Scan(&charged, &received, &outstanding, &waived)
	if fail(w, err) {
		return
	}
	nexus.JSON(w, 200, map[string]any{"charges": charges, "payments": payments, "has_more": more || pMore, "next_offset": start + 50, "totals": map[string]int64{"charged": charged, "received": received, "outstanding": outstanding, "waived": waived}})
}

func conflict(w http.ResponseWriter, err error) bool {
	var pg *pgconn.PgError
	if errors.As(err, &pg) && pg.Code == "23505" {
		nexus.Error(w, 409, "this payment reference is already recorded")
		return true
	}
	return fail(w, err)
}
func (m *Module) submitPayment(w http.ResponseWriter, r *http.Request) {
	c, ok := who(w, r)
	if !ok {
		return
	}
	var input struct {
		ChargeID   string `json:"charge_id"`
		RequestKey string `json:"request_key"`
		Amount     int64  `json:"amount"`
		Reference  string `json:"reference"`
	}
	if !decode(w, r, &input) {
		return
	}
	input.Reference = strings.TrimSpace(input.Reference)
	if _, err := uuid.Parse(input.ChargeID); err != nil {
		nexus.Error(w, 400, "invalid charge")
		return
	}
	if _, err := uuid.Parse(input.RequestKey); err != nil {
		nexus.Error(w, 400, "invalid request key")
		return
	}
	if input.Amount < 1 || input.Amount > 1000000000 || input.Reference == "" || !validText(input.Reference, 128) {
		nexus.Error(w, 400, "enter the amount and transfer reference")
		return
	}
	// A submission is only a pending report. The finance review takes a row
	// lock and checks the balance again before recognising any money.
	var amount, paid int64
	var waived bool
	err := m.db.QueryRow(r.Context(), `SELECT c.amount,`+paidSQL+`,c.waived FROM membership_dues_charges c WHERE c.tenant_id=$1 AND c.id=$2 AND c.user_id=$3`, c.WorkspaceID, input.ChargeID, c.UserID).Scan(&amount, &paid, &waived)
	if errors.Is(err, pgx.ErrNoRows) {
		nexus.Error(w, 404, "no such charge")
		return
	}
	if fail(w, err) {
		return
	}
	// Return a retry's existing receipt even if it was approved in between.
	var existingID, charge, reference string
	var previous int64
	err = m.db.QueryRow(r.Context(), `SELECT id::text,charge_id::text,amount,reference FROM membership_dues_payments WHERE tenant_id=$1 AND user_id=$2 AND request_key=$3`, c.WorkspaceID, c.UserID, input.RequestKey).Scan(&existingID, &charge, &previous, &reference)
	if err == nil {
		if charge != input.ChargeID || previous != input.Amount || reference != input.Reference {
			nexus.Error(w, 409, "request key was used for a different payment")
			return
		}
		nexus.JSON(w, 200, map[string]any{"id": existingID, "changed": false})
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) && fail(w, err) {
		return
	}
	if waived || input.Amount > amount-paid {
		nexus.Error(w, 409, "amount exceeds the outstanding balance")
		return
	}
	var id string
	err = m.db.QueryRow(r.Context(), `INSERT INTO membership_dues_payments(tenant_id,charge_id,user_id,request_key,amount,reference)
		VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,user_id,request_key) DO NOTHING RETURNING id::text`, c.WorkspaceID, input.ChargeID, c.UserID, input.RequestKey, input.Amount, input.Reference).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		nexus.Error(w, 409, "this submission is already recorded; refresh your payment history")
		return
	}
	if conflict(w, err) {
		return
	}
	nexus.Audit(r.Context(), c.WorkspaceID, c.UserID, "membership.dues.report", id, map[string]any{"amount": input.Amount})
	nexus.JSON(w, 201, map[string]any{"id": id, "changed": true})
}
func (m *Module) reviewPayment(w http.ResponseWriter, r *http.Request) {
	c, ok := who(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if _, err := uuid.Parse(id); err != nil {
		nexus.Error(w, 400, "invalid payment")
		return
	}
	var input struct {
		Action string `json:"action"`
		Reason string `json:"reason"`
	}
	if !decode(w, r, &input) {
		return
	}
	input.Reason = strings.TrimSpace(input.Reason)
	if (input.Action != "approve" && input.Action != "reject" && input.Action != "reverse") || input.Reason == "" || !validText(input.Reason, 500) {
		nexus.Error(w, 400, "choose approve, reject or reverse and provide a reason")
		return
	}
	tx, err := m.db.Begin(r.Context())
	if fail(w, err) {
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	var charge, user string
	var amount int64
	var state string
	err = tx.QueryRow(r.Context(), `SELECT charge_id::text FROM membership_dues_payments WHERE tenant_id=$1 AND id=$2`, c.WorkspaceID, id).Scan(&charge)
	if errors.Is(err, pgx.ErrNoRows) {
		nexus.Error(w, 404, "no such payment")
		return
	}
	if fail(w, err) {
		return
	}
	// Lock order is charge, then payment for all finance mutations.
	var charged, paid int64
	var waived bool
	err = tx.QueryRow(r.Context(), `SELECT amount,waived FROM membership_dues_charges WHERE tenant_id=$1 AND id=$2 FOR UPDATE`, c.WorkspaceID, charge).Scan(&charged, &waived)
	if fail(w, err) {
		return
	}
	err = tx.QueryRow(r.Context(), `SELECT user_id::text,amount,status FROM membership_dues_payments WHERE tenant_id=$1 AND id=$2 FOR UPDATE`, c.WorkspaceID, id).Scan(&user, &amount, &state)
	if fail(w, err) {
		return
	}
	target := map[string]string{"approve": "approved", "reject": "rejected", "reverse": "reversed"}[input.Action]
	if state == target {
		nexus.JSON(w, 200, map[string]any{"status": state, "changed": false})
		return
	}
	if (input.Action == "reverse" && state != "approved") || (input.Action != "reverse" && state != "pending") {
		nexus.Error(w, 409, "this payment cannot make that transition")
		return
	}
	delta := int64(0)
	switch input.Action {
	case "approve":
		err = tx.QueryRow(r.Context(), `SELECT `+paidSQL+` FROM membership_dues_charges c WHERE c.tenant_id=$1 AND c.id=$2`, c.WorkspaceID, charge).Scan(&paid)
		if fail(w, err) {
			return
		}
		if waived || amount > charged-paid {
			nexus.Error(w, 409, "approval exceeds the outstanding balance")
			return
		}
		delta = amount
	case "reverse":
		delta = -amount
	}
	_, err = tx.Exec(r.Context(), `UPDATE membership_dues_payments SET status=$3,review_note=$4,reviewed_by=$5,reviewed_at=now() WHERE tenant_id=$1 AND id=$2`, c.WorkspaceID, id, target, input.Reason, c.UserID)
	if conflict(w, err) {
		return
	}
	if delta != 0 {
		_, err = tx.Exec(r.Context(), `INSERT INTO membership_dues_entries(tenant_id,payment_id,user_id,delta,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6)`, c.WorkspaceID, id, user, delta, c.UserID, input.Reason)
		if fail(w, err) {
			return
		}
	}
	if fail(w, tx.Commit(r.Context())) {
		return
	}
	nexus.Audit(r.Context(), c.WorkspaceID, c.UserID, "membership.dues."+input.Action, id, map[string]any{"amount": amount, "reason": input.Reason})
	nexus.JSON(w, 200, map[string]any{"status": target, "changed": true})
}
func (m *Module) waive(w http.ResponseWriter, r *http.Request) {
	c, ok := who(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if _, err := uuid.Parse(id); err != nil {
		nexus.Error(w, 400, "invalid charge")
		return
	}
	var input struct {
		Reason string `json:"reason"`
	}
	if !decode(w, r, &input) {
		return
	}
	input.Reason = strings.TrimSpace(input.Reason)
	if input.Reason == "" || !validText(input.Reason, 500) {
		nexus.Error(w, 400, "provide the reason for exemption")
		return
	}
	tag, err := m.db.Exec(r.Context(), `UPDATE membership_dues_charges SET waived=true,waiver_reason=$3 WHERE tenant_id=$1 AND id=$2 AND NOT waived`, c.WorkspaceID, id, input.Reason)
	if fail(w, err) {
		return
	}
	if tag.RowsAffected() == 0 {
		nexus.Error(w, 404, "no unwaived charge with that id")
		return
	}
	nexus.Audit(r.Context(), c.WorkspaceID, c.UserID, "membership.dues.waive", id, map[string]any{"reason": input.Reason})
	nexus.JSON(w, 200, map[string]any{"ok": true})
}
