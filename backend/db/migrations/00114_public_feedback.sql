-- Санал хүсэлт: туршилтын үеийн хэрэглэгчдээс нээлттэй авах сувгийн хүснэгт.
--
-- Нүүр хуудсан дээрх маягтаар нэвтрээгүй хүн ч илгээж болно, тиймээс мөр нь
-- хэн нэгэн байгууллагынх биш — deployment-д ганц удаа оршдог, операторын
-- урсгалынх. tenant_id байхгүй, RLS ч байхгүй (00099-тэй адил шалтгаан).
--
-- Бичих нь нэвтрээгүй хүсэлт буюу login role-оор явна (dbguard-ийн
-- «платформын зам»). Тенантын role-д ямар ч эрх өгөхгүй: registry-ийн шинэ
-- хүснэгт анхнаасаа хаалттай (schema_split_test.go), тэр хэвээр үлдэнэ.
-- Консол зөвхөн уншиж, төлөвийг нь өөрчилнө; агуулгыг нь засах эрхгүй — хүний
-- бичсэн зүйлийг оператор өөрчилж чаддаг бол тэр нь санал биш болно.

-- +goose Up

CREATE TABLE registry.public_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category varchar(16) NOT NULL DEFAULT 'idea'
        CHECK (category IN ('idea','request','bug','other')),
    message varchar(2000) NOT NULL CHECK (length(btrim(message)) >= 5),
    name varchar(100) NOT NULL DEFAULT '',
    contact varchar(120) NOT NULL DEFAULT '',
    page varchar(200) NOT NULL DEFAULT '',
    status varchar(16) NOT NULL DEFAULT 'new'
        CHECK (status IN ('new','seen','planned','done','dismissed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    reviewed_at timestamptz
);
CREATE INDEX public_feedback_time ON registry.public_feedback(created_at DESC, id);
CREATE INDEX public_feedback_status ON registry.public_feedback(status, created_at DESC);

GRANT SELECT, UPDATE(status, reviewed_at) ON registry.public_feedback TO gerege_nexus_operator;

-- +goose Down

DROP TABLE IF EXISTS registry.public_feedback;
