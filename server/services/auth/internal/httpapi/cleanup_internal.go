package httpapi

import (
	"context"
	"github.com/meshwork-studio/auth/internal/accountcleanup"
	"net/http"
	"regexp"
	"strings"
)

type cleanupAuthorizer interface {
	AuthorizeDelivery(context.Context, *accountcleanup.Claim, string) (bool, error)
}

var cleanupUUID = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

func cleanupAuthorizeHandler(db cleanupAuthorizer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !internalKeyMatches(r.Header.Get("X-Internal-Key")) {
			writeError(w, r, http.StatusUnauthorized, "INTERNAL_AUTH", "Invalid internal key")
			return
		}
		var body struct {
			OperationID string `json:"operationId"`
			UserID      string `json:"userId"`
			Token       string `json:"claimToken"`
			Service     string `json:"service"`
		}
		if readJSON(r, &body) != nil || !cleanupUUID.MatchString(body.OperationID) || !cleanupUUID.MatchString(body.Token) || body.UserID == "" || len(body.UserID) > 128 || strings.TrimSpace(body.UserID) != body.UserID || (body.Service != "workspace" && body.Service != "team" && body.Service != "ai") {
			writeError(w, r, http.StatusBadRequest, "VALIDATION", "Invalid request")
			return
		}
		allowed, err := db.AuthorizeDelivery(r.Context(), &accountcleanup.Claim{OperationID: body.OperationID, UserID: body.UserID, Token: body.Token}, body.Service)
		if err != nil {
			writeError(w, r, http.StatusServiceUnavailable, "AUTH_SERVICE_UNAVAILABLE", "Authentication temporarily unavailable")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"authorized": allowed})
	}
}
