-- Хаалган дээр зогсож буй хүн хаалганы эзэнд харагдана.
--
--
-- ЮУ ЭВДЭРСЭН БАЙВ.
--
-- 00089 хүнд байгууллага руу элсэх хүсэлт илгээх зам нээсэн: мөр нь
-- `workspace.join_requests`-д тухайн байгууллагын tenant_id-тай бичигдэж,
-- админ `/admin/access/join-requests`-ээр дарааллаа уншина. Тэр уншилт
-- `registry.users`-тэй JOIN хийж нэр, хаягийг нь авдаг.
--
-- 00102 нь `registry.users`-ийг хүнээр тусгаарласан: «би өөрөө, эсвэл
-- надтай хамт ажилладаг хүн» — сүүлийнх нь `workspace.memberships`-ээр
-- шалгагдана, тэр нь өөрөө tenant-аар тусгаарлагдсан. Элсэх хүсэлт илгээсэн
-- хүн яг тодорхойлолтоороо хараахан гишүүн биш. Тиймээс JOIN түүний мөрийг
-- олдоггүй, дараалал хоосон буцдаг, хүсэлт нь `PENDING` хэвээр хэзээ ч
-- шийдэгдэхгүй үлддэг байв. Хоёр миграци тус тусдаа зөв, хамтдаа хаалганы
-- цаана хэн байгааг хэнд ч хэлдэггүй байв.
--
--
-- ЗАСВАР — БОДЛОГЫГ ӨРГӨСГӨНӨ, ХҮСЭЛТ БҮР ХАРАГДАХГҮЙ.
--
-- `registry.users`-ийн `person_isolation`-д гурав дахь мөчир: энэ хүн
-- `workspace.join_requests`-д PENDING мөртэй бол. Тэр хүснэгт өөрөө
-- tenant-аар тусгаарлагдсан (00089) тул мөчир нь зөвхөн *энэ* байгууллагын
-- хаалган дээр зогсож буй хүмүүсийг нээнэ — хөрш байгууллага руу хүсэлт
-- илгээсэн хүн энд харагдахгүй хэвээр. Хүсэлт шийдэгдмэгц (ACCEPTED бол
-- гишүүнчлэлээр, DECLINED бол огт биш) мөчир хаагдана: татгалзсан хүний
-- нэр админы лавлахад үлдэхгүй.
--
-- Зөвхөн USING өргөсдөг. WITH CHECK хэвээр: хүсэлт илгээсэн хүний мөрийг
-- байгууллага бичиж чадахгүй.
--
-- 00102-ын бусад хоёр хүснэгт (`user_sso_identities`, `user_eid_identities`)
-- хөндөгдөхгүй: дарааллын дэлгэц нэр, хаяг л асуудаг, хүний гадаад
-- танигчийг биш.

-- +goose Up
DROP POLICY IF EXISTS person_isolation ON registry.users;
CREATE POLICY person_isolation ON registry.users TO gerege_nexus_tenant
    USING (
        id = NULLIF(current_setting('app.current_user', true), '')::uuid
        OR EXISTS (SELECT 1 FROM workspace.memberships m WHERE m.user_id = registry.users.id)
        OR EXISTS (SELECT 1 FROM workspace.join_requests j
                    WHERE j.user_id = registry.users.id AND j.status = 'PENDING')
    )
    WITH CHECK (
        id = NULLIF(current_setting('app.current_user', true), '')::uuid
        OR EXISTS (SELECT 1 FROM workspace.memberships m WHERE m.user_id = registry.users.id)
    );

-- +goose Down
DROP POLICY IF EXISTS person_isolation ON registry.users;
CREATE POLICY person_isolation ON registry.users TO gerege_nexus_tenant
    USING (
        id = NULLIF(current_setting('app.current_user', true), '')::uuid
        OR EXISTS (SELECT 1 FROM workspace.memberships m WHERE m.user_id = registry.users.id)
    )
    WITH CHECK (
        id = NULLIF(current_setting('app.current_user', true), '')::uuid
        OR EXISTS (SELECT 1 FROM workspace.memberships m WHERE m.user_id = registry.users.id)
    );
