-- Гарын үсэгтэй архив ба PDF саналын хуудас.
--
-- Архивын баримт (хурлын тэмдэглэл, шийдвэр/тогтоол, саналын протокол) нь
-- төсөл (draft) → гарын үсэг зуруулж буй (signing) → баталгаажсан (signed)
-- эсвэл цуцлагдсан (cancelled). «Илгээх» үед PDF хөлдөж (revision 0), дугаар
-- (салбар бүрт жилээр: 2026/014) олгогдоно. Гарын үсэг зурагч бүр дараалсан:
-- N+1 дэх нь N-ийн eID-ээр тамгалуулсан PDF-ийг зурна, тэр нь өмнөх байтуудыг
-- хэвээр үлдээж хавсаргасан (incremental) хувилбар байх ёстой. Хувилбар бүр
-- (`events_archive_versions`) хадгалагдана — аудитад гинжийг бүтнээр нь харуулна.
-- Бүх зурагч зурсны дараа л баримт «баталгаажсан».
--
-- Санал бүрийн хуудас одоо PDF: санал өгөгч PDF-ийг PIN2-оор зурна,
-- `digest_hex` = тэр PDF-ийн SHA-256, eID-ийн тамгалсан PDF нь
-- `ballot_signed_pdf`-д.

-- +goose Up
CREATE TABLE IF NOT EXISTS events_archive_counters (
    tenant_id uuid NOT NULL REFERENCES registry.tenants(id) ON DELETE CASCADE,
    year integer NOT NULL CHECK (year BETWEEN 2000 AND 9999),
    last integer NOT NULL DEFAULT 0 CHECK (last >= 0),
    PRIMARY KEY (tenant_id, year)
);

