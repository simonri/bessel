#!/usr/bin/env bash
# Build the prod (Release) app and package it as an .ipa for AltStore.
# The .ipa lands in iCloud Drive/Bessel so it's visible in the Files app on the
# phone: open it there and share it to AltStore (or AltStore > My Apps > +).
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ICLOUD_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Bessel"
cd "$APP_DIR"

xcodegen generate

xcodebuild \
  -project Bessel.xcodeproj \
  -scheme Bessel \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -derivedDataPath build \
  -allowProvisioningUpdates \
  build

STAGING=$(mktemp -d)
trap 'rm -rf "$STAGING"' EXIT
mkdir -p "$STAGING/Payload"
cp -R "build/Build/Products/Release-iphoneos/Bessel.app" "$STAGING/Payload/"
(cd "$STAGING" && zip -qry Bessel.ipa Payload)

mkdir -p "$ICLOUD_DIR"
cp "$STAGING/Bessel.ipa" "$ICLOUD_DIR/Bessel.ipa"
cp "$STAGING/Bessel.ipa" "build/Bessel.ipa"

echo "Exported build/Bessel.ipa and iCloud Drive/Bessel/Bessel.ipa ($(date))"

SHORTCUT="Ship IPA"
if shortcuts list 2>/dev/null | grep -qF "$SHORTCUT"; then
  shortcuts run "$SHORTCUT" -i "$ICLOUD_DIR/Bessel.ipa"
else
  echo "Shortcut '$SHORTCUT' not found — create it (Get File + Share actions) to" \
       "auto-open the AirDrop sheet next time. Falling back to manual AirDrop/Files."
fi
