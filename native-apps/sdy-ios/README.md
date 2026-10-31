# E-sdy — iOS апп

SDY-ийн гишүүдэд зориулсан native SwiftUI апп (WebView ашиглахгүй). Вэб PWA-тай
(`frontend/`) ижил backend: `https://e-sdy.mn/api/v1`.

- Bundle ID: `mn.esdy.member` · Нэр: **E-sdy** · iOS 17+ · зөвхөн iPhone, босоо
- Таб: Нүүр · Арга хэмжээ · Ирц · Хураамж · Профайл (салбар батлагдаагүй гишүүнд зөвхөн Нүүр, Профайл)
- Нэвтрэлт: eID Mongolia (регистрийн дугаараар push, эсвэл энэ утсан дээрх eID апп), нэмэлтээр имэйл/нууц үг (App Review-д)
- Session: bearer token (`Authorization: Bearer`, `X-Session-Transport: bearer`), Keychain-д хадгална; cookie хэрэглэхгүй

## Бүтэц

```
project.yml              xcodegen-ийн эх сурвалж (SDYMember.xcodeproj нь .gitignore)
Config/                  Base.xcconfig, Signing.example.xcconfig (Signing.xcconfig — gitignored)
SDYMember/App            App, AppModel (session, таб, deep link), RootView
SDYMember/Core           APIClient, Endpoints, TokenStore, SessionCookie, OfflineCache,
                         APIError (монгол алдааны текст), Formatters, RegisterNumber,
                         DeepLink (QR, universal link), FixtureRouter (зөвхөн DEBUG)
SDYMember/Models         API-ийн төрлүүд (frontend/lib/api/*.ts-ийн толь)
SDYMember/Features       Login, Home, Events, CheckIn, Dues, Profile
SDYMember/Resources      Assets, Info.plist (үүсгэгдэнэ), entitlements, PrivacyInfo, Fixtures/*.json
SDYMemberTests           Decoding, QR, регистр, Set-Cookie, deep link, формат, алдааны текст
build.sh / release.sh    Симулятор build / App Store Connect руу илгээх
```

## Анхны тохиргоо

```sh
brew install xcodegen               # 2.45+
cp Config/Signing.example.xcconfig Config/Signing.xcconfig
# Config/Signing.xcconfig дотор SDY_TEAM_ID = <таны 10 тэмдэгт Team ID>
./build.sh                          # симулятор, гарын үсэггүй
xcodegen generate && open SDYMember.xcodeproj
```

Team ID: developer.apple.com → Account → Membership details. Signing нь Automatic;
Xcode-д Apple ID-гаа (Settings → Accounts) нэмсэн байхад хангалттай.

### Тест

```sh
xcodegen generate
xcodebuild test -project SDYMember.xcodeproj -scheme SDYMember \
  -destination 'platform=iOS Simulator,name=iPhone 17'
```

### Backend-гүй харах (зөвхөн Debug)

Scheme → Run → Arguments дээр `-SDYFixtures` нэмбэл `Resources/Fixtures/*.json`-оос
уншиж, нэвтрэлтгүйгээр бүх таб ажиллана. Нэмэлт: `-SDYTab events|checkin|dues|profile`,
`-SDYEvent <uuid>`, `-SDYHomeRoute notifications`, `-SDYProfileRoute leaderboard|record|deleteAccount`,
`-SDYCheckin 1`, `-SDYFixtureVariant nobranch`. Release build-д fixture файлууд ордоггүй.

## Профайлын зураг

Профайл → avatar дээр дарж системийн зураг сонгогчоор (PhotosPicker — зургийн санд хандах зөвшөөрөл шаардахгүй)
сонгоно. Апп төвөөс нь дөрвөлжин тайрч 512×512 JPEG болгоод `PUT /api/v1/profile/photo` руу илгээнэ; сервер дахин
кодолж EXIF/GPS-ийг арилгана (`backend/internal/workspace/profile/photo.go`, migration 00116). Солих, устгах нь мөн тэнд.
Зураг төхөөрөмж дээр офлайн кэшэд хадгалагдаж, гарахад устана. Бүртгэл устгагдахад серверээс зураг устана.

## Universal links (заавал)

Entitlement: `applinks:e-sdy.mn`. Ажиллахын тулд `https://e-sdy.mn/.well-known/apple-app-site-association`
дараах агуулгатай (`Content-Type: application/json`, redirect-гүй) байх ёстой:

