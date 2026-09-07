-- Арга хэмжээ ба ирц — mn.sdy.events модулийн өөрийн schema.
--
-- Хоёр хүснэгт: арга хэмжээ, ба түүнд хэн бүртгүүлж, хэн ирсэн. Хоёулаа
-- байгууллагаар тусгаарлагдана: dbguard холболт бүрийг байгууллагад уядаг
-- бөгөөд доорх бодлого нь тэр уяаг хүснэгт дээр хэрэгжүүлнэ — 00089-ийн
-- өргөн хэлбэр (хамт харах горимд байгаа админ өөрийн байгууллагуудыг
-- уншина, бичихдээ зөвхөн идэвхтэй нэг рүүгээ).
--
-- Оролцогч нь registry.users руу заана; нэр, хаяг нь тэндээс JOIN-оор ирнэ.
-- Хүнийг энд хуулахгүй: хүн нэрээ сольвол ирцийн жагсаалт нь дагаж солигдоно.

-- +goose Up
CREATE TABLE IF NOT EXISTS events_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES registry.tenants(id) ON DELETE CASCADE,
    title        TEXT NOT NULL CHECK (length(btrim(title)) > 0),
    description  TEXT NOT NULL DEFAULT '',
    location     TEXT NOT NULL DEFAULT '',
    starts_at    TIMESTAMPTZ NOT NULL,
    ends_at      TIMESTAMPTZ,
    capacity     INTEGER CHECK (capacity IS NULL OR capacity > 0),
    status       VARCHAR(16) NOT NULL DEFAULT 'planned'
                 CHECK (status IN ('planned', 'done', 'cancelled')),
    created_by   UUID NOT NULL REFERENCES registry.users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT events_ends_after_start CHECK (ends_at IS NULL OR ends_at >= starts_at)
);
CREATE INDEX IF NOT EXISTS idx_events_events_tenant_start
    ON events_events (tenant_id, starts_at DESC);

CREATE TABLE IF NOT EXISTS events_attendance (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES registry.tenants(id) ON DELETE CASCADE,
    event_id      UUID NOT NULL REFERENCES events_events(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES registry.users(id) ON DELETE CASCADE,
    -- registered  бүртгүүлсэн (өөрөө эсвэл зохион байгуулагч нэмсэн)
    -- attended    ирсэн — зохион байгуулагч тэмдэглэнэ
    -- absent      ирээгүй
    status        VARCHAR(16) NOT NULL DEFAULT 'registered'
                  CHECK (status IN ('registered', 'attended', 'absent')),
    note          TEXT NOT NULL DEFAULT '',
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    checked_at    TIMESTAMPTZ,
    checked_by    UUID REFERENCES registry.users(id),
    CONSTRAINT events_attendance_one_per_person UNIQUE (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_events_attendance_event
    ON events_attendance (event_id, status);
CREATE INDEX IF NOT EXISTS idx_events_attendance_person
    ON events_attendance (tenant_id, user_id);

ALTER TABLE events_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE events_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON events_events;
CREATE POLICY tenant_isolation ON events_events TO gerege_nexus_tenant
    USING (tenant_id = ANY (COALESCE(
        NULLIF(current_setting('app.allowed_tenants', true), '')::uuid[],
        ARRAY[NULLIF(current_setting('app.current_tenant', true), '')::uuid])))
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

ALTER TABLE events_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE events_attendance FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON events_attendance;
CREATE POLICY tenant_isolation ON events_attendance TO gerege_nexus_tenant
    USING (tenant_id = ANY (COALESCE(
        NULLIF(current_setting('app.allowed_tenants', true), '')::uuid[],
        ARRAY[NULLIF(current_setting('app.current_tenant', true), '')::uuid])))
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- +goose Down
DROP TABLE IF EXISTS events_attendance;
DROP TABLE IF EXISTS events_events;
