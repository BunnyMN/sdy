# SDY хөгжүүлэлтийн төлөв — 2026-09-09

> Энэ файл анхны үнэлгээний түүхэн snapshot. 2026-09-10-ны production PWA,
> Дархан-Уул + дөрвөн сумын бүтэц, шалгалт, хязгаар болон дараагийн ажил:
> [SDY_PRODUCT_PLAN.md](SDY_PRODUCT_PLAN.md), [SDY_PWA.md](SDY_PWA.md).
> Доорх «серверт SSH-ээр ороогүй», «QR/оноо/хураамж байхгүй» гэдэг нь
> шинэ rollout-ын төлөв биш, анхны үнэлгээ хийсэн үеийн нөхцөл юм.

Энэ нь код, баримт, Git түүх, GitHub Actions болон локал шалгалтад тулгуурласан тухайн өдрийн үнэлгээ. Хөгжүүлэлт үргэлжлэхэд commit болон шалгалтын үр дүнг шинэчилнэ.

**Ерөнхий дүгнэлт.** SDY нь Gerege Nexus-ийн олон байгууллага дэмждэг суурин дээр холбооны нэр, өнгө, домэйн, нэвтрэлт, элсэлтийн урсгалыг тохируулсан distribution юм. Платформын суурь боломжууд өргөн, тестийн хамрах хүрээ сайн. Холбооны өөрийн бизнес үйл ажиллагаа анхны Events MVP шатанд байна. Дараагийн бодит ажил нь Events-ийн найдвартай байдлыг бэхжүүлэх, хэрэглэгчийн бүтэн урсгалыг шалгах, дараагийн бизнес модулийн шаардлагыг тогтоох.

**Үнэлгээний суурь ба хамрах хүрээ**

| Үзүүлэлт | Тухайн үеийн төлөв |
| --- | --- |
| Репо | `BunnyMN/sdy`, ажлын хавтас `open-gerege-nexus/` |
| Салбар / commit | `main` / `debe50fef611ea951f0161b2d6f878d4e1d5986e` |
| Commit-ийн огноо | 2026-09-07, 13:54, UTC+08 |
| Upstream | `gerege-systems/open-gerege-nexus`; локал `upstream/main` нь `1a2a592a` |
| SDY өөрчлөлт | Дээрх upstream snapshot-аас 16 commit, 64 файл, +2556 / −724 мөр |
| Backend | Go 1.26; 445 Go файл, үүнээс 172 тестийн файл |
| Frontend | Next.js 16.3.3, React 19, TypeScript 5.9.3, Tailwind 3.4 |
| Өгөгдөл | PostgreSQL; 108 үндсэн SQL migration, Events-ийн 1 тусдаа migration |
| API | Route golden snapshot-д 214 method/path бүртгэл; Events 10 |
| Өөрийн бизнес апп | Каталогт `mn.sdy.events`, хувилбар `1.0.0` |

48 Markdown баримтыг бүртгэж, үндсэн архитектур, танилт, модуль, тайлан, гарын үсэг, ажиллагаа, runbook, SDY, native клиент болон хөгжүүлэлтийн заавруудыг судалсан. Орчуулгын баримтуудын бүтэц, техникийн тайлбарыг одоогийн кодтой харьцуулсан. `CHANGELOG.md`-ийн хувилбаруудын дараалал, гол өөрчлөлтүүдийг, `Unreleased` хэсэг болон SDY-ийн 16 commit-ийн тайлбарыг дэлгэрэнгүй үзсэн. Хуучин бүх commit-ийн diff, changelog-ийн түүхэн догол мөр бүрийг бүрэн аудитлаагүй.

Репод production-ийн runtime лог, бодит `.env` байгаагүй. GitHub Actions-ийн ажилласан төлөв, deploy алхмууд, өмнөх CI алдааны логийг шалгасан. Серверт SSH-ээр ороогүй; бодит хэрэглэгчийн өгөгдөл, Docker/nginx/DB/audit лог, backup болон monitoring-ийн ажиллагааг энэ үнэлгээгээр баталгаажуулаагүй.

