-- Профайлын зураг: хүн өөрийн зургийг оруулж, сольж, устгана.
--
-- Хүнийх, байгууллагынх биш — бүртгэл устгах хүсэлттэй (00115) адил
-- registry-д, tenant_id-гүй, RLS-гүй, тенантын role-д ямар ч эрх өгөхгүй
-- (registry-ийн шинэ хүснэгт анхнаасаа хаалттай — schema_split_test.go).
-- Унших, бичих нь бүгд login role-оор, зөвхөн тухайн хүний user_id-гаар
-- (internal/workspace/profile/photo.go). Консол ч уншихгүй: зураг бол
-- хүний хувийн мэдээлэл, дэмжлэгийн ажилд хэрэггүй.
--
-- Зураг өгөгдлийн санд bytea-аар хадгалагдана: платформд объект хадгалах
-- сан байхгүй, зураг нэг бүр жижиг (апп 512×512 JPEG болгож илгээнэ, сервер
-- дахин кодлож EXIF/GPS-ийг арилгана), хүн бүрт ганц мөр.
--
-- Бүртгэл устгагдахад (00115-ийн нэргүйжүүлэлт хүсэлтийг 'completed'
-- болгох мөчид) зураг устана — нэр, утас арилдагтай адил. Хүлээх
-- хугацаанд (30 хоног) зураг үлдэнэ: хүн буцаж нэвтэрвэл бүртгэл нь бүтнээрээ
-- сэргэх ёстой.

-- +goose Up

CREATE TABLE registry.user_photos (
    user_id UUID PRIMARY KEY REFERENCES registry.users(id) ON DELETE CASCADE,
    content bytea NOT NULL CHECK (octet_length(content) BETWEEN 100 AND 1048576),
    content_type varchar(32) NOT NULL DEFAULT 'image/jpeg' CHECK (content_type = 'image/jpeg'),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- +goose StatementBegin
CREATE FUNCTION registry.forget_photo_of_deleted_account()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, registry AS $fn$
BEGIN
    DELETE FROM registry.user_photos WHERE user_id = NEW.user_id;
    RETURN NEW;
END
$fn$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION registry.forget_photo_of_deleted_account() FROM PUBLIC;

CREATE TRIGGER account_deletion_forgets_photo
    AFTER UPDATE OF status ON registry.account_deletion_requests
    FOR EACH ROW
    WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
    EXECUTE FUNCTION registry.forget_photo_of_deleted_account();

-- +goose Down

DROP TRIGGER IF EXISTS account_deletion_forgets_photo ON registry.account_deletion_requests;
DROP FUNCTION IF EXISTS registry.forget_photo_of_deleted_account();
DROP TABLE IF EXISTS registry.user_photos;
