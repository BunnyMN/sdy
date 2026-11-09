# Android апп — үргэлжлүүлэх тэмдэглэл (2026-11-09)

## Хийгдсэн

- `native-apps/sdy-android`: iOS аппын (`native-apps/sdy-ios`) 1:1 хөрвүүлэлт, Kotlin + Jetpack Compose.
  Бүх таб, дэлгэц, sheet, логик, монгол текст, харанхуй дизайн, нэвтрэх дэлгэцийн хөдөлгөөнт сцен (SunLogo).
- iOS-ийн 20:59 (2026-11-09) хүртэлх бүх өөрчлөлт тусгагдсан: stale-token retry, `notificationTarget`, Мэдэгдэл жагсаалт.
- 47 unit тест (iOS SDYMemberTests-ийн хөрвүүлэлт) давдаг; debug/release (R8) build, `.aab` гардаг.
- Эмулятор дээр fixture-ээр шалгасан: бүх таб, push/back, eID регистрийн урсгал, ирцийн QR deep link.
- Backend/deploy: `frontend/app/.well-known/assetlinks.json/route.ts`, `ANDROID_CERT_SHA256`
  (deploy.yml, docker-compose.prod.yml, .env жишээнүүд), `docs/MZH.md`. **Deploy хийгдээгүй.**

## Үлдсэн ажил (дарааллаар)

1. **iOS-тэй дахин тулгах.** iOS-ийг өөр сесс зэрэгцээ өөрчилж байсан. Эхлээд:
   `find native-apps/sdy-ios/SDYMember native-apps/sdy-ios/SDYMemberTests -newermt "2026-11-09 21:00" -type f`
   гарсан файл бүрийн өөрчлөлтийг Android-д тусгана (iOS commit хийгдсэн бол `git log -p` -ээр).
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
