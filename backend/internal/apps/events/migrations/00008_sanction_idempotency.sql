-- Хяналтын хорооны шийдвэрийг давхар бүртгэхээс хамгаална.
--
-- Апп шийдвэр илгээхдээ `Idempotency-Key` (UUID) толгой хавсаргаж болно.
-- Сүлжээ тасарч дахин илгээсэн ижил түлхүүр, ижил шийдвэр гаргагчийн
-- хүсэлт шинэ мөр үүсгэхгүй — анхны шийдвэрийг буцаана, оноо хоёр дахь удаа
-- хасагдахгүй. Түлхүүргүй хүсэлт хуучнаараа ажиллана.

-- +goose Up
ALTER TABLE events_sanctions ADD COLUMN IF NOT EXISTS idempotency_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS events_sanctions_idempotency
    ON events_sanctions (tenant_id, actor_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS events_sanctions_idempotency;
ALTER TABLE events_sanctions DROP COLUMN IF EXISTS idempotency_key;
