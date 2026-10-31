package httpapi

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestVerificationReadsJSONBeforeSelectingToken(t *testing.T) {
	r := httptest.NewRequest("POST", "/verify?token=query", strings.NewReader(`{"token":"json"}`))
	if token := readVerificationToken(r); token != "json" {
		t.Fatalf("JSON token lost: %q", token)
	}
	r = httptest.NewRequest("POST", "/verify?token=query", strings.NewReader(`{}`))
	if token := readVerificationToken(r); token != "query" {
		t.Fatalf("query fallback lost: %q", token)
	}
}