**Кодын бүтэц ба баримтлах гэрээ**

| Байршил | Үүрэг, цаашдын ажилд анхаарах зүйл |
| --- | --- |
| [backend/pkg/host](../backend/pkg/host/) | Процесс эхлүүлэх, тохиргоо, DB, dependency холбох, router угсрах |
| [backend/internal/kernel](../backend/internal/kernel/) | Нийтлэг дэд бүтэц, `dbguard`, аюулгүй байдал, telemetry |
| [backend/internal/workspace](../backend/internal/workspace/) | Байгууллагын танилт, эрх, гишүүнчлэл, апп суулгалт, тайлан, signing |
| [backend/internal/person](../backend/internal/person/) | Хүний үндсэн орчин, байгууллага хайх, элсэх хүсэлт |
| [backend/internal/operator](../backend/internal/operator/) | Платформын удирдлагын тусдаа орчин |
| [backend/pkg/nexus](../backend/pkg/nexus/) | Бизнес модулийн нийтийн SDK; нийцэл, golden snapshot, CODEOWNERS дүрэмтэй |
| [backend/internal/apps/runtime.go](../backend/internal/apps/runtime.go) | Бинарьт багтах бизнес модулийг бүртгэнэ; одоо `events.New(p)` |
| [catalog/apps.json](../catalog/apps.json) | Апп каталог; manifest, permission, menu, хувилбар нь модулийн кодтой таарах ёстой |
| [frontend/app](../frontend/app/) | Нэвтрэлт, байгууллага, оператор болон модулийн дэлгэцүүд |
| [brand/copy.json](../brand/copy.json) | SDY нэршил, нүүр хуудасны үг хэллэг; өнгө, домэйнтай холбоотой утгууд мөн env-ээр ирнэ |
| [native-apps](../native-apps/) | macOS, Windows, iOS, Android клиент; shared IPC, token kit болон тусдаа build/release урсгалтай |
| [.github/workflows/deploy.yml](../.github/workflows/deploy.yml) | SDY image бүтээх, серверийн env бичих, migration болон rollout хийх бодит заавар |

`workspace`, `person`, `operator` орчны импортын хил тестээр хамгаалагдсан. Бизнес модуль `pkg/nexus` гэрээг ашиглана. Модулийг каталогт нэмэхээс гадна backend бинарьт компайлдаж бүртгэх шаардлагатай; каталог нь гүйцэтгэх код татдаг механизм биш.

Өгөгдөл `workspace`, `registry`, `operator` schema-д хуваагдана. Tenant query-ийн нөхцөл болон PostgreSQL RLS давхар хамгаална. `dbguard` нь `PrepareConn` дээр role, идэвхтэй tenant, зөвшөөрөгдсөн tenant-ууд, хүний context-ийг тавьдаг. Шинэ SQL, migration дээр энэ тусгаарлалтыг хадгална. Операторын cookie `cp_session`, байгууллагын session `session_token` тусдаа.

Frontend өөрчлөхийн өмнө [AGENTS.md](../frontend/AGENTS.md)-ийн дагуу суулгасан Next.js-ийн `node_modules/next/dist/docs/` зааврыг уншина. [CONTRIBUTING.md](../CONTRIBUTING.md)-ийн дагуу шинэ backend логик тесттэй, баримт монгол хэлээр, commit Conventional Commits хэлбэртэй байна.

**Одоо хэрэгжсэн боломж ба бүтээгдэхүүний шат**

