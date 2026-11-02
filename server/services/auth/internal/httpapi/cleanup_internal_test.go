package httpapi

import (
	"context"
	"errors"
	"github.com/meshwork-studio/auth/internal/accountcleanup"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeCleanupAuthorizer struct {
	calls   int
	allowed bool
	err     error
}

func (f *fakeCleanupAuthorizer) AuthorizeDelivery(_ context.Context, _ *accountcleanup.Claim, _ string) (bool, error) {
	f.calls++
	return f.allowed, f.err
}
func TestCleanupAuthorizeHandler(t *testing.T) {
	old := internalKeyValue
	internalKeyValue = "test-key"
	t.Cleanup(func() { internalKeyValue = old })
	fake := &fakeCleanupAuthorizer{allowed: true}
	handler := cleanupAuthorizeHandler(fake)
	body := `{"operationId":"bb58910d-3bf7-40cf-9cde-6f3992b09a33","userId":"user","claimToken":"bb58910d-3bf7-40cf-9cde-6f3992b09a34","service":"ai"}`
	request := func(body, key string) *httptest.ResponseRecorder { return collaboratorRequest(handler, body, key) }
	if w := request(body, "bad"); w.Code != 401 || fake.calls != 0 {
		t.Fatalf("unauthorized: %d", w.Code)
	}
	if w := request(strings.Replace(body, `"ai"`, `"unknown"`, 1), "test-key"); w.Code != 400 || fake.calls != 0 {
		t.Fatalf("invalid: %d", w.Code)
	}
	if w := request(body, "test-key"); w.Code != 200 || !strings.Contains(w.Body.String(), `"authorized":true`) {
		t.Fatalf("allowed: %d %s", w.Code, w.Body)
	}
	fake.err = errors.New("private database failure")
	if w := request(body, "test-key"); w.Code != 502 || strings.Contains(w.Body.String(), "private database failure") {
		t.Fatalf("outage: %d %s", w.Code, w.Body)
	}
}
