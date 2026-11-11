# E-sdy iOS — шинэчлэл гаргах (дурын Mac-аас)

Энэ баримтыг дагаад ямар ч Mac-аас TestFlight руу build оруулж, App Review-д илгээнэ. Репод бүх скрипт
байгаа; репод **байхгүй** зүйл бол App Store Connect-ийн API түлхүүр (`.p8`) ба Xcode-д нэвтэрсэн Apple ID.

| Юу | Хаана |
|---|---|
| Апп | E-sdy, bundle `mn.esdy.member`, App Store Connect app id `6827076210` |
| Team | `T65Z28HF29` (хувийн Apple Developer бүртгэл) |
| API түлхүүр | Key ID `QX4Z356N44`, Issuer `9dc31afc-853a-40ca-8016-a4e6595ab2bc`, файл `AuthKey_QX4Z356N44.p8` — **git-д биш** |
| Скриптүүд | `release.sh` (archive + upload), `scripts/asc.py` (хувилбар, review, submit) |
| Review-ийн тэмдэглэл | `AppStore/review-notes.txt` (нууц үггүй; демо бүртгэлийн нууц үг App Store Connect-д л байна) |
| Screenshot | `AppStore/screenshots` |

Шалгасан орчин: Xcode 26.2, xcodegen 2.45.3, Python 3.9, iOS deployment target 17.0.

## 1. Mac-ийг нэг удаа бэлдэх

```sh
xcode-select --install                       # Command Line Tools (Xcode суусан бол алгасна)
brew install xcodegen
pip3 install cryptography                    # scripts/asc.py-д

git clone https://github.com/BunnyMN/sdy.git
cd sdy/native-apps/sdy-ios
cp Config/Signing.example.xcconfig Config/Signing.xcconfig
# Config/Signing.xcconfig дотор:  SDY_TEAM_ID = T65Z28HF29
```

**Xcode → Settings → Accounts** дээр Team `T65Z28HF29`-д хамаарах Apple ID-гаар нэвтэрнэ. Build-ийг App Store руу
илгээх гэрчилгээг Xcode энэ бүртгэлээр cloud-оос авдаг (API түлхүүр үүнийг хийж чадахгүй).

### Түлхүүрийг шилжүүлэх

`AuthKey_QX4Z356N44.p8`-ийг хуучин Mac-аас **AirDrop эсвэл USB-ээр** хуулна — имэйл, чат, git-ээр хэзээ ч биш.

```sh
mkdir -p ~/.appstoreconnect/private_keys
mv ~/Downloads/AuthKey_QX4Z356N44.p8 ~/.appstoreconnect/private_keys/
chmod 600 ~/.appstoreconnect/private_keys/AuthKey_QX4Z356N44.p8
python3 scripts/asc.py versions               # жагсаалт гарвал түлхүүр ажиллаж байна
```

Хуучин түлхүүр алга болсон бол App Store Connect → Users and Access → Integrations → App Store Connect API
дээр шинэ Team key (App Manager) үүсгэж татаад, `export ASC_KEY_ID=<шинэ ID>` гэж ашиглана (Issuer ижил).
`.p8`-ийг Apple зөвхөн нэг удаа татуулдаг.

## 2. Шинэчлэл бүр

Жишээ нь 1.1.1-ийн дараах **1.1.2**:

```sh
cd sdy && git checkout main && git pull
cd native-apps/sdy-ios

# 1) Хувилбарын дугаар — project.yml: MARKETING_VERSION "1.1.2" (build дугаарыг release.sh өөрөө +1 болгоно)

# 2) Тест
xcodegen generate
xcodebuild test -project SDYMember.xcodeproj -scheme SDYMember \
  -destination 'platform=iOS Simulator,name=iPhone 17'

# 3) Archive + App Store Connect руу илгээх
export ASC_KEY_ID=QX4Z356N44 ASC_ISSUER_ID=9dc31afc-853a-40ca-8016-a4e6595ab2bc \
       ASC_KEY_PATH=$HOME/.appstoreconnect/private_keys/AuthKey_QX4Z356N44.p8
./release.sh                                   # "Build number: 12 → 13" гэж хэвлэнэ

# 4) Apple боловсруулж дуусахыг хүлээх (5–30 мин) — дараа нь TestFlight-д харагдана
python3 scripts/asc.py wait-build 13
```

Зөвхөн TestFlight-аар туршуулах бол энд зогсоно: App Store Connect → TestFlight дээр туршигчийн имэйл нэмэхэд
Apple урилга явуулна (дотоод туршигч шууд; гадаад туршигчийн анхны build Beta Review-ээр ордог).

App Review руу:

```sh
python3 scripts/asc.py create-version 1.1.2
python3 scripts/asc.py attach-build 1.1.2 13
python3 scripts/asc.py whats-new 1.1.2 "• …
• …"
python3 scripts/asc.py review-notes 1.1.2      # демо бүртгэл өмнөх хувилбараас, тэмдэглэл AppStore/review-notes.txt-ээс
python3 scripts/asc.py submit 1.1.2
python3 scripts/asc.py versions                # 1.1.2  WAITING_FOR_REVIEW
```

Батлагдмагц автоматаар гарна (`releaseType AFTER_APPROVAL`); `python3 scripts/asc.py release 1.1.2`-оор төлөвийг харна.

Дараа нь хувилбарын өөрчлөлтийг commit хийнэ (`main` руу шууд биш — салбар + PR; `main` руу merge нь backend-ийг
production-д дахин deploy хийдэг):

```sh
git checkout -b chore/ios-1.1.2
git add project.yml && git commit -m "chore(ios): 1.1.2 build 13 uploaded to App Store Connect"
git push -u origin chore/ios-1.1.2             # → PR
```

### Review-ийн тэмдэглэл

Аппын дэлгэц, демо бүртгэлийн замнал өөрчлөгдвөл `AppStore/review-notes.txt`-г засаад `review-notes`-ийг дахин
ажиллуулна. Тэмдэглэл англиар (reviewer монгол уншдаггүй), дэлгэцийн монгол нэрийг хашилтанд өгнө.

## 3. Алдаа гарвал

| Алдаа | Шалтгаан / шийдэл |
|---|---|
| `No signing certificate "iOS Distribution" found` | API түлхүүр гэрчилгээ гаргаж чадахгүй. `release.sh` Xcode-д нэвтэрсэн бүртгэлээр автоматаар дахин оролдоно; Xcode-д нэвтрээгүй бол нэвтэрнэ |
| `Config/Signing.xcconfig алга` | 1-р хэсгийн `cp …` |
| Build дугаар давхардсан (`The bundle version must be higher`) | `BUILD_NUMBER=14 ./release.sh` |
| `API түлхүүр олдсонгүй` | «Түлхүүрийг шилжүүлэх» |
| `attach-build`: build олдсонгүй / VALID биш | `wait-build` дуусахыг хүлээнэ |
| `review-notes`: демо бүртгэл олдсонгүй | App Store Connect → тухайн хувилбар → App Review Information-д гараар |
| Push мэдэгдэл Xcode-оос суулгасан build-д ирэхгүй | APNs түлхүүр зөвхөн Production — TestFlight/App Store build л push авна |

## Android

Android апп (`native-apps/sdy-android`) Google Play-д хараахан бүртгэгдээгүй. Гаргахын өмнө хийх зүйлс:
`native-apps/sdy-android/HANDOFF.md` ба `README.md` → «Google Play руу гаргах».
