#!/usr/bin/env bash
# esdy — симулятор дээр барих (гарын үсэггүй).
#
#   ./build.sh                       # Debug, iOS Simulator
#   CONFIGURATION=Release ./build.sh
#
# project.yml нь эх сурвалж тул барих бүрт .xcodeproj-ийг дахин үүсгэнэ.
set -euo pipefail
cd "$(dirname "$0")"

CONFIGURATION="${CONFIGURATION:-Debug}"
DESTINATION="${DESTINATION:-generic/platform=iOS Simulator}"
DERIVED="${DERIVED_DATA:-build/DerivedData}"

command -v xcodegen >/dev/null || { echo "xcodegen олдсонгүй: brew install xcodegen" >&2; exit 1; }
xcodegen generate --quiet

xcodebuild -quiet \
  -project SDYMember.xcodeproj \
  -scheme SDYMember \
  -configuration "$CONFIGURATION" \
  -destination "$DESTINATION" \
  -derivedDataPath "$DERIVED" \
  CODE_SIGNING_ALLOWED=NO \
  build

echo "OK: SDYMember ($CONFIGURATION) баригдлаа → $DERIVED/Build/Products/${CONFIGURATION}-iphonesimulator/SDYMember.app"
