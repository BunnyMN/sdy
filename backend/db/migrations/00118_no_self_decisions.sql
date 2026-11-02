-- Өөрийнхөө талаар шийдвэр гаргахгүй.
--
-- decide_membership_transfer (00113) өөрийнхөө шилжилтийг шийдэхийг аль
-- хэдийн хориглодог (transfer_self_decision_forbidden). Гишүүнчлэлийн төлөв
-- ба албан тушаалд ийм шалгалт байгаагүй: түдгэлзүүлсэн ч staff эрхээрээ
-- active хэвээр үлдсэн админ өөрийгөө буцааж 'active' болгох, эсвэл өөртөө
-- 'chair' оноох боломжтой байв. Одоо хоёулаа 42501-ээр татгалзана; өөр админ
-- шийднэ. Функцийн бусад хэсэг 00112 / 00117-тэй яг ижил.

-- +goose Up

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

-- +goose Down

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION registry.set_member_status(p_tenant UUID,p_user UUID,p_status TEXT,p_reason TEXT) RETURNS void
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

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION registry.set_member_position(p_tenant UUID, p_user UUID, p_position TEXT) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
DECLARE m workspace.memberships%ROWTYPE;
BEGIN
    IF NOT coalesce(registry.is_transfer_admin(p_tenant),false) THEN
        RAISE EXCEPTION 'membership_admin_required' USING ERRCODE='42501';
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
