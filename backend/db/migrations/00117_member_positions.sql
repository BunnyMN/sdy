-- Албан тушаал: гишүүнчлэл бүрт холбоон дахь албан тушаал.
--
-- SDY-ийн бүтэц: хүн бүр нэг холбоонд нэг албан тушаалтай — Тэргүүн,
-- Дэд тэргүүн, Нарийн бичиг, Хяналтын хороо, Тэргүүлэгч, Санхүүч эсвэл
-- Энгийн гишүүн. Энэ migration зөвхөн ХАРУУЛАХ зорилготой: албан тушаал эрх
-- олгохгүй, хасахгүй. Эрх нь workspace.roles / membership_roles-оор хэвээр
-- (00008). Албан тушаалыг эрхтэй холбох нь тусдаа, хожмын шийдвэр.
--
-- Бичих нь зөвхөн registry.set_member_position-оор, салбарын гишүүнчлэлийн
-- админ (registry.is_transfer_admin — set_member_status-тэй ижил шалгалт).
-- Тенантын role баганад шууд бичих эрхгүй хэвээр. Өөрчлөлт бүр аудитад.
-- Гишүүн өөрийн албан тушаалыг registry.my_member_record-оос уншина.

-- +goose Up

ALTER TABLE workspace.memberships
    ADD COLUMN position varchar(16) NOT NULL DEFAULT 'member'
    CHECK (position IN ('chair','vice_chair','secretary','auditor','board','finance','member'));

-- +goose StatementBegin
CREATE FUNCTION registry.set_member_position(p_tenant UUID, p_user UUID, p_position TEXT) RETURNS void
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
REVOKE ALL ON FUNCTION registry.set_member_position(UUID,UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION registry.set_member_position(UUID,UUID,TEXT) TO gerege_nexus_tenant;

-- 00112-ийнх, 'position'-тэй.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION registry.my_member_record() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
    SELECT jsonb_build_object('memberships',coalesce(jsonb_agg(jsonb_build_object(
        'tenant_id',m.tenant_id,'name',t.name,'slug',t.slug,'is_primary',m.is_primary,
        'status',m.member_status,'member_since',m.member_since,'has_access',m.active,
        'position',m.position)
        ORDER BY m.is_primary DESC,t.name),'[]'::jsonb))
    FROM workspace.memberships m JOIN registry.tenants t ON t.id=m.tenant_id
    WHERE m.user_id=NULLIF(current_setting('app.current_user',true),'')::uuid AND t.membership_branch;
$fn$;
-- +goose StatementEnd

-- +goose Down

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION registry.my_member_record() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
    SELECT jsonb_build_object('memberships',coalesce(jsonb_agg(jsonb_build_object(
        'tenant_id',m.tenant_id,'name',t.name,'slug',t.slug,'is_primary',m.is_primary,
        'status',m.member_status,'member_since',m.member_since,'has_access',m.active)
        ORDER BY m.is_primary DESC,t.name),'[]'::jsonb))
    FROM workspace.memberships m JOIN registry.tenants t ON t.id=m.tenant_id
    WHERE m.user_id=NULLIF(current_setting('app.current_user',true),'')::uuid AND t.membership_branch;
$fn$;
-- +goose StatementEnd
DROP FUNCTION IF EXISTS registry.set_member_position(UUID,UUID,TEXT);
ALTER TABLE workspace.memberships DROP COLUMN IF EXISTS position;
