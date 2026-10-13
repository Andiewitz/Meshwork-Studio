package httpapi

import (
	"net/http"
	"regexp"
	"time"
)

type auditHit struct {
	UserID    string    `json:"userId"`
	Email     string    `json:"email"`
	Event     string    `json:"event"`
	IPHash    string    `json:"ipHash"`
	RequestID string    `json:"requestId"`
	CreatedAt time.Time `json:"createdAt"`
}

// requestIDPattern keeps ILIKE wildcards out of the query: request IDs are
// hex (with an optional req- prefix), nothing else is searchable.
var requestIDPattern = regexp.MustCompile(`^[0-9a-fA-F-]{2,64}$`)

// handleAuditSearch lets the admin dashboard answer "what happened for
// support ref XXXX-XXXX?" by joining to audit rows. Internal-key guarded,
// never routed through NGINX. Returns metadata only (no tokens, no hashes
// beyond the already-pseudonymised IP).
func (s *Server) handleAuditSearch(w http.ResponseWriter, r *http.Request) {
	if !internalKeyMatches(r.Header.Get("X-Internal-Key")) {
		writeError(w, r, http.StatusUnauthorized, "INTERNAL_AUTH", "Invalid internal key")
		return
	}
	q := r.URL.Query().Get("request_id")
	if !requestIDPattern.MatchString(q) {
		writeError(w, r, http.StatusBadRequest, "VALIDATION", "request_id must be hex/dashes")
		return
	}
	rows, err := s.db.Pool.Query(r.Context(), `
		SELECT user_id, email, event, ip_hash, COALESCE(request_id, ''), created_at
		FROM audit_events
		WHERE request_id ILIKE '%' || $1 || '%'
		ORDER BY created_at DESC
		LIMIT 50`,
		q)
	if err != nil {
		s.writeInternal(w, r, err, "Audit search unavailable")
		return
	}
	defer rows.Close()
	hits := []auditHit{}
	for rows.Next() {
		var h auditHit
		var userID, email, ipHash, requestID *string
		if err := rows.Scan(&userID, &email, &h.Event, &ipHash, &requestID, &h.CreatedAt); err != nil {
			s.writeInternal(w, r, err, "Audit search unavailable")
			return
		}
		if userID != nil {
			h.UserID = *userID
		}
		if email != nil {
			h.Email = *email
		}
		if ipHash != nil {
			h.IPHash = *ipHash
		}
		if requestID != nil {
			h.RequestID = *requestID
		}
		hits = append(hits, h)
	}
	if err := rows.Err(); err != nil {
		s.writeInternal(w, r, err, "Audit search unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"hits": hits})
}
