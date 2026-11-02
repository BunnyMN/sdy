-- Албан тушаал эрх олгоно.
--
-- 00117-д албан тушаал зөвхөн харагддаг байсан. Одоо албан тушаал бүр
-- салбарын системийн роль (pos_<албан тушаал>) болж, түүний эрх нь
-- registry.position_permissions-оос ирнэ:
--   Тэргүүн, Дэд тэргүүн, Нарийн бичиг — арга хэмжээ үүсгэх, ирц ба оноо
--     батлах (events.manage), гишүүнчлэлийн хүсэлт (membership.manage);
--   Санхүүч — санхүүгийн бүх мэдээлэл, төлбөр хураах (membership.finance);
--   Хяналтын хороо — оноо хасах, сануулга өгөх (events.discipline);
--   Тэргүүлэгч, Энгийн гишүүн — нэмэлт эрхгүй (хүн бүр 'user' рольтой).
-- Салбарын 'manager' роль эдгээр эрхээ алдана: тэдгээрийг одоо албан тушаал
-- өгнө. Админ бүх эрхтэй хэвээр.
--
-- Албан тушаалыг салбарын Тэргүүн (эсвэл админ) онооно; Тэргүүнийг өөрийг нь
-- зөвхөн админ томилно/чөлөөлнө, нэг салбарт нэг Тэргүүн. Хяналтын хорооны
-- суудлын тоо салбар бүрт (workspace.branch_policies.auditor_seats, анхдагч 3),
-- үүнийг админ тохируулна. Роль нь memberships.position-оос триггерээр
-- тохирно; түдгэлзсэн, хугацаа дууссан, гарсан гишүүний албан тушаал 'member'
-- болно (сэргээхэд Тэргүүн дахин онооно).

-- +goose Up

CREATE TABLE registry.position_permissions (
    position varchar(16) NOT NULL CHECK (position IN ('chair','vice_chair','secretary','auditor','board','finance')),
    permission_code varchar(128) NOT NULL,
    PRIMARY KEY (position, permission_code)
);
INSERT INTO registry.position_permissions (position, permission_code) VALUES
    ('chair','events.read'),('chair','events.manage'),('chair','membership.read'),('chair','membership.manage'),
    ('vice_chair','events.read'),('vice_chair','events.manage'),('vice_chair','membership.read'),('vice_chair','membership.manage'),
    ('secretary','events.read'),('secretary','events.manage'),('secretary','membership.read'),('secretary','membership.manage'),
    ('finance','events.read'),('finance','membership.read'),('finance','membership.finance'),
    ('auditor','events.read'),('auditor','membership.read'),('auditor','events.discipline'),
    ('board','events.read'),('board','membership.read');
GRANT SELECT ON registry.position_permissions TO gerege_nexus_tenant;

INSERT INTO registry.permissions (code, name, description)
VALUES ('events.discipline', 'Оноо хасах, сануулга өгөх',
        'Хяналтын хороо: гишүүний оноог шалтгаантай хасах, сануулга бүртгэх')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE workspace.branch_policies (
    tenant_id uuid PRIMARY KEY REFERENCES registry.tenants(id) ON DELETE CASCADE,
    auditor_seats integer NOT NULL DEFAULT 3 CHECK (auditor_seats BETWEEN 1 AND 15),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES registry.users(id) ON DELETE SET NULL
);
CREATE INDEX idx_branch_policies_updated_by ON workspace.branch_policies (updated_by);
ALTER TABLE workspace.branch_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace.branch_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON workspace.branch_policies TO gerege_nexus_tenant
    USING (tenant_id = ANY (COALESCE(NULLIF(current_setting('app.allowed_tenants', true), '')::uuid[],
        ARRAY[NULLIF(current_setting('app.current_tenant', true), '')::uuid])))
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT ON workspace.branch_policies TO gerege_nexus_tenant;

