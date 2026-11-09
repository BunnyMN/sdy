# E-sdy — Android апп

SDY-ийн гишүүдэд зориулсан native Android апп (Kotlin + Jetpack Compose, WebView ашиглахгүй).
iOS апп (`native-apps/sdy-ios`)-ын нэг-нэгээр хөрвүүлэлт: ижил backend (`https://e-sdy.mn/api/v1`),
ижил дэлгэц, текст, логик, харанхуй дизайн.

- Application ID: `mn.esdy.member` · Нэр: **E-sdy** · Android 8.0+ (minSdk 26, targetSdk 36) · зөвхөн босоо
- Таб: Нүүр · Арга хэмжээ · Ирц · Хураамж · Профайл (салбар батлагдаагүй гишүүнд зөвхөн Нүүр, Профайл)
- Нэвтрэлт: eID Mongolia — ганц «e-ID | Нэвтрэх» товч; энэ утсан дээрх eID апп руу шууд (зөвхөн суусан апп,
  хөтөч биш — `FLAG_ACTIVITY_REQUIRE_NON_BROWSER`), апп байхгүй бол регистрийн дугаараар. Имэйл/нууц үг нь
  доод талын жижиг холбоос (Play-ийн шалгагчийн демо бүртгэл)
- Session: bearer token (`Authorization: Bearer`, `X-Session-Transport: bearer`, `X-Client: SDYMember-Android/…`),
  Android Keystore-ийн AES-GCM түлхүүрээр шифрлэж хадгална; cookie хэрэглэхгүй; backup/device transfer-ээс хассан

## Бүтэц

```
app/src/main/java/mn/esdy/member/
  SDYApplication, MainActivity   процесс дахь ганц AppModel; deep link, launch extras, resume
  app/        AppModel (session, таб, deep link, профайл зураг), Nav (таб бүрийн stack), RootView, Routes
  core/       APIClient (OkHttp), Endpoints, TokenStore (Keystore), SessionCookie, OfflineCache,
              APIError (монгол алдааны текст), Formatters, RegisterNumber, DeepLink, FixtureRouter (зөвхөн debug)
  models/     API-ийн төрлүүд (kotlinx.serialization; iOS Models.swift-ийн толь)
  design/     Theme, Hero (хөдөлгөөнт торго, HeroScaffold), Themes (Өнгө төрх), Glass, Components, Screens
  features/   login, home, events, checkin, dues, profile, manage
app/src/debug/assets/fixtures/   iOS-ийн Resources/Fixtures/*.json (release-д ордоггүй)
app/src/test/                    iOS SDYMemberTests-ийн хөрвүүлэлт (JVM unit test)
```

iOS → Android толь: SwiftUI `NavigationStack(path:)` → `app/Nav.kt`-ийн `TabStack` (таб бүр өөрийн stack-тай, доорх
дэлгэцүүдийн төлөв хадгалагдана), `List(.insetGrouped)` → `SdyListScreen` + `ListSection`, `.sheet` → `SdySheet`/`FormSheet`,
`.fullScreenCover` → `SdyFullScreen`, `.confirmationDialog` → `ActionSheet`, `Loader<T>` → `rememberLoader`.

## Анхны тохиргоо

```sh
# JDK 17–21 хэрэгтэй (Android Studio-гийн JBR хангалттай)
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
echo "sdk.dir=$HOME/Library/Android/sdk" > local.properties
./gradlew :app:assembleDebug          # app/build/outputs/apk/debug/app-debug.apk
./gradlew :app:testDebugUnitTest      # unit тест
```

### Backend-гүй харах (зөвхөн debug)

Launch extras нь iOS-ийн launch argument-ын үүргийг гүйцэтгэнэ:

```sh
adb shell am start -n mn.esdy.member/.MainActivity --ez SDYFixtures true \
  [--es SDYTab events|checkin|dues|profile] [--es SDYEvent <uuid>] \
  [--es SDYHomeRoute notifications] [--es SDYProfileRoute leaderboard|record|deleteAccount] \
  [--es SDYCheckin 1] [--es SDYFixtureVariant nobranch] [--es SDYSignedOut 1] [--es SDYLoginSheet register]
```

