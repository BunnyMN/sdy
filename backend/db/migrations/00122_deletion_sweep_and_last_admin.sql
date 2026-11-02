-- Бүртгэл устгалтын үлдсэн хоёр асуудал (00115).
--
-- 1. Цэвэрлэгээ (anonymise_deleted_accounts) мөрийг түгжээд дараа нь
--    гишүүнчлэлийн advisory lock-ийг хүлээдэг байсан; хүсэлт/цуцлалт эсрэг
--    дарааллаар авдаг тул зэрэг таарвал deadlock. Одоо lock-ийг оролдоод,
--    авч чадахгүй бол тэр хүнийг дараагийн цэвэрлэгээнд үлдээнэ.
-- 2. Байгууллагын сүүлчийн админ бүртгэлээ устгавал байгууллага админгүй
--    үлддэг. Устгалтыг хориглохгүй (App Store 5.1.1(v)), харин байгууллагын
--    аудитад 'organisation.left_without_admin' бичигдэнэ.

-- +goose Up

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION registry.anonymise_deleted_accounts(p_grace interval DEFAULT interval '30 days')
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, workspace, registry AS $fn$
DECLARE
    req registry.account_deletion_requests%ROWTYPE;
    done integer := 0;
BEGIN
    FOR req IN SELECT * FROM registry.account_deletion_requests
                WHERE status = 'pending' AND requested_at <= now() - p_grace
                ORDER BY requested_at FOR UPDATE SKIP LOCKED LOOP
        -- request/cancel take this lock first and the row second; waiting for
        -- it while holding the row could deadlock with them. Somebody busy
        -- right now is taken on the next sweep.
        IF NOT pg_try_advisory_xact_lock(hashtextextended('sdy-membership:'||req.user_id::text, 0)) THEN
            CONTINUE;
        END IF;

        UPDATE registry.users SET
               name = 'Устгагдсан хэрэглэгч',
               email = 'deleted+'||replace(id::text, '-', '')||'@identity.invalid',
               phone = '', locale = '', timezone = '', ge_id = NULL,
               -- bcrypt биш тул ямар ч нууц үгтэй таарахгүй.
               password_hash = '!account-deleted',
               active = false, failed_login_attempts = 0, locked_until = NULL
         WHERE id = req.user_id;
        UPDATE registry.member_profiles SET phone = '', residence = '',
               notifications_enabled = false, updated_at = now()
         WHERE user_id = req.user_id;
        DELETE FROM registry.user_eid_identities WHERE user_id = req.user_id;
        DELETE FROM registry.user_sso_identities WHERE user_id = req.user_id;
        DELETE FROM registry.member_notifications WHERE user_id = req.user_id;
        DELETE FROM registry.credential_grants WHERE user_id = req.user_id;
        DELETE FROM registry.person_items WHERE user_id = req.user_id;
        DELETE FROM workspace.sessions WHERE user_id = req.user_id;
        DELETE FROM workspace.push_tokens WHERE user_id = req.user_id;
        UPDATE workspace.membership_transfers
           SET requester_name = 'Устгагдсан хэрэглэгч', requester_email = ''
         WHERE user_id = req.user_id;
        UPDATE registry.tenants SET name = 'Устгагдсан хэрэглэгч'
         WHERE owner_user_id = req.user_id AND kind = 'personal';

        UPDATE registry.account_deletion_requests
           SET status = 'completed', processed_at = now(), ended_memberships = '[]'::jsonb
         WHERE id = req.id;
        done := done + 1;
    END LOOP;
    RETURN done;
END
$fn$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION registry.request_account_deletion(p_user UUID, p_reason TEXT)
RETURNS registry.account_deletion_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, workspace, registry AS $fn$
DECLARE
    req registry.account_deletion_requests%ROWTYPE;
    snapshot jsonb;
