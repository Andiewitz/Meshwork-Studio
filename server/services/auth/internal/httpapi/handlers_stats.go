package httpapi

import (
	"net/http"
)

type userStats struct {
	TotalUsers     int64 `json:"totalUsers"`
	NewUsersToday  int64 `json:"newUsersToday"`
	ActiveUsers24h int64 `json:"activeUsers24h"`
	LoginsToday    int64 `json:"loginsToday"`
}

// handleUserStats serves platform-wide user activity counters for the
// metrics collector. Internal-key guarded; never routed through NGINX.
func (s *Server) handleUserStats(w http.ResponseWriter, r *http.Request) {
	if !internalKeyMatches(r.Header.Get("X-Internal-Key")) {
		writeError(w, r, http.StatusUnauthorized, "INTERNAL_AUTH", "Invalid internal key")
		return
	}
	var stats userStats
	err := s.db.Pool.QueryRow(r.Context(), `
		SELECT
			(SELECT COUNT(*) FROM users),
			(SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_DATE),
			(SELECT COUNT(DISTINCT email) FROM login_attempts WHERE last_attempt >= NOW() - INTERVAL '24 hours'),
			(SELECT COUNT(*) FROM login_attempts WHERE last_attempt >= CURRENT_DATE)
	`).Scan(&stats.TotalUsers, &stats.NewUsersToday, &stats.ActiveUsers24h, &stats.LoginsToday)
	if err != nil {
		s.writeInternal(w, r, err, "Stats unavailable")
		return
	}
	writeJSON(w, http.StatusOK, stats)
}