- Платформ: password/eID/DAN/Google/federated OIDC танилт, session, байгууллага, эрх ба гишүүнчлэл, элсэлт/урилга, апп суулгалт, аудит, SSO provider, тайлангийн хөдөлгүүр, signing болон тохиргооноос хамаарах нэмэлт интеграцийн суурь бий. Production-д аль интеграц идэвхтэйг репогоос дангаар батлахгүй.
- SDY: улаан `#9c1d25`, мөнгөлөг `#e4e7ec` брэнд; `e-sdy.mn` болон `admin.e-sdy.mn`-д зориулсан deploy; байгууллага сонгож элсэх урсгал; операторын CORS/CSRF, урилга болон элсэлтийн RLS-ийн засварууд орсон.
- Events: байгууллага тус бүр суулгана. Гишүүн жагсаалт/дэлгэрэнгүй/оролцогчдыг харж, өөрөө бүртгүүлж, бүртгэлээ цуцална. Менежер/админ арга хэмжээ үүсгэж засах, төлөв солих, оролцогч нэмэх, ирц тэмдэглэх боломжтой.
- Events-ийн төлөв `planned/done/cancelled`, оролцогчийн төлөв `registered/attended/absent`. Багтаамж, эхлэх/дуусах цаг, байршил, тайлбар, ирцийн тэмдэглэлтэй. UI нь `/module/events`, `/module/events/[id]`.
- Events-д QR check-in, notification, хүлээлгийн жагсаалт, тусгай тайлан/экспорт, pagination хараахан хэрэгжээгүй. Нэгдсэн тайлангийн хөдөлгүүр байгаа ч Events тайлан бүртгээгүй.
- Холбооны гишүүний дэлгэрэнгүй бүртгэл, татвар/хураамж, салбарын төлөвлөгөө, төсөл хөтөлбөрийг дууссан бизнес модуль гэж тооцох үндэс алга. Хуучин documents/commerce зэрэг нэртэй UI, орчуулга байгааг тухайн backend апп бэлэн гэсэн нотолгоо гэж үзэхгүй.
- Native клиентүүдийн үндсэн endpoint, app identity болон release тохиргоо upstream Gerege Nexus-ийг заасан хэвээр. SDY-ийн desktop/mobile origin болон release бэлэн гэж тооцохгүй; SDY workflow-д `DEVICE_LINE_ORIGINS` нь web origin-оор тохируулагдсан.

**Сүүлийн хөгжүүлэлтийн дараалал**

| Огноо | Өөрчлөлт |
| --- | --- |
| 2026-09-05 | SDY брэнд, `e-sdy.mn` deploy, redirect дагах health check, public runner-оос шалгах, frontend cache бичих эрх |
| 2026-09-05–07 | Password form/eID тохиргоо ба алдааны лог, platform access mode env дамжуулалт, өнгө ба лого |
| 2026-09-07 | Migration 107: элсэх хүсэлт гаргасан хүнийг байгууллагын queue-д харах; 108: операторын урилга цуцлах UPDATE эрх; console origin CORS/CSRF засвар |
| 2026-09-07 | Published service-гүй байгууллагуудыг directory-д харуулах, салбарын нэрээр сонгож элсэх |
| 2026-09-07 | Events MVP, баримт, merge; дараа нь icon map болон route golden шинэчилсэн `debe50fe` |

**Хийсэн шалгалт**

| Шалгалт | Үр дүн ба хязгаар |
| --- | --- |
| Үндсэн migration | Тусгаарласан PostgreSQL дээр 108 хүртэл амжилттай |
| `go test -json -race -p 1 ./...` | 58 багц амжилттай; дэд тестүүдийг оруулаад 749 тестийн тохиолдол амжилттай. Алгассан individual тест байхгүй; 17 багц тестийн файлгүй |
| `go vet ./...` | Амжилттай |
| `npm test` | 32 файл, 193 тест амжилттай |
| `tsc --noEmit --incremental false` | Production build-ийн төрлүүдийг шинээр үүсгэхээс өмнөх шалгалт амжилттай |
| `npm run lint` | 0 алдаа, 31 warning |
| PWA / API / host / shell link / icon checks | Бүгд амжилттай; PWA 12 routing + 5 retry, API 47 core path, shell link 9, icon 17 |
| `i18n:check -- --warn` | Exit 0 боловч ar/zh/fr/ru/es хэл бүрд 1304 түлхүүр орчуулагдаагүй; нийт 6520. Warn горим нь орчуулга бүрэн гэсэн үг биш |
| Deploy allowlist Python тест | 6 тест амжилттай |
| Dashboard checker | 7 dashboard, 0 асуудал |
| Локал үндсэн `npm run build` | Эхлээд Google Fonts сүлжээний хориг; өргөтгөсөн эрхээр давтахад Turbopack процесс порт нээх орчны хоригоор зогссон |
| Локал `npm run build -- --webpack` | JS compile амжилттай, дараагийн generated PageProps TypeScript шалгалт Reports хуудас дээр унасан; доорх finding-ийг үзнэ |
| Playwright / host smoke / native build | Энэ үнэлгээнд ажиллуулаагүй; локал production build бүрэн дуусаагүй |