CREATE TABLE IF NOT EXISTS events_archive_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES registry.tenants(id) ON DELETE CASCADE,
    kind varchar(16) NOT NULL CHECK (kind IN ('minutes','decision','vote_protocol')),
    -- Assigned when the document is frozen for signing: «2026/014».
    number varchar(16),
    title varchar(200) NOT NULL CHECK (length(btrim(title)) > 0),
    body varchar(20000) NOT NULL DEFAULT '',
    event_id uuid REFERENCES events_events(id) ON DELETE CASCADE,
    motion_id uuid REFERENCES events_motions(id) ON DELETE CASCADE,
    -- A vote protocol's frozen result (counts and the signed roll).
    payload jsonb,
    status varchar(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','signing','signed','cancelled')),
    -- Why a document the system made is still a draft, e.g. 'no_signers'.
    draft_reason varchar(32) NOT NULL DEFAULT '',
    -- What the system wants a manager to know, e.g. a protocol signer skipped
    -- for having no eID.
    notice varchar(300) NOT NULL DEFAULT '',
    created_by uuid REFERENCES registry.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    issued_at timestamptz,
    signed_at timestamptz,
    cancelled_at timestamptz,
    cancelled_by uuid REFERENCES registry.users(id) ON DELETE SET NULL,
    cancel_reason varchar(500) NOT NULL DEFAULT '',
    -- SHA-256 of revision 0 (what the first signer signs) and of the last one.
    pdf_sha256 char(64),
    final_sha256 char(64),
    CONSTRAINT events_archive_frozen CHECK (status = 'draft' OR status = 'cancelled' OR (number IS NOT NULL AND pdf_sha256 IS NOT NULL AND issued_at IS NOT NULL)),
    CONSTRAINT events_archive_signed CHECK ((status = 'signed') = (final_sha256 IS NOT NULL AND signed_at IS NOT NULL)),
    CONSTRAINT events_archive_protocol CHECK ((kind = 'vote_protocol') = (motion_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_archive_number ON events_archive_documents (tenant_id, number) WHERE number IS NOT NULL;
-- One live protocol per decided motion.
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_archive_protocol ON events_archive_documents (motion_id) WHERE motion_id IS NOT NULL AND status <> 'cancelled';
CREATE INDEX IF NOT EXISTS idx_events_archive_list ON events_archive_documents (tenant_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_events_archive_event ON events_archive_documents (event_id);
CREATE INDEX IF NOT EXISTS idx_events_archive_motion ON events_archive_documents (motion_id);
CREATE INDEX IF NOT EXISTS idx_events_archive_creator ON events_archive_documents (created_by);
CREATE INDEX IF NOT EXISTS idx_events_archive_canceller ON events_archive_documents (cancelled_by);

CREATE TABLE IF NOT EXISTS events_archive_signers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES registry.tenants(id) ON DELETE CASCADE,
    document_id uuid NOT NULL REFERENCES events_archive_documents(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES registry.users(id),
    sign_order integer NOT NULL CHECK (sign_order BETWEEN 1 AND 60),
    -- The position held when the signer was chosen, as printed on the PDF.
    position_title varchar(40) NOT NULL DEFAULT '',
    -- replaced: a manager put somebody else in this signer's place before they
    -- signed (kept, with the reason, so the history shows it).
    status varchar(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','signing','signed','refused','replaced')),
    replaced_at timestamptz,
    replaced_by uuid REFERENCES registry.users(id) ON DELETE SET NULL,
    replace_reason varchar(500) NOT NULL DEFAULT '',
    sign_session_id varchar(128),
    session_started_at timestamptz,
    -- The revision this ceremony signs, and that revision's SHA-256.
    base_revision integer,
    digest_hex char(64),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error varchar(300) NOT NULL DEFAULT '',
    signed_at timestamptz,
    cert_name varchar(200) NOT NULL DEFAULT '',
    cert_serial varchar(100) NOT NULL DEFAULT '',
    cert_issuer varchar(200) NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT events_archive_signer_order UNIQUE (document_id, sign_order),
    CONSTRAINT events_archive_signer_signed_at CHECK ((status = 'signed') = (signed_at IS NOT NULL))
);
-- One live place per person; a replaced row stays beside a new one.
CREATE UNIQUE INDEX IF NOT EXISTS events_archive_signer_once ON events_archive_signers (document_id, user_id) WHERE status <> 'replaced';
CREATE INDEX IF NOT EXISTS idx_events_archive_signers_user ON events_archive_signers (tenant_id, user_id, status);
CREATE INDEX IF NOT EXISTS idx_events_archive_signers_user_fk ON events_archive_signers (user_id);
CREATE INDEX IF NOT EXISTS idx_events_archive_signers_replacer ON events_archive_signers (replaced_by);

CREATE TABLE IF NOT EXISTS events_archive_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES registry.tenants(id) ON DELETE CASCADE,
    document_id uuid NOT NULL REFERENCES events_archive_documents(id) ON DELETE CASCADE,
    revision integer NOT NULL CHECK (revision BETWEEN 0 AND 60),
    -- The signer whose signature this revision appended; NULL for revision 0.
    signer_id uuid REFERENCES events_archive_signers(id) ON DELETE CASCADE,
    pdf bytea NOT NULL CHECK (octet_length(pdf) BETWEEN 1 AND 20971520),
    sha256 char(64) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT events_archive_version_once UNIQUE (document_id, revision),
    CONSTRAINT events_archive_version_signer CHECK ((revision = 0) = (signer_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_events_archive_versions_signer ON events_archive_versions (signer_id);
CREATE INDEX IF NOT EXISTS idx_events_archive_versions_tenant ON events_archive_versions (tenant_id);

-- Ballots as PDF.
ALTER TABLE events_motion_votes
    ADD COLUMN IF NOT EXISTS ballot_pdf bytea CHECK (ballot_pdf IS NULL OR octet_length(ballot_pdf) <= 2097152),
    ADD COLUMN IF NOT EXISTS ballot_signed_pdf bytea CHECK (ballot_signed_pdf IS NULL OR octet_length(ballot_signed_pdf) <= 8388608),
    -- 'pdf' — the PDF went to eID; 'digest' — the rail could sign only its hash.
    ADD COLUMN IF NOT EXISTS ballot_signing varchar(8) CHECK (ballot_signing IS NULL OR ballot_signing IN ('pdf','digest')),
    ADD COLUMN IF NOT EXISTS ballot_error varchar(300) NOT NULL DEFAULT '',
    -- When eID was last asked for the stamped ballot, so a vote's later polls
    -- ask at most once every few minutes.
    ADD COLUMN IF NOT EXISTS ballot_stamp_tried_at timestamptz;

-- +goose StatementBegin
DO $isolation$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['events_archive_counters','events_archive_documents','events_archive_signers','events_archive_versions'] LOOP
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
-- A document is history: never deleted through the app; a revision is never changed.
GRANT SELECT, INSERT, UPDATE ON events_archive_counters, events_archive_documents TO gerege_nexus_tenant;
REVOKE DELETE ON events_archive_counters, events_archive_documents FROM gerege_nexus_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON events_archive_signers TO gerege_nexus_tenant;
GRANT SELECT, INSERT ON events_archive_versions TO gerege_nexus_tenant;
REVOKE UPDATE, DELETE ON events_archive_versions FROM gerege_nexus_tenant;

-- A frozen document's text does not change; a signed or cancelled one does not
-- change at all; a signature once given is final; signers leave only a draft.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION workspace.events_archive_is_final() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE doc_status TEXT;
BEGIN
    -- A foreign key's own action (a tenant deleted, an author's account set
    -- to NULL) runs as a nested trigger and is not an edit of the record.
    IF pg_trigger_depth() > 1 THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    IF TG_TABLE_NAME = 'events_archive_documents' THEN
        IF OLD.status IN ('signed','cancelled') THEN
            RAISE EXCEPTION 'a % document is final', OLD.status USING ERRCODE = 'check_violation';
        END IF;
        IF OLD.status = 'signing' AND (NEW.kind, NEW.number, NEW.title, NEW.body, NEW.payload::text, NEW.pdf_sha256, NEW.issued_at)
            IS DISTINCT FROM (OLD.kind, OLD.number, OLD.title, OLD.body, OLD.payload::text, OLD.pdf_sha256, OLD.issued_at) THEN
            RAISE EXCEPTION 'a document out for signature cannot be edited' USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.status = 'draft' AND OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'a document cannot go back to draft' USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;
    -- events_archive_signers
    IF TG_OP = 'DELETE' THEN
        SELECT status INTO doc_status FROM workspace.events_archive_documents WHERE id = OLD.document_id;
        IF doc_status IS NOT NULL AND doc_status <> 'draft' THEN
            RAISE EXCEPTION 'the signers of a frozen document cannot be removed' USING ERRCODE = 'check_violation';
        END IF;
        RETURN OLD;
    END IF;
    IF OLD.status = 'signed' THEN
        RAISE EXCEPTION 'a signature is final' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status = 'replaced' THEN
        RAISE EXCEPTION 'a replaced signer is final' USING ERRCODE = 'check_violation';
    END IF;
    IF (NEW.user_id, NEW.sign_order, NEW.document_id) IS DISTINCT FROM (OLD.user_id, OLD.sign_order, OLD.document_id) THEN
        SELECT status INTO doc_status FROM workspace.events_archive_documents WHERE id = OLD.document_id;
        IF doc_status <> 'draft' THEN
            RAISE EXCEPTION 'the signers of a frozen document cannot be changed' USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END
$fn$;
-- +goose StatementEnd
DROP TRIGGER IF EXISTS events_archive_documents_final ON events_archive_documents;
CREATE TRIGGER events_archive_documents_final BEFORE UPDATE ON events_archive_documents
    FOR EACH ROW EXECUTE FUNCTION workspace.events_archive_is_final();
DROP TRIGGER IF EXISTS events_archive_signers_final ON events_archive_signers;
CREATE TRIGGER events_archive_signers_final BEFORE UPDATE OR DELETE ON events_archive_signers
    FOR EACH ROW EXECUTE FUNCTION workspace.events_archive_is_final();

-- A signed vote stays final, except that its eID-stamped ballot PDF may be
-- attached once, afterwards, when it was not available at the moment of
-- counting. Only that PDF and its bookkeeping (ballot_error,
-- ballot_stamp_tried_at, updated_at) may change; every other column is compared.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION workspace.events_history_is_final() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
    IF TG_TABLE_NAME = 'events_motions' THEN
        IF OLD.status = 'decided' THEN
            RAISE EXCEPTION 'a decided motion is final' USING ERRCODE = 'check_violation';
        END IF;
        IF OLD.status = 'voting' THEN
            IF (NEW.title, NEW.body, NEW.content_hash) IS DISTINCT FROM (OLD.title, OLD.body, OLD.content_hash) THEN
                RAISE EXCEPTION 'a motion under vote cannot be edited' USING ERRCODE = 'check_violation';
            END IF;
        END IF;
    ELSIF OLD.status = 'signed' THEN
        IF OLD.ballot_signed_pdf IS NULL
           AND (NEW.id, NEW.tenant_id, NEW.event_id, NEW.motion_id, NEW.user_id, NEW.choice, NEW.status, NEW.document,
                NEW.digest_hex, NEW.sign_session_id, NEW.signed_at, NEW.points_awarded, NEW.ballot_pdf, NEW.ballot_signing,
                NEW.created_at)
               IS NOT DISTINCT FROM
               (OLD.id, OLD.tenant_id, OLD.event_id, OLD.motion_id, OLD.user_id, OLD.choice, OLD.status, OLD.document,
                OLD.digest_hex, OLD.sign_session_id, OLD.signed_at, OLD.points_awarded, OLD.ballot_pdf, OLD.ballot_signing,
                OLD.created_at) THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'a signed vote is final' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END
$fn$;
-- +goose StatementEnd

-- Notifications: the first signer when the document goes out, each next
-- signer when the one before signs, the author when every signature is in.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION workspace.notify_archive_signing() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
DECLARE doc workspace.events_archive_documents%ROWTYPE; next_user UUID; link TEXT;
BEGIN
    IF TG_TABLE_NAME = 'events_archive_documents' THEN
        doc := NEW;
        IF OLD.status = NEW.status THEN RETURN NEW; END IF;
    ELSIF TG_OP = 'INSERT' THEN
        -- A signer added to a document already out (a replacement) is told
        -- when the turn is theirs at once; one added to a draft waits for «send».
        SELECT * INTO doc FROM workspace.events_archive_documents WHERE id = NEW.document_id;
        IF doc.status <> 'signing' THEN RETURN NEW; END IF;
    ELSE
        IF OLD.status = NEW.status OR NEW.status <> 'signed' THEN RETURN NEW; END IF;
        SELECT * INTO doc FROM workspace.events_archive_documents WHERE id = NEW.document_id;
    END IF;
    link := '/member/archive/' || doc.id::text || '?workspace=' || doc.tenant_id::text;
    IF doc.status = 'signing' THEN
        SELECT s.user_id INTO next_user FROM workspace.events_archive_signers s
         WHERE s.document_id = doc.id AND s.status NOT IN ('signed','replaced') ORDER BY s.sign_order LIMIT 1;
        IF next_user IS NOT NULL THEN
            PERFORM registry.notify_member(next_user, 'archive:' || doc.id::text || ':' || next_user::text || ':' || txid_current()::text,
                'archive', 'Танд гарын үсэг зурах баримт ирлээ', left(coalesce(doc.number || ' · ', '') || doc.title, 500), link);
        END IF;
    ELSIF TG_TABLE_NAME = 'events_archive_documents' AND doc.status = 'signed' AND doc.created_by IS NOT NULL THEN
        PERFORM registry.notify_member(doc.created_by, 'archive:' || doc.id::text || ':signed',
            'archive', 'Баримт бүрэн баталгаажлаа', left(coalesce(doc.number || ' · ', '') || doc.title, 500), link);
    END IF;
    RETURN NEW;
END
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION workspace.notify_archive_signing() FROM PUBLIC;
DROP TRIGGER IF EXISTS notify_archive_document ON events_archive_documents;
CREATE TRIGGER notify_archive_document AFTER UPDATE OF status ON events_archive_documents
    FOR EACH ROW EXECUTE FUNCTION workspace.notify_archive_signing();
DROP TRIGGER IF EXISTS notify_archive_signer ON events_archive_signers;
CREATE TRIGGER notify_archive_signer AFTER INSERT OR UPDATE OF status ON events_archive_signers
    FOR EACH ROW EXECUTE FUNCTION workspace.notify_archive_signing();

-- +goose Down
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION workspace.events_history_is_final() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
    IF TG_TABLE_NAME = 'events_motions' THEN
        IF OLD.status = 'decided' THEN
            RAISE EXCEPTION 'a decided motion is final' USING ERRCODE = 'check_violation';
        END IF;
        IF OLD.status = 'voting' THEN
            IF (NEW.title, NEW.body, NEW.content_hash) IS DISTINCT FROM (OLD.title, OLD.body, OLD.content_hash) THEN
                RAISE EXCEPTION 'a motion under vote cannot be edited' USING ERRCODE = 'check_violation';
            END IF;
        END IF;
    ELSIF OLD.status = 'signed' THEN
        RAISE EXCEPTION 'a signed vote is final' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END
$fn$;
-- +goose StatementEnd
DROP TRIGGER IF EXISTS notify_archive_signer ON events_archive_signers;
DROP TRIGGER IF EXISTS notify_archive_document ON events_archive_documents;
DROP FUNCTION IF EXISTS workspace.notify_archive_signing();
DROP TRIGGER IF EXISTS events_archive_signers_final ON events_archive_signers;
DROP TRIGGER IF EXISTS events_archive_documents_final ON events_archive_documents;
DROP FUNCTION IF EXISTS workspace.events_archive_is_final();
DROP TABLE IF EXISTS events_archive_versions;
DROP TABLE IF EXISTS events_archive_signers;
DROP TABLE IF EXISTS events_archive_documents;
DROP TABLE IF EXISTS events_archive_counters;
ALTER TABLE events_motion_votes DROP COLUMN IF EXISTS ballot_stamp_tried_at, DROP COLUMN IF EXISTS ballot_error, DROP COLUMN IF EXISTS ballot_signing,
    DROP COLUMN IF EXISTS ballot_signed_pdf, DROP COLUMN IF EXISTS ballot_pdf;
