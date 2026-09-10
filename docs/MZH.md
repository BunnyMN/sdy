# Социал Демократ Монголын Залуучуудын Холбооны дотоод систем

Энэ репо нь **Социал Демократ Монголын Залуучуудын Холбооны (СДМЗХ)** дотоод системийн суулгац.
Доор нь Gerege Nexus платформ хэвээр ажиллана; холбооны нэр, лого, өнгө, үг
хэллэг нь **кодонд биш, тохиргоонд** байна. Энэ баримт нь юу өөрчлөгдсөн,
яагаад ингэж өөрчилсөн, цаашид юу хийхийг хэлнэ.

[Баримтын төв](README.md) · [Архитектур](ARCHITECTURE.md) · [Танилт](IDENTITY.md) ·
[Ажиллагаа](OPERATIONS.md)

---

## Яагаад fork биш, тохиргоо вэ

Платформ өөрөө ингэж зохион байгуулагдсан: нэг image, өөр `.env`, өөр нэр.
`frontend/lib/brand.ts` ба `backend/internal/kernel/config/brand.go`-д нэр
нь орчны хувьсагчаас уншигдана; `frontend/lib/brandCopy.ts` нь суулгацын
өөрийн үг хэллэгийг JSON файлаас уншина. Gerege Salus нэртэй өмнөх fork
наян мөр орчуулгын төлөө бүхэл платформыг хуулж, аюулгүй байдлын засвар бүрийг
хоёр удаа авдаг байсан — тэр алдааг давтахгүй.

Үр дүнд нь upstream (`gerege-systems/open-gerege-nexus`)-аас засвар татахад
энэ репогийн СДМЗХ-ны өөрчлөлтүүд мөргөлдөхгүй: тэдгээр нь compose-ийн
default, `.env` жишээ, `brand/copy.json`, `frontend/public/sdy/` ба энэ баримт.

## Юу өөрчлөгдсөн

| Хаана | Юу |
| --- | --- |
| `brand/copy.json` | СДМЗХ-ны нэр (mn/en), нүүр хуудасны гарчиг, тайлбар, нэвтрэлт/хамгаалалт/дэд бүтцийн хэсгүүдийн үг хэллэг, OAuth зөвшөөрлийн дэлгэц |
| `frontend/public/sdy/` | SDY Mongolia wordmark, лого, icon-ууд (`sdyLogo.jpg`-аас) |
| `docker-compose.yml` | `BRAND_*`, `BRAND_COPY_FILE=/brand/copy.json`, `LANDING_SECTIONS` default нь СДМЗХ-ных |
| `.env.example`, `deploy/.env.prod.example` | Мөн адил утгууд, тайлбартай |
| `makefile` | `make dev-frontend` / `dev-backend` гараар ажиллуулахад ч ижил брэнд |
| `backend/pkg/host/seed.go` | Хөгжүүлэлтийн seed tenant: «Социал Демократ Монголын Залуучуудын Холбоо» (`demo`) ба «СДМЗХ — Улаанбаатар хотын салбар зөвлөл» (`demo-branch`) |
| `backend/internal/workspace/identity/eidmongolia` | Mock eID-ийн төлөөлөх байгууллагын нэр |

Өөрчлөгдөөгүй, санаатайгаар:

- **`DEFAULT_BRAND` ба `defaultBrandName`** — кодын default нь Gerege Nexus
  хэвээр. Тэр нь платформын нэр; суулгацын нэр нь орчноос ирнэ.
- **Footer-ийн «Gerege Nexus дээр суурилсан»** — нэр өөрчлөгдсөн суулгац
  бүр үүнийг харуулна. Лиценз (Apache 2.0) ч үүнийг шаардана.
- **Native апп** (`native-apps/`) — bundle id, `gerege-nexus://` scheme,
  дэлгэцийн нэр. eID Mongolia дээрх RP-ийн `callback_hosts` энэ scheme-ээр
  бүртгэгдсэн тул сольвол App2App нэвтрэлт тасарна. Native апп нь web shell-ийг
  ачаалдаг учир доторх нэр, лого нь серверийн брэндийг дагана.
