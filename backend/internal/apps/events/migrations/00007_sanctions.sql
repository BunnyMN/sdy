-- Хяналтын хорооны шийдвэр: оноо хасах ба сануулга.
--
-- Хяналтын хорооны гишүүн (events.discipline, 00119-ийн pos_auditor) салбарын
-- аль ч гишүүнд — тэргүүлэгч, албан тушаалтан ч хамаарна — шалтгаантай
-- сануулга өгч, оноо хасна. Өөртөө шийдвэр гаргахгүй. Шийдвэр бүр түүх:
-- засагдахгүй, устгагдахгүй. Оноо хассан бол онооны бүртгэлд сөрөг мөр
-- (арга хэмжээгүй байж болно) орж, тухайн хүнд мэдэгдэл очно.

-- +goose Up
ALTER TABLE events_point_entries ALTER COLUMN event_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS events_sanctions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES registry.tenants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES registry.users(id) ON DELETE CASCADE,
    actor_id uuid NOT NULL REFERENCES registry.users(id),
    event_id uuid REFERENCES events_events(id) ON DELETE SET NULL,
    points integer NOT NULL DEFAULT 0 CHECK (points BETWEEN 0 AND 10000),
    reason varchar(500) NOT NULL CHECK (length(btrim(reason)) > 0),
    point_entry_id uuid REFERENCES events_point_entries(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT events_sanctions_not_self CHECK (user_id <> actor_id),
    CONSTRAINT events_sanctions_entry_when_points CHECK ((points > 0) = (point_entry_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_events_sanctions_tenant ON events_sanctions (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_sanctions_user ON events_sanctions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_sanctions_actor ON events_sanctions (actor_id);
CREATE INDEX IF NOT EXISTS idx_events_sanctions_event ON events_sanctions (event_id);
CREATE INDEX IF NOT EXISTS idx_events_sanctions_entry ON events_sanctions (point_entry_id);
ALTER TABLE events_sanctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE events_sanctions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON events_sanctions;
CREATE POLICY tenant_isolation ON events_sanctions TO gerege_nexus_tenant
    USING (tenant_id = NULLIF(current_setting('app.current_tenant',true),'')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant',true),'')::uuid);
-- A decision is history: never changed or removed through the app.
GRANT SELECT, INSERT ON events_sanctions TO gerege_nexus_tenant;
REVOKE UPDATE, DELETE ON events_sanctions FROM gerege_nexus_tenant;

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION workspace.notify_sanction() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
BEGIN
    PERFORM registry.notify_member(NEW.user_id, 'sanction:'||NEW.id::text, 'event',
        CASE WHEN NEW.points > 0 THEN 'Хяналтын хороо: '||NEW.points||' оноо хасагдлаа' ELSE 'Хяналтын хорооны сануулга' END,
        left(NEW.reason, 500), '/member/participation');
    RETURN NEW;
END
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION workspace.notify_sanction() FROM PUBLIC;
DROP TRIGGER IF EXISTS notify_sanction ON events_sanctions;
CREATE TRIGGER notify_sanction AFTER INSERT ON events_sanctions
    FOR EACH ROW EXECUTE FUNCTION workspace.notify_sanction();

-- 00004's, with entries that belong to no event (a sanction).
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
        SELECT p.id,t.name AS branch,COALESCE(e.title,'Хяналтын хорооны шийдвэр') AS title,p.delta,p.reason,p.created_at
        FROM workspace.events_point_entries p LEFT JOIN workspace.events_events e ON e.id=p.event_id AND e.tenant_id=p.tenant_id
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

-- +goose Down
DROP TRIGGER IF EXISTS notify_sanction ON events_sanctions;
DROP FUNCTION IF EXISTS workspace.notify_sanction();
DROP TABLE IF EXISTS events_sanctions;
DELETE FROM events_point_entries WHERE event_id IS NULL;
ALTER TABLE events_point_entries ALTER COLUMN event_id SET NOT NULL;
