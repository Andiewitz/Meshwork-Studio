package ratelimit

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWriteLimitErrorIncludesRequestID(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/auth/login", nil)
	req.Header.Set("X-Request-Id", "req-abc123")
	rec := httptest.NewRecorder()

	writeLimitError(rec, req, http.StatusTooManyRequests, "RATE_LIMITED", "Too many requests")

	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d", rec.Code)
	}
	var body map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["requestId"] != "req-abc123" || body["code"] != "RATE_LIMITED" {
		t.Fatalf("body = %v", body)
	}
}

func TestWriteLimitErrorFallsBackToUnscoped(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/auth/login", nil)
	rec := httptest.NewRecorder()

	writeLimitError(rec, req, http.StatusServiceUnavailable, "RATE_LIMIT_UNAVAILABLE", "Try again shortly")

	var body map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["requestId"] != "unscoped" {
		t.Fatalf("body = %v", body)
	}
}