- **Grafana-гийн лого** (`deploy/monitoring/grafana/branding/`) — тусдаа
  скрипт, тусдаа ажил ([Ажиллагаа](OPERATIONS.md#брэндлэлт-ба-монгол-хэл)).
- **Appearance дахь «Gerege загвар»** — тэр нь дизайн системийн нэр,
  бүтээгдэхүүний нэр биш.

## Ажиллуулах

```bash
docker compose up -d
```

- Систем: <http://nexus.localhost:3000>
- Удирдлагын консол: <http://admin.localhost:3000>
- Нэвтрэх: `admin@example.com` / `Password123!` → «Социал Демократ Монголын Залуучуудын Холбоо»

Хуучин `.env` байвал `BRAND_*` мөрүүд нь compose-ийн default-ыг дарна;
хоосон утга (`BRAND_NAME=`) ч дарна — тэгвэл Gerege Nexus гарч ирнэ. СДМЗХ
брэндийг харахын тулд тэдгээр мөрийг устгах эсвэл `.env.example`-ийн утгыг
хуулна.

Гараар: `make dev-backend`, `make dev-frontend` — makefile брэндийн
хувьсагчдыг өөрөө дамжуулна.

## Нүүр хуудас

`LANDING_SECTIONS=hero capabilities trust services`. Дотоод системийн нүүр
нь нэвтрэлт (hero), систем юу хийдэг (capabilities), мэдээлэл хэрхэн
хамгаалагддаг (trust), хажууд нь юу ажилладаг (services) гэсэн дөрвөн хэсэг.
Платформын архитектур, апп каталог, технологийн хэсгүүд гишүүнд хамаагүй тул
орхисон; `LANDING_SECTIONS=` хоосон өгвөл долуулаа буцаж ирнэ.

`services` хэсэг нь `SERVICE_URL_*` тохируулсан үед л зурагдана
(`.env.example`). Хөгжүүлэлтийн орчинд юу ч тохируулаагүй тул харагдахгүй.

## Лого ба өнгө

`frontend/public/sdy/` — SDY Mongolia (est. 1997) тэмдэг, `sdyLogo.jpg`
mockup-аас гаргаж авсан:

| Файл | Хаана |
| --- | --- |
| `wordmark.png` | Тунгалаг мөнгөлөг wordmark — landing-ийн улаан толгой (`BRAND_WORDMARK_URL`) |
| `logo.png` | Улаан квадрат дээрх тэмдэг — апп, консол, нэвтрэх дэлгэц (`BRAND_LOGO_URL`) |
| `icon-512.png`, `icon-192.png` | Tab, home screen, суулгасан апп (`BRAND_ICON_URL`) |
| `icon-maskable-512.png` | Android adaptive icon (`BRAND_MASKABLE_ICON_URL`) |

Өнгө: `BRAND_THEME_COLOR=#9c1d25` (логоны улаан), `BRAND_ACCENT_COLOR=#e4e7ec`
(мөнгөлөг — hero-гийн онцлох үг, CTA товч). Landing, нэвтрэх, eID
дэлгэцүүдийн палитр эдгээрээс гардаг (`app/layout.tsx` → `--brand-*` CSS
хувьсагч → `globals.css`); тохируулаагүй суулгац Gerege Nexus-ийн navy/gold
хэвээр.

## Үг хэллэг засах

`brand/copy.json`-ийн түлхүүр бүр `frontend/lib/i18n/` дахь түлхүүр. Хэл
тус бүрээр тааруулна: `mn` бичвэл монгол нь өөрчлөгдөж, англи нь хэвээр.
`{brand}` нь тухайн хэлний `brand.name`-ээр солигдоно. Файл эхлэхэд нэг удаа
уншигдана — өөрчлөлт контейнер дахин асахад орно.

Одоо давхардаж бичсэн түлхүүрүүд: `brand.*`, `website.*` (нүүр хуудас, `hero_eyebrow` орно),
`sso_clients.view.empty_body`, `oauth.consent.lede`. Бусад бүх дэлгэц
`{brand}`-ээр нэрээ авдаг тул нэмэлт override шаардлагагүй.

## Production-д гаргах

[Ажиллагаа](OPERATIONS.md)-ийн дарааллыг дагана; СДМЗХ-ны хувьд нэмэлтээр:

1. `deploy/.env.prod.example`-ийн `BRAND_*`, `LANDING_SECTIONS` мөрүүд
   бэлэн — `PUBLIC_ORIGIN`, домэйнуудыг холбооныхоор солино.
2. `brand/` хавтсыг compose файлын хажууд байлгана — `/brand:ro` гэж mount
   хийгддэг.
3. `SEED_DEMO_DATA` production-д анхдагчаар унтраа. Анхны байгууллага
   («Социал Демократ Монголын Залуучуудын Холбоо») ба операторыг `cmd/tenant-bootstrap`, `cmd/operator-bootstrap`-аар үүсгэнэ
   ([Ажиллагаа](OPERATIONS.md)). Салбар зөвлөл бүрийг тусдаа tenant болгож
   нээвэл салбарын өгөгдөл өгөгдлийн сангийн түвшинд тусгаарлагдана
   ([Архитектур](ARCHITECTURE.md#өгөгдлийн-тусгаарлалт--хоёр-давхарга)).
4. eID нэвтрэлтэд холбооны өөрийн RP credential хэрэгтэй; `BRAND_NAME` нь
   eID апп дээр иргэнд харагдах RP нэр болно.

## Арга хэмжээ ба ирц — `mn.sdy.events`

Холбооны эхний өөрийн апп, `backend/internal/apps/events`. Модулийн гэрээгээр
бичигдсэн ([Модуль бичих](MODULES.md)): `nexus.Register`, өөрийн миграци
(`events_events`, `events_attendance` — байгууллагаар RLS), эрх нь route
бүр дээр (`events.read` гишүүн бүрд, `events.manage` менежер/админд).
Каталогт (`catalog/apps.json`) орсон тул байгууллага бүр **Апп дэлгүүр**-ээс
өөрөө суулгана; суулгамагц хажуугийн цэсэнд «Арга хэмжээ» гарна.

| Хэн | Юу хийнэ |
| --- | --- |
| Гишүүн | Жагсаалт харах, арга хэмжээнд бүртгүүлэх, бүртгэлээ цуцлах, хэн бүртгүүлснийг харах |
| Менежер / админ | Арга хэмжээ нэмэх, засах, төлөв (товлогдсон/болсон/цуцлагдсан), оролцогч нэмэх, ирц тэмдэглэх (ирсэн/ирээгүй) |

API: `/api/v1/events`, `/api/v1/events/{id}`, `…/register`, `…/attendance`,
`…/attendance/{userID}`, `/api/v1/events/members`. Дэлгэц: `/module/events`,
`/module/events/{id}`.

`1.0.1`-ээс багтаамж нь гишүүний өөрийн бүртгэл, менежерийн нэмэлт болон
ирцийн төлөвийн өөрчлөлтөд ижил үйлчилнэ. `absent` төлөв суудал эзлэхгүй;
буцааж `registered`/`attended` болгоход сул суудал шаардлагатай. Багтаамжийг
одоо суудал эзэлж буй хүний тооноос багасгахгүй. Гишүүн зөвхөн `planned`
арга хэмжээний `registered` бүртгэлээ цуцална; менежер өмнөх арга хэмжээний
бодит ирцийг засаж болно.

## Гишүүний PWA

Элсэлт, QR ирц, оролцооны оноо, хураамжийн бүртгэл болон салбарын сарын
тайланг [SDY PWA заавар](SDY_PWA.md)-аас үзнэ. Нүүр нь `/member`.
Санхүүгийн тохиргоог салбар тус бүрт оруулсны дараа хураамж ногдуулна.

## Дараагийн алхам — бизнес модуль

Платформ нь нэвтрэлт, гишүүнчлэл, эрх, аудит, тайлангийн хөдөлгүүр, SSO
provider-ийг өгнө. Гишүүний бүртгэл, салбарын үйл ажиллагаа, арга хэмжээ,
төсөл хөтөлбөр зэрэг холбооны өөрийн апп нь энэ репод биш, тусдаа distribution
репод `pkg/nexus` гэрээгээр бичигдэж, каталогоор ирнэ — [Модуль
бичих](MODULES.md). Энэ репо тэр distribution-ы суурь бөгөөд брэнд нь түүнд
мөн адил `.env`-ээр дамжина.

## Сервер ба CI/CD — e-sdy.mn

| | |
| --- | --- |
| Хост | `5.45.65.164`, Ubuntu 26.04, 6 CPU / 15 GB |
| Домэйн | `e-sdy.mn`, `www.e-sdy.mn` (систем), `admin.e-sdy.mn` (операторын консол); wildcard DNS |
| TLS | Let's Encrypt, certbot nginx plugin, автоматаар сунгагдана |
| Репо | `github.com/BunnyMN/sdy` — `main` руу push → CI → deploy |
| Image | `ghcr.io/bunnymn/sdy/backend`, `ghcr.io/bunnymn/sdy/frontend` |
| Хост дээрх зам | `/opt/sdy` (`docker-compose.prod.yml`, `.env`, `brand/`), `deploy` хэрэглэгчийнх |
| Stack | `STACK=sdy` — контейнерууд `sdy_postgres`, `sdy_backend`, `sdy_frontend`; volume `sdy_postgres_data` |

**Урсгал.** `.github/workflows/deploy.yml` нь CI (`ci.yml`) ногоон болсны
дараа image бүтээж GHCR-д түлхээд, `deploy@5.45.65.164` руу ssh-ээр орж
`.env`-ийг шинээр бичиж, `docker compose pull → migrate → up` хийгээд
`/ready` ба нүүр хуудсыг шалгана. Гараар: Actions → «Deploy to Production
(e-sdy.mn)» → Run workflow.

**Хостын `.env` нь CI-гаас ирнэ.** Хост дээр гараар нэмсэн мөр дараагийн
rollout дээр арчигдана; шинэ тохиргоо нь `deploy.yml`-ийн heredoc-т, утга нь
GitHub secret/variable-д орно ([Ажиллагаа](OPERATIONS.md)).

**Хост дээр гараар хийгдсэн, CI хүрдэггүй зүйлс:**

- nginx vhost: `/etc/nginx/sites-available/e-sdy.mn.conf`, `admin.e-sdy.mn.conf`
  (`deploy/nginx/*.gerege.mn.conf`-оос домэйн солиод хуулсан).
- Операторын консолын IP allowlist: `/etc/nginx/snippets/cp-allowlist.conf`.
  Шинэ хаяг нэмэх: `echo "1.2.3.4/32 5.6.7.8/32" | python3 deploy/scripts/render_cp_allowlist.py`
  гаралтыг тэр файлд бичээд `nginx -t && systemctl reload nginx`.
- ufw: 22, 80, 443 л нээлттэй. Postgres, Redis, backend, frontend нь
  `127.0.0.1`-д л сонсоно.
- `deploy` хэрэглэгч: `docker` бүлэгт, sudo эрхгүй. GitHub Actions
  `DEPLOY_SSH_KEY`-ээр түүгээр нэвтэрнэ.

**Анхны нэвтрэлт.** Production-д `SEED_DEMO_DATA` унтраа тул demo account
байхгүй. `https://e-sdy.mn` анх нээхэд setup wizard гарч, анхны байгууллага
(«Социал Демократ Монголын Залуучуудын Холбоо») ба админ хэрэглэгчийг үүсгэнэ
(`/api/v1/setup/*`). Операторыг `https://admin.e-sdy.mn` дээр мөн setup
wizard-аар, эсвэл хост дээр `docker exec sdy_backend /app/operator-bootstrap`-аар үүсгэнэ.

**eID.** eID Mongolia дээр «SDY Platform» нэртэй RP бүртгэлтэй; `EID_RP_UUID`,
`EID_RP_SECRET` нь GitHub secret-д. Иргэнд eID апп дээр харагдах нэр
`EID_RP_NAME` (deploy.yml). RP-ийн `callback_hosts`-д `e-sdy.mn` ба native
аппын `gerege-nexus://` scheme бүртгэгдсэн байх ёстой — үгүй бол QR/push
нэвтрэлт ажиллаж, утасны App2App буцалт чимээгүй унана
([Танилт](IDENTITY.md#native-app2app-callback)).

**Аюулгүй байдлын санамж.** Серверийн root нууц үг чатаар дамжсан тул түүнийг
солих (`passwd`) эсвэл `PasswordAuthentication no` болгож зөвхөн SSH
түлхүүрээр нэвтэрдэг болгох. Root болон `deploy` хэрэглэгчид SSH түлхүүр
суусан.
