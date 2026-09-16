# SDY production — 2026-09-16

**Гурван ажлын хэрэгжилт https://e-sdy.mn дээр ажиллаж байна.**
Production баталгаажуулалт: **2026-09-16 12:15:43, Улаанбаатар**.
Нийтийн HTTPS шалгалт: **12:16:25**.

- Release commit: `72112a977c18a9d31d82b207903b4a94c3804193`.
- [PR #9](https://github.com/BunnyMN/sdy/pull/9) main-д нэгтгэгдсэн:
  `b6c25135e467fc6e6a70e5a70df0b92ad81f16c5`.
- Release болон merge commit-ийн source tree ижил:
  `5ba5d230ef44e45d22c6bbac25b2cc42ef7f6701`.
- Backend, frontend хоёул release SHA-тай Docker image ашиглаж байна.
- Core **113**, Events **1.2.0 / schema 4**, Membership **1.1.0 / schema 2**.
- Таван нийтлэгдсэн салбарын **10/10 суулгалт** шинэчлэгдсэн. Өөр хоёр хуучин
  Events суулгалт startup catalog sync-ээр мөн 1.2.0 болсон; бүх tenant нийлээд 12.

## Юу гарсан

Үндсэн харьяалал ба ажилтны эрх тусдаа болсон; хураамжийг идэвхтэй үндсэн гишүүнд
ногдуулж, шилжсэн сард хоёр салбарт давхар ногдуулахгүй. Admin-ийн шалтгаантай
гишүүнчлэлийн төлөвийн өөрчлөлт, хувийн profile, салбар дамнасан өөрийн түүх,
апп доторх мэдэгдэл, manager/admin бүртгэл болон салбарын нэгтгэл нэмэгдсэн.

Хэрэгжилтийн дүрэм, API, өгөгдлийн хамгаалалтыг
[SDY_IMPLEMENTATION_2026-09-15.md](SDY_IMPLEMENTATION_2026-09-15.md),
ашиглах зааврыг [SDY_PWA.md](SDY_PWA.md)-аас уншина.

## Дахин шалгасан үр дүн

| Шалгалт | Үр дүн |
| --- | --- |
| PostgreSQL/Redis-тэй backend race suite | **822 тест/дэдтест PASS, 0 FAIL, 0 SKIP**, 61 тесттэй package |
| `go vet`, golangci-lint 2.1.6 | PASS, **0 issue** |
| Frontend unit | **198 PASS**, 34 файл |
| Frontend lint, TypeScript | PASS; өмнөх 32 lint warning хэвээр |
| Локал production webpack build | PASS |
| Linux production Docker build | Backend PASS; frontend стандарт **Turbopack build PASS** |
| Playwright | **29 PASS** + landing **12 PASS** |
| Hostname isolation, API boundary, PWA cache/retry | PASS |
| Монгол/англи i18n | PASS; бусад таван хэлний 6625 орчуулгын backlog хэвээр |
| Production preflight | Давхардсан хүн/сарын charge **0**; admin-аар primary сонгуулах legacy хүн **1** |
| Production backup restore | Тусгаарласан DB-д сэргээж migration, өгөгдөл, эрхийг шалгасан — PASS |
| Шинэ image дээр нэвтэрсэн API journey | Profile privacy, manager/admin эрх, QR давталт, хэсэгчилсэн төлөлт, мэдэгдэл, шилжилт/session revoke, хуучин түүх, ижил сарын charge, lifecycle — PASS |
| Нийтийн HTTPS | Landing/login + шинэ 5 дэлгэц **200**, шинэ 6 хамгаалагдсан API нэвтрээгүй үед **401**, JS asset-ууд **200**, www **200** |
| Production login config | Шууд **eID enabled**; ерөнхий federated SSO-ийн `enabled=false` нь тусдаа тохиргоо |
| Runtime | Backend/PostgreSQL/Redis healthy; frontend HTTP шалгалт PASS; restart count бүгд 0 |

Core 113→111→113, Events 4→3→4, Membership 2→1→2 round trip болон legacy backfill
нь өмнөх хэрэгжилтийн шалгалтаар батлагдсан. Энэ удаа full backend/unit/browser
suite-ийг шинэ `sdy_release_20260915` санд давтан ажиллуулсан.

Browser suite нь API fixture ашигладаг. Жинхэнэ session, SQL role/RLS тестүүд
Go suite-д; Docker image-ийн HTTP journey нь production backup-аас сэргээсэн,
гадаад сүлжээгүй орчинд үүсгэсэн **хиймэл хэрэглэгчдээр** ажилласан. Production-д
туршилтын хэрэглэгч, ирц, төлөлт үүсгээгүй. Физик утас болон бодит eID нэвтрэлтийн
хүлээн авалтыг хийсэн гэж тооцохгүй.

## Өгөгдөл ба backup

Cutover-ийн өмнө/дараа **3 хэрэглэгч, 29 tenant, 30 membership, 1 event,
0 attendance, 0 charge, 0 payment** гэсэн тооллого таарсан. Membership-ийн
ажиллах төлөв болон role холбоосуудын hash өөрчлөгдөөгүй. Migration-аар 1 үндсэн
харьяалал тогтсон; олон салбартай хүний work access хадгалагдсан.

Сервер дээр зөвхөн root унших backup/evidence:
`/var/backups/sdy/release-20260915-membership/`.

- `before.dump`: rehearsal-д сэргээж шалгасан эхний backup.
- `cutover.dump`: frontend/backend-ийг зогсоосны дараах шинэ backup, **367683 byte**.
  SHA-256: `fb6ac6259c9b24374a90e99c6a5f6cad9229ecd24a0b3ddf1394f67981f64918`.
- `.env`, `docker-compose.prod.yml`, `brand/`, `roles.sql`, `database-properties.json`:
  хуучин тохиргоо, role definition, database тохиргоо.
- `release-images.tar`: шалгасан хоёр image-ийн offline нөөц, **691962368 byte**.
  SHA-256: `fb7604a51efadade337fced47854a77b88101bab16b5a8e8e240f9bdb4cb4716`.
- Build/migration/startup лог, `prepared.json`, `rehearsed.json`, `production.json`.
- Deployment скрипт: `/opt/sdy/releases/remote-release-20260915.py`.
- Эх код: `/opt/sdy/releases/72112a977c18a9d31d82b207903b4a94c3804193/`.

Restore хийхдээ database-level **`search_path = workspace, registry, operator`**,
**`TimeZone = UTC`**-г сэргээнэ. Existing DB-д `pg_restore` хийх нь эдгээр
тохиргоог дангаараа сэргээхгүй. Rehearsal-аар энэ нөхцөлийг баталсан.
Тусгаарласан container/network болон локал туршилтын PG/Redis-ийг цэвэрлэж,
backup, image archive, нотолгоог хадгалсан.

## Manual release ба дараагийн restart

GitHub Actions нь account billing/spending limit-ээс болж job эхлүүлээгүй.
Серверийн registry push `unauthorized` тул шинэ image-ууд GHCR-д **нийтлэгдээгүй**.
Ижил эх кодын локал тестүүд болон сервер дээрх бодит Docker/restore/HTTP
шалгалтуудаар баталгаажуулж manual deploy хийсэн.

`/opt/sdy/.env` дахь `IMAGE_TAG` нь release SHA. Серверийн compose дэх
`migrate`, `backend`, `frontend`-ийн `pull_policy`-г **missing** болгосон:
байгаа immutable image-ийг жирийн restart үед дахин татахгүй. Энэ нь
серверийн deployment тохируулга; repository-ийн ерөнхий compose template-ийг
өөрчлөөгүй. `docker compose pull` хийж шинэ tag татах боломж registry-д нийтлэх
хүртэл байхгүй. Image устсан бол `release-images.tar`-аас `docker image load`
хийж сэргээнэ; checksum болон JSON дахь image ID-уудыг тулгана.

Schema шинэчлэгдсэн сан дээр хуучин backend image-ийг дангаар буцаахгүй.
Core Down нь шинэ харьяалал, түүх, мэдэгдлийн өгөгдөл устгах тул live сан дээр
шууд ажиллуулахгүй. Rollback шаардвал cutover backup + хуучин image/config-ийг
тусгаарласан орчинд эхэлж сэргээж шалгана; backup-аас хойших бодит өөрчлөлтийг
хадгалах/тулгах төлөвлөгөөг гаргана.

## Дараагийн эхлэх цэг

1. Олон салбартай legacy хүний үндсэн харьяаллыг тухайн салбарын admin-аар батлуулна.
2. Бодит Android/iPhone дээр eID → элсэлт → ирц → мэдэгдэл → шилжилт → түүхийг хүлээн авна.
3. GitHub billing болон GHCR бичих эрхийг сэргээж автомат release урсгалыг хэвийн болгоно.

Нотолгоо: [SDY_PRODUCTION_EVIDENCE_2026-09-16.json](SDY_PRODUCTION_EVIDENCE_2026-09-16.json).
Локал raw лог: `/private/tmp/sdy-production-20260915/`.
