-- Admission and transfers update primary membership without granting staff access.
-- +goose Up
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION registry.request_membership_transfer(p_from UUID,p_slug TEXT,p_message TEXT) RETURNS UUID
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
      WHERE m.tenant_id=p_from AND m.user_id=actor AND m.active AND m.is_primary AND m.member_status='active' AND t.membership_branch
        AND t.suspended_at IS NULL AND t.deletion_scheduled_at IS NULL;
    IF source_id IS NULL THEN RAISE EXCEPTION 'transfer_source_unavailable' USING ERRCODE='42501'; END IF;
    SELECT id INTO target FROM registry.tenants WHERE slug=lower(btrim(p_slug)) AND membership_branch
      AND kind='organisation' AND suspended_at IS NULL AND deletion_scheduled_at IS NULL;
    IF target IS NULL THEN RAISE EXCEPTION 'transfer_destination_unavailable' USING ERRCODE='P0002'; END IF;
    IF target=p_from OR EXISTS (SELECT 1 FROM workspace.memberships WHERE tenant_id=target AND user_id=actor AND is_primary) THEN
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

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION registry.decide_membership_transfer(p_id UUID,p_accept BOOLEAN) RETURNS VOID
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
    destination_active boolean;
    source_staff boolean;
BEGIN
    IF p_accept IS NULL THEN RAISE EXCEPTION 'transfer_decision_required' USING ERRCODE='22023'; END IF;
    IF NOT coalesce(registry.is_transfer_admin(target),false) THEN
        RAISE EXCEPTION 'transfer_admin_required' USING ERRCODE='42501';
    END IF;
    SELECT user_id INTO requester FROM workspace.membership_transfers WHERE id=p_id AND tenant_id=target;
    IF requester IS NULL THEN RAISE EXCEPTION 'transfer_not_found' USING ERRCODE='P0002'; END IF;
    IF requester=actor THEN RAISE EXCEPTION 'transfer_self_decision_forbidden' USING ERRCODE='42501'; END IF;
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
        IF source.id IS NULL OR NOT source.active OR NOT source.is_primary OR source.member_status<>'active' THEN
            RAISE EXCEPTION 'transfer_source_changed' USING ERRCODE='55000';
        END IF;
        IF EXISTS (SELECT 1 FROM workspace.membership_roles mr JOIN workspace.roles r ON r.id=mr.role_id
            WHERE mr.membership_id=source.id AND r.tenant_id=source.tenant_id AND r.code='admin' AND r.active)
          AND NOT EXISTS (SELECT 1 FROM workspace.memberships m
            JOIN workspace.membership_roles mr ON mr.membership_id=m.id JOIN workspace.roles r ON r.id=mr.role_id
            WHERE m.tenant_id=source.tenant_id AND m.active AND m.user_id<>requester AND r.tenant_id=m.tenant_id AND r.code='admin' AND r.active) THEN
            RAISE EXCEPTION 'transfer_last_admin' USING ERRCODE='55000';
        END IF;
        IF EXISTS (SELECT 1 FROM workspace.memberships WHERE tenant_id=target AND user_id=requester AND is_primary) THEN
            RAISE EXCEPTION 'transfer_already_member' USING ERRCODE='55000';
        END IF;
        SELECT id INTO member_role FROM workspace.roles WHERE tenant_id=target AND code='user' AND active;
        IF member_role IS NULL THEN RAISE EXCEPTION 'transfer_member_role_unavailable' USING ERRCODE='55000'; END IF;
        SELECT EXISTS (SELECT 1 FROM workspace.membership_roles mr JOIN workspace.roles r ON r.id=mr.role_id
            WHERE mr.membership_id=source.id AND r.tenant_id=source.tenant_id AND r.active AND r.code<>'user') INTO source_staff;
        SELECT active INTO destination_active FROM workspace.memberships WHERE tenant_id=target AND user_id=requester;
        UPDATE workspace.memberships SET is_primary=false,member_status='left',member_reason=(SELECT left(name||' салбарт шилжив',500) FROM registry.tenants WHERE id=target),
            active=source_staff,deactivated_at=CASE WHEN source_staff THEN NULL ELSE now() END WHERE id=source.id;
        INSERT INTO workspace.memberships(tenant_id,user_id,is_primary,member_status,member_since,member_reason)
          VALUES(target,requester,true,'active',now(),(SELECT left(name||' салбараас шилжив',500) FROM registry.tenants WHERE id=source.tenant_id))
          ON CONFLICT(tenant_id,user_id) DO UPDATE SET active=true,deactivated_at=NULL,is_primary=true,
            member_status='active',member_since=now(),member_reason=EXCLUDED.member_reason
          RETURNING id INTO destination_membership;
        -- Existing active staff keeps its independent work permissions. An
        -- inactive historic grant never comes back through a membership transfer.
        IF NOT coalesce(destination_active,false) THEN
            DELETE FROM workspace.membership_roles WHERE membership_id=destination_membership;
        END IF;
        INSERT INTO workspace.membership_roles(membership_id,role_id) VALUES(destination_membership,member_role) ON CONFLICT DO NOTHING;
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
                WHERE tenant_id = target.id AND user_id = p_user_id
                  AND (NOT target.membership_branch OR is_primary)) THEN
        RAISE EXCEPTION 'request_to_join: already a member of %', p_slug
            USING ERRCODE = 'unique_violation';
    END IF;

    IF target.join_policy = 'open' THEN
        -- Гишүүнчлэл эхэлж: мөр нь түүнийг тайлбарлаж байгаа болохоос
        -- эсрэгээрээ биш. Хоёулаа нэг гүйлгээнд тул нэг нь бүтэхгүй бол
        -- нөгөө нь ч үлдэхгүй.
        INSERT INTO workspace.memberships (tenant_id, user_id)
        VALUES (target.id, p_user_id) ON CONFLICT(tenant_id,user_id) DO NOTHING;

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

