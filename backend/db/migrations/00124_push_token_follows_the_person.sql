-- Утасны push token-ийг бүртгэх нь тухайн хүний ажил, салбарын биш.
--
-- Өмнө нь POST /push-tokens нь салбарын RLS дор
-- `INSERT ... ON CONFLICT(token_hash) DO UPDATE SET tenant_id=...` хийдэг байв.
-- Гишүүн салбараа солиход хуучин мөр нь өөр салбарт байгаа тул UPDATE-ийн
-- USING нөхцөл унаж, бүртгэл 503 өгдөг байв. Салбаргүй (person scope) хүнд
-- tenant_id NULL болж NOT NULL зөрчигдөнө.
--
-- Одоо registry.register_my_push_token (SECURITY DEFINER) нь тухайн token-ийг
-- одоогийн хэрэглэгч ба одоогийн салбарт шилжүүлнэ. Салбаргүй хүний token
-- tenant_id NULL-тай хадгалагдана: claim_pushes нь хүнээр (user_id) нь
-- холбодог тул түүнд мэдэгдэл (жишээ нь элсэлтийн хүсэлт батлагдсан) очно.
-- NULL tenant-тай мөр салбарын RLS дор хэнд ч харагдахгүй.

-- +goose Up
ALTER TABLE workspace.push_tokens ALTER COLUMN tenant_id DROP NOT NULL;

-- +goose StatementBegin
CREATE FUNCTION registry.register_my_push_token(p_hash text, p_provider text, p_ciphertext text, p_app_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, workspace, registry AS $fn$
DECLARE
    me uuid := NULLIF(current_setting('app.current_user', true), '')::uuid;
    branch uuid := NULLIF(current_setting('app.current_tenant', true), '')::uuid;
BEGIN
    IF me IS NULL THEN
        RAISE EXCEPTION 'register_my_push_token: no signed-in user' USING ERRCODE = '42501';
    END IF;
    -- The acting branch comes from the session, already checked against the
    -- person's memberships; it is checked again here because this function
    -- writes past the policy.
    IF branch IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM workspace.memberships m WHERE m.tenant_id = branch AND m.user_id = me AND m.active) THEN
        branch := NULL;
    END IF;
    INSERT INTO workspace.push_tokens (tenant_id, user_id, provider, token_hash, token_ciphertext, app_id)
    VALUES (branch, me, p_provider, p_hash, p_ciphertext, p_app_id)
    ON CONFLICT (token_hash) DO UPDATE
       SET tenant_id = EXCLUDED.tenant_id, user_id = EXCLUDED.user_id, provider = EXCLUDED.provider,
           token_ciphertext = EXCLUDED.token_ciphertext, app_id = EXCLUDED.app_id, updated_at = now();
END
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION registry.register_my_push_token(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION registry.register_my_push_token(text, text, text, text) TO gerege_nexus_tenant;

-- +goose Down
DROP FUNCTION IF EXISTS registry.register_my_push_token(text, text, text, text);
DELETE FROM workspace.push_tokens WHERE tenant_id IS NULL;
ALTER TABLE workspace.push_tokens ALTER COLUMN tenant_id SET NOT NULL;