```json
{
  "applinks": {
    "details": [{
      "appIDs": ["<TEAM_ID>.mn.esdy.member"],
      "components": [
        { "/": "/auth/eid/callback", "?": { "app": "ios" } },
        { "/": "/member/check-in" }
      ]
    }]
  }
}
```

- `/auth/eid/callback?app=ios…` — eID апп-аас буцахад аппыг нээж, нэвтрэлт/саналын poll-ыг үргэлжлүүлнэ (`sessionId`, `return=` дэмжинэ).
- `/member/check-in#event=<uuid>&token=<48 hex>` — системийн камераар уншуулсан QR шууд аппад нээгдэнэ.
- Шалгах: бодит төхөөрөмж дээр Notes-д холбоосыг бичээд дарж үзнэ; симулятор дээр `xcrun simctl openurl booted "<url>"`.

## App Store руу гаргах

1. App Store Connect → Apps → «+» → New App: iOS, нэр «E-sdy», Bundle ID `mn.esdy.member`
   (Xcode automatic signing эсвэл developer.apple.com → Identifiers дээр Associated Domains-тай үүсгэнэ), SKU `sdy-member-ios`.
2. App Store Connect API key үүсгэнэ (Users and Access → Integrations → Team key, App Manager эрх), `.p8`-ийг татна.
3. ```sh
   export ASC_KEY_ID=XXXXXXXXXX ASC_ISSUER_ID=xxxxxxxx-... ASC_KEY_PATH=~/.appstoreconnect/AuthKey_XXXXXXXXXX.p8
   ./release.sh            # build number +1 → archive → upload
   ```
   `project.yml`-ийн `CURRENT_PROJECT_VERSION` өөрчлөгдөнө — commit хийнэ. Хувилбар (`MARKETING_VERSION`) гараар.
4. TestFlight дээр шалгаад, App Store хуудсыг бөглөж (доорх загвар) Review руу илгээнэ.

### App Icon

Одоогийн `AppIcon` нь `brand/sdyLogo.jpg` (1024×1024, alpha-гүй)-ээс автоматаар үүссэн. Жижиг хэмжээнд
«est. 1997 MONGOLIA» бичиг уншигдахгүй — **зөвхөн «SDY» тэмдэгтэй, ил тод бус 1024×1024 PNG мастер зураг**
дизайнераар хийлгэж `SDYMember/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png`-г солих хэрэгтэй.

## App Review-д зориулсан тэмдэглэл (загвар)

> **Demo account:** Email: `<demo@e-sdy.mn>` · Password: `<********>`
> Нэвтрэх дэлгэцийн доод хэсгийн «Нууц үгээр нэвтрэх» холбоосоор нэвтэрнэ. Энэ бүртгэл нь туршилтын
> салбарын батлагдсан гишүүн бөгөөд арга хэмжээ, хураамж, санал хураалтын жишээ өгөгдөлтэй.
>
> **eID Mongolia:** SDY гишүүд Монгол Улсын төрийн цахим үнэмлэх eID Mongolia-аар нэвтэрч, хурлын санал хураалтад
> тоон гарын үсэг зурдаг. eID нь Монгол Улсын иргэний бүртгэлтэй тул Монголоос гадуур турших боломжгүй; иймд демо
> бүртгэлийг имэйл/нууц үгээр өгсөн. eID-ийн гарын үсэг шаардсан санал өгөх үйлдэл демо бүртгэлд «eID холбоогүй»
> гэсэн тайлбар харуулна.
>
> **Ирцийн QR:** Ирц таб → «QR уншуулж ирцээ батлах». Камерыг зөвхөн QR уншихад ашиглана.
> **Төлбөр:** Апп дотор төлбөр авахгүй. Гишүүнчлэлийн хураамжийг банкаар шилжүүлсний дараа «Төлбөр мэдэгдэх»-ээр
> мэдэгдэнэ. Энэ нь байгууллагын гишүүнчлэлийн хураамж бөгөөд апп доторх дижитал контент биш (Guideline 3.1.1-д хамаарахгүй).
> **Бүртгэл устгах:** Профайл → Бүртгэл устгах (30 хоногийн дотор дахин нэвтэрвэл цуцлагдана).
> **Нууцлал:** https://e-sdy.mn/privacy · **Тусламж:** https://e-sdy.mn/support

## App Store Connect мета өгөгдөл (ноорог)