-- +goose StatementBegin
CREATE FUNCTION registry.position_title(p_position TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $fn$
    SELECT CASE p_position WHEN 'chair' THEN 'Тэргүүн' WHEN 'vice_chair' THEN 'Дэд тэргүүн'
        WHEN 'secretary' THEN 'Нарийн бичиг' WHEN 'auditor' THEN 'Хяналтын хороо' WHEN 'board' THEN 'Тэргүүлэгч'
        WHEN 'finance' THEN 'Санхүүч' ELSE 'Энгийн гишүүн' END;
$fn$;
-- +goose StatementEnd

-- Creates a branch's position roles and gives them the permissions that exist.
-- +goose StatementBegin
CREATE FUNCTION registry.ensure_position_roles(p_tenant UUID) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
BEGIN
    INSERT INTO workspace.roles (tenant_id, code, name, description, is_system, active)
    SELECT p_tenant, 'pos_'||x.position, registry.position_title(x.position),
           'Албан тушаалаас автоматаар: '||registry.position_title(x.position), TRUE, TRUE
      FROM (SELECT DISTINCT position FROM registry.position_permissions) x
    ON CONFLICT (tenant_id, code) DO UPDATE SET is_system = TRUE, active = TRUE;
    INSERT INTO workspace.role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM registry.position_permissions pp
      JOIN workspace.roles r ON r.tenant_id = p_tenant AND r.code = 'pos_'||pp.position
      JOIN registry.permissions p ON p.code = pp.permission_code
    ON CONFLICT DO NOTHING;
END
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION registry.ensure_position_roles(UUID) FROM PUBLIC;

-- A position's role follows memberships.position: only while the membership
-- is usable, never two position roles at once.
-- +goose StatementBegin
CREATE FUNCTION workspace.sync_position_role() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
DECLARE wanted UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM registry.tenants WHERE id = NEW.tenant_id AND membership_branch) THEN
        RETURN NEW;
    END IF;
    IF NEW.position <> 'member' AND NEW.active AND NEW.member_status NOT IN ('suspended','expired','left','alumni') THEN
        PERFORM registry.ensure_position_roles(NEW.tenant_id);
        SELECT id INTO wanted FROM workspace.roles WHERE tenant_id = NEW.tenant_id AND code = 'pos_'||NEW.position;
    END IF;
    DELETE FROM workspace.membership_roles mr USING workspace.roles r
     WHERE mr.membership_id = NEW.id AND r.id = mr.role_id AND r.code LIKE 'pos\_%'
       AND (wanted IS NULL OR r.id <> wanted);
    IF wanted IS NOT NULL THEN
        INSERT INTO workspace.membership_roles (membership_id, role_id) VALUES (NEW.id, wanted) ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION workspace.sync_position_role() FROM PUBLIC;
CREATE TRIGGER sync_position_role AFTER INSERT OR UPDATE OF position, active, member_status ON workspace.memberships
    FOR EACH ROW EXECUTE FUNCTION workspace.sync_position_role();

-- Somebody suspended, expired or gone holds no position: reinstatement never
-- brings back old privileges (00112), so the chair assigns it again.
-- +goose StatementBegin
CREATE FUNCTION workspace.leaving_ends_position() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
    IF NEW.member_status IN ('suspended','expired','left','alumni') THEN NEW.position := 'member'; END IF;
    RETURN NEW;
END
$fn$;
-- +goose StatementEnd
CREATE TRIGGER leaving_ends_position BEFORE UPDATE OF member_status ON workspace.memberships
    FOR EACH ROW EXECUTE FUNCTION workspace.leaving_ends_position();

-- A permission registered later (an app installed after this migration)
-- reaches the position roles that map to it.
-- +goose StatementBegin
CREATE FUNCTION registry.grant_new_permission_to_positions() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
BEGIN
    INSERT INTO workspace.role_permissions (role_id, permission_id)
    SELECT r.id, NEW.id FROM registry.position_permissions pp
      JOIN workspace.roles r ON r.code = 'pos_'||pp.position
     WHERE pp.permission_code = NEW.code
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION registry.grant_new_permission_to_positions() FROM PUBLIC;
CREATE TRIGGER grant_new_permission_to_positions AFTER INSERT ON registry.permissions
    FOR EACH ROW EXECUTE FUNCTION registry.grant_new_permission_to_positions();

