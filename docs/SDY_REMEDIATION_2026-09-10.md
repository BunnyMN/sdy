# SDY засвар ба серверийн шалгалт — 2026-09-10

Энэ нь локал ажиллагааны тэмдэглэл. Серверийн аудитын мэдээллийг кодын PR-д оруулаагүй; нэвтрэх нууц, `.env` утга, хувийн мэдээлэл агуулсан лог болон DB dump-ийг энд хадгалаагүй.

**Хийсэн кодын өөрчлөлт**

[PR #7](https://github.com/BunnyMN/sdy/pull/7), засварын commit `4f46e79f`, Events `1.0.1`.

- Бүртгэл, бүртгэл цуцлах, менежерийн оролцогч нэмэх/ирц өөрчлөх, багтаамж шинэчлэх үйлдэл нэг арга хэмжээний мөрийг transaction дотор түгжинэ. Багтаамжийг түгжсэний дараах тусдаа READ COMMITTED query-ээр уншина.
- Гишүүн зөвхөн `planned` арга хэмжээний `registered` мөрөө цуцална. Дууссан/цуцлагдсан арга хэмжээ болон тэмдэглэгдсэн ирц хадгалагдана. Багтаамжийг эзэлсэн суудлын тооноос багасгахгүй.
- Events-ийн жагсаалтын мөр унших DB алдааг шалгана. Модулийн migration 2 нь хэрэглэгч рүү заасан гурван FK-д индекс, нэр/тайлбар/байршил/ирцийн note-д уртын хязгаар нэмнэ. Одоогийн production өгөгдөл эдгээр хязгаарт багтаж байгааг урьдчилан шалгасан.
- Reports-ийн дундын дэлгэцийг `components/reports/ReportsScreen.tsx` руу салгаж route-ийн `PageProps` алдааг зассан.
- Серверийн лог дахь i18n алдаа root 404 компонентоос гарсныг chunk болон nginx логийн цагаар тогтоосон. Layout-гүй зурагдах үед fallback provider хэрэглэнэ; layout байгаа үед одоогийн хэл/брэндийг хадгална.
- Events формын label/input холбоос, frontend уртын хязгаарыг backend-тай нийцүүлсэн.
- Production контейнерийн лог тус бүр 10 MB × 5 файлаар хязгаарлагдана. Backup скрипт `umask 077` хэрэглэнэ.

**Баталгаажуулалт**

| Шалгалт | Үр дүн |
| --- | --- |
| Хуучин код дээр regression | Тусгаарласан DB-д нэг суудалд 24 бүртгэл зөвшөөрөгдсөнийг давтан гаргасан; хаагдсан арга хэмжээний withdrawal мөн буруу хариулсныг тест барьсан |
| Зассан backend | PostgreSQL 16.14, Redis 8.6.2, Go 1.26.6; 59 багц, дэд тесттэй нийлээд 784 амжилттай тестийн тохиолдол, individual skip/fail байхгүй; 16 багц тестийн файлгүй |
| Backend static check | `go vet ./...` амжилттай |
| Бүтэн API урсгал | Жинхэнэ router, password login, session cookie, CSRF, RLS, directory, элсэх хүсэлт/батлах, tenant солих, апп суулгах, member/manager эрх, бүртгэл/ирц/хаах урсгал амжилттай |
| Frontend unit | 33 файл, 195 тест амжилттай |
| Browser | Chromium 13 тест амжилттай; Events-ийн гишүүн/менежерийн урсгал, багтаамж дүүрэх хариу, үл мэдэгдэх Server Action-ийн 404 хамрагдсан |
| Production build | Webpack build болон generated TypeScript шалгалт амжилттай |
| Host/boundary checks | Built host smoke, API, PWA, host, shell links, icon map амжилттай |
| Lint | 0 алдаа; өмнөх 31 warning хэвээр. Дараа өөрчилсөн frontend файлуудын тусгай lint мөн амжилттай |
| Deploy туслах тест | Python 6 тест амжилттай; шинэ compose нь серверийн бодит env-тэй validate хийсэн |

CI нь Redis 7, Node 20 ашигладаг; локал Redis 8.6.2, Node 22.22.0 тул CI-ийн үр дүнг мөн хүлээн батална. Browser тестүүд API stub ашигладаг; бүтэн API тест нь жинхэнэ DB/session/installer ашигладаг. Production хэрэглэгчийн eID апптай интерактив нэвтрэлтийг энэ автомат шалгалт орлохгүй.

**Production сервер дээр тогтоосон төлөв**

Зөв сервер `5.45.65.164`; public `e-sdy.mn`, `www.e-sdy.mn`, operator `admin.e-sdy.mn`. Deploy хавтас `/opt/sdy`. Шалгалтын эхэнд backend/frontend `debe50fe` image-тэй, PostgreSQL 16 болон Redis 7 ажиллаж байсан.

- Backend, PostgreSQL, Redis health check амжилттай; контейнерүүдийн restart count 0, OOM false. Backend-ийн сүүлийн 24 цагийн логт WARN/ERROR илрээгүй.
- Диск 79 GB-аас ойролцоогоор 20 GB ашигласан, 56 GB сул; RAM хангалттай. Failed systemd unit байхгүй.
- PostgreSQL, Redis, backend, frontend хостын портууд зөвхөн loopback дээр. UFW incoming deny, 22/80/443 нээлттэй. Nginx config test амжилттай.
- Операторын nginx IP allowlist идэвхтэй. Серверийн хуулбарыг гараар өөрчлөхийн оронд GitHub дахь холбогдох тохиргоогоор удирддаг.
- Production TLS сертификат 2026-12-04 хүртэл хүчинтэй; certbot timer байна.
- `DEMO_MODE=false`, `EID_MOCK_MODE=false`, platform access mode public. Нууцын утгуудыг тайланд оруулаагүй.
- Frontend логийн ихэнх алдаа үл мэдэгдэх Server Action руу ирсэн хүсэлтүүд; i18n 404 алдаа тусдаа илэрч засагдсан. `.env`, `.git/config` зэрэг рүү ирсэн шалгасан хүсэлтүүд 404 хариулсан.

**Нөөцлөлт ба буцаах бэлтгэл**

Өмнө нь SDY-ийн автомат backup хуваарь болон нөөцийн бүртгэл олдоогүй. Дараахыг суулгасан:

| Байршил | Үүрэг |
| --- | --- |
| `/usr/local/sbin/sdy-backup` | Репогийн `deploy/scripts/backup.sh`-ийн хуулбар |
| `/etc/default/sdy-backup` | SDY container, DB, backup зам, 14 хоногийн хадгалалтын тохиргоо; 0600 |
| `/etc/cron.d/sdy-backup` | Өдөр бүр 19:15 UTC буюу 03:15 Улаанбаатар; `flock` давхар ажиллахаас хамгаална |
| `/var/backups/sdy` | 0700 хавтас, шинэ dump 0600 |
| `/var/lib/sdy/metrics` | Backup-ийн textfile metrics; Prometheus одоогоор холбогдоогүй |

Эхний dump `/var/backups/sdy/nexus-20260910-062653.sql.gz`, 41,711 байт. Түр DB-д бүрэн сэргээхэд 24 tenant, 2 user, 1 event, 0 attendance болон үндсэн migration 108 таарсан. Түр DB-г устгасан; сэргээхдээ эх DB-г дарж бичээгүй. Backup болон restore test-ийн амжилтыг `operator.platform_backups`-д бүртгэсэн.

Өмнөх `.env`, compose, brand-ийн хамгаалалттай хуулбар `/var/backups/sdy/predeploy-20260910_062823` дотор байна. Image rollback-д өмнөх `debe50fe` tag хэрэгтэй. Модулийн migration 2 зөвхөн уртын хязгаар, индекс нэмсэн тул өмнөх app image шинэ schema-г уншиж чадна; migration Down-ийг шаардлагагүйгээр ажиллуулахгүй.

**Байршуулалтын үр дүн**

PR #7-ийн backend CI хоёр хэсэг унасан; merge/deploy хийгдээгүй. Frontend build, lint, security, downstream, native шалгалтууд давсан. Production одоо ч `debe50fe`, Events `1.0.0`, Events schema 1 дээр байна.

**Хэрэглэгчийн тодруулгын дараах эрх ба тестийн дахин шалгалт**

Доорх хэсэг нь өмнөх асуултын үеийн тэмдэглэл. Дараагийн тодруулгаар
хэрэглэгч **manager болон admin хоёул элсэх хүсэлт шийдэж, Events удирдана**
гэж тогтоосон. Шинэ шаардлага, дарааллыг [бүтээгдэхүүний төлөвлөгөөнд](SDY_PRODUCT_PLAN.md)
хадгалсан; доорх «зөвхөн админ» тайлбар одоогийн шаардлага биш.

- Хэрэглэгчийн тайлбарласан дүрэм: байгууллагын админ арга хэмжээ үүсгэнэ; бусад гишүүд өөрийн бүртгэлээ хийнэ. Энэ шаардлагыг кодын default permission-той адил гэж таамаглахгүй.
- Production-ийн `events_events`, `events_attendance` хоёуланд ENABLE/FORCE RLS идэвхтэй. `gerege_nexus_tenant` role-ийн policy нь зөвшөөрсөн байгууллагуудын мөрийг уншиж, зөвхөн идэвхтэй байгууллагад бичих нөхцөлтэй. HTTP handler мөн tenant нөхцөлөө хэрэглэнэ.
- Events суусан 3 байгууллагад `admin` болон `manager` role-д `events.read`, `events.manage`; `user` role-д зөвхөн `events.read` байна. Одоогийн membership role оноолтууд `admin`/`user`; `manager` оноолт байхгүй. Иймээс одоогийн хэрэглэгчдийн бодит эрх ба кодын цаашид зөвшөөрөх эрхийг ялгана.
- `manager`-т `events.manage` өгдөг дүрэм засварын өмнөх `debe50fe` код/manifest-д байсан; PR #7 энэ default grant болон route permission-ийг өөрчлөөгүй. Код нь `events.manage` шалгадаг болохоос зөвхөн `IsAdmin` шалгадаггүй. Хэрэглэгчийн «зөвхөн админ» тайлбартай зөрүү бий.
- Гишүүний `POST .../register` нь session-ийн өөрийн `UserID`-г ашиглаж `registered` үүсгэнэ. `attended`/`absent`-ийг `events.manage` эрхээр тэмдэглэнэ. Гишүүд оролцогчдын жагсаалтыг мөн хардаг.
- Өмнөх тайлбар дахь «гишүүн тэмдэглэгдсэн ирцийг устгадаг» гэдэг нь буруу. Хуучин DELETE ч `status='registered'` нөхцөлтэй байсан. Олдсон ялгаа нь хаагдсан арга хэмжээний **registered** бүртгэлийг API-аар цуцалж болдог, харин UI үүнийг санал болгодоггүй явдал.
- CI 34446886079 дээр шинэ API journey тест нь Events install үед `permission denied for schema public` / 500 авсан. Тест `newServer` дуудсан ч production-ийн HTTP listener-ээс өмнөх `StartBackgroundJobs → ApplyCatalogToInstallations → MigrateModules` алхмыг алгассан. Тиймээс энэ ганц CI үр дүн production-ийн хэвийн суулгалт эвдэрснийг нотлохгүй.
- Migration-ийн context-оос tenant scope арилгах гэж нэмсэн, commit хийгдээгүй туршилтын өөрчлөлтийг буцаан авсан. Энэ өөрчлөлт серверт болон PR-д ороогүй. Тестийг бодит startup дараалалтай нийцүүлж, цэвэр DB дээр батлах ажил үлдсэн; хуучин DB дээр давсан 784 тест нь энэ асуудлыг хаасан нотолгоо биш.
- Шинэ локал цэвэр DB шалгалт эхлээгүй. Production-ийн эрх, RLS, бизнес өгөгдлийг энэ дахин шалгалтаар өөрчлөөгүй.

**Тусдаа үлдсэн ажиллагааны ажил**

- Нөөц одоогоор энэ серверийн дискэн дээр. Offsite хадгалалтын endpoint/credential/шифрлэх нийтийн түлхүүр өгөөгүй тул өөр сервер/S3 рүү хуулаагүй.
- Prometheus/Grafana/alert хүргэлтийн ажиллаж буй stack олдоогүй; backup DB бүртгэл, textfile metrics байгаа ч alert хүлээн авагч тохируулагдаагүй.
- OS update жагсаалт болон өмнөхөөс үлдсэн reboot шаардлага байна. Application rollout нь OS/kernel upgrade, reboot-ийг хамрахгүй.
- Test домэйнүүдийн nginx тохиргоо байгаа боловч тусдаа test stack ажиллахгүй байна; production үйлчилгээнд нөлөөлөхгүйгээр хэвээр үлдээсэн.
