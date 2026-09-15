-- Primary union membership is independent of permission to work in a branch.
-- Existing people with several branches require an explicit primary selection.
-- +goose Up
ALTER TABLE workspace.memberships
    ADD COLUMN is_primary boolean NOT NULL DEFAULT false,
    ADD COLUMN member_status varchar(16) NOT NULL DEFAULT 'none'
        CHECK (member_status IN ('none','active','suspended','expired','left','alumni')),
    ADD COLUMN member_since timestamptz,
    ADD COLUMN member_reason varchar(500) NOT NULL DEFAULT '';
ALTER TABLE workspace.memberships ADD CONSTRAINT memberships_primary_status
    CHECK (is_primary = (member_status IN ('active','suspended','expired')));
CREATE UNIQUE INDEX memberships_one_primary ON workspace.memberships(user_id) WHERE is_primary;

CREATE TABLE workspace.membership_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES registry.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES registry.users(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES registry.users(id) ON DELETE SET NULL,
    from_status varchar(16) NOT NULL,
    to_status varchar(16) NOT NULL,
    is_primary boolean NOT NULL,
    member_since timestamptz,
    reason varchar(500) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX membership_history_tenant ON workspace.membership_history(tenant_id,created_at DESC,id);
CREATE INDEX membership_history_user ON workspace.membership_history(user_id,created_at DESC,id);
CREATE INDEX membership_history_actor ON workspace.membership_history(actor_id);

CREATE TABLE registry.member_profiles (
    user_id UUID PRIMARY KEY REFERENCES registry.users(id) ON DELETE CASCADE,
    phone varchar(32) NOT NULL DEFAULT '',
    residence varchar(200) NOT NULL DEFAULT '',
    notifications_enabled boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE registry.member_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES registry.users(id) ON DELETE CASCADE,
    event_key varchar(200) NOT NULL,
    kind varchar(40) NOT NULL,
    title varchar(200) NOT NULL,
    body varchar(500) NOT NULL DEFAULT '',
    path varchar(200) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    read_at timestamptz,
    UNIQUE(user_id,event_key)
);
CREATE INDEX member_notifications_user_time ON registry.member_notifications(user_id,created_at DESC,id);

-- +goose StatementBegin
CREATE FUNCTION registry.can_manage_members(p_tenant UUID) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
    SELECT p_tenant=NULLIF(current_setting('app.current_tenant',true),'')::uuid AND EXISTS (
        SELECT 1 FROM workspace.memberships m
        JOIN workspace.membership_roles mr ON mr.membership_id=m.id
        JOIN workspace.roles r ON r.id=mr.role_id AND r.tenant_id=m.tenant_id
        WHERE m.tenant_id=p_tenant AND m.user_id=NULLIF(current_setting('app.current_user',true),'')::uuid
          AND m.active AND r.active AND (r.code='admin' OR EXISTS (
              SELECT 1 FROM workspace.role_permissions rp JOIN registry.permissions p ON p.id=rp.permission_id
              WHERE rp.role_id=r.id AND p.code='membership.manage')));
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION registry.can_manage_members(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION registry.can_manage_members(UUID) TO gerege_nexus_tenant;

ALTER TABLE workspace.membership_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace.membership_history FORCE ROW LEVEL SECURITY;
CREATE POLICY member_history_read ON workspace.membership_history FOR SELECT TO gerege_nexus_tenant
    USING (user_id=NULLIF(current_setting('app.current_user',true),'')::uuid OR registry.can_manage_members(tenant_id));
REVOKE ALL ON workspace.membership_history FROM gerege_nexus_tenant;
GRANT SELECT ON workspace.membership_history TO gerege_nexus_tenant;
ALTER TABLE registry.member_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry.member_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY member_profile_self ON registry.member_profiles TO gerege_nexus_tenant
    USING (user_id=NULLIF(current_setting('app.current_user',true),'')::uuid)
    WITH CHECK (user_id=NULLIF(current_setting('app.current_user',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON registry.member_profiles TO gerege_nexus_tenant;
ALTER TABLE registry.member_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry.member_notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY member_notifications_self ON registry.member_notifications FOR SELECT TO gerege_nexus_tenant
    USING (user_id=NULLIF(current_setting('app.current_user',true),'')::uuid);
CREATE POLICY member_notifications_read ON registry.member_notifications FOR UPDATE TO gerege_nexus_tenant
    USING (user_id=NULLIF(current_setting('app.current_user',true),'')::uuid)
    WITH CHECK (user_id=NULLIF(current_setting('app.current_user',true),'')::uuid);
REVOKE ALL ON registry.member_notifications FROM gerege_nexus_tenant;
GRANT SELECT,UPDATE(read_at) ON registry.member_notifications TO gerege_nexus_tenant;

-- Called only by database-owned triggers, never directly by an API caller.
-- +goose StatementBegin
CREATE FUNCTION registry.notify_member(p_user UUID,p_key TEXT,p_kind TEXT,p_title TEXT,p_body TEXT,p_path TEXT) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,registry AS $fn$
BEGIN
    IF coalesce((SELECT notifications_enabled FROM registry.member_profiles WHERE user_id=p_user),true) THEN
        INSERT INTO registry.member_notifications(user_id,event_key,kind,title,body,path)
        VALUES(p_user,p_key,p_kind,p_title,p_body,p_path) ON CONFLICT(user_id,event_key) DO NOTHING;
    END IF;
END
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION registry.notify_member(UUID,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;

-- Preserve an explicit transition and its notification in the same transaction.
-- +goose StatementBegin
CREATE FUNCTION registry.record_member_transition() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
DECLARE previous TEXT := 'none'; history_id UUID; branch_name TEXT;
BEGIN
    IF TG_OP='UPDATE' THEN
        previous:=OLD.member_status;
        IF (OLD.member_status,OLD.is_primary,OLD.member_since) IS NOT DISTINCT FROM
           (NEW.member_status,NEW.is_primary,NEW.member_since) THEN RETURN NEW; END IF;
    END IF;
    IF NEW.member_status='none' AND previous='none' THEN RETURN NEW; END IF;
    INSERT INTO workspace.membership_history(tenant_id,user_id,actor_id,from_status,to_status,is_primary,member_since,reason)
    VALUES(NEW.tenant_id,NEW.user_id,NULLIF(current_setting('app.current_user',true),'')::uuid,
        previous,NEW.member_status,NEW.is_primary,NEW.member_since,NEW.member_reason) RETURNING id INTO history_id;
    SELECT name INTO branch_name FROM registry.tenants WHERE id=NEW.tenant_id;
    PERFORM registry.notify_member(NEW.user_id,'membership:'||history_id,'membership',
        'Гишүүнчлэлийн төлөв өөрчлөгдлөө',branch_name,'/member/record');
    RETURN NEW;
END
$fn$;
-- +goose StatementEnd
CREATE TRIGGER record_member_transition AFTER INSERT OR UPDATE ON workspace.memberships
    FOR EACH ROW EXECUTE FUNCTION registry.record_member_transition();
REVOKE ALL ON FUNCTION registry.record_member_transition() FROM PUBLIC;

-- An unambiguous existing branch can be retained. Multi-branch staff stays
-- unclassified until an administrator explicitly confirms their primary affiliation.
WITH single_branch AS (
    SELECT m.user_id FROM workspace.memberships m JOIN registry.tenants t ON t.id=m.tenant_id
    WHERE m.active AND t.membership_branch AND t.suspended_at IS NULL AND t.deletion_scheduled_at IS NULL
    GROUP BY m.user_id HAVING count(*)=1
)
UPDATE workspace.memberships m SET is_primary=true,member_status='active',member_since=m.created_at,
    member_reason='Өмнөх бүртгэлийн цорын ганц салбарын харьяалал'
FROM single_branch s,registry.tenants t
WHERE s.user_id=m.user_id AND t.id=m.tenant_id AND m.active AND t.membership_branch
    AND t.suspended_at IS NULL AND t.deletion_scheduled_at IS NULL;

-- Existing access APIs may still edit access fields, but cannot write the
-- primary affiliation or lifecycle columns outside the constrained functions.
REVOKE INSERT,UPDATE ON workspace.memberships FROM gerege_nexus_tenant;
GRANT INSERT(id,tenant_id,user_id,created_at,active,deactivated_at),
      UPDATE(active,deactivated_at) ON workspace.memberships TO gerege_nexus_tenant;

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION registry.guard_branch_admission(p_tenant UUID,p_user UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
DECLARE actor UUID := NULLIF(current_setting('app.current_user',true),'')::uuid;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM registry.tenants WHERE id=p_tenant AND membership_branch) THEN RETURN; END IF;
    IF actor IS NULL OR (actor<>p_user AND NOT coalesce(registry.can_manage_members(p_tenant),false)) THEN
        RAISE EXCEPTION 'admission_not_authorized' USING ERRCODE='42501';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('sdy-membership:'||p_user::text,0));
    IF EXISTS (SELECT 1 FROM workspace.memberships WHERE user_id=p_user AND is_primary AND tenant_id<>p_tenant) THEN
        RAISE EXCEPTION 'branch_transfer_required' USING ERRCODE='55000';
    END IF;
END
$fn$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE FUNCTION registry.set_member_status(p_tenant UUID,p_user UUID,p_status TEXT,p_reason TEXT) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
DECLARE m workspace.memberships%ROWTYPE; staff boolean; member_role UUID;
BEGIN
    IF NOT coalesce(registry.is_transfer_admin(p_tenant),false) THEN
        RAISE EXCEPTION 'membership_admin_required' USING ERRCODE='42501';
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
REVOKE ALL ON FUNCTION registry.set_member_status(UUID,UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION registry.set_member_status(UUID,UUID,TEXT,TEXT) TO gerege_nexus_tenant;

-- +goose StatementBegin
CREATE FUNCTION registry.my_member_record() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
    SELECT jsonb_build_object('memberships',coalesce(jsonb_agg(jsonb_build_object(
        'tenant_id',m.tenant_id,'name',t.name,'slug',t.slug,'is_primary',m.is_primary,
        'status',m.member_status,'member_since',m.member_since,'has_access',m.active)
        ORDER BY m.is_primary DESC,t.name),'[]'::jsonb))
    FROM workspace.memberships m JOIN registry.tenants t ON t.id=m.tenant_id
    WHERE m.user_id=NULLIF(current_setting('app.current_user',true),'')::uuid AND t.membership_branch;
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION registry.my_member_record() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION registry.my_member_record() TO gerege_nexus_tenant;

-- +goose Down
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION registry.guard_branch_admission(p_tenant UUID,p_user UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, workspace, registry AS $fn$
DECLARE actor UUID := NULLIF(current_setting('app.current_user',true),'')::uuid;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM registry.tenants WHERE id=p_tenant AND membership_branch) THEN RETURN; END IF;
    IF actor IS NULL OR (actor<>p_user AND NOT coalesce((
        p_tenant=NULLIF(current_setting('app.current_tenant',true),'')::uuid AND EXISTS (
            SELECT 1 FROM workspace.memberships m
            JOIN workspace.membership_roles mr ON mr.membership_id=m.id
            JOIN workspace.roles r ON r.id=mr.role_id AND r.tenant_id=m.tenant_id
            WHERE m.tenant_id=p_tenant AND m.user_id=actor AND m.active AND r.active
              AND (r.code='admin' OR EXISTS (SELECT 1 FROM workspace.role_permissions rp
                  JOIN registry.permissions p ON p.id=rp.permission_id
                  WHERE rp.role_id=r.id AND p.code='membership.manage')))),false)) THEN
        RAISE EXCEPTION 'admission_not_authorized' USING ERRCODE='42501';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('sdy-membership:'||p_user::text,0));
    IF EXISTS (SELECT 1 FROM workspace.memberships m JOIN registry.tenants t ON t.id=m.tenant_id
        WHERE m.user_id=p_user AND m.active AND m.tenant_id<>p_tenant AND t.membership_branch
          AND t.suspended_at IS NULL AND t.deletion_scheduled_at IS NULL) THEN
        RAISE EXCEPTION 'branch_transfer_required' USING ERRCODE='55000';
    END IF;
END
$fn$;
-- +goose StatementEnd
DROP FUNCTION registry.my_member_record();
DROP FUNCTION registry.set_member_status(UUID,UUID,TEXT,TEXT);
DROP TRIGGER record_member_transition ON workspace.memberships;
DROP FUNCTION registry.record_member_transition();
DROP TABLE registry.member_notifications;
DROP TABLE registry.member_profiles;
DROP TABLE workspace.membership_history;
DROP FUNCTION registry.notify_member(UUID,TEXT,TEXT,TEXT,TEXT,TEXT);
DROP FUNCTION registry.can_manage_members(UUID);
DROP INDEX workspace.memberships_one_primary;
ALTER TABLE workspace.memberships DROP CONSTRAINT memberships_primary_status;
ALTER TABLE workspace.memberships DROP COLUMN is_primary,DROP COLUMN member_status,DROP COLUMN member_since,DROP COLUMN member_reason;
GRANT INSERT,UPDATE ON workspace.memberships TO gerege_nexus_tenant;