- **Нэр:** E-sdy
- **Subtitle:** Ирц, арга хэмжээ, хураамж
- **Ангилал:** Social Networking (нэмэлт: Lifestyle)
- **Keywords:** SDY,гишүүн,ирц,арга хэмжээ,хураамж,eID,санал хураалт,залуучууд,QR,оноо
- **Тайлбар:**

  > E-sdy — SDY-ийн гишүүдийн албан ёсны апп.
  >
  > • Арга хэмжээ: салбарын арга хэмжээг харж, бүртгүүлж, суудлын тоог шууд хянана.
  > • Ирц: зохион байгуулагчийн QR-ийг уншуулж ирцээ нэг товшилтоор батлан, оноо цуглуулна.
  > • Хэлэлцүүлэг: хурлын асуудалд eID Mongolia тоон гарын үсгээр найдвартай санал өгнө.
  > • Ажил үүрэг: арга хэмжээний ажилд сайн дураар оролцож, оноо авна.
  > • Хураамж: гишүүнчлэлийн хураамжийн үлдэгдэл, хугацаа, дансны мэдээллээ харж, шилжүүлснээ мэдэгдэнэ.
  > • Тэргүүлэгчид: салбарын идэвхтэй гишүүдийн самбар.
  > • Мэдэгдэл, гишүүнчлэлийн түүх, салбар шилжих хүсэлт.
  >
  > eID Mongolia-аар аюулгүй нэвтэрнэ. Интернэтгүй үед сүүлд харсан мэдээллээ үзэх боломжтой.
  > SDY-ийн зөвшөөрөлтэйгээр, нээлттэй эхийн Gerege open-gerege-nexus (Apache-2.0) дээр хөгжүүлсэн.

- **Support URL:** https://e-sdy.mn/support · **Privacy Policy URL:** https://e-sdy.mn/privacy
- **Age rating:** 4+ (хэрэглэгчийн контент: гишүүдийн дэвшүүлсэн асуудал — модераторлогддог)
- **Export compliance:** `ITSAppUsesNonExemptEncryption = NO` (зөвхөн HTTPS)

### App Privacy асуулга (хариулт)

- Tracking: **Үгүй** (tracking, гуравдагч этгээдийн SDK, зар сурталчилгаа алга)
- Цуглуулдаг, **хэрэглэгчтэй холбогддог**, зорилго нь **App Functionality**:
  - Contact Info: Name, Email Address, Phone Number, Physical Address (оршин суугаа аймаг/сум)
  - Identifiers: User ID
  - Financial Info: Other Financial Info (хураамжийн төлбөрийн мэдэгдэл, гүйлгээний утга)
  - User Content: Other User Content (хурлын асуудал, санал)
  - Other Data: регистрийн дугаар (eID-ээр нэвтрэхэд илгээгддэг, backend-д хадгалагдана)
  - Photos or Videos: профайлын зураг (хэрэглэгч өөрөө сонгоно; сервер 512 px болгож EXIF/GPS-ийг арилгана) — 1.0.1-ээс
- Цуглуулдаггүй: байршил, эрүүл мэнд, хайлтын түүх, оношилгоо, худалдан авалт, контакт
- Аппын `PrivacyInfo.xcprivacy` дээрхтэй тохирно (UserDefaults reason CA92.1).

## Үлдсэн гар ажил

1. `Config/Signing.xcconfig`-д Team ID бичих.
2. AASA: `frontend/app/.well-known/apple-app-site-association/route.ts` үүнийг `APPLE_TEAM_ID`-аас үүсгэнэ;
   GitHub variable `APPLE_TEAM_ID=T65Z28HF29` → `deploy.yml` хостын `.env`-д бичнэ. `curl -i https://e-sdy.mn/.well-known/apple-app-site-association` → 200 JSON.
3. 1024×1024 AppIcon мастер зураг.
4. App Store Connect-д апп үүсгэх, API key, `./release.sh`.
5. Демо бүртгэл (нууц үгтэй, туршилтын салбарт батлагдсан гишүүн) үүсгэж Review notes-д бичих.
6. Бодит төхөөрөмж дээр: eID нэвтрэлт (хоёр арга), санал зурах, universal link буцалт, QR камер.

## Лиценз

Apache License 2.0. Keychain хадгалалт ба scenePhase resume хэв маягийг
`native-apps/desktop/macos/Core/Keychain/KeychainManager.swift` болон
`native-apps/mobile/ios/Features/Login/MobileLoginView.swift`-ээс (Gerege Systems Development Team,
Gerege Nomadica Foundation) авч тохируулсан.