BEGIN
    IF p_user IS NULL OR NOT EXISTS (SELECT 1 FROM registry.users WHERE id = p_user) THEN
        RAISE EXCEPTION 'account_deletion_user_unknown' USING ERRCODE = 'P0002';
    END IF;
    IF p_reason IS NOT NULL AND length(btrim(p_reason)) > 500 THEN
        RAISE EXCEPTION 'account_deletion_reason_too_long' USING ERRCODE = '22023';
    END IF;
    -- Гишүүнчлэлийн бусад функцтэй (00112, 00113) нэг түгжээ: шилжилт эсвэл
    -- элсэлтийн шийдвэр энэ хүсэлттэй зэрэг явахгүй.
    PERFORM pg_advisory_xact_lock(hashtextextended('sdy-membership:'||p_user::text, 0));

    SELECT * INTO req FROM registry.account_deletion_requests
     WHERE user_id = p_user AND status = 'pending' FOR UPDATE;

    IF req.id IS NULL THEN
        -- Хувийн орон зай (kind='personal') хүний өөрийнх тул түүнийг
        -- хөндөхгүй; зөвхөн байгууллага дахь гишүүнчлэл дуусна.
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'id', m.id, 'active', m.active, 'is_primary', m.is_primary,
                   'member_status', m.member_status, 'deactivated_at', m.deactivated_at)), '[]'::jsonb)
          INTO snapshot
          FROM workspace.memberships m JOIN registry.tenants t ON t.id = m.tenant_id
         WHERE m.user_id = p_user AND t.kind <> 'personal' AND (m.active OR m.is_primary);

        INSERT INTO registry.account_deletion_requests (user_id, reason, ended_memberships)
        VALUES (p_user, coalesce(btrim(p_reason), ''), snapshot)
        RETURNING * INTO req;

        -- An organisation this person was the last administrator of is left
        -- without one: said in its audit trail, where the operator console
        -- reads it, so somebody can be named before it is needed.
        INSERT INTO workspace.audit_events (tenant_id, user_id, action, resource, details)
        SELECT m.tenant_id, p_user::text, 'organisation.left_without_admin', 'organisation',
               jsonb_build_object('request_id', req.id)
          FROM workspace.memberships m
          JOIN registry.tenants t ON t.id = m.tenant_id AND t.kind <> 'personal'
          JOIN workspace.membership_roles mr ON mr.membership_id = m.id
          JOIN workspace.roles r ON r.id = mr.role_id AND r.code = 'admin' AND r.active
         WHERE m.user_id = p_user AND m.active
           AND NOT EXISTS (SELECT 1 FROM workspace.memberships o
                JOIN workspace.membership_roles omr ON omr.membership_id = o.id
                JOIN workspace.roles orr ON orr.id = omr.role_id AND orr.code = 'admin' AND orr.active
               WHERE o.tenant_id = m.tenant_id AND o.user_id <> p_user AND o.active);

        UPDATE workspace.memberships m SET
               member_status = CASE WHEN m.member_status IN ('active','suspended','expired')
                                    THEN 'left' ELSE m.member_status END,
               is_primary = false,
               member_reason = 'account deletion',
               active = false,
               deactivated_at = coalesce(m.deactivated_at, now())
          FROM registry.tenants t
         WHERE t.id = m.tenant_id AND m.user_id = p_user AND t.kind <> 'personal'
           AND (m.active OR m.is_primary);

        INSERT INTO workspace.audit_events (tenant_id, user_id, action, resource, details)
        SELECT DISTINCT m.tenant_id, p_user::text, 'account.deletion_requested', 'user',
               jsonb_build_object('request_id', req.id)
          FROM workspace.memberships m JOIN registry.tenants t ON t.id = m.tenant_id
         WHERE m.user_id = p_user AND t.kind <> 'personal';
    END IF;

    -- Нэвтрэх бүх зам хаагдана. Сесс, бусад системд олгосон OAuth токен,
    -- push мэдэгдлийн токен.
    UPDATE workspace.sessions SET revoked_at = now() WHERE user_id = p_user AND revoked_at IS NULL;
    UPDATE workspace.oauth2_tokens SET revoked_at = now() WHERE user_id = p_user AND revoked_at IS NULL;
    DELETE FROM workspace.push_tokens WHERE user_id = p_user;
    -- Хүлээгдэж буй асуултууд: админ дараа нь «зөвшөөрөх» товч дарж хүнийг
    -- буцааж гишүүн болгох ёсгүй.
    UPDATE workspace.membership_transfers SET status = 'CANCELLED', decided_at = now()
     WHERE user_id = p_user AND status = 'PENDING';
    DELETE FROM workspace.join_requests WHERE user_id = p_user AND status = 'PENDING';

    RETURN req;
END
$fn$;
-- +goose StatementEnd

-- +goose Down

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION registry.anonymise_deleted_accounts(p_grace interval DEFAULT interval '30 days')
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, workspace, registry AS $fn$
DECLARE
    req registry.account_deletion_requests%ROWTYPE;
    done integer := 0;
BEGIN
    FOR req IN SELECT * FROM registry.account_deletion_requests
                WHERE status = 'pending' AND requested_at <= now() - p_grace
                ORDER BY requested_at FOR UPDATE SKIP LOCKED LOOP
        PERFORM pg_advisory_xact_lock(hashtextextended('sdy-membership:'||req.user_id::text, 0));

        UPDATE registry.users SET
               name = 'Устгагдсан хэрэглэгч',
               email = 'deleted+'||replace(id::text, '-', '')||'@identity.invalid',
               phone = '', locale = '', timezone = '', ge_id = NULL,
               -- bcrypt биш тул ямар ч нууц үгтэй таарахгүй.
               password_hash = '!account-deleted',
               active = false, failed_login_attempts = 0, locked_until = NULL
         WHERE id = req.user_id;
        UPDATE registry.member_profiles SET phone = '', residence = '',
               notifications_enabled = false, updated_at = now()
         WHERE user_id = req.user_id;
        DELETE FROM registry.user_eid_identities WHERE user_id = req.user_id;
        DELETE FROM registry.user_sso_identities WHERE user_id = req.user_id;
        DELETE FROM registry.member_notifications WHERE user_id = req.user_id;
        DELETE FROM registry.credential_grants WHERE user_id = req.user_id;
        DELETE FROM registry.person_items WHERE user_id = req.user_id;
        DELETE FROM workspace.sessions WHERE user_id = req.user_id;
        DELETE FROM workspace.push_tokens WHERE user_id = req.user_id;
        UPDATE workspace.membership_transfers
           SET requester_name = 'Устгагдсан хэрэглэгч', requester_email = ''
         WHERE user_id = req.user_id;
        UPDATE registry.tenants SET name = 'Устгагдсан хэрэглэгч'
         WHERE owner_user_id = req.user_id AND kind = 'personal';

        UPDATE registry.account_deletion_requests
           SET status = 'completed', processed_at = now(), ended_memberships = '[]'::jsonb
         WHERE id = req.id;
        done := done + 1;
    END LOOP;
    RETURN done;
