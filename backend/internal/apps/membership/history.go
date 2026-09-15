package membership

import (
	"encoding/json"
	"net/http"

	"github.com/gerege-systems/open-gerege-nexus/backend/pkg/nexus"
	"github.com/go-chi/chi/v5"
)

func (m *Module) RegisterPersonalRoutes(r chi.Router, authenticated func(http.Handler) http.Handler) {
	r.With(authenticated).Get("/api/v1/me/dues-history", func(w http.ResponseWriter, r *http.Request) {
		claims, err := nexus.UserFromContext(r.Context())
		if err != nil || claims.UserID == "" {
			nexus.Error(w, 401, "unauthorized")
			return
		}
		var result json.RawMessage
		if err := m.db.QueryRow(r.Context(), `SELECT workspace.my_dues_history($1)`, offset(r)).Scan(&result); err != nil {
			nexus.Error(w, 500, "could not load dues history")
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		nexus.JSON(w, 200, result)
	})
}
