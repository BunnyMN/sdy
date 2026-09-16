-- Read-only review before core 112/113 and Membership schema 2.
-- Requires the existing Membership module (schema 1 or later).
BEGIN READ ONLY;

-- Must return no rows before applying the global person/month unique index.
-- Finance must reconcile any duplicates; do not delete historical ledger rows.
SELECT user_id, to_char(period,'YYYY-MM') AS period, count(*) AS charges,
       array_agg(tenant_id ORDER BY tenant_id) AS branches
FROM workspace.membership_dues_charges
GROUP BY user_id, period
HAVING count(*) > 1
ORDER BY user_id, period;

-- These legacy multi-branch accounts retain work access but need an admin to
-- confirm the primary affiliation. No new dues until one is confirmed.
SELECT m.user_id, count(*) AS active_branches,
       array_agg(t.slug ORDER BY t.slug) AS branches
FROM workspace.memberships m JOIN registry.tenants t ON t.id=m.tenant_id
WHERE m.active AND t.membership_branch
  AND t.suspended_at IS NULL AND t.deletion_scheduled_at IS NULL
GROUP BY m.user_id
HAVING count(*) > 1
ORDER BY m.user_id;

COMMIT;
