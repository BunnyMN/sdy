# SDY eID нэвтрэлт — 2026-09-16

**Төлөв: 2026-09-22-нд хаагдсан. Production-д QR нэвтрэлт сэргэсэн.**
Хэрэглэгчийн зураг: 13:48, Улаанбаатар. Оношилгоо: 13:49–13:54.

## 2026-09-22 — шинэ RP API secret-ээр батлагдсан хаяг

Хэрэглэгчийн өгсөн шинэ загварын RP API secret (`rp_sk_…`, утгыг баримтад
оруулаагүй)-ээр шалгав. Цаг: 13:17, Улаанбаатар.

| Шалгалт | Үр дүн |
| --- | --- |
| `POST https://eidmongolia.mn/v3/authentication/device-link/anonymous` | **404**, Next.js вэбсайтын HTML — API биш |
| `POST https://api.ca.eidmongolia.mn/v3/...` | 200 JSON, гэхдээ TLS hostname зөрүүтэй хэвээр (зөвхөн public key pin-тэй шалгасан) |
| **`POST https://ca.eidmongolia.mn/v3/...`** | **200 JSON, TLS бүрэн баталгаажсан** — `sessionID`, `sessionToken`, `sessionSecret`, `deviceLinkBase=https://ca.eidmongolia.mn/dl`, `vc` |
| `GET https://ca.eidmongolia.mn/v3/session/{id}?timeoutMs=3000` | **200** `{"state":"RUNNING"}` |
| Хуучирсан `relyingPartyUUID`-тай биетэй ижил хүсэлт | **200** — шинэ API нь UUID-г шалгахгүй, зөвхөн `Bearer` secret |

**Дүгнэлт:** eID нь RP API-г `eidmongolia.mn/v3` → `ca.eidmongolia.mn/v3` руу
шилжүүлсэн бөгөөд хуучин зам дээр маркетингийн вэбсайт сууснаас HTML 404 ирж
байсан. `api.ca.` хостыг ашиглах шаардлагагүй: `ca.` хост нь хүчинтэй
сертификаттай тул production-д TLS шалгалт сулруулахгүй.

`eidrp` client-ийн хүсэлтийн формат, `vc`-г мөр болгон уншдаг parser, poll зам
шинэ API-тай тохирсон тул кодын логикт засвар хийгээгүй. Зөвхөн хаягийн
анхдагчийг шинэчилсэн: `.env.example`, `docker-compose.prod.yml`,
`.github/workflows/deploy.yml`, `eidrp.go` (`defaultBase`), `eidmongolia.go`.

**Хэрэгжүүлэлт:**

- BunnyMN/sdy repo-д `vars.EID_BASE_URL=https://ca.eidmongolia.mn/v3` болон
  `secrets.EID_RP_SECRET` (шинэ түлхүүр) тавигдсан.
- Production `/opt/sdy/.env` шинэчлэгдэж backend дахин асав.
- Батлагдсан: `POST https://e-sdy.mn/api/v1/auth/eid/start` → **200**,
  `session_id` + `verification_code` буцаж байна (өмнө нь 502).
- Утсаар бүрэн нэвтрэх (QR уншуулж, PIN оруулаад гишүүний нүүрт буцаж ирэх)
  шалгалтыг хэрэглэгч өөрийн төхөөрөмж дээр хийж баталгаажуулна.

**Үлдсэн ажил:**

- `fix(eid): point the relying-party client at ca.eidmongolia.mn` commit
  `3cba2c02` нь `feat/admin-approved-transfers` салбарт байна; main-д нийлэх
  хүртэл repo-гийн анхдагч хаяг хуучин хэвээр (runtime-д GitHub variable дарж
  байгаа тул production-д нөлөөгүй).
- RP secret чат мессежээр дамжсан тул eID-ээс шинээр солиулж, GitHub secret-ийг
  дахин шинэчлэх.

**GitHub Actions:** төлбөр унасан биш — GitHub Free-ийн 2,000 минут дуусаж,
spending limit $0 байснаас job-ууд эхлээгүй (`sdy` $12.29, `Basu` $1.09;
хязгаар 10-р сарын 1-нд шинэчлэгдэнэ). 2026-09-22-нд repo-г public болгосноор
Actions минут тоологдохоо больж CI/deploy сэргэсэн.

## 2026-09-18 — санал болгосон шинэ API хаягийг шалгасан

Хэрэглэгчийн өгсөн `https://api.ca.eidmongolia.mn/` хаягийг SDY production
серверээс шалгав. Нэмэлт routing шалгалтын цаг: **10:09, Улаанбаатар**.

| Шалгалт | Үр дүн |
| --- | --- |
| Шинэ host-ийн DNS | `103.229.177.86` |
| Ердийн HTTPS, сертификатын баталгаажуулалттай | **FAIL — hostname mismatch**; HTTP хүсэлт хүрэхээс өмнө тасарсан |
| Сертификатын CN | `ca.eidmongolia.mn` |
| Сертификатын SAN | `api.ca.eidmongolia.mn` **байхгүй** |
| Сертификатын хугацаа | 2026-09-14–2026-12-13 UTC; илэрсэн алдаа нь нэрийн зөрүү |
| Шинэ host: `GET /` — зөвхөн routing оношилгоо | **200 text/html** |
| Шинэ host: `POST /v3/authentication/device-link/anonymous` — зөвхөн routing оношилгоо | **401 application/json**; `RP authentication шаардлагатай (Bearer API secret эсвэл mTLS)` |
| Шинэ host: `POST /authentication/device-link/anonymous` — зөвхөн routing оношилгоо | **404 text/html** |
| Одоогийн provider-ийн `/v3/authentication/device-link/anonymous` | **404 text/html** хэвээр |
| SDY `POST /api/v1/auth/eid/start` | **502 application/json**, session үүсээгүй |
| Backend | Docker health **healthy**, release `72112a97`, mock **false** |

