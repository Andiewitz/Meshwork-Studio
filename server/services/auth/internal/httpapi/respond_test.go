package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
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