-- +goose StatementBegin
CREATE FUNCTION registry.admit_primary_member() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
DECLARE actor UUID := NULLIF(current_setting('app.current_user',true),'')::uuid;
    m workspace.memberships%ROWTYPE; member_role UUID;
BEGIN
    IF NEW.status<>'ACCEPTED' THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND OLD.status='ACCEPTED' THEN RETURN NEW; END IF;
    IF NOT EXISTS (SELECT 1 FROM registry.tenants WHERE id=NEW.tenant_id AND membership_branch) THEN RETURN NEW; END IF;
    IF NOT coalesce(registry.can_manage_members(NEW.tenant_id),false) AND NOT
       (actor=NEW.user_id AND EXISTS (SELECT 1 FROM registry.tenants WHERE id=NEW.tenant_id AND join_policy='open')) THEN
        RAISE EXCEPTION 'admission_not_authorized' USING ERRCODE='42501';
    END IF;
    PERFORM registry.guard_branch_admission(NEW.tenant_id,NEW.user_id);
    SELECT * INTO m FROM workspace.memberships WHERE tenant_id=NEW.tenant_id AND user_id=NEW.user_id FOR UPDATE;
    IF m.id IS NULL THEN RAISE EXCEPTION 'membership_not_found' USING ERRCODE='P0002'; END IF;
    IF NOT m.active THEN DELETE FROM workspace.membership_roles WHERE membership_id=m.id; END IF;
    SELECT id INTO member_role FROM workspace.roles WHERE tenant_id=NEW.tenant_id AND code='user' AND active;
    IF member_role IS NULL THEN RAISE EXCEPTION 'membership_role_unavailable' USING ERRCODE='55000'; END IF;
    INSERT INTO workspace.membership_roles(membership_id,role_id) VALUES(m.id,member_role) ON CONFLICT DO NOTHING;
    UPDATE workspace.memberships SET is_primary=true,member_status='active',member_since=now(),
        member_reason='Элсэх хүсэлтийг батлав',active=true,deactivated_at=NULL WHERE id=m.id;
    RETURN NEW;
END
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION registry.admit_primary_member() FROM PUBLIC;
CREATE TRIGGER admit_primary_member AFTER INSERT OR UPDATE OF status ON workspace.join_requests
    FOR EACH ROW EXECUTE FUNCTION registry.admit_primary_member();

-- +goose StatementBegin
CREATE FUNCTION registry.notify_membership_decision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,registry AS $fn$
DECLARE label TEXT; destination TEXT;
BEGIN
    IF NEW.status='PENDING' THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND OLD.status=NEW.status THEN RETURN NEW; END IF;
    SELECT name INTO destination FROM registry.tenants WHERE id=NEW.tenant_id;
    label:=CASE WHEN TG_TABLE_NAME='membership_transfers' THEN 'Шилжилтийн хүсэлт шийдвэрлэгдлээ' ELSE 'Элсэх хүсэлт шийдвэрлэгдлээ' END;
    PERFORM registry.notify_member(NEW.user_id,TG_TABLE_NAME||':'||NEW.id::text||':'||NEW.status,
        'request',label,destination,'/member');
    RETURN NEW;
END
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION registry.notify_membership_decision() FROM PUBLIC;
CREATE TRIGGER notify_membership_decision AFTER INSERT OR UPDATE OF status ON workspace.join_requests
    FOR EACH ROW EXECUTE FUNCTION registry.notify_membership_decision();
CREATE TRIGGER notify_transfer_decision AFTER UPDATE OF status ON workspace.membership_transfers
    FOR EACH ROW EXECUTE FUNCTION registry.notify_membership_decision();

-- +goose Down
DROP TRIGGER notify_transfer_decision ON workspace.membership_transfers;
DROP TRIGGER notify_membership_decision ON workspace.join_requests;
DROP FUNCTION registry.notify_membership_decision();
DROP TRIGGER admit_primary_member ON workspace.join_requests;
DROP FUNCTION registry.admit_primary_member();
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION registry.request_membership_transfer(p_from UUID,p_slug TEXT,p_message TEXT) RETURNS UUID
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
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION registry.decide_membership_transfer(p_id UUID,p_accept BOOLEAN) RETURNS VOID
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
