-- Push мэдэгдлийг дор хаяж нэг удаа хүргэх (at-least-once), хязгаартай
-- давталттай.
--
-- 00120-ийн claim_pushes илгээхээс өмнө pushed_at-ийг тэмдэглэдэг байсан тул
-- APNs 5xx/429 эсвэл сүлжээний алдаа гарвал мэдэгдэл алга болдог байв. Одоо:
--
--   * claim_pushes мөрийг "түрээслэнэ": push_attempts-ийг нэмж,
--     push_next_attempt_at-ийг 5 минутын дараа болгоно. Илгээгч унасан ч
--     түрээс дуусахад дахин оролдоно.
--   * Амжилттай (эсвэл давтах утгагүй) бол registry.complete_pushes pushed_at-ийг
--     тэмдэглэнэ.
--   * Түр зуурын алдаа бол registry.retry_pushes 30с, 1м, 2м, 4м хүлээлттэй
--     дахин товлоно; 5 дахь оролдлогын дараа, эсвэл мэдэгдэл 1 цагаас
--     хуучирвал орхино (pushed_at тэмдэглэнэ).
--   * Зөвхөн APNs token-тэй хүний мэдэгдлийг авна. FCM token-той л хүний
--     мэдэгдэл (FCM илгээгч хараахан байхгүй) "илгээсэн" гэж тэмдэглэгдэхгүй;
--     15 минутаас хуучирсан, нэг ч оролдоогүй мөр өмнөх шигээ хуучирсанд
--     тооцогдоно — түлхүүр хожим тохируулагдахад хуучин мэдэгдлүүд нэг дор
--     бууж ирэхгүй.

-- +goose Up
ALTER TABLE registry.member_notifications
    ADD COLUMN IF NOT EXISTS push_attempts smallint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS push_next_attempt_at timestamptz;

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION registry.claim_pushes(p_limit integer)
RETURNS TABLE (notification_id uuid, user_id uuid, title text, body text, path text, unread integer,
               token_hash text, token_ciphertext text, app_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, workspace, registry AS $fn$
BEGIN
    -- Never tried and already stale: not sent late.
    UPDATE registry.member_notifications SET pushed_at = now(), push_next_attempt_at = NULL
     WHERE pushed_at IS NULL AND push_attempts = 0 AND created_at < now() - interval '15 minutes';
    -- Tried, and still not through an hour on: given up.
    UPDATE registry.member_notifications SET pushed_at = now(), push_next_attempt_at = NULL
     WHERE pushed_at IS NULL AND push_attempts > 0 AND created_at < now() - interval '1 hour';
    RETURN QUERY
    WITH due AS (
        SELECT n.id FROM registry.member_notifications n
         WHERE n.pushed_at IS NULL
           -- Five attempts is the cap even when the fifth never reported back
           -- (the sender died mid-round): the hour sweep above settles it.
           AND n.push_attempts < 5
           AND (n.push_next_attempt_at IS NULL OR n.push_next_attempt_at <= now())
           AND EXISTS (SELECT 1 FROM workspace.push_tokens t WHERE t.user_id = n.user_id AND t.provider = 'APNS')
         ORDER BY n.created_at
         LIMIT greatest(1, least(p_limit, 500))
         FOR UPDATE OF n SKIP LOCKED
    ), leased AS (
        UPDATE registry.member_notifications n
           SET push_attempts = n.push_attempts + 1, push_next_attempt_at = now() + interval '5 minutes'
          FROM due WHERE n.id = due.id
        RETURNING n.id, n.user_id, n.title, n.body, n.path
    )
    SELECT m.id, m.user_id, m.title::text, m.body::text, m.path::text,
           (SELECT count(*) FROM registry.member_notifications x WHERE x.user_id = m.user_id AND x.read_at IS NULL)::integer,
           t.token_hash::text, t.token_ciphertext::text, t.app_id::text
      FROM leased m JOIN workspace.push_tokens t ON t.user_id = m.user_id AND t.provider = 'APNS';
END
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION registry.claim_pushes(integer) FROM PUBLIC;

-- Delivered, or failed in a way a retry will not fix.
-- +goose StatementBegin
CREATE FUNCTION registry.complete_pushes(p_ids uuid[]) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, workspace, registry AS $fn$
    UPDATE registry.member_notifications SET pushed_at = now(), push_next_attempt_at = NULL
     WHERE id = ANY(p_ids) AND pushed_at IS NULL;
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION registry.complete_pushes(uuid[]) FROM PUBLIC;

-- A temporary failure: again after 30s, 1m, 2m, 4m; after the fifth attempt
-- it is given up.
-- +goose StatementBegin
CREATE FUNCTION registry.retry_pushes(p_ids uuid[]) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, workspace, registry AS $fn$
    UPDATE registry.member_notifications
       SET pushed_at = CASE WHEN push_attempts >= 5 THEN now() END,
           push_next_attempt_at = CASE WHEN push_attempts >= 5 THEN NULL
               ELSE now() + make_interval(secs => 30 * power(2, greatest(push_attempts, 1) - 1)) END
     WHERE id = ANY(p_ids) AND pushed_at IS NULL;
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION registry.retry_pushes(uuid[]) FROM PUBLIC;

-- +goose Down
DROP FUNCTION IF EXISTS registry.retry_pushes(uuid[]);
DROP FUNCTION IF EXISTS registry.complete_pushes(uuid[]);
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION registry.claim_pushes(p_limit integer)
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
           t.token_hash::text, t.token_ciphertext::text, t.app_id::text
      FROM marked m JOIN workspace.push_tokens t ON t.user_id = m.user_id AND t.provider = 'APNS';
END
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION registry.claim_pushes(integer) FROM PUBLIC;
ALTER TABLE registry.member_notifications DROP COLUMN IF EXISTS push_next_attempt_at, DROP COLUMN IF EXISTS push_attempts;
