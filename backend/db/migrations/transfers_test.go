package migrations_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type transferFixture struct {
	pool                             *pgxpool.Pool
	source, destination, alternative string
	member, admin                    string
}

func newTransferFixture(t *testing.T) transferFixture {
	t.Helper()
	f := transferFixture{migrationsPool(t), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()}
	// Requests race across committed transactions, so use unique fixtures and
	// remove their rows before migrationsPool closes the connection pool.
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if _, err := f.pool.Exec(ctx, `DELETE FROM registry.tenants WHERE id=ANY($1::uuid[])`, []string{f.source, f.destination, f.alternative}); err != nil {
			t.Errorf("remove transfer organisations: %v", err)
		}
		if _, err := f.pool.Exec(ctx, `DELETE FROM registry.users WHERE id=ANY($1::uuid[])`, []string{f.member, f.admin}); err != nil {
			t.Errorf("remove transfer users: %v", err)
		}
	})
	for _, tenant := range []string{f.source, f.destination, f.alternative} {
		f.exec(t, `INSERT INTO registry.tenants(id,slug,name,membership_branch) VALUES($1,$2,'Transfer test',true)`, tenant, "transfer-"+tenant)
	}
	for _, user := range []string{f.member, f.admin} {
		f.exec(t, `INSERT INTO registry.users(id,email,name,password_hash) VALUES($1,$2,'Transfer member','unused')`, user, user+"@transfer.test")
	}
	f.exec(t, `INSERT INTO workspace.memberships(tenant_id,user_id,is_primary,member_status,member_since) VALUES($1,$2,true,'active',now())`, f.source, f.member)
	for _, tenant := range []string{f.source, f.destination} {
		f.exec(t, `INSERT INTO workspace.memberships(tenant_id,user_id) VALUES($1,$2)`, tenant, f.admin)
		f.exec(t, `INSERT INTO workspace.membership_roles(membership_id,role_id)
			SELECT m.id,r.id FROM workspace.memberships m JOIN workspace.roles r ON r.tenant_id=m.tenant_id
			WHERE m.tenant_id=$1 AND m.user_id=$2 AND r.code='admin'`, tenant, f.admin)
	}
	return f
}

func (f transferFixture) exec(t *testing.T, query string, args ...any) {
	t.Helper()
	if _, err := f.pool.Exec(t.Context(), query, args...); err != nil {
		t.Fatal(err)
	}
}

// Exercise the public SQL functions with the actual restricted application
// role. Fixture setup and assertions use the test database owner separately.
func (f transferFixture) call(ctx context.Context, tenant, user, query string, args ...any) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	tx, err := f.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer func() { _ = tx.Rollback(context.Background()) }()
	if _, err = tx.Exec(ctx, `SET LOCAL ROLE gerege_nexus_tenant`); err != nil {
		return "", err
	}
	if _, err = tx.Exec(ctx, `SELECT set_config('app.current_tenant',$1,true),set_config('app.current_user',$2,true)`, tenant, user); err != nil {
		return "", err
	}
	var result string
	if err = tx.QueryRow(ctx, query, args...).Scan(&result); err != nil {
		return "", err
	}
	return result, tx.Commit(ctx)
}

func (f transferFixture) request(ctx context.Context, destination string) (string, error) {
	return f.call(ctx, f.source, f.member, `SELECT registry.request_membership_transfer($1,$2,'Moving branch')::text`, f.source, "transfer-"+destination)
}

func assertTransferError(t *testing.T, err error, code, message string) {
	t.Helper()
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != code || pgErr.Message != message {
		t.Fatalf("transfer error = %v, want %s / %s", err, code, message)
	}
}

func (f transferFixture) assertPending(t *testing.T, id string) {
	t.Helper()
	var pending, sourceActive bool
	var otherMemberships, decisions int
	err := f.pool.QueryRow(t.Context(), `SELECT
		(SELECT status='PENDING' AND decided_at IS NULL AND decided_by IS NULL FROM workspace.membership_transfers WHERE id=$1),
		(SELECT active FROM workspace.memberships WHERE tenant_id=$2 AND user_id=$3),
		(SELECT count(*) FROM workspace.memberships WHERE tenant_id<>$2 AND user_id=$3 AND active),
		(SELECT count(*) FROM workspace.audit_events WHERE details->>'request_id'=$1::text)`, id, f.source, f.member).
		Scan(&pending, &sourceActive, &otherMemberships, &decisions)
	if err != nil {
		t.Fatal(err)
	}
	if !pending || !sourceActive || otherMemberships != 0 || decisions != 0 {
		t.Fatalf("failed request changed state: pending=%v source=%v other memberships=%d audit=%d", pending, sourceActive, otherMemberships, decisions)
	}
}

