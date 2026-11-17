package events

import (
	"net/http"
	"strings"

	"github.com/gerege-systems/open-gerege-nexus/backend/pkg/nexus"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// Every id a caller sends is rewritten to its one canonical spelling before a
// handler sees it.
//
// PostgreSQL reads "ABCDEF…", "{abcdef…}" and the undashed form as the same
// uuid as the lowercase one, and Go compares strings. A guard written as
// `userID == claims.UserID` — "nobody awards themselves" — was therefore one
// uppercase letter from not being a guard. Canonicalising at the edge makes
// every comparison, every advisory-lock key and every audit row downstream
// use the form the database itself returns.

// idParams are the path parameters that name a row.
var idParams = map[string]bool{"id": true, "userID": true, "taskID": true, "motionID": true}

const errInvalidID = "invalid id"

// canonicalID is raw in lowercase dashed form, or false when it is no uuid.
func canonicalID(raw string) (string, bool) {
	parsed, err := uuid.Parse(strings.TrimSpace(raw))
	if err != nil {
		return "", false
	}
	return parsed.String(), true
}

// canonicalIDs rewrites the matched route's id parameters in place. It runs
// as the innermost middleware of an endpoint — after the permission gate, so
// a caller without the permission still hears 403 — when chi has filled in
// every parameter of the route.
func canonicalIDs(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if rctx := chi.RouteContext(r.Context()); rctx != nil {
			for i, key := range rctx.URLParams.Keys {
				if !idParams[key] {
					continue
				}
				id, ok := canonicalID(rctx.URLParams.Values[i])
				if !ok {
					nexus.Error(w, http.StatusBadRequest, errInvalidID)
					return
				}
				rctx.URLParams.Values[i] = id
			}
		}
		next.ServeHTTP(w, r)
	})
}

// gated is a permission gate followed by canonicalIDs.
func gated(store nexus.PermissionStore, code string) func(http.Handler) http.Handler {
	permission := nexus.RequirePermission(store, code)
	return func(next http.Handler) http.Handler { return permission(canonicalIDs(next)) }
}
