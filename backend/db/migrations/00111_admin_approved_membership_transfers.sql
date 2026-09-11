-- A member asks; the destination organisation's administrator decides.
-- Cross-organisation writes use narrow functions bound to the authenticated
-- person and acting workspace. No client receives broad membership writes.
-- +goose Up
CREATE TABLE workspace.membership_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES registry.tenants(id) ON DELETE CASCADE,
    from_tenant_id UUID NOT NULL REFERENCES registry.tenants(id) ON DELETE CASCADE,
    source_membership_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES registry.users(id) ON DELETE CASCADE,
    requester_name VARCHAR(255) NOT NULL,
    requester_email VARCHAR(255) NOT NULL,
    message VARCHAR(500) NOT NULL CHECK (length(message) BETWEEN 1 AND 500),
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','DECLINED','CANCELLED')),
    decided_by UUID REFERENCES registry.users(id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (tenant_id <> from_tenant_id),
    CHECK ((status = 'PENDING') = (decided_at IS NULL))
);
CREATE UNIQUE INDEX membership_transfers_one_pending ON workspace.membership_transfers(user_id) WHERE status='PENDING';
CREATE INDEX membership_transfers_queue ON workspace.membership_transfers(tenant_id,created_at) WHERE status='PENDING';
CREATE INDEX membership_transfers_source ON workspace.membership_transfers(from_tenant_id);
CREATE INDEX membership_transfers_decider ON workspace.membership_transfers(decided_by);
CREATE INDEX membership_transfers_history ON workspace.membership_transfers(user_id,created_at DESC);

