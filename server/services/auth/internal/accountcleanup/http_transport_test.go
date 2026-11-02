package accountcleanup

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHTTPTransportRequiresValidReceipt(t *testing.T) {
	claim := &Claim{OperationID: "op", UserID: "user", Token: "token"}
	response := `{"operationId":"op","status":"published"}`
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.URL.Path != "/internal/v1/account-cleanup/deliver" || r.Header.Get("X-Internal-Key") != "secret" {
			t.Error("bad request")
		}
		var body map[string]string
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		if body["operationId"] != "op" || body["userId"] != "user" || body["claimToken"] != "token" || body["service"] != "ai" {
			t.Errorf("bad body: %v", body)
		}
		_, _ = w.Write([]byte(response))
	}))
	defer server.Close()
	transport, err := NewHTTPTransport(server.URL, "secret")
	if err != nil {
		t.Fatal(err)
	}
	if receipt, err := transport.Execute(context.Background(), "ai", claim); err != nil || receipt.Status != "published" {
		t.Fatalf("valid receipt: %+v %v", receipt, err)
	}
	for _, bad := range []string{`{"operationId":"other","status":"completed"}`, `{"operationId":"op","status":"invalid"}`, `{"operationId":"op","status":"completed","extra":true}`, `{"operationId":"op","status":"completed"} {}`} {
		response = bad
		if _, err := transport.Execute(context.Background(), "ai", claim); err == nil {
			t.Fatalf("accepted invalid receipt %s", bad)
		}
	}
}
func TestHTTPTransportRejectsRedirectAndInvalidConfiguration(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "https://example.com/", http.StatusTemporaryRedirect)
	}))
	defer server.Close()
	transport, err := NewHTTPTransport(server.URL, "secret")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = transport.Execute(context.Background(), "team", &Claim{OperationID: "op", UserID: "u", Token: "t"}); err == nil || strings.Contains(err.Error(), "secret") {
		t.Fatalf("redirect: %v", err)
	}
	for _, base := range []string{"", "file:///tmp/foo", "https://user:pass@example.com"} {
		if _, err := NewHTTPTransport(base, "secret"); err == nil {
			t.Fatalf("accepted %q", base)
		}
	}
	if _, err := NewHTTPTransport(server.URL, ""); err == nil {
		t.Fatal("accepted empty key")
	}
}
