package accountcleanup

import (
	"context"
	"errors"
	"testing"
)

type fakeStore struct {
	steps        []Step
	finished     bool
	released     string
	releaseCount int
	renewErr     error
}

func (s *fakeStore) Claim(context.Context) (*Claim, error) {
	return &Claim{OperationID: "op", UserID: "u", Token: "lease"}, nil
}
func (s *fakeStore) Steps(context.Context, *Claim) ([]Step, error) {
	return append([]Step(nil), s.steps...), nil
}
func (s *fakeStore) Renew(context.Context, *Claim) error { return s.renewErr }
func (s *fakeStore) CompleteStep(_ context.Context, _ *Claim, name string) error {
	for i := range s.steps {
		if s.steps[i].Service == name {
			s.steps[i].Completed = true
			return nil
		}
	}
	return errors.New("missing")
}
func (s *fakeStore) Finish(context.Context, *Claim) error { s.finished = true; return nil }
func (s *fakeStore) Release(_ context.Context, _ *Claim, reason string) error {
	s.released = reason
	s.releaseCount++
	return nil
}

type fakeTransport struct {
	statuses       map[string]string
	fail           string
	wrongOperation bool
	calls          []string
}

func (t *fakeTransport) Execute(_ context.Context, service, user, operation string) (Receipt, error) {
	t.calls = append(t.calls, service)
	if service == t.fail {
		return Receipt{}, errors.New("owner unavailable")
	}
	if t.wrongOperation {
		operation = "different"
	}
	return Receipt{OperationID: operation, Status: t.statuses[service]}, nil
}
func validSteps() []Step { return []Step{{Service: "workspace"}, {Service: "ai"}, {Service: "team"}} }
func TestPublishedRemainsPendingAndRetryCompletes(t *testing.T) {
	store := &fakeStore{steps: validSteps()}
	transport := &fakeTransport{statuses: map[string]string{"workspace": "published", "ai": "completed", "team": "completed"}}
	worker := Worker{Store: store, Transport: transport}
	if err := worker.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if store.finished || store.releaseCount != 1 || len(transport.calls) != 1 {
		t.Fatalf("operation settled early: %+v %v", store, transport.calls)
	}
	transport.statuses["workspace"] = "completed"
	if err := worker.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !store.finished || !store.steps[0].Completed || !store.steps[1].Completed || !store.steps[2].Completed {
		t.Fatalf("operation not completed: %+v", store)
	}
}
func TestFailurePreservesCompletedStepsForRetry(t *testing.T) {
	store := &fakeStore{steps: validSteps()}
	transport := &fakeTransport{statuses: map[string]string{"workspace": "completed", "ai": "completed", "team": "completed"}, fail: "ai"}
	worker := Worker{Store: store, Transport: transport}
	if err := worker.RunOnce(context.Background()); err == nil {
		t.Fatal("expected failure")
	}
	if store.finished || !store.steps[0].Completed || store.steps[1].Completed || store.released == "" {
		t.Fatalf("bad partial state: %+v", store)
	}
	transport.fail = ""
	transport.calls = nil
	if err := worker.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !store.finished || len(transport.calls) != 2 || transport.calls[0] != "ai" {
		t.Fatalf("retry did not resume: %v", transport.calls)
	}
}
func TestMissingOrStaleLeaseNeverCompletes(t *testing.T) {
	for _, tc := range []struct {
		name     string
		steps    []Step
		renewErr error
	}{{name: "missing", steps: []Step{{Service: "workspace"}}}, {name: "stale", steps: validSteps(), renewErr: errors.New("lease lost")}} {
		t.Run(tc.name, func(t *testing.T) {
			store := &fakeStore{steps: tc.steps, renewErr: tc.renewErr}
			transport := &fakeTransport{}
			err := (Worker{Store: store, Transport: transport}).RunOnce(context.Background())
			if err == nil || store.finished || len(transport.calls) != 0 {
				t.Fatalf("unsafe result: %v %+v %v", err, store, transport.calls)
			}
		})
	}
}

func TestReceiptMustMatchOperation(t *testing.T) {
	store := &fakeStore{steps: validSteps()}
	transport := &fakeTransport{statuses: map[string]string{"workspace": "completed"}, wrongOperation: true}
	if err := (Worker{Store: store, Transport: transport}).RunOnce(context.Background()); err == nil || store.finished || store.steps[0].Completed {
		t.Fatalf("mismatched receipt accepted: %v %+v", err, store)
	}
}
