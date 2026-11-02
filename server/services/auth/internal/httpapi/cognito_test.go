package httpapi

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"golang.org/x/oauth2"
)

func TestCognitoUserInfoRequiresVerifiedAddress(t *testing.T) {
	for _, verified := range []string{`true`, `"true"`, `false`, `"false"`, `null`, `1`, `"yes"`} {
		u := cognitoUserInfo{Sub: "subject", Email: "user@example.com", Verified: json.RawMessage(verified)}
		want := verified == `true` || verified == `"true"`
		if u.valid() != want {
			t.Errorf("verified %s: got %v", verified, u.valid())
		}
	}
	if (cognitoUserInfo{Email: "user@example.com", Verified: json.RawMessage(`true`)}).valid() {
		t.Fatal("missing subject accepted")
	}
}

func TestCognitoProviderFlagIsServerControlled(t *testing.T) {
	for _, enabled := range []bool{false, true} {
		s := &Server{}
		if enabled {
			s.cognitoCfg = &oauth2.Config{}
		}
		rec := httptest.NewRecorder()
		s.handleAuthProviders(rec, httptest.NewRequestWithContext(t.Context(), "GET", "/api/v1/auth/providers", nil))
		if decodeBody(t, rec)["cognito"] != enabled {
			t.Fatal("wrong provider flag")
		}
	}
}

func TestOAuthReturnToRejectsExternalDestinations(t *testing.T) {
	for _, input := range []string{"https://evil.example", "//evil.example", "/\\evil.example", "/home\r\nLocation: bad"} {
		if safeReturnTo(input) != "/" {
			t.Errorf("unsafe destination accepted: %q", input)
		}
	}
	if safeReturnTo("/workspace/123") != "/workspace/123" {
		t.Fatal("safe path rejected")
	}
}
