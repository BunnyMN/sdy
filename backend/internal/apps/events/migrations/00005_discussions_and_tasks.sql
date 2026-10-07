-- Хэлэлцүүлэг (асуудал → санал хураалт → шийдвэр), eID-ээр зурсан санал,
-- арга хэмжээний ажил хуваарилалт.
--
-- Санал өгөх эрх нь тухайн арга хэмжээнд ирц нь батлагдсан (attended) гишүүнд.
-- Гишүүн бүр саналаа eID тоон гарын үсгээр (PIN2) зурна: зурагдсан текст
-- (`document`) ба түүний SHA-256 нь мөрөнд хадгалагдана, тоонд зөвхөн зурагдсан
-- санал орно. Шийдвэр нь өгсөн саналын олонхоор: зөвшөөрсөн > татгалзсан.
-- Зурагдсан санал ба гарсан шийдвэрийг өөрчлөх боломжгүй (триггер), тенантын
-- роль тэдгээрийг устгах эрхгүй — арга хэмжээ бүрийн түүх болж үлдэнэ.

-- +goose Up
ALTER TABLE events_events ADD COLUMN IF NOT EXISTS vote_points integer NOT NULL DEFAULT 0 CHECK (vote_points BETWEEN 0 AND 100000);

CREATE TABLE IF NOT EXISTS events_motions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES registry.tenants(id) ON DELETE CASCADE,
    event_id uuid NOT NULL REFERENCES events_events(id) ON DELETE CASCADE,
    title varchar(200) NOT NULL CHECK (length(btrim(title)) > 0),
    body varchar(4000) NOT NULL DEFAULT '',
    proposer_id uuid NOT NULL REFERENCES registry.users(id),
    status varchar(16) NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','voting','decided','withdrawn')),
    -- SHA-256 of the title and body, frozen when voting opens. Every vote's
    -- signed document names it, so a vote is bound to the text it was cast on.
    content_hash char(64),
    opened_at timestamptz,
    opened_by uuid REFERENCES registry.users(id),
    closed_at timestamptz,
    closed_by uuid REFERENCES registry.users(id),
    result varchar(16) CHECK (result IN ('approved','rejected')),
    yes_count integer,
    no_count integer,
    abstain_count integer,
    note varchar(500) NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT events_motions_decided_has_result CHECK ((status = 'decided') = (result IS NOT NULL)),
    CONSTRAINT events_motions_voting_is_frozen CHECK (status IN ('proposed','withdrawn') OR content_hash IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_events_motions_event ON events_motions (tenant_id, event_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_motions_event_fk ON events_motions (event_id);
CREATE INDEX IF NOT EXISTS idx_events_motions_proposer ON events_motions (proposer_id);
CREATE INDEX IF NOT EXISTS idx_events_motions_opened_by ON events_motions (opened_by);
CREATE INDEX IF NOT EXISTS idx_events_motions_closed_by ON events_motions (closed_by);

CREATE TABLE IF NOT EXISTS events_motion_votes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES registry.tenants(id) ON DELETE CASCADE,
    motion_id uuid NOT NULL REFERENCES events_motions(id) ON DELETE CASCADE,
    event_id uuid NOT NULL REFERENCES events_events(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES registry.users(id),
    choice varchar(8) NOT NULL CHECK (choice IN ('yes','no','abstain')),
    status varchar(8) NOT NULL DEFAULT 'signing' CHECK (status IN ('signing','signed','failed')),
    -- The exact text whose SHA-256 the voter signed, and that digest.
    document varchar(8000) NOT NULL CHECK (length(document) > 0),
    digest_hex char(64) NOT NULL,
    sign_session_id varchar(128),
    signed_at timestamptz,
    points_awarded integer NOT NULL DEFAULT 0 CHECK (points_awarded BETWEEN 0 AND 100000),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT events_motion_votes_one_per_person UNIQUE (motion_id, user_id),
    CONSTRAINT events_motion_votes_signed_at CHECK ((status = 'signed') = (signed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_events_votes_motion ON events_motion_votes (tenant_id, motion_id, status);
CREATE INDEX IF NOT EXISTS idx_events_votes_event ON events_motion_votes (event_id);
CREATE INDEX IF NOT EXISTS idx_events_votes_user ON events_motion_votes (user_id);

CREATE TABLE IF NOT EXISTS events_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES registry.tenants(id) ON DELETE CASCADE,
    event_id uuid NOT NULL REFERENCES events_events(id) ON DELETE CASCADE,
    title varchar(160) NOT NULL CHECK (length(btrim(title)) > 0),
    description varchar(2000) NOT NULL DEFAULT '',
    points integer NOT NULL DEFAULT 0 CHECK (points BETWEEN 0 AND 100000),
    slots integer NOT NULL DEFAULT 1 CHECK (slots BETWEEN 1 AND 500),
    created_by uuid NOT NULL REFERENCES registry.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_tasks_event ON events_tasks (tenant_id, event_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_tasks_event_fk ON events_tasks (event_id);
CREATE INDEX IF NOT EXISTS idx_events_tasks_creator ON events_tasks (created_by);

CREATE TABLE IF NOT EXISTS events_task_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES registry.tenants(id) ON DELETE CASCADE,
    task_id uuid NOT NULL REFERENCES events_tasks(id) ON DELETE CASCADE,
    event_id uuid NOT NULL REFERENCES events_events(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES registry.users(id),
    -- offered: a manager asked; accepted: the member took it (asked or
    -- volunteered); declined: the member said no; done: a manager confirmed it.
    status varchar(10) NOT NULL CHECK (status IN ('offered','accepted','declined','done')),
    assigned_by uuid REFERENCES registry.users(id),
    points_awarded integer NOT NULL DEFAULT 0 CHECK (points_awarded BETWEEN 0 AND 100000),
    responded_at timestamptz,
    completed_at timestamptz,
    completed_by uuid REFERENCES registry.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT events_task_assignments_one_per_person UNIQUE (task_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_events_assignments_task ON events_task_assignments (tenant_id, task_id);
CREATE INDEX IF NOT EXISTS idx_events_assignments_event ON events_task_assignments (event_id);
CREATE INDEX IF NOT EXISTS idx_events_assignments_user ON events_task_assignments (tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_events_assignments_user_fk ON events_task_assignments (user_id);
CREATE INDEX IF NOT EXISTS idx_events_assignments_assigner ON events_task_assignments (assigned_by);
CREATE INDEX IF NOT EXISTS idx_events_assignments_completer ON events_task_assignments (completed_by);

-- The leaderboard sums points per person over a period.
CREATE INDEX IF NOT EXISTS idx_events_points_period ON events_point_entries (tenant_id, created_at);

-- +goose StatementBegin
DO $isolation$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['events_motions','events_motion_votes','events_tasks','events_task_assignments'] LOOP
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
-- A decision and a signed vote are history: never deleted through the app.
GRANT SELECT, INSERT, UPDATE ON events_motions, events_motion_votes TO gerege_nexus_tenant;
REVOKE DELETE ON events_motions, events_motion_votes FROM gerege_nexus_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON events_tasks, events_task_assignments TO gerege_nexus_tenant;

-- A decided motion and a signed vote do not change. This is below the
-- handlers so that a bug, or a direct statement, cannot rewrite a result.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION workspace.events_history_is_final() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
    IF TG_TABLE_NAME = 'events_motions' AND OLD.status = 'decided' THEN
        RAISE EXCEPTION 'a decided motion is final' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_TABLE_NAME = 'events_motions' AND OLD.status = 'voting' AND
       (NEW.title, NEW.body, NEW.content_hash) IS DISTINCT FROM (OLD.title, OLD.body, OLD.content_hash) THEN
        RAISE EXCEPTION 'a motion under vote cannot be edited' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_TABLE_NAME = 'events_motion_votes' AND OLD.status = 'signed' THEN
        RAISE EXCEPTION 'a signed vote is final' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END
$fn$;
-- +goose StatementEnd
DROP TRIGGER IF EXISTS events_motions_final ON events_motions;
CREATE TRIGGER events_motions_final BEFORE UPDATE ON events_motions
    FOR EACH ROW EXECUTE FUNCTION workspace.events_history_is_final();
DROP TRIGGER IF EXISTS events_motion_votes_final ON events_motion_votes;
CREATE TRIGGER events_motion_votes_final BEFORE UPDATE ON events_motion_votes
    FOR EACH ROW EXECUTE FUNCTION workspace.events_history_is_final();

-- Notifications: a task offered or confirmed reaches its member; a vote opened
-- or decided reaches everyone whose attendance at the event was confirmed.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION workspace.notify_task_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
DECLARE heading TEXT; task_title TEXT;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;
    heading := CASE NEW.status WHEN 'offered' THEN 'Танд ажил үүрэг санал болголоо'
        WHEN 'done' THEN 'Ажил үүрэг гүйцэтгэснээр баталгаажлаа' ELSE NULL END;
    IF heading IS NULL THEN RETURN NEW; END IF;
    SELECT title INTO task_title FROM workspace.events_tasks WHERE id = NEW.task_id AND tenant_id = NEW.tenant_id;
    PERFORM registry.notify_member(NEW.user_id, 'task:'||NEW.id::text||':'||NEW.status, 'event', heading,
        left(task_title, 500), '/module/events/'||NEW.event_id::text||'?workspace='||NEW.tenant_id::text||'#tasks');
    RETURN NEW;
END
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION workspace.notify_task_assignment() FROM PUBLIC;
DROP TRIGGER IF EXISTS notify_task_assignment ON events_task_assignments;
CREATE TRIGGER notify_task_assignment AFTER INSERT OR UPDATE OF status ON events_task_assignments
    FOR EACH ROW EXECUTE FUNCTION workspace.notify_task_assignment();

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION workspace.notify_motion_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
DECLARE heading TEXT; recipient UUID;
BEGIN
    IF OLD.status = NEW.status THEN RETURN NEW; END IF;
    heading := CASE
        WHEN NEW.status = 'voting' THEN 'Санал хураалт эхэллээ'
        WHEN NEW.status = 'decided' AND NEW.result = 'approved' THEN 'Асуудал батлагдлаа'
        WHEN NEW.status = 'decided' THEN 'Асуудал батлагдсангүй'
        ELSE NULL END;
    IF heading IS NULL THEN RETURN NEW; END IF;
    FOR recipient IN SELECT user_id FROM workspace.events_attendance
        WHERE tenant_id = NEW.tenant_id AND event_id = NEW.event_id AND status = 'attended'
    LOOP
        PERFORM registry.notify_member(recipient, 'motion:'||NEW.id::text||':'||NEW.status, 'event', heading,
            left(NEW.title, 500), '/module/events/'||NEW.event_id::text||'?workspace='||NEW.tenant_id::text||'#discussion');
    END LOOP;
    RETURN NEW;
END
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION workspace.notify_motion_change() FROM PUBLIC;
DROP TRIGGER IF EXISTS notify_motion_change ON events_motions;
CREATE TRIGGER notify_motion_change AFTER UPDATE OF status ON events_motions
    FOR EACH ROW EXECUTE FUNCTION workspace.notify_motion_change();

-- +goose Down
DROP TRIGGER IF EXISTS notify_motion_change ON events_motions;
DROP FUNCTION IF EXISTS workspace.notify_motion_change();
DROP TRIGGER IF EXISTS notify_task_assignment ON events_task_assignments;
DROP FUNCTION IF EXISTS workspace.notify_task_assignment();
DROP TRIGGER IF EXISTS events_motion_votes_final ON events_motion_votes;
DROP TRIGGER IF EXISTS events_motions_final ON events_motions;
DROP FUNCTION IF EXISTS workspace.events_history_is_final();
DROP INDEX IF EXISTS idx_events_points_period;
DROP TABLE IF EXISTS events_task_assignments;
DROP TABLE IF EXISTS events_tasks;
DROP TABLE IF EXISTS events_motion_votes;
DROP TABLE IF EXISTS events_motions;
ALTER TABLE events_events DROP COLUMN IF EXISTS vote_points;