-- A tenant that becomes a membership branch gets its position roles, and its
-- manager and user roles give up what the positions grant. Named to sort
-- after tenant_access_role_seed: triggers on one event fire in name order, and
-- the seed is what gives a new tenant's manager every '%.manage'.
-- +goose StatementBegin
CREATE FUNCTION registry.branch_gets_position_roles() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
BEGIN
    IF NEW.membership_branch THEN
        PERFORM registry.ensure_position_roles(NEW.id);
        DELETE FROM workspace.role_permissions rp USING workspace.roles r, registry.permissions p
         WHERE rp.role_id = r.id AND r.tenant_id = NEW.id AND r.code IN ('manager','user')
           AND p.id = rp.permission_id AND p.code IN (SELECT permission_code FROM registry.position_permissions
                                                      WHERE permission_code NOT LIKE '%.read');
    END IF;
    RETURN NEW;
END
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION registry.branch_gets_position_roles() FROM PUBLIC;
CREATE TRIGGER tenant_access_role_seed_positions AFTER INSERT ON registry.tenants
    FOR EACH ROW WHEN (NEW.membership_branch) EXECUTE FUNCTION registry.branch_gets_position_roles();
-- Only when the flag turns on: re-running the provisioner must not take back
-- what an administrator has since given the manager role.
CREATE TRIGGER tenant_access_role_seed_positions_on_change AFTER UPDATE OF membership_branch ON registry.tenants
    FOR EACH ROW WHEN (NEW.membership_branch AND NOT OLD.membership_branch) EXECUTE FUNCTION registry.branch_gets_position_roles();

