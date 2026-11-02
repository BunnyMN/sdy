package migrations_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

// A notification is handed to the sender once, with the person's tokens, and
// a stale one is skipped rather than sent late.
func TestPushesAreClaimedOnceAndNeverLate(t *testing.T) {
	pool := migrationsPool(t)
	ctx := t.Context()
	tenant, user := uuid.NewString(), uuid.NewString()
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM registry.tenants WHERE id=$1`, tenant)
		_, _ = pool.Exec(context.Background(), `DELETE FROM registry.users WHERE id=$1`, user)
	})
	for _, q := range []struct {
		sql  string
		args []any
	}{
		{`INSERT INTO registry.tenants(id,slug,name) VALUES($1,$2,'Push test')`, []any{tenant, "push-" + tenant}},
		{`INSERT INTO registry.users(id,email,name,password_hash) VALUES($1,$2,'Push member','unused')`, []any{user, user + "@push.test"}},
		{`INSERT INTO workspace.push_tokens(tenant_id,user_id,provider,token_hash,token_ciphertext,app_id) VALUES($1,$2,'APNS',$3,'sealed','mn.esdy.member')`, []any{tenant, user, "hash-" + user}},
		{`INSERT INTO registry.member_notifications(user_id,event_key,kind,title,body,path) VALUES($1,'fresh','event','Шинэ','Мэдэгдэл','/member')`, []any{user}},
		{`INSERT INTO registry.member_notifications(user_id,event_key,kind,title,body,path,created_at) VALUES($1,'stale','event','Хуучин','','/member',now()-interval '1 hour')`, []any{user}},
	} {
		if _, err := pool.Exec(ctx, q.sql, q.args...); err != nil {
			t.Fatal(err)
		}
	}
	// The test database holds other tests' notifications; claim_pushes takes
	// the oldest first, so those are settled before this one is asked about.
	if _, err := pool.Exec(ctx, `UPDATE registry.member_notifications SET pushed_at=now() WHERE pushed_at IS NULL AND user_id<>$1`, user); err != nil {
		t.Fatal(err)
	}
	claim := func() (titles []string) {
		rows, err := pool.Query(ctx, `SELECT title FROM registry.claim_pushes(500) WHERE user_id=$1`, user)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		for rows.Next() {
			var title string
			if err := rows.Scan(&title); err != nil {
				t.Fatal(err)
			}
			titles = append(titles, title)
		}
		return titles
	}
	if got := claim(); len(got) != 1 || got[0] != "Шинэ" {
		t.Fatalf("first claim = %v, want only the fresh one", got)
	}
	if got := claim(); len(got) != 0 {
		t.Fatalf("second claim = %v, want nothing", got)
	}
	var unpushed int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM registry.member_notifications WHERE user_id=$1 AND pushed_at IS NULL`, user).Scan(&unpushed); err != nil || unpushed != 0 {
		t.Fatalf("%d left unpushed (%v)", unpushed, err)
	}
	if _, err := pool.Exec(ctx, `SELECT registry.forget_push_token($1)`, "hash-"+user); err != nil {
		t.Fatal(err)
	}
	var tokens int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM workspace.push_tokens WHERE user_id=$1`, user).Scan(&tokens); err != nil || tokens != 0 {
		t.Fatalf("token not forgotten: %d (%v)", tokens, err)
	}
}
