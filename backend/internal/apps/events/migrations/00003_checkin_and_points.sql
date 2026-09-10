-- +goose Up
ALTER TABLE events_events ADD COLUMN IF NOT EXISTS points_value integer NOT NULL DEFAULT 0 CHECK (points_value BETWEEN 0 AND 100000);
ALTER TABLE events_events ADD COLUMN IF NOT EXISTS checkin_hash bytea;
ALTER TABLE events_events ADD COLUMN IF NOT EXISTS checkin_expires_at timestamptz;
ALTER TABLE events_attendance ADD COLUMN IF NOT EXISTS points_awarded integer NOT NULL DEFAULT 0 CHECK (points_awarded BETWEEN 0 AND 100000);

CREATE TABLE IF NOT EXISTS events_point_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES registry.tenants(id) ON DELETE CASCADE,
    event_id uuid NOT NULL REFERENCES events_events(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES registry.users(id) ON DELETE CASCADE,
    delta integer NOT NULL CHECK (delta <> 0),
    reason varchar(96) NOT NULL,
    actor_id uuid NOT NULL REFERENCES registry.users(id),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_points_person ON events_point_entries (tenant_id,user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_points_event ON events_point_entries (event_id);
CREATE INDEX IF NOT EXISTS idx_events_points_user ON events_point_entries (user_id);
CREATE INDEX IF NOT EXISTS idx_events_points_actor ON events_point_entries (actor_id);
ALTER TABLE events_point_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE events_point_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON events_point_entries;
CREATE POLICY tenant_isolation ON events_point_entries TO gerege_nexus_tenant
USING (tenant_id = NULLIF(current_setting('app.current_tenant',true),'')::uuid)
WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant',true),'')::uuid);
GRANT SELECT,INSERT ON events_point_entries TO gerege_nexus_tenant;
REVOKE UPDATE,DELETE ON events_point_entries FROM gerege_nexus_tenant;

-- +goose Down
DROP TABLE IF EXISTS events_point_entries;
ALTER TABLE events_attendance DROP COLUMN IF EXISTS points_awarded;
ALTER TABLE events_events DROP COLUMN IF EXISTS checkin_expires_at;
ALTER TABLE events_events DROP COLUMN IF EXISTS checkin_hash;
ALTER TABLE events_events DROP COLUMN IF EXISTS points_value;
