# Android апп — үргэлжлүүлэх тэмдэглэл (2026-11-09, шинэчилсэн 2026-11-17)

## 2026-11-17: iOS аудитын засварууд (`fix/android-audit-2026-11`)

iOS `fix/ios-audit-2026-11` (PR #45, d872426f хүртэл; `docs/SDY_IOS_REVIEW_2026-11-09.md` «2026-11-17 засвар») 1:1 тусгагдсан,
backend PR #46-ийн гэрээ орно. Тест 97/97 (`AuditFixTest.kt` — iOS `AuditFixTests` + `EIDLoginModelTests` +
`BackendPR46Tests`-ийн хөрвүүлэлт). Debug, R8 release (түр keystore-оор) build амжилттай; эмулятор дээр fixture-ээр
зургуудыг iOS-тэй тулгасан.

- Session: салбар солилтын хагас алдаа (#3), нэвтрэхээс өмнөх линк/мэдэгдлийн дарилт хүлээгдэнэ (#4; push байхгүй тул
  одоохондоо eID-ийн санал буцалт, FCM-д `openPushed` бэлэн), eID binding Keystore-оор + `expires_at` + 404 → хугацаа дууссан (#5),
  foreground/403-аар эрх дахин уншина (#7, кэшгүй, хоцорсон хариуг хаяна), гарсны дараа кэш бичигдэхгүй, 401-д pending устна.
- Удирдлага: Хяналтын хорооны `Idempotency-Key` (#8), ирц засахад `ReasonSheet` (#9), хайлттай `PersonPicker` (#10),
  QR дэлгэц унтрахгүй + хугацаа дууссан QR бүдгэрнэ + 10 с-ийн дараа дахин (#12), албан тушаал оноохоос өмнө асууна (#13),
  хүлээгдэж буй төлбөртэй хураамжийг чөлөөлөхгүй (#14), «Чөлөөлөлтийг буцаах» (unwaive), 72 шинэ алдааны текст + ерөнхий 403/409 зураглал (#15).
- Арга хэмжээ: 502/503/504 poll тэвчинэ (#16), «Шалгах» (#17), QR батлах `blockedReason` (#18), ажлын алдааны дараа дахин
  ачаална (#19), олон өдрийн арга хэмжээ дуусах хүртэл «Удахгүй», «11-р сарын 9, 18:30–20:30», жагсаалтын нэг мөрт тоо.
- Нүүр/Профайл: «хийх зүйлс» 60 с-ээс хуучин бол шинэчлэгдэнэ (#20), бүртгэл устгах текст (#21), түдгэлзсэн гишүүний карт (#22),
  «Цааш үзэх» + давхардалгүй хуудаслалт (#23), уншсан тэмдэг зөвхөн амжилттай үед.
- UI/UX хасалт: Нүүрний «Арга хэмжээ/Ирц/Хураамж» хавтан, табын badge, «хийх зүйл»-ийн тоо, Профайлын хонх/⏻, «Тэргүүлэгчид»
  хавтан, Ирц табын «Нийт оноо»/«Онооны түүх», «Бүгдийг уншсан» → «…» цэс; «Нууц үгээр нэвтрэх» 44dp товч; «Сонгогдсон» идэвхгүй ✓.
- Build: `keystore.properties` байхгүй бол `bundleRelease`/`assembleRelease` тодорхой алдаатай зогсоно; `versionCode`
  `appVersion`-оос гарна (README → «Google Play руу гаргах»).
- Хийгээгүй: дахин суулгахад token цэвэрлэх (Android-д хэрэггүй — uninstall бүгдийг устгадаг, backup унтраатай);
  `EventEditor`-ийн цагийн бүс аль хэдийн Улаанбаатар байсан; push (FCM) — шийдвэр хүлээж буй хэвээр.

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