Routing оношилгооны гурван хүсэлтэд **зөвхөн тусдаа шалгах скрипт дотор**
сертификат шалгахыг алгассан. RP secret, UUID, cookie, хувийн мэдээлэл илгээгээгүй;
redirect дагаагүй. Эдгээр хариу нь хүчинтэй HTTPS холболт эсвэл амжилттай
нэвтрэлтийг батлахгүй. Production-ийн TLS шалгалт, тохиргоог өөрчлөөгүй.

**Дараагийн шаардлагатай засвар:** eID provider нь `api.ca.eidmongolia.mn`
нэрийг агуулсан сертификат гаргаж, уг host-ийн TLS/SNI тохиргоонд байршуулна.
Үүний дараа `https://api.ca.eidmongolia.mn/v3` хаягт одоогийн RP credentials-аар
anonymous QR session үүсгэж шалгана. Амжилттай бол runtime болон дараагийн
deployment-ийн `EID_BASE_URL`-ийг хамт шинэчилнэ. Одоогоор хаягийг шилжүүлээгүй,
RP credentials шинэ API дээр ажиллах эсэх болон утсаар бүрэн нэвтрэх нь шалгагдаагүй.

## Батлагдсан нөхцөл

- Production `POST /api/v1/auth/eid/start` → **502 JSON**,
  `eID Mongolia session could not be started`; session үүсээгүй.
- Backend 13:48:53 лог: configured provider-ийн initiate дуудлага →
  **404**, JSON бус HTML хуудас.
- Provider руу нууц/хувийн мэдээлэлгүй шууд POST:
  `https://eidmongolia.mn/v3/authentication/device-link/anonymous` → **404 text/html**.
- `eidmongolia.mn` A хаяг: `38.180.117.155`. SDY host: `5.45.65.164`.
- Backend healthy, release `72112a977c18a9d31d82b207903b4a94c3804193`.
- Runtime `EID_BASE_URL=https://eidmongolia.mn/v3`, mock false,
  certificate level ADVANCED. RP UUID/secret тохируулагдсан бөгөөд deployment-ийн
  өмнөх backup-тай **ижил**. Утгуудыг хэвлээгүй/баримтад оруулаагүй.
- Өмнөх production backend `cf09ae79`-оос release `72112a97` хүртэл
  `backend/internal/workspace/identity` болон `backend/internal/kernel/eidrp`
  кодод diff байхгүй.
- [Provider-ийн нийтэлсэн integration заавар](https://eidmongolia.mn/api/integration)
  мөн `/v3` RP API хаяг заасан. Web-ийн cached баримт нь API яг одоо ажиллаж буйг нотлохгүй.

## Дүгнэлт ба үлдсэн ажил

eID provider-ийн API зам дээр HTML 404 ирж байгаа нь routing/service deployment-ийн
зөрүү байж болзошгүй. Upstream nginx/service тохиргоог хараагүй тул яг ямар
өөрчлөлт гарсныг батлаагүй. SDY нууцыг солих үндэслэл илрээгүй.

1. eID хариуцагчаас API base өөрчлөгдсөн эсэхийг тодруулна.
2. Хаяг өөрчлөгдөөгүй бол provider серверийн `/v3/` reverse proxy, API upstream
   болон service төлөвийг шалгаж сэргээнэ. Тухайн серверт өөрчлөлт хийгээгүй.
3. Шинэ API хаяг баталгаажвал SDY-ийн server-side `EID_BASE_URL` болон дараагийн
   deployment-ийн тохиргоог ижил шинэчилнэ. Нууц түлхүүрийг таамгаар сонгосон
   өөр хостод илгээхгүй.
4. Дараа нь SDY-ээр anonymous QR session start **200** ба session handle ирснийг
   нууцгүйгээр шалгаад, хэрэглэгч өөрийн төхөөрөмжөөр eID баталгаажуулж гишүүний
   нүүрт буцаж ирэхийг хүлээн авна. Зөвхөн config enabled/HTTPS 200 хангалтгүй.

GitHub Actions billing нь тусдаа асуудал; энэ provider-ийн 404-ийн шалтгаан гэдгийг
баталсан зүйл байхгүй. Mock нэвтрэлт асаах, authentication-ийг тойрох, RP нууц солих,
гишүүний өгөгдөл өөрчлөх үйлдэл хийгээгүй.

Нотолгооны raw файл: `/private/tmp/sdy-eid-20260916/probe-results.json`.
[Гараар шалгах зааврын T02](SDY_MANUAL_TEST_2026-09-16.md): desktop Chrome дээр
хэрэглэгчийн мэдээлсэн **FAIL**. Android/iPhone бүрэн нэвтрэлтийг шалгасан гэж тооцохгүй.