-- +goose StatementBegin
CREATE FUNCTION registry.is_transfer_admin(p_tenant UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, workspace, registry AS $fn$
    SELECT p_tenant = NULLIF(current_setting('app.current_tenant',true),'')::uuid
       AND EXISTS (SELECT 1 FROM workspace.memberships m
           JOIN workspace.membership_roles mr ON mr.membership_id=m.id
           JOIN workspace.roles r ON r.id=mr.role_id AND r.tenant_id=m.tenant_id
           WHERE m.tenant_id=p_tenant AND m.user_id=NULLIF(current_setting('app.current_user',true),'')::uuid
             AND m.active AND r.active AND r.code='admin');
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION registry.is_transfer_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION registry.is_transfer_admin(UUID) TO gerege_nexus_tenant;
ALTER TABLE workspace.membership_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace.membership_transfers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON workspace.membership_transfers FOR SELECT TO gerege_nexus_tenant
    USING (tenant_id=NULLIF(current_setting('app.current_tenant',true),'')::uuid AND registry.is_transfer_admin(tenant_id));
REVOKE ALL ON workspace.membership_transfers FROM gerege_nexus_tenant;
GRANT SELECT ON workspace.membership_transfers TO gerege_nexus_tenant;

-- This guard is shared with ordinary admission. A queued admission from before
-- somebody joined another branch must not become a manager-approved transfer.
-- Serialize all of a person's admission/transfer decisions before row locks.
-- +goose StatementBegin
CREATE FUNCTION registry.guard_branch_admission(p_tenant UUID,p_user UUID) RETURNS VOID
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
REVOKE ALL ON FUNCTION registry.guard_branch_admission(UUID,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION registry.guard_branch_admission(UUID,UUID) TO gerege_nexus_tenant;

-- +goose StatementBegin
CREATE FUNCTION registry.request_membership_transfer(p_from UUID,p_slug TEXT,p_message TEXT) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, workspace, registry AS $fn$
DECLARE
    actor UUID := NULLIF(current_setting('app.current_user',true),'')::uuid;
    target UUID;
    source_id UUID;
    pending workspace.membership_transfers%ROWTYPE;
    result UUID;
BEGIN
    IF actor IS NULL THEN RAISE EXCEPTION 'transfer_not_authorized' USING ERRCODE='42501'; END IF;
    IF p_message IS NULL OR length(btrim(p_message)) NOT BETWEEN 1 AND 500 THEN
        RAISE EXCEPTION 'transfer_reason_required' USING ERRCODE='22023';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('sdy-membership:'||actor::text,0));
    SELECT m.id INTO source_id FROM workspace.memberships m JOIN registry.tenants t ON t.id=m.tenant_id
      WHERE m.tenant_id=p_from AND m.user_id=actor AND m.active AND t.membership_branch
        AND t.suspended_at IS NULL AND t.deletion_scheduled_at IS NULL;
    IF source_id IS NULL THEN RAISE EXCEPTION 'transfer_source_unavailable' USING ERRCODE='42501'; END IF;
    SELECT id INTO target FROM registry.tenants WHERE slug=lower(btrim(p_slug)) AND membership_branch
      AND kind='organisation' AND suspended_at IS NULL AND deletion_scheduled_at IS NULL;
    IF target IS NULL THEN RAISE EXCEPTION 'transfer_destination_unavailable' USING ERRCODE='P0002'; END IF;
    IF target=p_from OR EXISTS (SELECT 1 FROM workspace.memberships WHERE tenant_id=target AND user_id=actor AND active) THEN
        RAISE EXCEPTION 'transfer_already_member' USING ERRCODE='55000';
    END IF;
    SELECT * INTO pending FROM workspace.membership_transfers WHERE user_id=actor AND status='PENDING';
    IF pending.id IS NOT NULL THEN
        IF pending.from_tenant_id=p_from AND pending.tenant_id=target THEN RETURN pending.id; END IF;
        RAISE EXCEPTION 'transfer_already_pending' USING ERRCODE='55000';
    END IF;
    INSERT INTO workspace.membership_transfers(tenant_id,from_tenant_id,source_membership_id,user_id,requester_name,requester_email,message)
      SELECT target,p_from,source_id,id,name,email,btrim(p_message) FROM registry.users WHERE id=actor RETURNING id INTO result;
    RETURN result;
END
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION registry.request_membership_transfer(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION registry.request_membership_transfer(UUID,TEXT,TEXT) TO gerege_nexus_tenant;

-- The requester sees only their own history, even after their old membership
-- has ended. The administrator's queue remains an ordinary, narrow RLS read.
-- +goose StatementBegin
CREATE FUNCTION registry.my_membership_transfers() RETURNS SETOF JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, workspace, registry AS $fn$
    SELECT jsonb_build_object('id',r.id,'from_tenant_id',r.from_tenant_id,'from_name',src.name,
        'tenant_id',r.tenant_id,'to_name',dest.name,'message',r.message,'status',r.status,
        'created_at',r.created_at,'decided_at',r.decided_at)
      FROM workspace.membership_transfers r
      JOIN registry.tenants src ON src.id=r.from_tenant_id JOIN registry.tenants dest ON dest.id=r.tenant_id
      WHERE r.user_id=NULLIF(current_setting('app.current_user',true),'')::uuid
      ORDER BY r.created_at DESC,r.id LIMIT 100;
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION registry.my_membership_transfers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION registry.my_membership_transfers() TO gerege_nexus_tenant;

-- +goose StatementBegin
CREATE FUNCTION registry.cancel_membership_transfer(p_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, workspace, registry AS $fn$
DECLARE actor UUID := NULLIF(current_setting('app.current_user',true),'')::uuid;
BEGIN
    IF actor IS NULL THEN RAISE EXCEPTION 'transfer_not_authorized' USING ERRCODE='42501'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('sdy-membership:'||actor::text,0));
    UPDATE workspace.membership_transfers SET status='CANCELLED',decided_by=actor,decided_at=now()
      WHERE id=p_id AND user_id=actor AND status='PENDING';
    IF NOT FOUND THEN RAISE EXCEPTION 'transfer_not_pending' USING ERRCODE='55000'; END IF;
END
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION registry.cancel_membership_transfer(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION registry.cancel_membership_transfer(UUID) TO gerege_nexus_tenant;

-- +goose StatementBegin
CREATE FUNCTION registry.decide_membership_transfer(p_id UUID,p_accept BOOLEAN) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, workspace, registry AS $fn$
DECLARE
    actor UUID := NULLIF(current_setting('app.current_user',true),'')::uuid;
    target UUID := NULLIF(current_setting('app.current_tenant',true),'')::uuid;
    requester UUID;
    transfer workspace.membership_transfers%ROWTYPE;
    source workspace.memberships%ROWTYPE;
    destination_membership UUID;
    member_role UUID;
    details JSONB;
BEGIN
    IF p_accept IS NULL THEN RAISE EXCEPTION 'transfer_decision_required' USING ERRCODE='22023'; END IF;
    IF NOT coalesce(registry.is_transfer_admin(target),false) THEN
        RAISE EXCEPTION 'transfer_admin_required' USING ERRCODE='42501';
    END IF;
    SELECT user_id INTO requester FROM workspace.membership_transfers WHERE id=p_id AND tenant_id=target;
    IF requester IS NULL THEN RAISE EXCEPTION 'transfer_not_found' USING ERRCODE='P0002'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('sdy-membership:'||requester::text,0));
    SELECT * INTO transfer FROM workspace.membership_transfers WHERE id=p_id AND tenant_id=target FOR UPDATE;
    IF NOT coalesce(registry.is_transfer_admin(target),false) THEN
        RAISE EXCEPTION 'transfer_admin_required' USING ERRCODE='42501';
    END IF;
    IF transfer.status<>'PENDING' THEN RAISE EXCEPTION 'transfer_not_pending' USING ERRCODE='55000'; END IF;
    IF p_accept THEN
        -- Sorted organisation locks serialize opposite-direction transfers and
        -- protect the last-administrator check across different requesters.
        PERFORM id FROM registry.tenants WHERE id IN (transfer.from_tenant_id,target) ORDER BY id FOR UPDATE;
        IF (SELECT count(*) FROM registry.tenants WHERE id IN (transfer.from_tenant_id,target)
            AND membership_branch AND suspended_at IS NULL AND deletion_scheduled_at IS NULL)<>2 THEN
            RAISE EXCEPTION 'transfer_organisation_unavailable' USING ERRCODE='55000';
        END IF;
        SELECT * INTO source FROM workspace.memberships WHERE id=transfer.source_membership_id
            AND tenant_id=transfer.from_tenant_id AND user_id=requester FOR UPDATE;
        IF source.id IS NULL OR NOT source.active THEN
            RAISE EXCEPTION 'transfer_source_changed' USING ERRCODE='55000';
        END IF;
        IF EXISTS (SELECT 1 FROM workspace.membership_roles mr JOIN workspace.roles r ON r.id=mr.role_id
            WHERE mr.membership_id=source.id AND r.tenant_id=source.tenant_id AND r.code='admin' AND r.active)
          AND NOT EXISTS (SELECT 1 FROM workspace.memberships m
            JOIN workspace.membership_roles mr ON mr.membership_id=m.id JOIN workspace.roles r ON r.id=mr.role_id
            WHERE m.tenant_id=source.tenant_id AND m.active AND m.user_id<>requester AND r.tenant_id=m.tenant_id AND r.code='admin' AND r.active) THEN
            RAISE EXCEPTION 'transfer_last_admin' USING ERRCODE='55000';
        END IF;
        IF EXISTS (SELECT 1 FROM workspace.memberships WHERE tenant_id=target AND user_id=requester AND active) THEN
            RAISE EXCEPTION 'transfer_already_member' USING ERRCODE='55000';
        END IF;
        SELECT id INTO member_role FROM workspace.roles WHERE tenant_id=target AND code='user' AND active;
        IF member_role IS NULL THEN RAISE EXCEPTION 'transfer_member_role_unavailable' USING ERRCODE='55000'; END IF;
        UPDATE workspace.memberships SET active=false,deactivated_at=now() WHERE id=source.id;
        INSERT INTO workspace.memberships(tenant_id,user_id) VALUES(target,requester)
          ON CONFLICT(tenant_id,user_id) DO UPDATE SET active=true,deactivated_at=NULL
          RETURNING id INTO destination_membership;
        -- A transfer grants ordinary membership, never old staff/admin roles.
        DELETE FROM workspace.membership_roles WHERE membership_id=destination_membership;
        INSERT INTO workspace.membership_roles(membership_id,role_id) VALUES(destination_membership,member_role);
        UPDATE workspace.sessions SET revoked_at=now() WHERE user_id=requester
          AND tenant_id IN (transfer.from_tenant_id,target) AND revoked_at IS NULL;
    END IF;
    UPDATE workspace.membership_transfers SET status=CASE WHEN p_accept THEN 'ACCEPTED' ELSE 'DECLINED' END,
      decided_by=actor,decided_at=now() WHERE id=p_id;
    details:=jsonb_build_object('request_id',p_id,'user_id',requester,'from_tenant_id',transfer.from_tenant_id,
      'to_tenant_id',target,'accepted',p_accept);
    INSERT INTO workspace.audit_events(tenant_id,user_id,action,resource,details)
      VALUES(target,actor::text,'membership.transfer.decided','membership_transfer',details);
    IF p_accept THEN
        INSERT INTO workspace.audit_events(tenant_id,user_id,action,resource,details)
          VALUES(transfer.from_tenant_id,actor::text,'membership.transfer.departed','membership_transfer',details);
    END IF;
END
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION registry.decide_membership_transfer(UUID,BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION registry.decide_membership_transfer(UUID,BOOLEAN) TO gerege_nexus_tenant;

-- Ordinary admission function replacement is appended below.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION registry.request_to_join(
    p_user_id UUID,
    p_slug    TEXT,
    p_message TEXT
) RETURNS TABLE (request_id UUID, workspace_id UUID, workspace_name TEXT, joined BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = workspace, registry AS $fn$
DECLARE
    target registry.tenants%ROWTYPE;
    found  UUID;
    admitted BOOLEAN := FALSE;
BEGIN
    SELECT * INTO target FROM registry.tenants
     WHERE slug = p_slug AND kind = 'organisation';
    IF target.id IS NULL THEN
        RAISE EXCEPTION 'request_to_join: no organisation with slug %', p_slug
            USING ERRCODE = 'no_data_found';
    END IF;
    IF target.suspended_at IS NOT NULL OR target.deletion_scheduled_at IS NOT NULL THEN
        RAISE EXCEPTION 'request_to_join: % is not accepting members', p_slug
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    PERFORM registry.guard_branch_admission(target.id,p_user_id);
    IF EXISTS (SELECT 1 FROM workspace.memberships
                WHERE tenant_id = target.id AND user_id = p_user_id) THEN
        RAISE EXCEPTION 'request_to_join: already a member of %', p_slug
            USING ERRCODE = 'unique_violation';
    END IF;

    IF target.join_policy = 'open' THEN
        -- Гишүүнчлэл эхэлж: мөр нь түүнийг тайлбарлаж байгаа болохоос
        -- эсрэгээрээ биш. Хоёулаа нэг гүйлгээнд тул нэг нь бүтэхгүй бол
        -- нөгөө нь ч үлдэхгүй.
        INSERT INTO workspace.memberships (tenant_id, user_id)
        VALUES (target.id, p_user_id);

        -- Хүлээгдэж байсан хүсэлт байвал түүнийг л шийднэ: хүн хүсэлт
        -- илгээчихээд, дараа нь байгууллага нээлттэй болсон тохиолдол.
        SELECT j.id INTO found FROM workspace.join_requests j
         WHERE j.tenant_id = target.id AND j.user_id = p_user_id AND j.status = 'PENDING';
        IF found IS NULL THEN
            INSERT INTO workspace.join_requests
                   (tenant_id, user_id, message, status, decided_at)
            VALUES (target.id, p_user_id, coalesce(left(p_message, 500), ''),
                    'ACCEPTED', NOW())
            RETURNING id INTO found;
        ELSE
            UPDATE workspace.join_requests
               SET status = 'ACCEPTED', decided_at = NOW()
             WHERE id = found;
        END IF;

        admitted := TRUE;
    ELSE
        SELECT j.id INTO found FROM workspace.join_requests j
         WHERE j.tenant_id = target.id AND j.user_id = p_user_id AND j.status = 'PENDING';
        IF found IS NULL THEN
            INSERT INTO workspace.join_requests (tenant_id, user_id, message)
            VALUES (target.id, p_user_id, coalesce(left(p_message, 500), ''))
            RETURNING id INTO found;
        END IF;
    END IF;

    RETURN QUERY SELECT found, target.id, target.name::text, admitted;
END
$fn$;
-- +goose StatementEnd

GRANT EXECUTE ON FUNCTION registry.request_to_join(UUID, TEXT, TEXT) TO gerege_nexus_tenant;


-- +goose Down
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION registry.request_to_join(
    p_user_id UUID,
    p_slug    TEXT,
    p_message TEXT
) RETURNS TABLE (request_id UUID, workspace_id UUID, workspace_name TEXT, joined BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = workspace, registry AS $fn$
DECLARE
    target registry.tenants%ROWTYPE;
    found  UUID;
    admitted BOOLEAN := FALSE;
BEGIN
    SELECT * INTO target FROM registry.tenants
     WHERE slug = p_slug AND kind = 'organisation';
    IF target.id IS NULL THEN
        RAISE EXCEPTION 'request_to_join: no organisation with slug %', p_slug
            USING ERRCODE = 'no_data_found';
    END IF;
    IF target.suspended_at IS NOT NULL OR target.deletion_scheduled_at IS NOT NULL THEN
        RAISE EXCEPTION 'request_to_join: % is not accepting members', p_slug
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF EXISTS (SELECT 1 FROM workspace.memberships
                WHERE tenant_id = target.id AND user_id = p_user_id) THEN
        RAISE EXCEPTION 'request_to_join: already a member of %', p_slug
            USING ERRCODE = 'unique_violation';
    END IF;

    IF target.join_policy = 'open' THEN
        -- Гишүүнчлэл эхэлж: мөр нь түүнийг тайлбарлаж байгаа болохоос
        -- эсрэгээрээ биш. Хоёулаа нэг гүйлгээнд тул нэг нь бүтэхгүй бол
        -- нөгөө нь ч үлдэхгүй.
        INSERT INTO workspace.memberships (tenant_id, user_id)
        VALUES (target.id, p_user_id);

        -- Хүлээгдэж байсан хүсэлт байвал түүнийг л шийднэ: хүн хүсэлт
        -- илгээчихээд, дараа нь байгууллага нээлттэй болсон тохиолдол.
        SELECT j.id INTO found FROM workspace.join_requests j
         WHERE j.tenant_id = target.id AND j.user_id = p_user_id AND j.status = 'PENDING';
        IF found IS NULL THEN
            INSERT INTO workspace.join_requests
                   (tenant_id, user_id, message, status, decided_at)
            VALUES (target.id, p_user_id, coalesce(left(p_message, 500), ''),
                    'ACCEPTED', NOW())
            RETURNING id INTO found;
        ELSE
            UPDATE workspace.join_requests
               SET status = 'ACCEPTED', decided_at = NOW()
             WHERE id = found;
        END IF;

        admitted := TRUE;
    ELSE
        SELECT j.id INTO found FROM workspace.join_requests j
         WHERE j.tenant_id = target.id AND j.user_id = p_user_id AND j.status = 'PENDING';
        IF found IS NULL THEN
            INSERT INTO workspace.join_requests (tenant_id, user_id, message)
            VALUES (target.id, p_user_id, coalesce(left(p_message, 500), ''))
            RETURNING id INTO found;
        END IF;
    END IF;

    RETURN QUERY SELECT found, target.id, target.name::text, admitted;
END
$fn$;
-- +goose StatementEnd

GRANT EXECUTE ON FUNCTION registry.request_to_join(UUID, TEXT, TEXT) TO gerege_nexus_tenant;


DROP FUNCTION registry.decide_membership_transfer(UUID,BOOLEAN);
DROP FUNCTION registry.cancel_membership_transfer(UUID);
DROP FUNCTION registry.my_membership_transfers();
DROP FUNCTION registry.request_membership_transfer(UUID,TEXT,TEXT);
DROP FUNCTION registry.guard_branch_admission(UUID,UUID);
DROP TABLE workspace.membership_transfers;
DROP FUNCTION registry.is_transfer_admin(UUID);
