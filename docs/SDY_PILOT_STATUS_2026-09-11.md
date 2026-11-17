# SDY — 2026-09-11-ний ажлын төлөв

## Одоогийн төлөв — улаан дээд цэсийг буцаасан

Хэрэглэгчийн хүсэлтээр улаан header-ийн өөрчлөлтийг буцаав.
Production frontend дахин `2a4b2b33eca753763e21678eb28d741a5012103e`.
Кодын revert commit `55d96fe9`; tracked tree нь `2a4b2b33`-тай ижил.
Нүүр ба backend health PASS. Буцаалтын баримт:
`/var/backups/sdy/rollback-header-bcca0587/result.json`.
Доорх улаан header-ийн тэмдэглэл нь түүхэн, одоо ажиллаж буй хувилбар биш.

## Дээд цэсний өнгө — хэрэглэгчийн хүсэлт

Production frontend: `bcca058745099ddd9bd039622218b5c330ec9ecc`.
Логоны PNG захын өнгөтэй ижил `#9C1D25` фонтой header/mobile menu,
цайвар текст, товч ба focus төлөвтэй. Light/dark горимд өнгө ижил.
Build, өмнөх 12 landing browser тест PASS; production 375/1280px light/dark
өнгө, цэс, overflow, JS алдаагүйг баталгаажуулсан. Backend container хэвээр.
Release record: `/var/backups/sdy/release-bcca058745099ddd9bd039622218b5c330ec9ecc/`.

## Хамгийн сүүлийн шинэчлэлт — нийтийн landing page

Production frontend: `2a4b2b33eca753763e21678eb28d741a5012103e`.
Backend код, ажиллаж буй container `cf09ae79` хэвээр; шинэ migration байхгүй.
Compose-ийн IMAGE_TAG-д тааруулах backend image alias нь өмнөхтэй byte-identical.

- `https://e-sdy.mn/` дээр SDY-ийн танилцуулга, боломжууд, элсэх гурван алхам,
  FAQ болон e-ID нэвтрэх холбоостой шинэ light/dark landing ажиллаж байна.
- Локал 12 landing + өмнөх 23 browser, 198 unit тест PASS; TypeScript,
  өөрчилсөн файлуудын ESLint, production webpack болон серверийн build PASS.
- Бодит production 375/768/1280px × light/dark: HTTP 200, overflow 0,
  JS error 0. Mobile menu, FAQ, login handoff, хуучин `/trust` redirect PASS.
- Нөөц `/var/backups/sdy/nexus-20260911-075407.sql.gz` (56,462 байт).
  Release record: `/var/backups/sdy/release-2a4b2b33eca753763e21678eb28d741a5012103e/`.
- PR #9 шинэчлэгдсэн; image сервер дээр build хийгдсэн, GHCR-д push хийгээгүй.

## Одоогийн төлөв — админ батлах шилжилт ба Gerege UI

Production backend/frontend: `cf09ae793f1fb30b53d5ab373994fb7f7d74d598`.
Core migration 111; backend healthy, frontend/member HTTP 200.
PR: https://github.com/BunnyMN/sdy/pull/9 (нээлттэй, merge хийгээгүй).

- Очих байгууллагын идэвхтэй admin шилжилтийг батлах/татгалзах эрхтэй.
  Manager энгийн элсэлт батлах эрхээ хадгална, шилжилт батлахгүй.
- Хүлээгдэж байх үед хуучин харьяалал хэвээр. Баталбал сонгосон хуучин
  харьяалал идэвхгүй болж, шинэ байгууллагад зөвхөн user эрх авна.
  Хуучин session хүчингүй болно; ирц, оноо, хураамжийн түүх хадгалагдана.
- Гишүүний PWA болон нэвтрэх дэлгэцийг Gerege Design Research дүрмээр
  шинэчилсэн. Хүрээ, шийдвэр, үлдсэн төхөөрөмжийн шалгалт:
  [SDY_DESIGN_REVIEW.md](SDY_DESIGN_REVIEW.md).
- Локал Go race 799 тест/61 package/0 skip, frontend 198 unit, 23 Playwright
  тест PASS. go vet, golangci-lint v2.1.6 (0 issues), TypeScript, build PASS.
- Production: Дархан сум руу хүсэлт → татгалзах/цуцлах/батлах, manager болон
  буруу байгууллагын admin хориглох, session хүчингүй болох, түүх хадгалах PASS.
  Demo manager-ийн бодит browser login, шинэ цэс, зөвшөөрөлгүй шилжилтийн
  дэлгэц, logout PASS; JS error болон overflow 0.
- Түр өгөгдөл, credential JSON файлууд цэвэрлэгдсэн: users=3, original events=1,
  dues charges=0, transfers=0, smoke users=0. Дархан demo manager хадгалагдсан.
- GitHub Actions billing/spending-limit шалтгаанаар runner эхлээгүй.
  Бүрэн локал шалгалтын дараа хоёр Docker image-ийг production сервер дээр
  build хийж, `--pull never` ашиглан байршуулсан. Image-үүд серверт байгаа;
  GHCR-д энэ release-ийг push хийгээгүй.
- Өмнөх backup: `/var/backups/sdy/nexus-20260911-071002.sql.gz`.
  Дараах backup: `/var/backups/sdy/nexus-20260911-072159.sql.gz`.
  Серверийн баримт: `/var/backups/sdy/release-cf09ae793f1fb30b53d5ab373994fb7f7d74d598/result.json`.

Доорх хэсгүүд нь өмнөх шалгалтын түүхэн тэмдэглэл; шилжилтийн тухай
хариу хүлээж байсан төлөвийг дээрх хэрэгжилт орлосон.

## Дархан сумын demo manager — дараагийн шинэчлэлт

