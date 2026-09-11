-- SDY-ийн салбарын элсэлт. Элсэлт шийдэх эрх нь role өөрчлөх эрхээс тусдаа.
-- +goose Up
ALTER TABLE registry.tenants ADD COLUMN membership_branch boolean NOT NULL DEFAULT false;
UPDATE registry.tenants SET membership_branch = true
WHERE kind = 'organisation' AND slug IN (
    'sdy-darkhan-uul', 'sdy-darkhan-uul-darkhan', 'sdy-darkhan-uul-orkhon',
    'sdy-darkhan-uul-shariin-gol', 'sdy-darkhan-uul-khongor'
);

INSERT INTO registry.permissions (code, name, description)
VALUES ('membership.manage', 'Гишүүнчлэлийн хүсэлт шийдэх',
        'Өөрийн байгууллагын элсэх хүсэлтийг харах, батлах, татгалзах')
ON CONFLICT (code) DO NOTHING;
INSERT INTO workspace.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM workspace.roles r CROSS JOIN registry.permissions p
WHERE r.code IN ('admin', 'manager') AND p.code = 'membership.manage'
ON CONFLICT DO NOTHING;

-- +goose Down
DELETE FROM workspace.role_permissions WHERE permission_id IN (
    SELECT id FROM registry.permissions WHERE code = 'membership.manage'
);
DELETE FROM registry.permissions WHERE code = 'membership.manage';
ALTER TABLE registry.tenants DROP COLUMN membership_branch;
