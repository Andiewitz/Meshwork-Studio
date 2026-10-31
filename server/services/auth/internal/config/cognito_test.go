package config

import "testing"

func TestCognitoConfigurationRequiresCompleteHTTPSDomain(t *testing.T) {
	t.Setenv("AUTH_DATABASE_URL", "postgres://db")
	t.Setenv("NODE_ENV", "development")
	t.Setenv("COGNITO_CLIENT_ID", "client")
	t.Setenv("COGNITO_POOL_ID", "us-east-1_pool")
	for _, domain := range []string{"http://example.auth.us-east-1.amazoncognito.com", "https://evil.example", "https://test.auth.us-east-1.amazoncognito.com/path", "https://test.auth.us-east-1.amazoncognito.com?x=y", ""} {
		t.Setenv("COGNITO_DOMAIN", domain)
		if _, err := Load(); err == nil {
			t.Errorf("accepted invalid domain %q", domain)
		}
	}
	t.Setenv("COGNITO_DOMAIN", "https://test.auth.us-east-1.amazoncognito.com")
	if _, err := Load(); err != nil {
		t.Fatal(err)
	}
}
