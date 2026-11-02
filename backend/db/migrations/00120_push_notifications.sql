-- Push мэдэгдэл: registry.member_notifications-ийн мөр бүр гишүүний утсанд
-- (APNs) очно.
--
-- Мэдэгдэл бүр нэг удаа: claim_pushes нь илгээгдээгүйг (pushed_at IS NULL)
-- түгжиж, тэмдэглээд, тухайн хүний утасны token-уудтай хамт буцаана. 15
-- минутаас хуучин илгээгдээгүй мөр илгээгдэхгүй, зөвхөн тэмдэглэгдэнэ —
-- түлхүүр хожим тохируулагдахад хуучин мэдэгдлүүд нэг дор бууж ирэхгүй.
-- Энэ migration-оос өмнөх мэдэгдлүүд илгээгдсэнд тооцогдоно.
-- workspace.push_tokens нь байгууллагаар тусгаарлагдсан тул ажлыг SECURITY
-- DEFINER функц хийнэ (account deletion sweep-тэй ижил).

-- +goose Up
ALTER TABLE registry.member_notifications ADD COLUMN pushed_at timestamptz;
UPDATE registry.member_notifications SET pushed_at = created_at;
CREATE INDEX idx_member_notifications_unpushed ON registry.member_notifications (created_at) WHERE pushed_at IS NULL;

-- +goose StatementBegin
CREATE FUNCTION registry.claim_pushes(p_limit integer)
RETURNS TABLE (notification_id uuid, user_id uuid, title text, body text, path text, unread integer,
               token_hash text, token_ciphertext text, app_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, workspace, registry AS $fn$
BEGIN
    UPDATE registry.member_notifications SET pushed_at = now()
     WHERE pushed_at IS NULL AND created_at < now() - interval '15 minutes';
    RETURN QUERY
    WITH due AS (
        SELECT n.id FROM registry.member_notifications n
         WHERE n.pushed_at IS NULL
         ORDER BY n.created_at
         LIMIT greatest(1, least(p_limit, 500))
         FOR UPDATE SKIP LOCKED
    ), marked AS (
        UPDATE registry.member_notifications n SET pushed_at = now()
          FROM due WHERE n.id = due.id
        RETURNING n.id, n.user_id, n.title, n.body, n.path
    )
    SELECT m.id, m.user_id, m.title::text, m.body::text, m.path::text,
           (SELECT count(*) FROM registry.member_notifications x WHERE x.user_id = m.user_id AND x.read_at IS NULL)::integer,
           t.token_hash, t.token_ciphertext, t.app_id
      FROM marked m JOIN workspace.push_tokens t ON t.user_id = m.user_id AND t.provider = 'APNS';
END
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION registry.claim_pushes(integer) FROM PUBLIC;

-- A token APNs says is gone (the app removed, the token rotated).
-- +goose StatementBegin
CREATE FUNCTION registry.forget_push_token(p_hash text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, workspace, registry AS $fn$
    DELETE FROM workspace.push_tokens WHERE token_hash = p_hash;
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION registry.forget_push_token(text) FROM PUBLIC;

-- Signing out on a phone: its token stops receiving this person's
-- notifications, whichever organisation it was registered in.
-- +goose StatementBegin
CREATE FUNCTION registry.forget_my_push_token(p_hash text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, workspace, registry AS $fn$
    DELETE FROM workspace.push_tokens
     WHERE token_hash = p_hash AND user_id = NULLIF(current_setting('app.current_user', true), '')::uuid;
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION registry.forget_my_push_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION registry.forget_my_push_token(text) TO gerege_nexus_tenant;

-- +goose Down
DROP FUNCTION IF EXISTS registry.forget_my_push_token(text);
DROP FUNCTION IF EXISTS registry.forget_push_token(text);
DROP FUNCTION IF EXISTS registry.claim_pushes(integer);
DROP INDEX IF EXISTS registry.idx_member_notifications_unpushed;
ALTER TABLE registry.member_notifications DROP COLUMN IF EXISTS pushed_at;
