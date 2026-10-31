package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/meshwork-studio/auth/internal/store"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type collaboratorFake struct {
	email string
	user  *store.User
	err   error
	ids   []string
	users []*store.User
	calls int
}

func (f *collaboratorFake) FindUserByEmail(_ context.Context, email string) (*store.User, error) {
	f.email = email
	return f.user, f.err
}
func (f *collaboratorFake) FindEligibleUsersByIDs(_ context.Context, ids []string) ([]*store.User, error) {
	f.calls++
	f.ids = append([]string(nil), ids...)
	if f.users != nil {
		return f.users, f.err
	}
	if f.user != nil {
		return []*store.User{f.user}, f.err
	}
	return nil, f.err
}
func collaboratorRequest(h http.HandlerFunc, body, key string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/internal/test", strings.NewReader(body))
	req.Header.Set("X-Internal-Key", key)
	w := httptest.NewRecorder()
	h(w, req)
	return w
}
func TestCollaboratorLookupEligibilityAndRedaction(t *testing.T) {
	old := internalKeyValue
	internalKeyValue = "test-key"
	t.Cleanup(func() { internalKeyValue = old })
	now := time.Now()
	secret := "secret-hash"
	db := &collaboratorFake{user: &store.User{ID: "legacy-id", Email: "user@example.com", IsActive: true, EmailVerifiedAt: &now, PasswordHash: &secret, IsAdmin: true}}
	h := collaboratorLookupHandler(db)
	if w := collaboratorRequest(h, `{"email":"USER@example.com"}`, "bad"); w.Code != 401 || db.email != "" {
		t.Fatalf("key protection failed: %d", w.Code)
	}
	w := collaboratorRequest(h, `{"email":"  USER@example.com "}`, "test-key")
	if w.Code != 200 || db.email != "user@example.com" {
		t.Fatalf("lookup failed %d %q", w.Code, db.email)
	}
	if strings.Contains(w.Body.String(), "secret-hash") || strings.Contains(w.Body.String(), "isAdmin") {
		t.Fatal("private identity fields leaked")
	}
	var result struct {
		User *collaboratorIdentity `json:"user"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil || result.User == nil || result.User.ID != "legacy-id" {
		t.Fatalf("unexpected response %s", w.Body)
	}
	db.user.IsActive = false
	w = collaboratorRequest(h, `{"email":"user@example.com"}`, "test-key")
	if !strings.Contains(w.Body.String(), `"user":null`) {
		t.Fatalf("inactive user returned: %s", w.Body)
	}
	db.user.IsActive = true
	db.user.EmailVerifiedAt = nil
	w = collaboratorRequest(h, `{"email":"user@example.com"}`, "test-key")
	if !strings.Contains(w.Body.String(), `"user":null`) {
		t.Fatalf("unverified user returned: %s", w.Body)
	}
	db.err = store.ErrNotFound
	db.user = nil
	w = collaboratorRequest(h, `{"email":"user@example.com"}`, "test-key")
	if !strings.Contains(w.Body.String(), `"user":null`) {
		t.Fatal(w.Body)
	}
	db.err = errors.New("database down")
	w = collaboratorRequest(h, `{"email":"user@example.com"}`, "test-key")
	if w.Code != 502 || strings.Contains(w.Body.String(), "database down") {
		t.Fatalf("outage response: %d %s", w.Code, w.Body)
	}
}
func TestCollaboratorProfilesBoundsAndLegacyIDs(t *testing.T) {
	old := internalKeyValue
	internalKeyValue = "test-key"
	t.Cleanup(func() { internalKeyValue = old })
	now := time.Now()
	db := &collaboratorFake{user: &store.User{ID: "legacy-id", Email: "u@example.com", IsActive: true, EmailVerifiedAt: &now}}
	h := collaboratorProfilesHandler(db)
	w := collaboratorRequest(h, `{"ids":["legacy-id","legacy-id"]}`, "test-key")
	var result struct {
		Users []collaboratorIdentity `json:"users"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil || w.Code != 200 || len(result.Users) != 1 {
		t.Fatalf("unexpected profiles: %d %s", w.Code, w.Body)
	}
	w = collaboratorRequest(h, `{"ids":[""]}`, "test-key")
	if w.Code != 400 {
		t.Fatalf("invalid id: %d", w.Code)
	}
}

func TestCollaboratorProfilesBatchOrderingAndFailures(t *testing.T) {
	old := internalKeyValue
	internalKeyValue = "test-key"
	t.Cleanup(func() { internalKeyValue = old })
	now := time.Now()
	db := &collaboratorFake{users: []*store.User{
		{ID: "second", Email: "second@example.com", IsActive: true, EmailVerifiedAt: &now},
		{ID: "inactive", IsActive: false, EmailVerifiedAt: &now},
		{ID: "unverified", IsActive: true},
		{ID: "first", Email: "first@example.com", IsActive: true, EmailVerifiedAt: &now},
	}}
	h := collaboratorProfilesHandler(db)
	w := collaboratorRequest(h, `{"ids":["first","missing","second","first","inactive","unverified"]}`, "test-key")
	var result struct {
		Users []collaboratorIdentity `json:"users"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil || w.Code != 200 || len(result.Users) != 2 || result.Users[0].ID != "first" || result.Users[1].ID != "second" {
		t.Fatalf("unexpected response: %d %s", w.Code, w.Body)
	}
	if db.calls != 1 || strings.Join(db.ids, ",") != "first,missing,second,inactive,unverified" {
		t.Fatalf("unexpected batch: calls=%d ids=%v", db.calls, db.ids)
	}
	w = collaboratorRequest(h, `{"ids":["first",""]}`, "test-key")
	if w.Code != 400 || db.calls != 1 {
		t.Fatalf("invalid request reached store: %d calls=%d", w.Code, db.calls)
	}
	w = collaboratorRequest(h, `{"ids":["first"]}`, "bad")
	if w.Code != 401 || db.calls != 1 {
		t.Fatalf("unauthorized request reached store: %d calls=%d", w.Code, db.calls)
	}
	db.err = errors.New("private database error")
	w = collaboratorRequest(h, `{"ids":["first"]}`, "test-key")
	if w.Code != 502 || strings.Contains(w.Body.String(), "private database error") {
		t.Fatalf("unexpected outage response: %d %s", w.Code, w.Body)
	}
}