Backend шалгалт Go 1.26.6, PostgreSQL 16.14, Redis 8.6.2 дээр ажилласан; CI нь Redis 7 ашигладаг тул орчин яг ижил биш. Бүх DB test env-ийг түр DB рүү чиглүүлж integration тестүүдийг ажиллуулсан. Түр PostgreSQL/Redis процессыг дуусгаад зогсоосон. Frontend локал Node 22.22.0, npm 10.9.4; CI Node 20.

Одоогийн commit-ийн [CI](https://github.com/BunnyMN/sdy/actions/runs/34088577177), [Downstream](https://github.com/BunnyMN/sdy/actions/runs/34088577134), [Security](https://github.com/BunnyMN/sdy/actions/runs/34088577171) амжилттай. [Deploy](https://github.com/BunnyMN/sdy/actions/runs/34089196713) 2026-09-07 14:03 UTC+08 орчим амжилттай дууссан; image build/push, файл хуулалт, migration/restart, дотоод health болон public endpoint verification алхмууд ажиллаж амжилттай болсон. Энэ нь тухайн rollout-ын нотолгоо; өнөөдрийн runtime-ийн бүрэн эрүүл мэндийн аудит биш.

Өмнөх merge-ийн CI нь generated icon map хуучирснаас унаж deploy алгасагдсан; одоогийн commit үүнийг зассан. Dependency update салбарын зарим CI/downstream failure-ийг одоогийн `main`-ийн failure-тэй хольж үзэхгүй.

**Дараагийн засварт эрэмбэлэх асуудал**

| Дараалал | Нотолгоо | Хийх ажил ба батлах шалгалт |
| --- | --- | --- |
| 1 | [Events `register`](../backend/internal/apps/events/events.go): багтаамжийг унших, шалгах, INSERT хийх нь тусдаа query; нэг transaction/lock байхгүй | Үлдсэн нэг суудалд өөр хэрэглэгчид зэрэг бүртгүүлэхэд багтаамж хэтрэх боломжтой. Бүртгэл ба холбогдох төлөвийн өөрчлөлтийг атомик болгох; зэрэг хүсэлттэй DB integration тестээр багтаамж хэтрэхгүйг батлах. Энэ нь кодоос тогтоосон race эрсдэл, production-д давтан гаргасан тохиолдол биш |
| 2 | [Events пакет](../backend/internal/apps/events/) дотор `*_test.go` байхгүй; Events UI-ийн зориулалтын тест илрээгүй | Route/permission гэрээний тест байгаа ч бизнес ажиллагааг батлахгүй. Tenant тусгаарлалт, member/manager эрх, install/access, давхар бүртгэл, багтаамж, төлөв, ирцийн хамгаалалтыг API/DB тестээр; үндсэн хэрэглэгчийн урсгалыг browser тестээр батлах |
| 3 | [Reports route](../frontend/app/reports/page.tsx) нь `appFilter` custom prop-той, default parameter хэрэглэдэг; [documents route](../frontend/app/module/documents/reports/page.tsx) түүнийг component болгон ашигладаг | Webpack production build-ийн `.next/types/app/reports/page.ts` дээр `TS2344`, `PageProps` нийцэхгүй. Дахин ашиглах Reports component-ийг route файлаас салгах нь тохиромжтой засвар. Үндсэн build болон generated type шалгалтаар батлах. GitHub дахь Turbopack build амжилттай тул production build бүхэлдээ эвдэрсэн гэж дүгнэхгүй |
| 4 | Events `withdraw` зөвхөн attendance-ийн `registered` төлөвийг шалгана; event `done/cancelled` эсэхийг шалгахгүй. UI цуцлах үйлдлийг `planned` үед харуулдаг | Дууссан/цуцалсан арга хэмжээний бүртгэлээ API-аар устгахыг зөвшөөрөх эсэх бизнес дүрмийг тогтоож, backend ба UI-г ижил болгох; түүх хадгалах тест нэмэх |
| 5 | Events `list` болон `attendance` нь `rows.Next()`-ийн дараа `rows.Err()` шалгахгүй | DB мөр унших явцын алдааг амжилттай дутуу жагсаалт болгож буцаахаас сэргийлэх. Attendance-ийн DB алдааг 404-тэй нэгтгэсэн хэсгийг мөн ялгах |
| 6 | [Events migration](../backend/internal/apps/events/migrations/00001_events.sql)-д attendance-ийн `tenant_id`, `event_id` тусдаа FK-тэй | Attendance ба event нэг tenant-д харьяалагдахыг composite FK зэрэг DB constraint-аар хамгаалах боломжийг үнэлэх. Одоогийн handler tenant нөхцөлтэй, RLS-тэй; үүнийг батлагдсан tenant хоорондын мэдээлэл алдагдал гэж үзээгүй |
| 7 | Events жагсаалт `LIMIT 500`, pagination/таслагдсан тухай мэдээлэлгүй; ирцийн жагсаалт pagination-гүй | Хүлээгдэж буй хэмжээнд тулгуурлан pagination, хайлт, тайлан/экспортын хэрэгцээг тодорхойлох |

Оролцогчийн email болон ирцийн note нь `events.read` эрхтэй гишүүдэд харагддаг. Энэ нь одоогийн хэрэгжилтийн зан төлөв; ямар мэдээллийг зөвхөн зохион байгуулагчид үзүүлэхийг бүтээгдэхүүний шаардлагаар шийдэх шаардлагатай.

**Баримтын зөрүү**

- [README](../README.md), [ARCHITECTURE](ARCHITECTURE.md), [MODULES](MODULES.md) болон `runtime.go`-ийн зарим тайлбар каталог/бизнес апп хоосон гэж үлдсэн; одоо Events бий. Архитектурын хуучин route/migration тоо мөн шинэчлэгдээгүй.
- [MZH](MZH.md) Events-ийг энэ репогийн өөрийн апп гэж зөв тайлбарладаг ч дараагийн хэсэгт бизнес апп энэ репод байхгүй гэж бичсэн. Distribution-ийн одоогийн хөгжүүлэлтийн байршлыг нэг мөр болгох хэрэгтэй.
- MODULES migration-ийг зөвхөн install үед гэж тайлбарладаг ч код startup үеийн catalog apply урсгалд `MigrateModules` ажиллуулдаг. Migration-ийг дахин ажиллахад аюулгүй, upgrade-д нийцэх байдлаар төлөвлөнө.
- Архитектурын `BeforeAcquire` тайлбарыг бодит `PrepareConn` хэрэгжилттэй, shell/identity баримтын cookie тайлбарыг бодит тохиргоотой нийцүүлэх хэрэгтэй.
- Англи болон бусад хэлний README-д хуучин directory, `sso_clients`-ийн үеийн тайлбар, upstream host үлдсэн. SDY-ийн сүүлийн өөрчлөлтийн эх сурвалж нь одоогоор Git түүх, MZH болон бодит workflow байна.
- [OPERATIONS](OPERATIONS.md), native баримтууд дахь upstream сервер, хуучин API path, `/server`/`/web` зам, нууцын үйлчилгээний зааврыг SDY-д шууд хуулж хэрэглэхгүй. SDY-ийн бодит deploy workflow GitHub Secrets/Variables ашиглаж байна.
- `CHANGELOG.md` нь платформын түүхийг дэлгэрэнгүй өгдөг ч SDY/Events-ийн сүүлийн өөрчлөлт бүрийг хамраагүй. Түүхэн хувилбарын тайлбарыг өнөөгийн боломжийн жагсаалттай ялгаж уншина.

**Ажиллагааны анхаарах зүйл ба баталгаажаагүй төлөв**

SDY workflow нь `/opt/sdy` орчинд GHCR-ийн backend/frontend image байршуулж, deploy бүрд `.env`-ийг дахин үүсгэдэг. Шинэ env нэмэхэд workflow-ийн утга дамжуулах хэсэг, SSH `envs`, env бичих хэсэг, compose болон example файлуудыг хамтад нь шалгана. Сервер дээр гараар `.env` өөрчлөхөд дараагийн deploy дарж бичиж болно. `PLATFORM_ACCESS_MODE` workflow default нь `private`; repo variable болон runtime settings-ийн бодит утгыг кодын default-оос таахгүй.

Rollout нь stateless контейнерүүдийг зогсоож дахин үүсгэдэг тул түр тасалдал гарах боломжтой. Blue/green rollout, автомат rollback хэрэгжсэн нотолгоо харагдаагүй. DB migration буцаах нь image rollback-аас тусдаа асуудал.

Бодит хэрэглээнд хүргэх дараагийн ажиллагааны шалгалтад TLS/nginx, операторын IP allowlist, backup ба restore туршилт, alert хүргэлт, диск/DB нөөц, eID callback болон идэвхтэй тохиргоог оруулна. Репод эдгээрийн скрипт/заавар байгаа нь SDY сервер дээр идэвхтэй гэсэн баталгаа биш. Commit түүхэнд өмнө нь хуваалцсан root нууц үгийг солих сануулга байсан; солигдсон эсэхийг энэ судалгаагаар баталгаажуулаагүй.

**Үргэлжлүүлэх санал болгож буй дараалал**

1. Events-ийн concurrency болон бизнес ажиллагааны тест, дээрх хамгийн эхний засваруудыг хийх; Reports route-ийн build нийцлийг засах.
2. Байгууллага олох → элсэлт илгээх → зөвшөөрөх → зөв эрхтэй нэвтрэх → Events суулгах → арга хэмжээ үүсгэх → бүртгүүлэх → ирц тэмдэглэх урсгалыг гишүүн, менежер, операторын дүрээр бүрэн шалгах.
3. README/MZH/MODULES/ARCHITECTURE болон deployment зааврыг одоогийн SDY төлөвтэй нийцүүлж, цаашдын шийдвэрийн нэг эх сурвалж болгох.
4. Дараагийн бизнес модулийг сонгохын өмнө гишүүний бүртгэлийн талбар, салбарын бүтэц ба төвөөс харах эрх, элсэлтийн батлах шат, Events-ийн хугацаа/багтаамж/цуцлах дүрэм, тайлан ба экспортын шаардлагыг тогтоох. Татвар/хураамж, төсөл хөтөлбөр, native release нь хэрэгцээ батлагдсаны дараах тусдаа ажлууд.
5. Production-д бодит хэрэглэхэд бэлэн эсэхийг runtime лог, тохиргоо, backup restore болон хэрэглэгчийн урсгалын нотолгоотойгоор дахин үнэлэх.

Энэ судалгаагаар application код, migration, тохиргоог өөрчлөөгүй; deploy хийгээгүй. Зөвхөн энэхүү үнэлгээний баримтыг нэмсэн. Дээрх засвар, бүтээгдэхүүний сонголтууд нь дараагийн ажлын санал юм.
