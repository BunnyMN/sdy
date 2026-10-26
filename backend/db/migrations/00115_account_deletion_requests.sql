-- Бүртгэл устгах хүсэлт: хүн өөрийн бүртгэлийг устгуулахыг хүсэх суваг.
--
-- eID-ээр анх нэвтрэхэд бүртгэл автоматаар нээгддэг, тиймээс хүн түүнийгээ
-- хаалгах замтай байх ёстой (App Store 5.1.1(v)). Хүсэлт гурван үетэй:
--
--   1. Хүсэлт (request_account_deletion): мөр бичигдэж, тухайн хүний бүх
--      сесс цуцлагдана, байгууллага дахь гишүүнчлэл «account deletion»
--      шалтгаантайгаар дуусна, хүлээгдэж буй элсэлт/шилжилтийн хүсэлт
--      хаагдана. Дуусгасан гишүүнчлэлийн өмнөх төлөвийг мөрөнд хадгална —
--      цуцлах үед буцааж сэргээхийн тулд.
--   2. Хүлээх хугацаа (30 хоног): энэ хугацаанд дахин нэвтэрвэл
--      (cancel_account_deletion, auth.FirstTenantFor-оос дуудагдана) хүсэлт
--      цуцлагдаж, гишүүнчлэл сэргэнэ. eID холбоосыг хүсэлтийн үед салгадаггүй
--      нь үүнээс: салгачихвал дахин нэвтрэхэд шинэ хоосон бүртгэл нээгдэх
--      байсан.
--   3. Нэргүйжүүлэлт (anonymise_deleted_accounts): хугацаа өнгөрмөгц хувь
--      хүний талбарууд (нэр, и-мэйл, утас, оршин суугаа газар, eID/SSO
--      холбоос) арилна. Санхүүгийн болон ирцийн мөрүүд (татвар, төлбөр,
--      ирц, оноо, санал хураалт) user_id-гаараа үлдэнэ — тэдгээр нь
--      байгууллагын бүртгэл, хүнийх биш.
--
-- Хүснэгт нь хэн нэгэн байгууллагынх биш, хүнийх; бичих, унших нь бүгд
-- login role-оор (nexus.WithoutWorkspace) явна. 00114-тэй адил tenant_id ч,
-- RLS ч байхгүй, тенантын role-д ямар ч эрх өгөхгүй (registry-ийн шинэ
-- хүснэгт анхнаасаа хаалттай — schema_split_test.go). Консол зөвхөн уншина.

-- +goose Up

CREATE TABLE registry.account_deletion_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES registry.users(id) ON DELETE CASCADE,
    requested_at timestamptz NOT NULL DEFAULT now(),
    reason varchar(500) NOT NULL DEFAULT '',
    status varchar(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','cancelled','completed')),
    processed_at timestamptz,
    -- Хүсэлтийн үед дуусгасан гишүүнчлэлүүдийн өмнөх төлөв. Цуцлахад л
    -- хэрэгтэй; нэргүйжүүлсний дараа хоосолно.
    ended_memberships jsonb NOT NULL DEFAULT '[]'::jsonb,
    CHECK ((status = 'pending') = (processed_at IS NULL))
);
CREATE INDEX account_deletion_requests_user ON registry.account_deletion_requests(user_id, requested_at DESC);
CREATE UNIQUE INDEX account_deletion_requests_one_pending ON registry.account_deletion_requests(user_id) WHERE status = 'pending';
CREATE INDEX account_deletion_requests_due ON registry.account_deletion_requests(requested_at) WHERE status = 'pending';

GRANT SELECT ON registry.account_deletion_requests TO gerege_nexus_operator;

-- Хүсэлт. Давтан дуудвал шинэ мөр нээхгүй, байгааг нь буцаана; харин сесс
-- цуцлах зэрэг алхмуудыг дахин хийнэ (тэр нь аюулгүй).
-- +goose StatementBegin
CREATE FUNCTION registry.request_account_deletion(p_user UUID, p_reason TEXT)
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
REVOKE ALL ON FUNCTION registry.request_account_deletion(UUID, TEXT) FROM PUBLIC;

