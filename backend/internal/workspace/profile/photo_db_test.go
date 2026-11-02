package profile

import (
	"context"
	"testing"
)

// The photo is the person's: saved, replaced, read back, and forgotten when
// their account deletion completes (migration 00116's trigger).
func TestAPhotoIsKeptUntilTheAccountIsDeleted(t *testing.T) {
	f := newDeletionFixture(t)
	ctx := context.Background()

	if _, _, ok, _ := f.h.Photo(ctx, f.userID); ok {
		t.Fatal("a new account already has a photo")
	}
	first, err := normalisePhoto(testJPEG(t, 200, 200))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.h.SavePhoto(ctx, f.userID, first); err != nil {
		t.Fatalf("save: %v", err)
	}
	second, _ := normalisePhoto(testJPEG(t, 300, 300))
	if _, err := f.h.SavePhoto(ctx, f.userID, second); err != nil {
		t.Fatalf("replace: %v", err)
	}
	got, _, ok, err := f.h.Photo(ctx, f.userID)
	if err != nil || !ok || len(got) != len(second) {
		t.Fatalf("read back ok=%v len=%d want %d err=%v", ok, len(got), len(second), err)
	}

	req, err := f.h.RequestDeletion(ctx, f.userID, "")
	if err != nil {
		t.Fatal(err)
	}
	// Inside the grace period the account can come back whole.
	if _, _, ok, _ := f.h.Photo(ctx, f.userID); !ok {
		t.Fatal("the photo went before the grace period ended")
	}
	if _, err := f.pool.Exec(ctx,
		`UPDATE registry.account_deletion_requests SET requested_at = now() - interval '31 days' WHERE id=$1`, req.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.h.AnonymiseDueAccounts(ctx, DeletionGrace); err != nil {
		t.Fatal(err)
	}
	if _, _, ok, _ := f.h.Photo(ctx, f.userID); ok {
		t.Fatal("an anonymised account kept its photo")
	}
}

func TestDeletingAPhotoThatIsNotThereIsFine(t *testing.T) {
	f := newDeletionFixture(t)
	if err := f.h.DeletePhoto(context.Background(), f.userID); err != nil {
		t.Fatal(err)
	}
}
