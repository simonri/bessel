#!/usr/bin/env bash
# Build and install Bessel on the iPhone (both dev and prod apps by default).
# Re-running this resets the 7-day free-provisioning clock for whichever
# configs it installs, so it doubles as the weekly refresh job (see
# com.simonri.bessel.refresh.plist).
#
# Requirements: Apple ID signed into Xcode (Settings > Accounts), iPhone paired
# once via Xcode and on USB or the same Wi-Fi, Developer Mode enabled on device.
set -euo pipefail

# devicectl replaces non-ASCII device-name characters (e.g. the apostrophe in
# "Simon's iPhone") with "?" under a non-UTF-8 locale — which is launchd's
# default environment — breaking the name match below.
export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

DEVICE_NAME=${DEVICE_NAME:-"Simon’s iPhone"}
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

notify_failure() {
  osascript -e 'display notification "Bessel iOS refresh failed — run apps/ios/scripts/deploy.sh manually (Xcode Apple ID session may have expired)" with title "Bessel"' || true
}
trap notify_failure ERR

# Both dev and prod are direct-installed and share this same refresh job;
# CONFIGS="Debug" or CONFIGS="Release" ./deploy.sh to do just one.
CONFIGS=${CONFIGS:-"Debug Release"}

xcodegen generate

DEVICE_ID=$(xcrun devicectl list devices --hide-headers 2>/dev/null \
  | grep -F "$DEVICE_NAME" | grep -oE '[0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12}' | head -1)
if [[ -z "$DEVICE_ID" ]]; then
  echo "Device '$DEVICE_NAME' not found — is it on the same network?" >&2
  exit 1
fi

for CONFIG in $CONFIGS; do
  xcodebuild \
    -project Bessel.xcodeproj \
    -scheme Bessel \
    -configuration "$CONFIG" \
    -destination "platform=iOS,name=$DEVICE_NAME" \
    -derivedDataPath build \
    -allowProvisioningUpdates \
    build

  xcrun devicectl device install app --device "$DEVICE_ID" \
    "build/Build/Products/$CONFIG-iphoneos/Bessel.app"
done

echo "Installed [$CONFIGS] on $DEVICE_NAME ($(date))"
