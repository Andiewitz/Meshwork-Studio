package password

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestHashPoolSaturationReturnsBusy(t *testing.T) {
	origSlots, origWait := hashSlots, hashWait
	hashSlots, hashWait = make(chan struct{}, 1), 30*time.Millisecond
	defer func() { hashSlots, hashWait = origSlots, origWait }()

	hashSlots <- struct{}{} // occupy the only slot
	if _, err := HashCtx(context.Background(), "pw"); !errors.Is(err, ErrBusy) {
		t.Fatalf("saturated pool: want ErrBusy, got %v", err)
	}

	<-hashSlots // free it
	h, err := HashCtx(context.Background(), "pw")
	if err != nil || h == "" {
		t.Fatalf("after release: want success, got %q, %v", h, err)
	}
}

func TestHashPoolCanceledContextReturnsBusy(t *testing.T) {
	origSlots := hashSlots
	hashSlots = make(chan struct{}, 1)
	defer func() { hashSlots = origSlots }()

	hashSlots <- struct{}{}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := HashCtx(ctx, "pw"); !errors.Is(err, ErrBusy) {
		t.Fatalf("canceled context: want ErrBusy, got %v", err)
	}
}

func TestVerifyDummyCtxUsesPool(t *testing.T) {
	if err := VerifyDummyCtx(context.Background(), "pw"); err != nil {
		t.Fatalf("VerifyDummyCtx: %v", err)
	}
}
