-- +goose Up
-- A transfer during the same month cannot generate a second obligation.
-- Existing duplicate months require a finance review before this can migrate;
-- no historical ledger entries are discarded or silently consolidated.
CREATE UNIQUE INDEX IF NOT EXISTS membership_charges_one_month_per_person ON membership_dues_charges(user_id,period);

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION workspace.notify_dues_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
DECLARE key TEXT; heading TEXT;
BEGIN
    IF TG_TABLE_NAME='membership_dues_charges' THEN
        IF TG_OP='INSERT' THEN
            key:='charge:'||NEW.id::text; heading:='Сарын хураамж ногдууллаа';
        ELSIF NEW.waived AND NOT OLD.waived THEN
            key:='waive:'||NEW.id::text; heading:='Хураамжийн үлдэгдлээс чөлөөллөө';
        ELSE RETURN NEW;
        END IF;
    ELSE
        IF TG_OP='UPDATE' AND OLD.status=NEW.status THEN RETURN NEW; END IF;
        key:='payment:'||NEW.id::text||':'||NEW.status;
        heading:=CASE NEW.status WHEN 'pending' THEN 'Төлөлтийн мэдээлэл хүлээн авлаа'
            WHEN 'approved' THEN 'Төлөлтийг баталгаажууллаа' WHEN 'rejected' THEN 'Төлөлтөөс татгалзлаа'
            ELSE 'Төлөлтийн баталгаажуулалтыг буцаалаа' END;
    END IF;
    PERFORM registry.notify_member(NEW.user_id,key,'dues',heading,'','/member/history');
    RETURN NEW;
END
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION workspace.notify_dues_change() FROM PUBLIC;
DROP TRIGGER IF EXISTS notify_dues_charge ON membership_dues_charges;
CREATE TRIGGER notify_dues_charge AFTER INSERT OR UPDATE OF waived ON membership_dues_charges
    FOR EACH ROW EXECUTE FUNCTION workspace.notify_dues_change();
DROP TRIGGER IF EXISTS notify_dues_payment ON membership_dues_payments;
CREATE TRIGGER notify_dues_payment AFTER INSERT OR UPDATE OF status ON membership_dues_payments
    FOR EACH ROW EXECUTE FUNCTION workspace.notify_dues_change();

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION workspace.my_dues_history(p_offset integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,workspace,registry AS $fn$
    WITH charges AS (
        SELECT c.id,c.tenant_id,t.name AS branch,to_char(c.period,'YYYY-MM') AS period,c.amount,c.waived,
            COALESCE((SELECT sum(e.delta) FROM workspace.membership_dues_entries e
                JOIN workspace.membership_dues_payments p ON p.id=e.payment_id AND p.tenant_id=e.tenant_id
                WHERE p.charge_id=c.id AND p.tenant_id=c.tenant_id),0) AS paid
        FROM workspace.membership_dues_charges c JOIN registry.tenants t ON t.id=c.tenant_id
        WHERE c.user_id=NULLIF(current_setting('app.current_user',true),'')::uuid
        ORDER BY c.period DESC,c.id DESC LIMIT 51 OFFSET greatest(0,least(p_offset,100000))
    ), payments AS (
        SELECT p.id,p.tenant_id,t.name AS branch,p.amount,p.status,p.reference,p.review_note,p.created_at
        FROM workspace.membership_dues_payments p JOIN registry.tenants t ON t.id=p.tenant_id
        WHERE p.user_id=NULLIF(current_setting('app.current_user',true),'')::uuid
        ORDER BY p.created_at DESC,p.id DESC LIMIT 51 OFFSET greatest(0,least(p_offset,100000))
    )
    SELECT jsonb_build_object('charges',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
        SELECT c.*,CASE WHEN waived THEN 0 ELSE greatest(amount-paid,0) END AS balance FROM charges c LIMIT 50) x),'[]'::jsonb),
        'payments',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM payments LIMIT 50) x),'[]'::jsonb),
        'has_more',(SELECT count(*)>50 FROM charges) OR (SELECT count(*)>50 FROM payments),
        'next_offset',greatest(0,least(p_offset,100000))+50);
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION workspace.my_dues_history(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION workspace.my_dues_history(integer) TO gerege_nexus_tenant;

-- +goose Down
DROP FUNCTION IF EXISTS workspace.my_dues_history(integer);
DROP TRIGGER IF EXISTS notify_dues_charge ON membership_dues_charges;
DROP TRIGGER IF EXISTS notify_dues_payment ON membership_dues_payments;
DROP FUNCTION IF EXISTS workspace.notify_dues_change();
DROP INDEX IF EXISTS membership_charges_one_month_per_person;
