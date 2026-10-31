package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/meshwork-studio/auth/internal/store"
)

type collaboratorIdentityLookup interface {
	FindUserByEmail(context.Context, string) (*store.User, error)
	FindEligibleUsersByIDs(context.Context, []string) ([]*store.User, error)
}

type collaboratorIdentity struct {
	ID              string  `json:"id"`
	Email           string  `json:"email"`
	Name            string  `json:"name"`
	ProfileImageURL *string `json:"profileImageUrl"`
}

func eligibleIdentity(u *store.User) *collaboratorIdentity {
	if u == nil || !u.IsActive || u.EmailVerifiedAt == nil {
		return nil
	}
	return &collaboratorIdentity{ID: u.ID, Email: u.Email, Name: displayName(u), ProfileImageURL: u.ProfileImageURL}
}

// These handlers are available only on the internal listener and require the
// identity service key. Missing, inactive, and unverified accounts are alike.
func collaboratorLookupHandler(db collaboratorIdentityLookup) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !internalKeyMatches(r.Header.Get("X-Internal-Key")) {
			writeError(w, r, http.StatusUnauthorized, "INTERNAL_AUTH", "Invalid internal key")
			return
		}
		var body struct {
			Email string `json:"email"`
		}
		if readJSON(r, &body) != nil {
			writeError(w, r, http.StatusBadRequest, "VALIDATION", "Invalid request")
			return
		}
		email := normalizeEmail(body.Email)
		if !validateEmail(email) {
			writeJSON(w, http.StatusOK, map[string]any{"user": nil})
			return
		}
		user, err := db.FindUserByEmail(r.Context(), email)
		if err != nil && !errors.Is(err, store.ErrNotFound) {
			writeError(w, r, http.StatusServiceUnavailable, "AUTH_SERVICE_UNAVAILABLE", "Authentication temporarily unavailable")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"user": eligibleIdentity(user)})
	}
}

func collaboratorProfilesHandler(db collaboratorIdentityLookup) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !internalKeyMatches(r.Header.Get("X-Internal-Key")) {
			writeError(w, r, http.StatusUnauthorized, "INTERNAL_AUTH", "Invalid internal key")
			return
		}
		var body struct {
			IDs []string `json:"ids"`
		}
		if readJSON(r, &body) != nil || len(body.IDs) > 100 {
			writeError(w, r, http.StatusBadRequest, "VALIDATION", "Invalid request")
			return
		}
		ids := make([]string, 0, len(body.IDs))
		seen := make(map[string]bool)
		for _, id := range body.IDs {
			if len(id) == 0 || len(id) > 128 || strings.TrimSpace(id) != id {
				writeError(w, r, http.StatusBadRequest, "VALIDATION", "Invalid request")
				return
			}
			if !seen[id] {
				seen[id] = true
				ids = append(ids, id)
			}
		}
		profiles := make([]collaboratorIdentity, 0, len(ids))
		if len(ids) > 0 {
			users, err := db.FindEligibleUsersByIDs(r.Context(), ids)
			if err != nil {
				writeError(w, r, http.StatusServiceUnavailable, "AUTH_SERVICE_UNAVAILABLE", "Authentication temporarily unavailable")
				return
			}
			byID := make(map[string]*collaboratorIdentity, len(users))
			for _, user := range users {
				if identity := eligibleIdentity(user); identity != nil && seen[identity.ID] {
					byID[identity.ID] = identity
				}
			}
			for _, id := range ids {
				if profile := byID[id]; profile != nil {
					profiles = append(profiles, *profile)
				}
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{"users": profiles})
	}
}
