-- Push-ийг шууд сэрээх: мэдэгдэл бичигдмэгц internal/workspace/push-ийн
-- LISTEN хийж буй холболт сэрнэ — 5 секундын давтамжийг хүлээхгүй.
-- Транзакц commit болсны дараа л NOTIFY хүрнэ, тиймээс worker мөрийг заавал харна.

-- +goose Up
-- +goose StatementBegin
CREATE FUNCTION registry.wake_push_delivery() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
    PERFORM pg_notify('member_notifications', '');
    RETURN NULL;
END
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION registry.wake_push_delivery() FROM PUBLIC;
CREATE TRIGGER wake_push_delivery AFTER INSERT ON registry.member_notifications
    FOR EACH STATEMENT EXECUTE FUNCTION registry.wake_push_delivery();

-- +goose Down
DROP TRIGGER IF EXISTS wake_push_delivery ON registry.member_notifications;
DROP FUNCTION IF EXISTS registry.wake_push_delivery();
