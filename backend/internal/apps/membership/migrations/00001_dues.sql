-- +goose Up
CREATE TABLE IF NOT EXISTS membership_dues_settings (
    tenant_id uuid PRIMARY KEY REFERENCES registry.tenants(id) ON DELETE CASCADE,
    enabled boolean NOT NULL DEFAULT false,
    monthly_amount bigint NOT NULL DEFAULT 0 CHECK (monthly_amount BETWEEN 0 AND 1000000000),
    due_day integer NOT NULL DEFAULT 15 CHECK (due_day BETWEEN 1 AND 28),
    bank_name varchar(100) NOT NULL DEFAULT '',
    account_number varchar(64) NOT NULL DEFAULT '',
    account_holder varchar(200) NOT NULL DEFAULT '',
    instructions varchar(2000) NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS membership_dues_charges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES registry.tenants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES registry.users(id) ON DELETE CASCADE,
    period date NOT NULL CHECK (extract(day FROM period)=1),
    amount bigint NOT NULL CHECK (amount BETWEEN 1 AND 1000000000),
    due_date date NOT NULL,
    waived boolean NOT NULL DEFAULT false,
    waiver_reason varchar(500) NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(tenant_id,user_id,period), UNIQUE(tenant_id,id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_membership_charges_user ON membership_dues_charges(user_id);
CREATE TABLE IF NOT EXISTS membership_dues_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES registry.tenants(id) ON DELETE CASCADE,
    charge_id uuid NOT NULL,
    user_id uuid NOT NULL REFERENCES registry.users(id) ON DELETE CASCADE,
    request_key uuid NOT NULL,
    amount bigint NOT NULL CHECK (amount BETWEEN 1 AND 1000000000),
    reference varchar(128) NOT NULL CHECK (length(btrim(reference))>0),
    status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','reversed')),
    review_note varchar(500) NOT NULL DEFAULT '',
    reviewed_by uuid REFERENCES registry.users(id),
    reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY(tenant_id,charge_id,user_id) REFERENCES membership_dues_charges(tenant_id,id,user_id) ON DELETE CASCADE,
    UNIQUE(tenant_id,user_id,request_key), UNIQUE(tenant_id,id,user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_payments_reference ON membership_dues_payments(tenant_id,reference) WHERE status='approved';
CREATE INDEX IF NOT EXISTS idx_membership_payments_charge ON membership_dues_payments(tenant_id,charge_id,user_id);
CREATE INDEX IF NOT EXISTS idx_membership_payments_user ON membership_dues_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_membership_payments_reviewer ON membership_dues_payments(reviewed_by);
CREATE TABLE IF NOT EXISTS membership_dues_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES registry.tenants(id) ON DELETE CASCADE,
    payment_id uuid NOT NULL,
    user_id uuid NOT NULL REFERENCES registry.users(id) ON DELETE CASCADE,
    delta bigint NOT NULL CHECK (delta<>0),
    actor_id uuid NOT NULL REFERENCES registry.users(id),
    reason varchar(500) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY(tenant_id,payment_id,user_id) REFERENCES membership_dues_payments(tenant_id,id,user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_membership_entries_payment ON membership_dues_entries(tenant_id,payment_id,user_id);
CREATE INDEX IF NOT EXISTS idx_membership_entries_user ON membership_dues_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_membership_entries_actor ON membership_dues_entries(actor_id);

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION workspace.membership_finance_allowed() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,workspace,registry AS $$
    SELECT EXISTS (
        SELECT 1 FROM workspace.memberships m
        JOIN workspace.membership_roles mr ON mr.membership_id=m.id
        JOIN workspace.roles r ON r.id=mr.role_id AND r.tenant_id=m.tenant_id AND r.active
        WHERE m.tenant_id=NULLIF(current_setting('app.current_tenant',true),'')::uuid
          AND m.user_id=NULLIF(current_setting('app.current_user',true),'')::uuid
          AND (r.code='admin' OR EXISTS (
              SELECT 1 FROM workspace.role_permissions rp JOIN registry.permissions p ON p.id=rp.permission_id
              WHERE rp.role_id=r.id AND p.code='membership.finance'))
    );
$$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION workspace.membership_finance_allowed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION workspace.membership_finance_allowed() TO gerege_nexus_tenant;

-- +goose StatementBegin
DO $$ DECLARE tbl text; BEGIN
    FOREACH tbl IN ARRAY ARRAY['membership_dues_settings','membership_dues_charges','membership_dues_payments','membership_dues_entries'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tbl);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I',tbl);
        EXECUTE format('DROP POLICY IF EXISTS finance_insert ON %I',tbl);
        EXECUTE format('DROP POLICY IF EXISTS finance_update ON %I',tbl);
        EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO gerege_nexus_tenant',tbl);
        EXECUTE format('REVOKE DELETE ON %I FROM gerege_nexus_tenant',tbl);
        IF tbl='membership_dues_settings' THEN
            EXECUTE format('CREATE POLICY tenant_isolation ON %I FOR SELECT TO gerege_nexus_tenant USING (tenant_id=NULLIF(current_setting(''app.current_tenant'',true),'''')::uuid)',tbl);
        ELSE
            EXECUTE format('CREATE POLICY tenant_isolation ON %I FOR SELECT TO gerege_nexus_tenant USING (tenant_id=NULLIF(current_setting(''app.current_tenant'',true),'''')::uuid AND (user_id=NULLIF(current_setting(''app.current_user'',true),'''')::uuid OR workspace.membership_finance_allowed()))',tbl);
        END IF;
        EXECUTE format('CREATE POLICY finance_insert ON %I FOR INSERT TO gerege_nexus_tenant WITH CHECK (tenant_id=NULLIF(current_setting(''app.current_tenant'',true),'''')::uuid AND workspace.membership_finance_allowed())',tbl);
        EXECUTE format('CREATE POLICY finance_update ON %I FOR UPDATE TO gerege_nexus_tenant USING (tenant_id=NULLIF(current_setting(''app.current_tenant'',true),'''')::uuid AND workspace.membership_finance_allowed()) WITH CHECK (tenant_id=NULLIF(current_setting(''app.current_tenant'',true),'''')::uuid AND workspace.membership_finance_allowed())',tbl);
    END LOOP;
END $$;
-- +goose StatementEnd
DROP POLICY IF EXISTS member_payment ON membership_dues_payments;
CREATE POLICY member_payment ON membership_dues_payments FOR INSERT TO gerege_nexus_tenant
WITH CHECK (tenant_id=NULLIF(current_setting('app.current_tenant',true),'')::uuid
    AND user_id=NULLIF(current_setting('app.current_user',true),'')::uuid AND status='pending'
    AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_note='');
REVOKE UPDATE ON membership_dues_entries FROM gerege_nexus_tenant;

-- +goose Down
DROP TABLE IF EXISTS membership_dues_entries;
DROP TABLE IF EXISTS membership_dues_payments;
DROP TABLE IF EXISTS membership_dues_charges;
DROP TABLE IF EXISTS membership_dues_settings;
DROP FUNCTION IF EXISTS workspace.membership_finance_allowed();
