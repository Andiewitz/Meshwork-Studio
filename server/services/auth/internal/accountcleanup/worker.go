// Package accountcleanup coordinates required, replay-safe data-owner cleanup.
package accountcleanup

import (
	"context"
	"errors"
	"fmt"
	"time"
)

type Claim struct{ OperationID, UserID, Token string }
type Step struct {
	Service   string
	Completed bool
}
type Receipt struct{ OperationID, Status string }

type Store interface {
	Claim(context.Context) (*Claim, error)
	Steps(context.Context, *Claim) ([]Step, error)
	Renew(context.Context, *Claim) error
	CompleteStep(context.Context, *Claim, string) error
	Finish(context.Context, *Claim) error
	Release(context.Context, *Claim, string) error
}
type Transport interface {
	Execute(context.Context, string, *Claim) (Receipt, error)
}
type Worker struct {
	Store     Store
	Transport Transport
	Timeout   time.Duration
}

// RunOnce handles one fenced operation. Published is not completion: the
// operation remains pending and will be retried after the owner finishes work.
func (w Worker) RunOnce(ctx context.Context) error {
	claim, err := w.Store.Claim(ctx)
	if err != nil || claim == nil {
		return err
	}
	done := false
	var failure error
	steps, err := w.Store.Steps(ctx, claim)
	if err != nil {
		failure = err
	} else {
		required := map[string]bool{"workspace": false, "team": false, "ai": false}
		for _, step := range steps {
			if seen, ok := required[step.Service]; !ok || seen {
				failure = fmt.Errorf("invalid cleanup step %q", step.Service)
				break
			}
			required[step.Service] = true
		}
		if failure == nil && len(steps) != len(required) {
			failure = errors.New("missing required cleanup step")
		}
		for _, step := range steps {
			if failure != nil {
				break
			}
			if step.Completed {
				continue
			}
			if err := w.Store.Renew(ctx, claim); err != nil {
				failure = err
				break
			}
			timeout := w.Timeout
			if timeout <= 0 {
				timeout = 10 * time.Second
			}
			requestCtx, cancel := context.WithTimeout(ctx, timeout)
			receipt, err := w.Transport.Execute(requestCtx, step.Service, claim)
			cancel()
			if err != nil {
				failure = err
				break
			}
			if receipt.OperationID != claim.OperationID {
				failure = errors.New("cleanup receipt operation mismatch")
				break
			}
			if receipt.Status == "published" {
				break
			}
			if receipt.Status != "completed" {
				failure = errors.New("invalid cleanup receipt status")
				break
			}
			if err := w.Store.CompleteStep(ctx, claim, step.Service); err != nil {
				failure = err
				break
			}
		}
		if failure == nil {
			// Re-read persisted state; published or unprocessed work cannot finish.
			finalSteps, err := w.Store.Steps(ctx, claim)
			if err != nil {
				failure = err
			} else {
				seen := map[string]bool{"workspace": false, "team": false, "ai": false}
				complete := len(finalSteps) == len(seen)
				for _, step := range finalSteps {
					if _, ok := seen[step.Service]; !ok || seen[step.Service] || !step.Completed {
						complete = false
						break
					}
					seen[step.Service] = true
				}
				if complete {
					if err := w.Store.Finish(ctx, claim); err != nil {
						failure = err
					} else {
						done = true
					}
				}
			}
		}
	}
	if !done {
		reason := ""
		if failure != nil {
			reason = failure.Error()
		}
		if err := w.Store.Release(ctx, claim, reason); err != nil {
			failure = errors.Join(failure, err)
		}
	}
	return failure
}