-- Is the caller this branch's chair?
-- +goose StatementBegin
CREATE FUNCTION registry.is_branch_chair(p_tenant UUID) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
    SELECT p_tenant = NULLIF(current_setting('app.current_tenant',true),'')::uuid AND EXISTS (
        SELECT 1 FROM workspace.memberships m
         WHERE m.tenant_id = p_tenant AND m.user_id = NULLIF(current_setting('app.current_user',true),'')::uuid
           AND m.active AND m.position = 'chair' AND m.member_status NOT IN ('suspended','expired','left','alumni'));
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION registry.is_branch_chair(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION registry.is_branch_chair(UUID) TO gerege_nexus_tenant;

-- +goose StatementBegin
CREATE FUNCTION registry.set_auditor_seats(p_tenant UUID, p_seats INTEGER) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
BEGIN
    IF NOT coalesce(registry.is_transfer_admin(p_tenant),false) THEN
        RAISE EXCEPTION 'membership_admin_required' USING ERRCODE='42501';
    END IF;
    IF p_seats IS NULL OR p_seats NOT BETWEEN 1 AND 15 THEN
        RAISE EXCEPTION 'auditor_seats_invalid' USING ERRCODE='22023';
    END IF;
    -- The same row set_member_position locks, so a seat count and an
    -- appointment cannot pass each other.
    PERFORM id FROM registry.tenants WHERE id=p_tenant AND membership_branch FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'membership_branch_unavailable' USING ERRCODE='55000'; END IF;
    IF p_seats < (SELECT count(*) FROM workspace.memberships WHERE tenant_id=p_tenant AND position='auditor') THEN
        RAISE EXCEPTION 'auditor_seats_below_current' USING ERRCODE='55000';
    END IF;
    INSERT INTO workspace.branch_policies (tenant_id, auditor_seats, updated_at, updated_by)
    VALUES (p_tenant, p_seats, now(), NULLIF(current_setting('app.current_user',true),'')::uuid)
    ON CONFLICT (tenant_id) DO UPDATE SET auditor_seats = EXCLUDED.auditor_seats, updated_at = now(), updated_by = EXCLUDED.updated_by;
    INSERT INTO workspace.audit_events (tenant_id, user_id, action, resource, details)
    VALUES (p_tenant, NULLIF(current_setting('app.current_user',true),''), 'membership.auditor_seats_changed', 'membership',
            jsonb_build_object('seats', p_seats));
END
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION registry.set_auditor_seats(UUID,INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION registry.set_auditor_seats(UUID,INTEGER) TO gerege_nexus_tenant;

-- The chair assigns positions; only an administrator names or removes the chair.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION registry.set_member_position(p_tenant UUID, p_user UUID, p_position TEXT) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
DECLARE m workspace.memberships%ROWTYPE; admin boolean; seats integer; taken integer;
BEGIN
    admin := coalesce(registry.is_transfer_admin(p_tenant),false);
    IF NOT admin AND NOT coalesce(registry.is_branch_chair(p_tenant),false) THEN
        RAISE EXCEPTION 'position_chair_required' USING ERRCODE='42501';
    END IF;
    IF p_user = NULLIF(current_setting('app.current_user',true),'')::uuid THEN
        RAISE EXCEPTION 'membership_self_decision_forbidden' USING ERRCODE='42501';
    END IF;
    IF p_position IS NULL OR p_position NOT IN ('chair','vice_chair','secretary','auditor','board','finance','member') THEN
        RAISE EXCEPTION 'membership_position_invalid' USING ERRCODE='22023';
    END IF;
    PERFORM id FROM registry.tenants WHERE id=p_tenant AND membership_branch FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'membership_branch_unavailable' USING ERRCODE='55000'; END IF;
    SELECT * INTO m FROM workspace.memberships WHERE tenant_id=p_tenant AND user_id=p_user FOR UPDATE;
    IF m.id IS NULL THEN RAISE EXCEPTION 'membership_not_found' USING ERRCODE='P0002'; END IF;
    IF m.position = p_position THEN RETURN; END IF;
    IF (p_position = 'chair' OR m.position = 'chair') AND NOT admin THEN
        RAISE EXCEPTION 'position_chair_admin_only' USING ERRCODE='42501';
    END IF;
    IF p_position <> 'member' AND (NOT m.active OR m.member_status IN ('suspended','expired','left','alumni')) THEN
        RAISE EXCEPTION 'position_needs_active_member' USING ERRCODE='55000';
    END IF;
    IF p_position = 'chair' AND EXISTS (SELECT 1 FROM workspace.memberships
        WHERE tenant_id=p_tenant AND position='chair' AND id<>m.id) THEN
        RAISE EXCEPTION 'position_chair_taken' USING ERRCODE='55000';
    END IF;
    IF p_position = 'auditor' THEN
        SELECT coalesce((SELECT auditor_seats FROM workspace.branch_policies WHERE tenant_id=p_tenant),3) INTO seats;
        SELECT count(*) INTO taken FROM workspace.memberships WHERE tenant_id=p_tenant AND position='auditor' AND id<>m.id;
        IF taken >= seats THEN RAISE EXCEPTION 'auditor_seats_full' USING ERRCODE='55000'; END IF;
    END IF;
    PERFORM registry.ensure_position_roles(p_tenant);
    UPDATE workspace.memberships SET position=p_position WHERE id=m.id;
    INSERT INTO workspace.audit_events (tenant_id, user_id, action, resource, details)
    VALUES (p_tenant, NULLIF(current_setting('app.current_user',true),''), 'membership.position_changed', 'membership',
            jsonb_build_object('member', p_user, 'from', m.position, 'to', p_position));
    PERFORM registry.notify_member(p_user, 'position:'||m.id::text||':'||extract(epoch FROM clock_timestamp())::bigint::text,
        'membership', 'Албан тушаал: '||registry.position_title(p_position),
        'Таны албан тушаал «'||registry.position_title(m.position)||'»-аас «'||registry.position_title(p_position)||'» болж өөрчлөгдлөө.',
        '/member/record');
END
$fn$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION registry.set_member_status(p_tenant UUID,p_user UUID,p_status TEXT,p_reason TEXT) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
DECLARE m workspace.memberships%ROWTYPE; staff boolean; member_role UUID;
BEGIN
    IF NOT coalesce(registry.is_transfer_admin(p_tenant),false) THEN
        RAISE EXCEPTION 'membership_admin_required' USING ERRCODE='42501';
    END IF;
    IF p_user = NULLIF(current_setting('app.current_user',true),'')::uuid THEN
        RAISE EXCEPTION 'membership_self_decision_forbidden' USING ERRCODE='42501';
    END IF;
    IF p_status IS NULL OR p_status NOT IN ('active','suspended','expired','left','alumni')
       OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN
        RAISE EXCEPTION 'membership_status_and_reason_required' USING ERRCODE='22023';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('sdy-membership:'||p_user::text,0));
    PERFORM id FROM registry.tenants WHERE id=p_tenant AND membership_branch
        AND suspended_at IS NULL AND deletion_scheduled_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'membership_branch_unavailable' USING ERRCODE='55000'; END IF;
    SELECT * INTO m FROM workspace.memberships WHERE tenant_id=p_tenant AND user_id=p_user FOR UPDATE;
    IF m.id IS NULL THEN RAISE EXCEPTION 'membership_not_found' USING ERRCODE='P0002'; END IF;
    IF m.member_status=p_status THEN RETURN; END IF;
    IF p_status IN ('suspended','expired') AND NOT m.is_primary THEN
        RAISE EXCEPTION 'membership_transition_unavailable' USING ERRCODE='55000';
    END IF;
    IF p_status IN ('left','alumni') AND m.member_status='none' THEN
        RAISE EXCEPTION 'membership_transition_unavailable' USING ERRCODE='55000';
    END IF;
    IF p_status='active' THEN
        PERFORM registry.guard_branch_admission(p_tenant,p_user);
        SELECT id INTO member_role FROM workspace.roles WHERE tenant_id=p_tenant AND code='user' AND active;
        IF member_role IS NULL THEN RAISE EXCEPTION 'membership_role_unavailable' USING ERRCODE='55000'; END IF;
        -- Reactivating membership never reactivates old staff privileges.
        IF NOT m.active THEN DELETE FROM workspace.membership_roles WHERE membership_id=m.id; END IF;
        INSERT INTO workspace.membership_roles(membership_id,role_id) VALUES(m.id,member_role) ON CONFLICT DO NOTHING;
    END IF;
    SELECT EXISTS (SELECT 1 FROM workspace.membership_roles mr JOIN workspace.roles r ON r.id=mr.role_id
        WHERE mr.membership_id=m.id AND r.tenant_id=p_tenant AND r.active AND r.code<>'user'
          AND r.code NOT LIKE 'pos\_%') INTO staff;
    UPDATE workspace.memberships SET member_status=p_status,is_primary=p_status IN ('active','suspended','expired'),
        member_since=CASE WHEN p_status='active' AND NOT m.is_primary THEN now() ELSE member_since END,
        member_reason=btrim(p_reason),active=(p_status='active' OR (m.active AND staff)),
        deactivated_at=CASE WHEN p_status='active' OR (m.active AND staff) THEN NULL ELSE now() END WHERE id=m.id;
    UPDATE workspace.sessions SET revoked_at=now() WHERE tenant_id=p_tenant AND user_id=p_user AND revoked_at IS NULL;
    INSERT INTO workspace.audit_events(tenant_id,user_id,action,resource,details)
    VALUES(p_tenant,NULLIF(current_setting('app.current_user',true),''),'membership.status.changed','membership',
        jsonb_build_object('user_id',p_user,'from',m.member_status,'to',p_status,'reason',btrim(p_reason)));
END
$fn$;
-- +goose StatementEnd

-- Existing branches: roles, position roles for positions already set, and
-- the manager role gives up what positions now grant.
-- +goose StatementBegin
DO $backfill$
DECLARE t UUID;
BEGIN
    FOR t IN SELECT id FROM registry.tenants WHERE membership_branch LOOP
        PERFORM registry.ensure_position_roles(t);
    END LOOP;
    UPDATE workspace.memberships m SET position = m.position
      FROM registry.tenants t WHERE t.id = m.tenant_id AND t.membership_branch AND m.position <> 'member';
    DELETE FROM workspace.role_permissions rp USING workspace.roles r, registry.tenants t, registry.permissions p
     WHERE rp.role_id = r.id AND r.tenant_id = t.id AND t.membership_branch AND r.code IN ('manager','user')
       AND p.id = rp.permission_id AND p.code IN (SELECT permission_code FROM registry.position_permissions
                                                  WHERE permission_code NOT LIKE '%.read');
END
$backfill$;
-- +goose StatementEnd

-- +goose Down

-- +goose StatementBegin
DO $restore$
BEGIN
    INSERT INTO workspace.role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM workspace.roles r JOIN registry.tenants t ON t.id = r.tenant_id AND t.membership_branch
      JOIN registry.permissions p ON p.code IN ('events.manage','membership.manage')
     WHERE r.code = 'manager'
    ON CONFLICT DO NOTHING;
END
$restore$;
-- +goose StatementEnd
DROP TRIGGER IF EXISTS tenant_access_role_seed_positions_on_change ON registry.tenants;
DROP TRIGGER IF EXISTS tenant_access_role_seed_positions ON registry.tenants;
DROP FUNCTION IF EXISTS registry.branch_gets_position_roles();
DROP TRIGGER IF EXISTS grant_new_permission_to_positions ON registry.permissions;
DROP FUNCTION IF EXISTS registry.grant_new_permission_to_positions();
DROP TRIGGER IF EXISTS leaving_ends_position ON workspace.memberships;
DROP FUNCTION IF EXISTS workspace.leaving_ends_position();
DROP TRIGGER IF EXISTS sync_position_role ON workspace.memberships;
DROP FUNCTION IF EXISTS workspace.sync_position_role();
DELETE FROM workspace.roles WHERE code LIKE 'pos\_%';
DROP FUNCTION IF EXISTS registry.set_auditor_seats(UUID,INTEGER);
DROP FUNCTION IF EXISTS registry.is_branch_chair(UUID);
DROP FUNCTION IF EXISTS registry.ensure_position_roles(UUID);
DROP FUNCTION IF EXISTS registry.position_title(TEXT);
DROP TABLE IF EXISTS workspace.branch_policies;
DROP TABLE IF EXISTS registry.position_permissions;
DELETE FROM registry.permissions WHERE code = 'events.discipline';

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION registry.set_member_status(p_tenant UUID,p_user UUID,p_status TEXT,p_reason TEXT) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
DECLARE m workspace.memberships%ROWTYPE; staff boolean; member_role UUID;
BEGIN
    IF NOT coalesce(registry.is_transfer_admin(p_tenant),false) THEN
        RAISE EXCEPTION 'membership_admin_required' USING ERRCODE='42501';
    END IF;
    IF p_user = NULLIF(current_setting('app.current_user',true),'')::uuid THEN
        RAISE EXCEPTION 'membership_self_decision_forbidden' USING ERRCODE='42501';
    END IF;
    IF p_status IS NULL OR p_status NOT IN ('active','suspended','expired','left','alumni')
       OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN
        RAISE EXCEPTION 'membership_status_and_reason_required' USING ERRCODE='22023';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('sdy-membership:'||p_user::text,0));
    PERFORM id FROM registry.tenants WHERE id=p_tenant AND membership_branch
        AND suspended_at IS NULL AND deletion_scheduled_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'membership_branch_unavailable' USING ERRCODE='55000'; END IF;
    SELECT * INTO m FROM workspace.memberships WHERE tenant_id=p_tenant AND user_id=p_user FOR UPDATE;
    IF m.id IS NULL THEN RAISE EXCEPTION 'membership_not_found' USING ERRCODE='P0002'; END IF;
    IF m.member_status=p_status THEN RETURN; END IF;
    IF p_status IN ('suspended','expired') AND NOT m.is_primary THEN
        RAISE EXCEPTION 'membership_transition_unavailable' USING ERRCODE='55000';
    END IF;
    IF p_status IN ('left','alumni') AND m.member_status='none' THEN
        RAISE EXCEPTION 'membership_transition_unavailable' USING ERRCODE='55000';
    END IF;
    IF p_status='active' THEN
        PERFORM registry.guard_branch_admission(p_tenant,p_user);
        SELECT id INTO member_role FROM workspace.roles WHERE tenant_id=p_tenant AND code='user' AND active;
        IF member_role IS NULL THEN RAISE EXCEPTION 'membership_role_unavailable' USING ERRCODE='55000'; END IF;
        -- Reactivating membership never reactivates old staff privileges.
        IF NOT m.active THEN DELETE FROM workspace.membership_roles WHERE membership_id=m.id; END IF;
        INSERT INTO workspace.membership_roles(membership_id,role_id) VALUES(m.id,member_role) ON CONFLICT DO NOTHING;
    END IF;
    SELECT EXISTS (SELECT 1 FROM workspace.membership_roles mr JOIN workspace.roles r ON r.id=mr.role_id
        WHERE mr.membership_id=m.id AND r.tenant_id=p_tenant AND r.active AND r.code<>'user') INTO staff;
    UPDATE workspace.memberships SET member_status=p_status,is_primary=p_status IN ('active','suspended','expired'),
        member_since=CASE WHEN p_status='active' AND NOT m.is_primary THEN now() ELSE member_since END,
        member_reason=btrim(p_reason),active=(p_status='active' OR (m.active AND staff)),
        deactivated_at=CASE WHEN p_status='active' OR (m.active AND staff) THEN NULL ELSE now() END WHERE id=m.id;
    UPDATE workspace.sessions SET revoked_at=now() WHERE tenant_id=p_tenant AND user_id=p_user AND revoked_at IS NULL;
    INSERT INTO workspace.audit_events(tenant_id,user_id,action,resource,details)
    VALUES(p_tenant,NULLIF(current_setting('app.current_user',true),''),'membership.status.changed','membership',
        jsonb_build_object('user_id',p_user,'from',m.member_status,'to',p_status,'reason',btrim(p_reason)));
