-- Ирцийн QR кодыг зохион байгуулагч бүр тусдаа гаргана.
--
-- Өмнө нь арга хэмжээнд ганц checkin_hash байсан тул хоёр зохион байгуулагч
-- зэрэг QR нээхэд сүүлд нээсэн нь эхнийхийг хүчингүй болгодог байв. Одоо
-- код бүр гаргасан хүнтэйгээ мөр болж хадгалагдана: нэг хүн шинэ код
-- гаргахад зөвхөн өөрийнх нь өмнөх код солигдоно, бусдынх хугацаа нь
-- дуустал хүчинтэй хэвээр. Код хадгалахдаа зөвхөн SHA-256 хэшийг нь
-- хадгална.

-- +goose Up
CREATE TABLE IF NOT EXISTS events_checkin_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES registry.tenants(id) ON DELETE CASCADE,
    event_id uuid NOT NULL REFERENCES events_events(id) ON DELETE CASCADE,
    issued_by uuid NOT NULL REFERENCES registry.users(id) ON DELETE CASCADE,
    code_hash bytea NOT NULL CHECK (length(code_hash) = 32),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT events_checkin_codes_one_per_issuer UNIQUE (event_id, issued_by),
    CONSTRAINT events_checkin_codes_hash UNIQUE (code_hash)
);
CREATE INDEX IF NOT EXISTS idx_events_checkin_codes_tenant ON events_checkin_codes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_events_checkin_codes_issuer ON events_checkin_codes (issued_by);
ALTER TABLE events_checkin_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE events_checkin_codes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON events_checkin_codes;
CREATE POLICY tenant_isolation ON events_checkin_codes TO gerege_nexus_tenant
    USING (tenant_id = NULLIF(current_setting('app.current_tenant',true),'')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant',true),'')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON events_checkin_codes TO gerege_nexus_tenant;

-- The single per-event code is no longer read; clear what is left of it so a
-- stale hash cannot be mistaken for a live one.
UPDATE events_events SET checkin_hash = NULL, checkin_expires_at = NULL WHERE checkin_hash IS NOT NULL;

-- +goose Down
DROP TABLE IF EXISTS events_checkin_codes;
