-- Нийтэд харагдах салбарын нэр, харьяаллын холбоос. Профайлын бусад талбар,
-- гишүүд, эрх, байгууллагын өгөгдлийг энэ функц гаргахгүй.
-- +goose Up
-- +goose StatementBegin
CREATE FUNCTION registry.membership_branches()
RETURNS TABLE(slug text, name text, parent_slug text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT t.slug::text,t.name::text,parent.slug::text
 FROM registry.tenants t
 LEFT JOIN workspace.tenant_profiles p ON p.tenant_id=t.id
 LEFT JOIN registry.tenants parent ON parent.id=p.parent_tenant_id
   AND parent.membership_branch AND parent.kind='organisation'
   AND parent.suspended_at IS NULL AND parent.deletion_scheduled_at IS NULL
 WHERE t.kind='organisation' AND t.membership_branch
   AND t.suspended_at IS NULL AND t.deletion_scheduled_at IS NULL
 ORDER BY COALESCE(parent.name,t.name),parent.id NULLS FIRST,t.name;
$$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION registry.membership_branches() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION registry.membership_branches() TO gerege_nexus_tenant;

-- +goose Down
DROP FUNCTION registry.membership_branches();