END
$fn$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION registry.set_member_position(p_tenant UUID, p_user UUID, p_position TEXT) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
DECLARE m workspace.memberships%ROWTYPE;
BEGIN
    IF NOT coalesce(registry.is_transfer_admin(p_tenant),false) THEN
        RAISE EXCEPTION 'membership_admin_required' USING ERRCODE='42501';
    END IF;
    IF p_user = NULLIF(current_setting('app.current_user',true),'')::uuid THEN
        RAISE EXCEPTION 'membership_self_decision_forbidden' USING ERRCODE='42501';
    END IF;
    IF p_position IS NULL OR p_position NOT IN ('chair','vice_chair','secretary','auditor','board','finance','member') THEN
        RAISE EXCEPTION 'membership_position_invalid' USING ERRCODE='22023';
    END IF;
    SELECT * INTO m FROM workspace.memberships WHERE tenant_id=p_tenant AND user_id=p_user FOR UPDATE;
    IF m.id IS NULL THEN RAISE EXCEPTION 'membership_not_found' USING ERRCODE='P0002'; END IF;
    IF m.position = p_position THEN RETURN; END IF;
    UPDATE workspace.memberships SET position=p_position WHERE id=m.id;
    INSERT INTO workspace.audit_events (tenant_id, user_id, action, resource, details)
    VALUES (p_tenant, NULLIF(current_setting('app.current_user',true),''), 'membership.position_changed', 'membership',
            jsonb_build_object('member', p_user, 'from', m.position, 'to', p_position));
END
$fn$;
-- +goose StatementEnd
