package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/meshwork-studio/auth/internal/session"
	"github.com/meshwork-studio/auth/internal/store"
)

func decodeBody(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var body map[string]any
	if err := json.NewDecoder(rec.Result().Body).Decode(&body); err != nil {
		t.Fatalf("decode error body: %v", err)
	}
	return body
}

// Additive contract: message text unchanged, code + requestId added.
func TestWriteErrorEnvelope(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	rec := httptest.NewRecorder()
	writeError(rec, req, http.StatusTeapot, "WEAK_PASSWORD", "too short")

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status not canonicalized: %d", rec.Code)
	}
	body := decodeBody(t, rec)
	if body["message"] != "too short" {
		t.Fatalf("message changed: %v", body)
	}
	if body["code"] != "WEAK_PASSWORD" {
		t.Fatalf("code missing: %v", body)
	}
	if body["requestId"] != "unscoped" {
		t.Fatalf("want unscoped fallback, got %v", body)
	}
}

func TestStatusForSentinels(t *testing.T) {
	cases := []struct {
		err    error
		status int
		code   string
	}{
		{store.ErrNotFound, 404, "NOT_FOUND"},
		{session.ErrNotFound, 404, "NOT_FOUND"},
		{store.ErrDuplicateEmail, 409, "CONFLICT"},
		{store.ErrConflict, 409, "CONFLICT"},
		{session.ErrInvalidSession, 401, "SESSION_INVALID"},
		{errors.New("boom"), 500, "INTERNAL"},
		{nil, 500, "INTERNAL"},
	}
	for _, tc := range cases {
		status, code := statusFor(tc.err)
		if status != tc.status || code != tc.code {
			t.Fatalf("statusFor(%v) = %d/%s, want %d/%s",
				tc.err, status, code, tc.status, tc.code)
		}
	}
	// Wrapped sentinels still match (leaves must use %w).
	wrapped := errors.Join(store.ErrNotFound, errors.New("db down"))
	if _, code := statusFor(wrapped); code != "NOT_FOUND" {
		t.Fatalf("wrapped sentinel lost: %s", code)
	}
}

func TestWriteErrorAdoptsRequestID(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	ctx := context.WithValue(req.Context(), ctxRequestID, "req-abc123")
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()
	writeError(rec, req, 500, "INTERNAL", "boom")

	body := decodeBody(t, rec)
	if body["requestId"] != "req-abc123" {
		t.Fatalf("want adopted id, got %v", body)
	}
	if rec.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("wrong content type: %v", rec.Header())
	}
}