-- Хүлээх хугацаанд дахин нэвтэрсэн хүн бодлоо өөрчилсөн гэж үзнэ. Хүсэлтийн
-- үед дуусгасан гишүүнчлэл, өөр хэн нэгэн (админ) хооронд нь өөрчлөөгүй л бол,
-- өмнөх төлөвтөө буцна. Хүсэлт байхгүй бол юу ч хийхгүй, false буцаана.
-- +goose StatementBegin
CREATE FUNCTION registry.cancel_account_deletion(p_user UUID) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, workspace, registry AS $fn$
DECLARE
    req registry.account_deletion_requests%ROWTYPE;
    item jsonb;
BEGIN
    -- Ихэнх нэвтрэлтэд хүсэлт байдаггүй; түгжээ авалгүй хурдан гарна.
    IF NOT EXISTS (SELECT 1 FROM registry.account_deletion_requests
                    WHERE user_id = p_user AND status = 'pending') THEN
        RETURN false;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('sdy-membership:'||p_user::text, 0));
    SELECT * INTO req FROM registry.account_deletion_requests
     WHERE user_id = p_user AND status = 'pending' FOR UPDATE;
    IF req.id IS NULL THEN RETURN false; END IF;

    FOR item IN SELECT * FROM jsonb_array_elements(req.ended_memberships) LOOP
        UPDATE workspace.memberships m SET
               member_status = item->>'member_status',
               is_primary = (item->>'is_primary')::boolean,
               member_reason = 'account deletion cancelled',
               active = (item->>'active')::boolean,
               deactivated_at = (item->>'deactivated_at')::timestamptz
         WHERE m.id = (item->>'id')::uuid AND m.user_id = p_user
           AND m.member_reason = 'account deletion' AND NOT m.active AND NOT m.is_primary
           AND (NOT (item->>'is_primary')::boolean OR NOT EXISTS (
                SELECT 1 FROM workspace.memberships o WHERE o.user_id = p_user AND o.is_primary));
    END LOOP;

    UPDATE registry.account_deletion_requests
       SET status = 'cancelled', processed_at = now(), ended_memberships = '[]'::jsonb
     WHERE id = req.id;

    INSERT INTO workspace.audit_events (tenant_id, user_id, action, resource, details)
    SELECT DISTINCT m.tenant_id, p_user::text, 'account.deletion_cancelled', 'user',
           jsonb_build_object('request_id', req.id)
      FROM workspace.memberships m JOIN registry.tenants t ON t.id = m.tenant_id
     WHERE m.user_id = p_user AND t.kind <> 'personal';
    RETURN true;
END
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION registry.cancel_account_deletion(UUID) FROM PUBLIC;

-- Хүлээх хугацаа өнгөрсөн хүсэлтүүдийг нэргүйжүүлнэ. API-ийн housekeeping
-- (profile.StartDeletionHousekeeping) зургаан цаг тутам дууддаг; оператор
-- гараар ч дуудаж болно:
--
--     SELECT registry.anonymise_deleted_accounts();            -- 30 хоног
--     SELECT registry.anonymise_deleted_accounts('0 seconds'); -- одоо шууд
--
-- Үлдэх зүйл: users мөр өөрөө (id нь татвар, төлбөр, ирц, оноо, санал
-- хураалт, membership_history, audit_events-д холбогдсон), гишүүнчлэлийн мөр
-- («left», «account deletion»). Арилах зүйл: нэр, и-мэйл, утас, оршин суугаа
-- газар, Gerege ID, eID/SSO холбоос (регистр, иргэний дугаар, eID-ийн claims),
-- сесс (IP, user agent), мэдэгдэл, хувийн орон зайн нэр, шилжилтийн хүсэлтэд
-- хуулагдсан нэр/и-мэйл. audit_events нь append-only тул тэнд үлдсэн
-- бичлэг хуулийн хадгалалтын хугацаагаар үлдэнэ.
-- +goose StatementBegin
CREATE FUNCTION registry.anonymise_deleted_accounts(p_grace interval DEFAULT interval '30 days')
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
REVOKE ALL ON FUNCTION registry.anonymise_deleted_accounts(interval) FROM PUBLIC;

-- +goose Down

DROP FUNCTION IF EXISTS registry.anonymise_deleted_accounts(interval);
DROP FUNCTION IF EXISTS registry.cancel_account_deletion(UUID);
DROP FUNCTION IF EXISTS registry.request_account_deletion(UUID, TEXT);
DROP TABLE IF EXISTS registry.account_deletion_requests;
