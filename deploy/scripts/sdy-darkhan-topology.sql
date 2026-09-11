-- 2026-09-10: хэрэглэгчийн хүссэн Дархан-Уул + дөрвөн сумын бүтэц.
-- Backup авсны дараа psql -v ON_ERROR_STOP=1 -v apply=false -f ... гэж шалгана.
-- apply=true үед хэрэгжинэ. Бусад organisation-г suspend хийнэ; hard delete нь
-- operator-ийн хоёр админ, 30 хоногийн одоогийн дарааллаар тусдаа шийдэгдэнэ.
\set ON_ERROR_STOP on
\if :{?apply}
\else
\set apply false
\endif
BEGIN;
SET LOCAL search_path = workspace, registry, public;
SELECT pg_advisory_xact_lock(hashtext('sdy-darkhan-topology'));
LOCK TABLE registry.tenants IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE sdy_children(slug text PRIMARY KEY, name text, district text) ON COMMIT DROP;
INSERT INTO sdy_children VALUES
 ('sdy-darkhan-uul-darkhan', 'Дархан сумын SDY', 'Дархан'),
 ('sdy-darkhan-uul-orkhon', 'Орхон сумын SDY', 'Орхон'),
 ('sdy-darkhan-uul-shariin-gol', 'Шарын гол сумын SDY', 'Шарын гол'),
 ('sdy-darkhan-uul-khongor', 'Хонгор сумын SDY', 'Хонгор');
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM registry.tenants WHERE slug='sdy-darkhan-uul'
   AND kind='organisation' AND suspended_at IS NULL AND deletion_scheduled_at IS NULL) THEN
   RAISE EXCEPTION 'Active Darkhan-Uul parent is required';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM workspace.memberships m
   JOIN registry.tenants t ON t.id=m.tenant_id
   JOIN workspace.membership_roles mr ON mr.membership_id=m.id
   JOIN workspace.roles r ON r.id=mr.role_id
   WHERE t.slug='sdy-darkhan-uul' AND m.active AND r.active AND r.code='admin') THEN
   RAISE EXCEPTION 'Existing active parent administrator is required';
 END IF;
 IF EXISTS (SELECT 1 FROM registry.tenants t JOIN sdy_children c USING(slug)
   LEFT JOIN workspace.tenant_profiles p ON p.tenant_id=t.id
   WHERE t.kind<>'organisation' OR t.suspended_at IS NOT NULL OR t.deletion_scheduled_at IS NOT NULL
   OR p.parent_tenant_id IS DISTINCT FROM (SELECT id FROM registry.tenants WHERE slug='sdy-darkhan-uul')) THEN
   RAISE EXCEPTION 'Child slug already exists outside the requested hierarchy';
 END IF;
END $$;
CREATE TEMP TABLE sdy_parent_admins ON COMMIT DROP AS
 SELECT DISTINCT m.user_id FROM workspace.memberships m
 JOIN registry.tenants t ON t.id=m.tenant_id
 JOIN workspace.membership_roles mr ON mr.membership_id=m.id
 JOIN workspace.roles r ON r.id=mr.role_id
 WHERE t.slug='sdy-darkhan-uul' AND m.active AND r.active AND r.code='admin';
CREATE TEMP TABLE sdy_retired ON COMMIT DROP AS
 SELECT id,slug,name FROM registry.tenants WHERE kind='organisation'
 AND slug<>'sdy-darkhan-uul' AND slug NOT IN (SELECT slug FROM sdy_children);
INSERT INTO registry.tenants(slug,name,kind,join_policy)
 SELECT slug,name,'organisation','on_request' FROM sdy_children ON CONFLICT(slug) DO NOTHING;
UPDATE workspace.tenant_profiles p SET
 parent_tenant_id=(SELECT id FROM registry.tenants WHERE slug='sdy-darkhan-uul'),
 province='Дархан-Уул',district=c.district,updated_at=now()
 FROM registry.tenants t JOIN sdy_children c USING(slug) WHERE p.tenant_id=t.id;
INSERT INTO workspace.memberships(tenant_id,user_id)
 SELECT t.id,a.user_id FROM registry.tenants t JOIN sdy_children c USING(slug)
 CROSS JOIN sdy_parent_admins a ON CONFLICT(tenant_id,user_id) DO NOTHING;
INSERT INTO workspace.membership_roles(membership_id,role_id)
 SELECT m.id,r.id FROM workspace.memberships m
 JOIN registry.tenants t ON t.id=m.tenant_id JOIN sdy_children c USING(slug)
 JOIN sdy_parent_admins a ON a.user_id=m.user_id
 JOIN workspace.roles r ON r.tenant_id=t.id AND r.code IN ('admin','user')
 ON CONFLICT DO NOTHING;
UPDATE registry.tenants SET suspended_at=now(),
 suspension_reason='2026-09-10 owner request: retain Darkhan-Uul and four soums; deletion awaits operator approval and grace period'
 WHERE id IN (SELECT id FROM sdy_retired) AND suspended_at IS NULL;
UPDATE workspace.sessions SET revoked_at=now()
 WHERE tenant_id IN (SELECT id FROM sdy_retired) AND revoked_at IS NULL AND expires_at>now();
SELECT t.slug,t.name,parent.slug AS parent_slug FROM registry.tenants t
 LEFT JOIN workspace.tenant_profiles p ON p.tenant_id=t.id
 LEFT JOIN registry.tenants parent ON parent.id=p.parent_tenant_id
 WHERE t.kind='organisation' AND t.suspended_at IS NULL ORDER BY parent.slug NULLS FIRST,t.slug;
SELECT count(*) AS suspended_organisations FROM sdy_retired;
SELECT count(*) AS preserved_users FROM registry.users;
SELECT count(*) AS preserved_personal_workspaces FROM registry.tenants WHERE kind='personal';
\if :apply
COMMIT;
\else
ROLLBACK;
\endif