END
$fn$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION registry.request_account_deletion(p_user UUID, p_reason TEXT)
RETURNS registry.account_deletion_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, workspace, registry AS $fn$
DECLARE
    req registry.account_deletion_requests%ROWTYPE;
    snapshot jsonb;
BEGIN
    IF p_user IS NULL OR NOT EXISTS (SELECT 1 FROM registry.users WHERE id = p_user) THEN
        RAISE EXCEPTION 'account_deletion_user_unknown' USING ERRCODE = 'P0002';
    END IF;
    IF p_reason IS NOT NULL AND length(btrim(p_reason)) > 500 THEN
        RAISE EXCEPTION 'account_deletion_reason_too_long' USING ERRCODE = '22023';
    END IF;
    -- Гишүүнчлэлийн бусад функцтэй (00112, 00113) нэг түгжээ: шилжилт эсвэл
    -- элсэлтийн шийдвэр энэ хүсэлттэй зэрэг явахгүй.
    PERFORM pg_advisory_xact_lock(hashtextextended('sdy-membership:'||p_user::text, 0));

    SELECT * INTO req FROM registry.account_deletion_requests
     WHERE user_id = p_user AND status = 'pending' FOR UPDATE;

    IF req.id IS NULL THEN
        -- Хувийн орон зай (kind='personal') хүний өөрийнх тул түүнийг
        -- хөндөхгүй; зөвхөн байгууллага дахь гишүүнчлэл дуусна.
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'id', m.id, 'active', m.active, 'is_primary', m.is_primary,
                   'member_status', m.member_status, 'deactivated_at', m.deactivated_at)), '[]'::jsonb)
          INTO snapshot
          FROM workspace.memberships m JOIN registry.tenants t ON t.id = m.tenant_id
         WHERE m.user_id = p_user AND t.kind <> 'personal' AND (m.active OR m.is_primary);

        INSERT INTO registry.account_deletion_requests (user_id, reason, ended_memberships)
        VALUES (p_user, coalesce(btrim(p_reason), ''), snapshot)
        RETURNING * INTO req;

        UPDATE workspace.memberships m SET
               member_status = CASE WHEN m.member_status IN ('active','suspended','expired')
                                    THEN 'left' ELSE m.member_status END,
               is_primary = false,
               member_reason = 'account deletion',
               active = false,
               deactivated_at = coalesce(m.deactivated_at, now())
          FROM registry.tenants t
         WHERE t.id = m.tenant_id AND m.user_id = p_user AND t.kind <> 'personal'
           AND (m.active OR m.is_primary);

        INSERT INTO workspace.audit_events (tenant_id, user_id, action, resource, details)
        SELECT DISTINCT m.tenant_id, p_user::text, 'account.deletion_requested', 'user',
               jsonb_build_object('request_id', req.id)
          FROM workspace.memberships m JOIN registry.tenants t ON t.id = m.tenant_id
         WHERE m.user_id = p_user AND t.kind <> 'personal';
    END IF;

    -- Нэвтрэх бүх зам хаагдана. Сесс, бусад системд олгосон OAuth токен,
    -- push мэдэгдлийн токен.
    UPDATE workspace.sessions SET revoked_at = now() WHERE user_id = p_user AND revoked_at IS NULL;
    UPDATE workspace.oauth2_tokens SET revoked_at = now() WHERE user_id = p_user AND revoked_at IS NULL;
    DELETE FROM workspace.push_tokens WHERE user_id = p_user;
    -- Хүлээгдэж буй асуултууд: админ дараа нь «зөвшөөрөх» товч дарж хүнийг
    -- буцааж гишүүн болгох ёсгүй.
    UPDATE workspace.membership_transfers SET status = 'CANCELLED', decided_at = now()
     WHERE user_id = p_user AND status = 'PENDING';
    DELETE FROM workspace.join_requests WHERE user_id = p_user AND status = 'PENDING';

    RETURN req;
END
$fn$;
-- +goose StatementEnd
