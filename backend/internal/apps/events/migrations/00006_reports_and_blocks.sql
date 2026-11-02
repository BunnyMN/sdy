-- Гишүүдийн бичсэн асуудлыг мэдээлэх, бичсэн хүнийг блоклох.
--
-- Мэдээлэл (report): гишүүн бусдын дэвшүүлсэн асуудлыг шалтгаантай нь
-- мэдээлнэ; нэг хүн нэг асуудлыг нэг удаа. Арга хэмжээг үүсгэсэн хүнд
-- мэдэгдэл очно. Санал хураалт нээгдээгүй асуудлыг гурав ба түүнээс олон
-- гишүүн мэдээлбэл энгийн гишүүдэд нуугдана; удирдагч харж шийднэ (татах).
--
-- Блок: гишүүн өөр гишүүнийг блоклоход тэр хүний санал хураалт нээгдээгүй
-- асуудлууд түүнд харагдахгүй. Санал хураалтад орсон асуудал бол
-- удирдагчийн нээсэн албан ёсны хэлэлцүүлэг тул хэвээр харагдана.

-- +goose Up
CREATE TABLE IF NOT EXISTS events_motion_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES registry.tenants(id) ON DELETE CASCADE,
    motion_id uuid NOT NULL REFERENCES events_motions(id) ON DELETE CASCADE,
    event_id uuid NOT NULL REFERENCES events_events(id) ON DELETE CASCADE,
    reporter_id uuid NOT NULL REFERENCES registry.users(id) ON DELETE CASCADE,
    reason varchar(500) NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,
    resolved_by uuid REFERENCES registry.users(id) ON DELETE SET NULL,
    CONSTRAINT events_motion_reports_once UNIQUE (motion_id, reporter_id)
);
CREATE INDEX IF NOT EXISTS idx_events_reports_motion ON events_motion_reports (tenant_id, motion_id) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_reports_event ON events_motion_reports (event_id);
CREATE INDEX IF NOT EXISTS idx_events_reports_reporter ON events_motion_reports (reporter_id);
CREATE INDEX IF NOT EXISTS idx_events_reports_resolved_by ON events_motion_reports (resolved_by);

CREATE TABLE IF NOT EXISTS events_member_blocks (
    tenant_id uuid NOT NULL REFERENCES registry.tenants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES registry.users(id) ON DELETE CASCADE,
    blocked_id uuid NOT NULL REFERENCES registry.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, user_id, blocked_id),
    CONSTRAINT events_member_blocks_not_self CHECK (user_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS idx_events_blocks_blocked ON events_member_blocks (blocked_id);
CREATE INDEX IF NOT EXISTS idx_events_blocks_user ON events_member_blocks (user_id);

-- +goose StatementBegin
DO $isolation$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['events_motion_reports','events_member_blocks'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
        EXECUTE format('CREATE POLICY tenant_isolation ON %I TO gerege_nexus_tenant '
            'USING (tenant_id = NULLIF(current_setting(''app.current_tenant'',true),'''')::uuid) '
            'WITH CHECK (tenant_id = NULLIF(current_setting(''app.current_tenant'',true),'''')::uuid)', t);
    END LOOP;
END
$isolation$;
-- +goose StatementEnd
GRANT SELECT, INSERT, UPDATE ON events_motion_reports TO gerege_nexus_tenant;
GRANT SELECT, INSERT, DELETE ON events_member_blocks TO gerege_nexus_tenant;

-- The event's organiser hears about a report at once.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION workspace.notify_motion_report() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
DECLARE organiser UUID; heading TEXT;
BEGIN
    SELECT e.created_by INTO organiser FROM events_events e WHERE e.id = NEW.event_id;
    SELECT 'Асуудлыг мэдээлсэн: ' || left(mo.title, 120) INTO heading FROM events_motions mo WHERE mo.id = NEW.motion_id;
    IF organiser IS NOT NULL AND organiser <> NEW.reporter_id THEN
        PERFORM registry.notify_member(organiser, 'motion-report:'||NEW.id::text, 'event', heading,
            left(coalesce(nullif(NEW.reason,''), 'Шалтгаан бичээгүй'), 500),
            '/module/events/'||NEW.event_id::text||'?workspace='||NEW.tenant_id::text||'#discussion');
    END IF;
    RETURN NEW;
END
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION workspace.notify_motion_report() FROM PUBLIC;
DROP TRIGGER IF EXISTS notify_motion_report ON events_motion_reports;
CREATE TRIGGER notify_motion_report AFTER INSERT ON events_motion_reports
    FOR EACH ROW EXECUTE FUNCTION workspace.notify_motion_report();

-- +goose Down
DROP TRIGGER IF EXISTS notify_motion_report ON events_motion_reports;
DROP FUNCTION IF EXISTS workspace.notify_motion_report();
DROP TABLE IF EXISTS events_member_blocks;
DROP TABLE IF EXISTS events_motion_reports;