Хэрэглэгч Дархан сум дээр туршихыг заасан тул `demo.manager.darkhan@sdy.test`
гэсэн тусдаа туршилтын хэрэглэгчийг үүсгэв. Зөвхөн Дархан сумын SDY-д
идэвхтэй `user` + `manager` role-той, global admin=false. Бусад байгууллагад
эрх олгоогүй, санхүүгийн эрхгүй. Нэвтрэх мэдээллийг эзэмшигчид зориулсан
0600 эрхтэй тусдаа local файлд өгсөн; нууц үгийг энэ баримт/GitHub-д бичээгүй.

- Production API: нэвтрэлт, элсэх хүсэлт батлах, event үүсгэх, QR ирц PASS.
- Admin role удирдах, санхүү, аймгийн байгууллага руу орох нь 403.
- Chromium гар утасны дэлгэцээр жинхэнэ формоос нэвтэрч /member нээгдсэн;
  manager хүсэлтийн цэс, event цэс харагдсан; page error=0, overflow=0; logout=200.
- Түр туршилтын нэмэлт хэрэглэгч болон event цэвэрлэгдсэн. Demo manager үлдсэн.
- Одоогийн users=3, original events=1; хураамжийн тохиргоо=0.
- Нэвтрэлтийн туршилтын session-уудыг хааж, түр credential JSON файлуудыг устгасан.

**Шилжилт:** admin зөвшөөрөх шаардлага батлагдсан. Хуучин/шинэ/аймгийн
аль admin батлах тухай async асуулт одоогоор хариу хүлээж байна.
Шилжилтийн schema/API/UI хараахан хэрэгжүүлээгүй. Manager шинэ элсэлт
батлах эрхээ хадгална; шилжилт батлах эрх олгохгүй.

Доорх нь demo manager үүсгэхээс өмнөх шалгалтын түүхэн төлөв.

Production: `b09e1dae47279dba16c7b7dbac92c9f0584c839c`, backend/frontend healthy.
PR: https://github.com/BunnyMN/sdy/pull/8 (feat/member-onboarding).
CI: https://github.com/BunnyMN/sdy/actions/runs/34557210886 — success.
Deploy: https://github.com/BunnyMN/sdy/actions/runs/34558441581 — success.

## Хэрэгжүүлсэн ба шалгасан

- Идэвхгүй болсон байгууллагын гишүүний хуучин session 401 болно.
- Сонгосон олон байгууллагын хүрээг идэвхтэй гишүүнчлэл, одоогийн lifecycle
  кэшийн шийдвэрээр хязгаарлаж, дараа нь RLS-д дамжуулна.
- Membership 1.0.1: идэвхгүй гишүүнд шинэ хураамж ногдуулахгүй;
  өмнөх ногдуулалт/төлөлтийн түүх хадгалагдана. Таван байгууллагад current.
- PWA суулгах санал browser storage хаалттай үед ажиллаж, SDY icon хэрэглэнэ.
- 198 frontend unit test, CI-ийн browser/build/дөрвөн backend shard,
  заавал ажиллах PostgreSQL/RLS/session/dues тестүүд бүгд PASS.
- Production API: login → салбарын хүсэлт → manager батлах → QR → оноо PASS.
  Давхар оноо үүсээгүй, member event үүсгэж чадаагүй, manager finance болон
  role удирдах эрх аваагүй. Хаалттай байгууллага сонгогдоогүй; гишүүнчлэл
  идэвхгүй болгоход хуучин session ажиллаагүй.
- Тестийн өгөгдөл цэвэрлэсний дараа users=2, personal=2, active organisation=5,
  suspended organisation=21, original event=1, smoke users=0.
- Chromium гар утасны хэмжээ: page/manifest/installability алдаа 0, overflow 0.
- Бодит eID provider-ийн QR хүсэлт HTTP 200: session ба баталгаажуулах код үүссэн.
  Хүний eID зөвшөөрөл, Android/iPhone дээр PWA руу буцаж ирэхийг шалгаагүй.

## 1–3 ажлаас мэдээлэл/төхөөрөмж хүлээж буй хэсэг

1. Бодит Android/iPhone-ийн суулгалт, eID зөвшөөрөл ба буцах урсгал.
2. Нэг үндсэн сум эсвэл олон харьяалал, шилжилт/түүхийн дүрэм;
   дөрвөн сумын manager болон санхүүгийн ажилтны бүртгэлтэй email/user ID.
3. Сарын хураамжийн дүн, эцсийн өдөр, банк/данс/эзэмшигч, эхлэх сар,
   элссэн эхний сарын болон чөлөөлөлтийн дүрэм, event-ийн оноо.

Эдгээрийг өмнө async асуултаар хүссэн; 2026-09-11-ний энэ шалгалтын үед
хариу ирээгүй. Дур мэдэн manager/admin эрх томилоогүй, хураамж идэвхжүүлээгүй:
settings=0, charges=0. Үндсэн сумын шинэ дүрэм хараахан хэрэгжээгүй.
Бодит төхөөрөмжийн заавар: [SDY_PILOT.md](SDY_PILOT.md).

Өмнөх 21 байгууллага suspend хэвээр; hard delete болон хоёр админы
устгах хүсэлт эхлүүлээгүй. Үүнийг устгасан гэж тайлагнахгүй.

Нөөц: шинэчлэлтийн өмнө `/var/backups/sdy/nexus-20260911-025720.sql.gz`,
тестийн өгөгдөл цэвэрлэсний дараа `/var/backups/sdy/nexus-20260911-033426.sql.gz`.
Туршилтын нууц үгийн local/server файлуудыг устгасан. PR #8 тайлбарыг үр дүнгээр шинэчилсэн; merge хийгээгүй.
