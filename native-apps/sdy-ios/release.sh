#!/usr/bin/env bash
# esdy — App Store Connect руу archive хийж илгээх.
#
# Шаардлага:
#   Config/Signing.xcconfig  (SDY_TEAM_ID = XXXXXXXXXX)
#   Xcode → Settings → Accounts дээр нэвтэрсэн Apple ID хангалттай. Эсвэл
#   App Store Connect API key (Users and Access → Integrations → App Store Connect API):
#     export ASC_KEY_ID=XXXXXXXXXX
#     export ASC_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
#     export ASC_KEY_PATH=$HOME/.appstoreconnect/AuthKey_XXXXXXXXXX.p8
#
#   ./release.sh                 # build number-ийг автоматаар +1
#   BUILD_NUMBER=42 ./release.sh # тодорхой дугаар
set -euo pipefail
cd "$(dirname "$0")"

[ -f Config/Signing.xcconfig ] || { echo "Config/Signing.xcconfig алга. Signing.example.xcconfig-оос хуулж Team ID бичнэ үү." >&2; exit 1; }
grep -Eq '^SDY_TEAM_ID *= *[A-Z0-9]{10}' Config/Signing.xcconfig || { echo "Config/Signing.xcconfig дотор SDY_TEAM_ID буруу." >&2; exit 1; }

# Build number: project.yml-ийн CURRENT_PROJECT_VERSION-ийг +1 болгож хадгална,
# ингэснээр дараагийн илгээлт давхардахгүй.
CURRENT=$(grep -E '^\s+CURRENT_PROJECT_VERSION:' project.yml | head -1 | sed -E 's/.*"([0-9]+)".*/\1/')
NEXT="${BUILD_NUMBER:-$((CURRENT + 1))}"
sed -i '' -E "s/(CURRENT_PROJECT_VERSION: )\"[0-9]+\"/\1\"$NEXT\"/" project.yml
echo "Build number: $CURRENT → $NEXT"

xcodegen generate --quiet

ARCHIVE="build/SDYMember-$NEXT.xcarchive"
EXPORT="build/export-$NEXT"
AUTH=(-allowProvisioningUpdates)
# API key өгөгдөөгүй бол Xcode-д нэвтэрсэн бүртгэлийг ашиглана.
if [ -n "${ASC_KEY_ID:-}" ]; then
  [ -f "${ASC_KEY_PATH:-}" ] || { echo "API key олдсонгүй: ${ASC_KEY_PATH:-}" >&2; exit 1; }
  AUTH+=(-authenticationKeyPath "$ASC_KEY_PATH"
         -authenticationKeyID "$ASC_KEY_ID"
         -authenticationKeyIssuerID "${ASC_ISSUER_ID:?ASC_ISSUER_ID тохируулна уу}")
fi

xcodebuild -project SDYMember.xcodeproj -scheme SDYMember -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  "${AUTH[@]}" archive

# ExportOptions.plist: method app-store-connect, destination upload →
# exportArchive өөрөө App Store Connect руу илгээнэ.
#
# API key (App Manager эрх) нь «iOS Distribution» гэрчилгээг cloud-оос гаргаж
# чаддаггүй тул export «No signing certificate "iOS Distribution" found» гэж
# унаж болно. Тэгвэл Xcode → Settings → Accounts-д нэвтэрсэн Apple ID-аар
# (cloud signing) дахин илгээнэ — 2026-11-09-нд build 12 ингэж явсан.
if ! xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportPath "$EXPORT" \
     -exportOptionsPlist ExportOptions.plist "${AUTH[@]}"; then
  if [ -n "${ASC_KEY_ID:-}" ]; then
    echo "API key-ээр export бүтэлгүйтлээ — Xcode-д нэвтэрсэн бүртгэлээр дахин оролдоно…" >&2
    xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportPath "$EXPORT-xcode" \
      -exportOptionsPlist ExportOptions.plist -allowProvisioningUpdates
  else
    exit 1
  fi
fi

echo "OK: build $NEXT App Store Connect руу илгээгдлээ. Боловсруулалт: scripts/asc.py wait-build $NEXT"
