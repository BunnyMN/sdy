-- Гарын үсэгтэй архив (mn.sdy.events 1.7.0): албан тушаалын эрх.
--
-- archive.read — архивыг харах, өөрт ирсэн баримтад гарын үсэг зурах (гишүүн
--   бүр 'user' рольтойгоор авна; албан тушаалын рольд ч 00119-ийн хэв маягаар).
-- archive.manage — төсөл үүсгэх/засах, гарын үсэг зурагчдыг сонгох, илгээх,
--   цуцлах: Тэргүүн, Нарийн бичиг. Админ бүх эрхтэй хэвээр.
--
-- Эрх нь апп шинэчлэгдэж registry.permissions-д бүртгэгдэх үед
-- grant_new_permission_to_positions триггерээр албан тушаалын рольд очно;
-- аль хэдийн бүртгэгдсэн бол доорх ensure_position_roles шууд олгоно.

-- +goose Up
INSERT INTO registry.position_permissions (position, permission_code) VALUES
    ('chair','archive.read'),('chair','archive.manage'),
    ('vice_chair','archive.read'),
    ('secretary','archive.read'),('secretary','archive.manage'),
    ('finance','archive.read'),
    ('auditor','archive.read'),
    ('board','archive.read')
ON CONFLICT DO NOTHING;

-- +goose StatementBegin
DO $grant$
DECLARE t UUID;
BEGIN
    FOR t IN SELECT id FROM registry.tenants WHERE membership_branch LOOP
        PERFORM registry.ensure_position_roles(t);
    END LOOP;
END
$grant$;
-- +goose StatementEnd

-- +goose Down
DELETE FROM workspace.role_permissions rp USING workspace.roles r, registry.permissions p
 WHERE rp.role_id = r.id AND r.code LIKE 'pos\_%' AND p.id = rp.permission_id
   AND p.code IN ('archive.read','archive.manage');
DELETE FROM registry.position_permissions WHERE permission_code IN ('archive.read','archive.manage');
