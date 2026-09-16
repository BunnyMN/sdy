-- +goose Up
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION workspace.notify_event_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
DECLARE recipient UUID; heading TEXT; key TEXT;
BEGIN
    IF TG_OP='INSERT' THEN
        heading:='Шинэ арга хэмжээ'; key:='event:'||NEW.id::text;
    ELSIF (OLD.starts_at,OLD.location,OLD.status) IS DISTINCT FROM (NEW.starts_at,NEW.location,NEW.status) THEN
        heading:='Арга хэмжээний мэдээлэл өөрчлөгдлөө'; key:='event:'||NEW.id::text||':'||txid_current()::text;
    ELSE RETURN NEW;
    END IF;
    FOR recipient IN SELECT user_id FROM workspace.memberships
        WHERE tenant_id=NEW.tenant_id AND active AND is_primary AND member_status='active'
    LOOP
        PERFORM registry.notify_member(recipient,key,'event',heading,left(NEW.title,500),
            '/module/events/'||NEW.id::text||'?workspace='||NEW.tenant_id::text);
    END LOOP;
    RETURN NEW;
END
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION workspace.notify_event_change() FROM PUBLIC;
DROP TRIGGER IF EXISTS notify_event_change ON events_events;
CREATE TRIGGER notify_event_change AFTER INSERT OR UPDATE ON events_events
    FOR EACH ROW EXECUTE FUNCTION workspace.notify_event_change();

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION workspace.notify_attendance_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
DECLARE heading TEXT; event_title TEXT;
BEGIN
    IF TG_OP='UPDATE' AND OLD.status=NEW.status THEN RETURN NEW; END IF;
    heading:=CASE NEW.status WHEN 'registered' THEN 'Арга хэмжээнд бүртгэгдлээ'
        WHEN 'attended' THEN 'Ирц баталгаажлаа' ELSE 'Ирцийн төлөв өөрчлөгдлөө' END;
    SELECT title INTO event_title FROM workspace.events_events WHERE id=NEW.event_id AND tenant_id=NEW.tenant_id;
    PERFORM registry.notify_member(NEW.user_id,'attendance:'||NEW.id::text||':'||txid_current()::text,
        'attendance',heading,left(event_title,500),'/member/history');
    RETURN NEW;
END
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION workspace.notify_attendance_change() FROM PUBLIC;
DROP TRIGGER IF EXISTS notify_attendance_change ON events_attendance;
CREATE TRIGGER notify_attendance_change AFTER INSERT OR UPDATE OF status ON events_attendance
    FOR EACH ROW EXECUTE FUNCTION workspace.notify_attendance_change();

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION workspace.my_participation_history(p_offset integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
    WITH attendance AS (
        SELECT a.id,a.tenant_id,t.name AS branch,e.title,e.starts_at,a.status,a.points_awarded AS points
        FROM workspace.events_attendance a JOIN workspace.events_events e ON e.id=a.event_id AND e.tenant_id=a.tenant_id
        JOIN registry.tenants t ON t.id=a.tenant_id
        WHERE a.user_id=NULLIF(current_setting('app.current_user',true),'')::uuid
        ORDER BY e.starts_at DESC,a.id DESC LIMIT 51 OFFSET greatest(0,least(p_offset,100000))
    ), entries AS (
        SELECT p.id,t.name AS branch,e.title,p.delta,p.reason,p.created_at
        FROM workspace.events_point_entries p JOIN workspace.events_events e ON e.id=p.event_id AND e.tenant_id=p.tenant_id
        JOIN registry.tenants t ON t.id=p.tenant_id
        WHERE p.user_id=NULLIF(current_setting('app.current_user',true),'')::uuid
        ORDER BY p.created_at DESC,p.id DESC LIMIT 51 OFFSET greatest(0,least(p_offset,100000))
    )
    SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM attendance LIMIT 50) x),'[]'::jsonb),
        'entries',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM entries LIMIT 50) x),'[]'::jsonb),
        'total_points',(SELECT coalesce(sum(delta),0) FROM workspace.events_point_entries WHERE user_id=NULLIF(current_setting('app.current_user',true),'')::uuid),
        'has_more',(SELECT count(*)>50 FROM attendance) OR (SELECT count(*)>50 FROM entries),
        'next_offset',greatest(0,least(p_offset,100000))+50);
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION workspace.my_participation_history(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION workspace.my_participation_history(integer) TO gerege_nexus_tenant;

-- +goose Down
DROP FUNCTION IF EXISTS workspace.my_participation_history(integer);
DROP TRIGGER IF EXISTS notify_attendance_change ON events_attendance;
DROP FUNCTION IF EXISTS workspace.notify_attendance_change();
DROP TRIGGER IF EXISTS notify_event_change ON events_events;
DROP FUNCTION IF EXISTS workspace.notify_event_change();