## App Links (заавал)

Manifest-д `https://e-sdy.mn/auth/eid/callback` болон `/member/check-in`-д `autoVerify` бүхий intent-filter бий.
Ажиллахын тулд `https://e-sdy.mn/.well-known/assetlinks.json` энэ аппын гарын үсгийн SHA-256-г нэрлэх ёстой:

1. `frontend/app/.well-known/assetlinks.json/route.ts` үүнийг `ANDROID_CERT_SHA256` (таслалаар) орчны хувьсагчаас үүсгэнэ.
2. GitHub repository variable `ANDROID_CERT_SHA256` = Play Console → Setup → App integrity → **App signing key certificate**
   SHA-256 (+ Play-ээс гадуур суулгах build-ийн upload key). `deploy.yml` хостын `.env`-д бичнэ.
3. Шалгах: `curl -i https://e-sdy.mn/.well-known/assetlinks.json` → 200 JSON;
   утсан дээр `adb shell pm get-app-links mn.esdy.member` → `e-sdy.mn: verified`.

- `/auth/eid/callback?app=android…` — eID апп-аас буцахад аппыг нээж, нэвтрэлт/саналын poll-ыг үргэлжлүүлнэ.
  Android 15-аас доош App Link-ийг query-ээр шүүх боломжгүй тул вэбийн eID буцалт (`app=android`-гүй) ч аппад ирж
  болно — `MainActivity` түүнийг үндсэн хөтөч рүү нь буцааж өгнө.
- `/member/check-in#event=<uuid>&token=<48 hex>` — камераар уншуулсан QR шууд аппад нээгдэнэ.
- Симулятор дээр: `adb shell am start -a android.intent.action.VIEW -d "<url>" mn.esdy.member`.

## Google Play руу гаргах

1. Upload key үүсгэнэ (нэг удаа, **алдаж болохгүй** — нууц үгийн хамт аюулгүй газар хадгална):
   ```sh
   keytool -genkeypair -v -keystore ~/.android/esdy-upload.jks -alias esdy-upload \
     -keyalg RSA -keysize 4096 -validity 10000
   ```
2. `keystore.properties` (gitignored) энэ хавтсанд:
   ```
   storeFile=/Users/<you>/.android/esdy-upload.jks
   storePassword=…
   keyAlias=esdy-upload
   keyPassword=…
   ```
3. `app/build.gradle.kts`-ийн `versionCode`-г +1 (хувилбар бүрт), `versionName`-г iOS-тэй ижил байлгана.
4. `./gradlew :app:bundleRelease` → `app/build/outputs/bundle/release/app-release.aab`
5. Play Console → Create app («E-sdy», Social, Free) → Internal testing-д `.aab` ачаална → Play App Signing-ийг зөвшөөрнө →
   App integrity-ээс SHA-256-г авч `ANDROID_CERT_SHA256`-д тавина (дээрх App Links).
6. Store listing, Data safety (iOS App Privacy-тэй ижил: нэр, имэйл, утас, зураг, апп доторх үйлдэл; шифрлэгдсэн дамжуулалт;
   бүртгэл устгах боломжтой — Профайл → Бүртгэл устгах ба https://e-sdy.mn/support), Content rating, Target audience,
   App access (демо бүртгэл, «Нууц үгээр нэвтрэх» холбоос) бөглөөд Production-д review-д илгээнэ.
   Play-ийн store icon: `play-icon-512.png`.

## Push мэдэгдэл (хийгдээгүй)

iOS апп APNs-ээр push авдаг (`backend/internal/workspace/push`). Android-д Firebase Cloud Messaging хэрэгтэй:
Firebase төсөл (`google-services.json`), backend-д FCM илгээгч (HTTP v1, service account), аппад
`FirebaseMessagingService` + `POST /push-tokens` (`provider: "FCM"`, `Endpoints.kt`-д бэлэн). Хүртэл нь
мэдэгдлүүд апп доторх «Мэдэгдэл» жагсаалт болон Нүүрийн badge-д (апп нээгдэх бүрт шинэчлэгдэнэ) харагдана.
