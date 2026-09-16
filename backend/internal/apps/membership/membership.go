// Package membership is SDY's member dues ledger. Identity and admission remain
// platform capabilities; this module owns amounts, payments and their history.
package membership

import (
	"embed"
	"encoding/json"
	"io/fs"
	"net/http"
	"strconv"
	"strings"

	"github.com/gerege-systems/open-gerege-nexus/backend/pkg/nexus"
	"github.com/go-chi/chi/v5"
)

//go:embed migrations/*.sql
var schema embed.FS

const ID = "mn.sdy.membership"
const PermRead = "membership.read"
const PermFinance = "membership.finance"

type Module struct {
	db          nexus.DB
	permissions nexus.PermissionStore
}

func New(p nexus.Platform) *Module {
	m := &Module{db: p.DB(), permissions: p.Permissions()}
	nexus.Register(m)
	migrations, err := fs.Sub(schema, "migrations")
	if err != nil {
		panic(err)
	}
	nexus.Migrations(ID, migrations)
	return m
}
func (*Module) ID() string                       { return ID }
func (*Module) Name() string                     { return "Membership" }
func (*Module) Version() string                  { return "1.1.0" }
func (*Module) Dependencies() []nexus.Dependency { return nil }
func (*Module) Permissions() []nexus.PermissionDefinition {
	return []nexus.PermissionDefinition{
		{Code: PermRead, Name: "Миний хураамж", Description: "Өөрийн сарын хураамж, төлөлтийг харах, шилжүүлэг мэдээлэх", DefaultRoles: []string{nexus.DefaultRoleManager, nexus.DefaultRoleUser}},
		{Code: PermFinance, Name: "Хураамжийн санхүү", Description: "Хураамж тохируулах, ногдуулах, төлөлт батлах, буцаах, чөлөөлөх", AdminOnly: true},
	}
}
func (*Module) Menus() []nexus.MenuDefinition {
	return []nexus.MenuDefinition{{ID: "membership", Label: "Membership dues", Path: "/member/dues", Icon: "wallet", Order: 20, Labels: map[string]string{"mn": "Гишүүний хураамж", "en": "Membership dues", "ar": "رسوم العضوية", "zh": "会费", "fr": "Cotisations", "ru": "Членские взносы", "es": "Cuotas"}}}
}
func (*Module) MenuPermission() string        { return PermRead }
func (*Module) RoutePermissionPrefix() string { return "" }
func (m *Module) RegisterRoutes(r chi.Router, gate func(http.Handler) http.Handler) {
	r.Route("/api/v1/dues", func(dr chi.Router) {
		dr.Use(gate)
		read, finance := nexus.RequirePermission(m.permissions, PermRead), nexus.RequirePermission(m.permissions, PermFinance)
		dr.With(read).Get("/settings", m.getSettings)
		dr.With(finance).Put("/settings", m.saveSettings)
		dr.With(read).Get("/mine", m.mine)
		dr.With(read).Post("/payments", m.submitPayment)
		dr.With(finance).Post("/charges", m.createCharges)
		dr.With(finance).Get("/finance", m.finance)
		dr.With(finance).Post("/payments/{id}/review", m.reviewPayment)
		dr.With(finance).Post("/charges/{id}/waive", m.waive)
	})
}
func who(w http.ResponseWriter, r *http.Request) (nexus.UserClaims, bool) {
	claims, err := nexus.UserFromContext(r.Context())
	if err != nil || claims.WorkspaceID == "" {
		nexus.Error(w, 401, "unauthorized")
		return claims, false
	}
	return claims, true
}
func decode(w http.ResponseWriter, r *http.Request, value any) bool {
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192)).Decode(value); err != nil {
		nexus.Error(w, 400, "invalid request")
		return false
	}
	return true
}
func fail(w http.ResponseWriter, err error) bool {
	if err != nil {
		nexus.Error(w, 500, "could not complete the dues operation")
		return true
	}
	return false
}
func offset(r *http.Request) int {
	n, err := strconv.Atoi(r.URL.Query().Get("offset"))
	if err != nil || n < 0 || n > 100000 {
		return 0
	}
	return n
}
func validText(value string, max int) bool { return len([]rune(strings.TrimSpace(value))) <= max }
