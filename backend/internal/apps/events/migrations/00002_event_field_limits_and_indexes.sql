-- +goose Up
-- The same limits are checked by the API. ALTER TYPE refuses oversized rows
-- rather than truncating existing data during an upgrade.
ALTER TABLE events_events ALTER COLUMN title TYPE VARCHAR(200);
ALTER TABLE events_events ALTER COLUMN description TYPE VARCHAR(10000);
ALTER TABLE events_events ALTER COLUMN location TYPE VARCHAR(500);
ALTER TABLE events_attendance ALTER COLUMN note TYPE VARCHAR(500);

-- A parent user's deletion must not scan every event and attendance row.
CREATE INDEX IF NOT EXISTS idx_events_events_created_by ON events_events (created_by);
CREATE INDEX IF NOT EXISTS idx_events_attendance_user ON events_attendance (user_id);
CREATE INDEX IF NOT EXISTS idx_events_attendance_checked_by ON events_attendance (checked_by);

-- +goose Down
DROP INDEX IF EXISTS idx_events_attendance_checked_by;
DROP INDEX IF EXISTS idx_events_attendance_user;
DROP INDEX IF EXISTS idx_events_events_created_by;
ALTER TABLE events_attendance ALTER COLUMN note TYPE TEXT;
ALTER TABLE events_events ALTER COLUMN location TYPE TEXT;
ALTER TABLE events_events ALTER COLUMN description TYPE TEXT;
ALTER TABLE events_events ALTER COLUMN title TYPE TEXT;