func TestConcurrentTransferRequestsKeepOnePendingDestination(t *testing.T) {
	for _, sameDestination := range []bool{true, false} {
		name := "different_destinations"
		if sameDestination {
			name = "same_destination"
		}
		t.Run(name, func(t *testing.T) {
			f := newTransferFixture(t)
			destinations := []string{f.destination, f.alternative}
			if sameDestination {
				destinations[1] = f.destination
			}
			type result struct {
				id, destination string
				err             error
			}
			start := make(chan struct{})
			results := make(chan result, 2)
			for _, destination := range destinations {
				go func() {
					<-start
					id, err := f.request(t.Context(), destination)
					results <- result{id, destination, err}
				}()
			}
			close(start)
			// Drain both workers before any fatal assertion can clean up fixtures.
			completed := []result{<-results, <-results}
			var id, destination string
			successes := 0
			for _, r := range completed {
				if r.err != nil {
					assertTransferError(t, r.err, "55000", "transfer_already_pending")
					continue
				}
				successes++
				if id != "" && id != r.id {
					t.Fatal("retries returned different transfer IDs")
				}
				id, destination = r.id, r.destination
			}
			wantSuccesses := 1
			if sameDestination {
				wantSuccesses = 2
			}
			if successes != wantSuccesses {
				t.Fatalf("successful requests = %d, want %d", successes, wantSuccesses)
			}
			var pending int
			var savedDestination string
			if err := f.pool.QueryRow(t.Context(), `SELECT count(*),min(tenant_id::text) FROM workspace.membership_transfers WHERE user_id=$1 AND status='PENDING'`, f.member).Scan(&pending, &savedDestination); err != nil {
				t.Fatal(err)
			}
			if pending != 1 || savedDestination != destination {
				t.Fatalf("pending destination was replaced: count=%d destination=%s", pending, savedDestination)
			}
			retry, err := f.request(t.Context(), destination)
			if err != nil || retry != id {
				t.Fatalf("retry = %s / %v, want %s", retry, err, id)
			}
			f.assertPending(t, id)
		})
	}
}

func TestUnavailableOrganisationDoesNotPartiallyAcceptTransfer(t *testing.T) {
	for _, side := range []string{"source", "destination"} {
		for _, lifecycle := range []struct{ name, query string }{
			{"suspended", `UPDATE registry.tenants SET suspended_at=now() WHERE id=$1`},
			{"deletion_scheduled", `UPDATE registry.tenants SET deletion_scheduled_at=now()+interval '30 days' WHERE id=$1`},
		} {
			t.Run(side+"/"+lifecycle.name, func(t *testing.T) {
				f := newTransferFixture(t)
				id, err := f.request(t.Context(), f.destination)
				if err != nil {
					t.Fatal(err)
				}
				tenant := f.source
				if side == "destination" {
					tenant = f.destination
				}
				f.exec(t, lifecycle.query, tenant)
				_, err = f.call(t.Context(), f.destination, f.admin, `SELECT registry.decide_membership_transfer($1,true)::text`, id)
				assertTransferError(t, err, "55000", "transfer_organisation_unavailable")
				f.assertPending(t, id)
				// Restoring the organisation permits the original request to finish.
				f.exec(t, `UPDATE registry.tenants SET suspended_at=NULL,deletion_scheduled_at=NULL WHERE id=$1`, tenant)
				if _, err = f.call(t.Context(), f.destination, f.admin, `SELECT registry.decide_membership_transfer($1,true)::text`, id); err != nil {
					t.Fatal(err)
				}
				var accepted, sourceActive, destinationActive bool
				err = f.pool.QueryRow(t.Context(), `SELECT
					(SELECT status='ACCEPTED' FROM workspace.membership_transfers WHERE id=$1),
					(SELECT active FROM workspace.memberships WHERE tenant_id=$2 AND user_id=$4),
					(SELECT active FROM workspace.memberships WHERE tenant_id=$3 AND user_id=$4)`, id, f.source, f.destination, f.member).
					Scan(&accepted, &sourceActive, &destinationActive)
				if err != nil || !accepted || sourceActive || !destinationActive {
					t.Fatalf("restored transfer: accepted=%v source=%v destination=%v error=%v", accepted, sourceActive, destinationActive, err)
				}
			})
		}
	}
}
