# Android апп — үргэлжлүүлэх тэмдэглэл (2026-11-09, шинэчилсэн 2026-11-11)

## 2026-11-11: iOS-тэй нарийн тулгалт

- iOS 1.1.1 (build 12) хүртэлх бүх өөрчлөлт тусгагдсан; Android versionName 1.1.1.
- 5 хөндлөнгийн аудит (core, login+design, home+profile, events, check-in+dues+admin) + iOS симулятор / Android
  эмулятор дээр дэлгэц дэлгэцээр нь харьцуулж засав. Гол засварууд:
  - timeout-ыг «цуцлагдсан» биш «сүлжээ» гэж үзнэ (офлайн кэш, баннер, eID poll дахин оролдлого iOS шиг);
    эхний bootstrap app scope-д (activity дахин үүсэхэд тасрахгүй); eID нэвтрэлтийн model activity дахин үүсэхэд хадгалагдана.
  - iOS 26 харагдац: хөвөгч шилэн tab bar, шилэн буцах/toolbar товч, inline гарчиг (Мэдэгдэл, Шилжүүлэх, Элсэх,
    удирдлагын 3 дэлгэц), жагсаалтын мөр 52 / булан 26 / том section гарчиг, LabeledContent багтахгүй бол доош шилжинэ,
    capsule segmented control, Өнгө төрх дээр tab bar нуугдана.
  - Фонт: **Inter** (OFL, `third_party/Inter-LICENSE.txt`) — SF Pro-той өргөн нь ойр тул мөр таслалт iOS-тэй таарна.
  - Нэвтрэх: улаан туяа эллипс, 24 цацраг, бөмбөрцөг subpixel, таймер шугаман, sheet бүтэн өндөр.
  - Жижиг логик: мэдэгдэл уншсан болгох optimistic, «Буцах» цуцлах товч, QR-ийн зөвшөөрөл Settings-ээс буцахад
    шалгагдана, амжилтын оноо `toInt`, Төлбөр мэдэгдэх / Асуудал дэвшүүлэх дээр busy үед «Болих» идэвхтэй.
- Санаатай үлдсэн ялгаа: pull-to-stretch (Android overscroll), push байхгүй, SF Symbols → Material icons.
- Харьцуулах арга: түр симулятор `xcrun simctl create sdy-compare "iPhone 16e"` + тусдаа DerivedData,
  iOS `-SDYFixtures …`, Android `--ez SDYFixtures true …`, хоёуланг нь зэрэг screenshot хийж зэрэгцүүлнэ.


## Хийгдсэн

- `native-apps/sdy-android`: iOS аппын (`native-apps/sdy-ios`) 1:1 хөрвүүлэлт, Kotlin + Jetpack Compose.
  Бүх таб, дэлгэц, sheet, логик, монгол текст, харанхуй дизайн, нэвтрэх дэлгэцийн хөдөлгөөнт сцен (SunLogo).
- iOS-ийн 20:59 (2026-11-09) хүртэлх бүх өөрчлөлт тусгагдсан: stale-token retry, `notificationTarget`, Мэдэгдэл жагсаалт.
- 47 unit тест (iOS SDYMemberTests-ийн хөрвүүлэлт) давдаг; debug/release (R8) build, `.aab` гардаг.
- Эмулятор дээр fixture-ээр шалгасан: бүх таб, push/back, eID регистрийн урсгал, ирцийн QR deep link.
- Backend/deploy: `frontend/app/.well-known/assetlinks.json/route.ts`, `ANDROID_CERT_SHA256`
  (deploy.yml, docker-compose.prod.yml, .env жишээнүүд), `docs/MZH.md`. **Deploy хийгдээгүй.**

## Үлдсэн ажил (дарааллаар)

1. **iOS-тэй дахин тулгах.** `git log --oneline b6f42826..HEAD -- native-apps/sdy-ios` (1.1.1 build 12-оос хойш) гарсан өөрчлөлтийг Android-д тусгана.
2. **Бодит backend дээр турших.** Fixture-гүй debug build-ийг утсан дээр суулгаж
   App Review-ийн демо бүртгэлээр («Нууц үгээр нэвтрэх») бүх табыг үзэх; eID-ээр жинхэнэ нэвтрэлт;
   камераар ирцийн QR уншуулах; профайлын зураг солих.
3. **Play Console.** Upload keystore үүсгэх (`README.md` → «Google Play руу гаргах»), `keystore.properties`,
   `./gradlew :app:bundleRelease`, Internal testing-д ачаалах, Play App Signing.
4. **App Links.** Play Console → App integrity-ийн SHA-256-г GitHub variable `ANDROID_CERT_SHA256`-д тавиад
   deploy хийх → `curl https://e-sdy.mn/.well-known/assetlinks.json` 200 эсэх, утсан дээр
   `adb shell pm get-app-links mn.esdy.member` → verified.
5. **Push (шийдвэр хэрэгтэй).** FCM: Firebase төсөл + `google-services.json`, backend-д FCM илгээгч
   (`internal/workspace/push`-д APNs-ийн хажууд), аппад `FirebaseMessagingService` + `registerPushToken` (бэлэн).
6. Store listing, Data safety, Content rating, App access (демо бүртгэл) бөглөөд review-д илгээх.

## Мэдэх зүйлс

- Build: `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"` (Homebrew JDK 25 таардаггүй).
- Fixture: `adb shell am start -n mn.esdy.member/.MainActivity --ez SDYFixtures true [--es SDYTab events] [--es SDYSignedOut 1]`.
- iOS → Android толь, бүтэц: `README.md`.
- iOS-оос санаатай ялгаа: зарим дэлгэцийн гарчиг эхэндээ том гардаг; Android 15-аас доош вэбийн eID буцалт
  аппад ирвэл хөтөч рүү буцаана; push байхгүй.
