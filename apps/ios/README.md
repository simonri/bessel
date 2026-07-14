# Bessel iOS

Native SwiftUI app (iOS 17+). Currently implements auth (the same Auth0 + Google
OAuth the web/desktop apps use) and the tasks/todo list.

The Xcode project is generated — `Bessel.xcodeproj` is gitignored. Source of truth
is `project.yml` (XcodeGen).

## Dev and prod apps

Two build configurations produce two separate apps that install side by side:

| Configuration | App | Bundle ID | API |
|---|---|---|---|
| Debug | Bessel Dev | `com.simonri.bessel.dev` | Mac's LAN IP (`uv run task api`) |
| Release | Bessel | `com.simonri.bessel.WQH84QWCFP` | `https://api.getbessel.com` |

Both apps are installed the same way: directly, over Wi-Fi (or USB), via
Xcode's Run button (Debug only) or `scripts/deploy.sh` (either or both —
see below). No AltStore, no `.ipa` export, no AirDrop — that whole path was
retired because it silently dropped the HealthKit entitlement (see below).

### Why the prod bundle ID looks like that

Bessel used to be free-sideloaded twice: once directly (dev) and once
re-signed by AltStore (prod), which rewrites the bundle ID it's given. When
we moved prod to direct installs to fix HealthKit (below), Apple's device-side
free-provisioning tracker already had 3 App IDs on file for this device
(dev, AltStore itself, and AltStore's rewritten prod ID) — the max — and that
tracker doesn't free a slot on uninstall, only after its own rolling ~7-day
window. So prod now reuses AltStore's old rewritten ID
(`com.simonri.bessel.WQH84QWCFP`) rather than waiting out the window to
reclaim the clean `com.simonri.bessel`. Ugly, but it's an already-registered
App ID slot, not a new one — swap it back to `com.simonri.bessel` later if
you want, once a slot frees up and AltStore is uninstalled (it's no longer
needed for Bessel at all, freeing its slot for something else).

## Setup

1. **Config** — copy `Config/Dev.example.xcconfig` → `Config/Dev.xcconfig` and
   `Config/Prod.example.xcconfig` → `Config/Prod.xcconfig`, and fill in the
   Auth0 values (same as `VITE_AUTH0_*` in `apps/web/.env`). Dev's
   `API_BASE_URL` must be reachable *from the phone* — the Mac's LAN IP, not
   localhost.
2. **Auth0 dashboard** — add both native callbacks to the application's
   *Allowed Callback URLs*:
   `com.simonri.bessel.WQH84QWCFP://<AUTH0_DOMAIN>/ios/com.simonri.bessel.WQH84QWCFP/callback`,
   `com.simonri.bessel.dev://<AUTH0_DOMAIN>/ios/com.simonri.bessel.dev/callback`
3. **Generate + open**:
   ```bash
   cd apps/ios
   xcodegen generate    # brew install xcodegen
   open Bessel.xcodeproj
   ```
4. **Phone (one-time)** — sign your Apple ID into Xcode (Settings → Accounts),
   plug the iPhone in once to pair, enable Developer Mode
   (Settings → Privacy & Security → Developer Mode), then Run. On first launch,
   trust the certificate under Settings → General → VPN & Device Management.

## Running without a paid Apple Developer account

Free "Personal Team" signing is used (team `WQH84QWCFP` in `project.yml`). The
constraints:

- The signature **expires after 7 days** — the app stops launching (data is kept).
  Reinstalling from the same team resets the clock and preserves data.
- Max **3 sideloaded apps** per device, max **10 bundle IDs per rolling week**
  (keep bundle IDs stable — see "Why the prod bundle ID looks like that" above).
  The 3-app tracker is historical, not live: uninstalling an app does **not**
  free its slot before the rolling window rolls over.
- No paid capabilities: **no push notifications** (APNs), App Groups, iCloud,
  Sign in with Apple, or universal links. Custom URL schemes, Keychain (own app),
  and local notifications all work — which is why auth uses the
  `com.simonri.bessel.WQH84QWCFP://` scheme rather than universal links.
  HealthKit *does* work on a free Personal Team — it only failed when prod was
  distributed through AltStore (below), which doesn't provision the capability.

### Ship a new prod build

```bash
make ios-deploy
# or: CONFIGS=Release apps/ios/scripts/deploy.sh
```

Direct-installs over Wi-Fi (or USB) via `xcodebuild -allowProvisioningUpdates`
+ `xcrun devicectl`, same as the dev app. Requires the phone on the same
network (or plugged in) and Xcode's Apple ID session still valid.

We used to distribute prod through AltStore instead, so its 7-day signature
could refresh in the background without opening Xcode. That was dropped: **AltStore
re-signs the `.ipa` with its own App ID and doesn't provision capabilities it
doesn't already know about**, so the entitlements requested in
`Bessel.entitlements` (HealthKit) got silently dropped, crashing the app the
first time it touched a HealthKit API — even though the local build's
signature correctly embedded them. If you ever see "Missing entitlement" on
an installed app again, suspect whatever signed it isn't reading this
project's entitlements — same failure mode, different cause.

### Auto-renewing both apps' 7-day signatures

`scripts/deploy.sh` defaults to installing both configs, so the same launchd
job now keeps both signatures fresh. It runs Mondays and Fridays at 09:00 so
the gap never exceeds ~4 days; launchd runs missed jobs at next wake:

```bash
cp scripts/com.simonri.bessel.refresh.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.simonri.bessel.refresh.plist
```

Requirements at refresh time: Mac awake, phone on the same Wi-Fi, Apple ID
session in Xcode still valid. That session expires every month or two and needs
an interactive re-login (2FA) — the script posts a macOS notification when the
refresh fails so it doesn't die silently. Logs: `/tmp/bessel-ios-refresh.log`.

Manual refresh any time (both apps):

```bash
./scripts/deploy.sh
```

## Architecture

- `Bessel/Auth` — Auth0 authorization-code + PKCE via `ASWebAuthenticationSession`
  (native analog of the desktop app's loopback flow). Access/refresh tokens live
  in the Keychain; the API client attaches `Authorization: Bearer` and force-
  refreshes once on 401, mirroring the web client interceptor.
- `Bessel/API` — thin `URLSession` client for the FastAPI backend (`/v1/...`).
- `Bessel/Tasks` — models mirroring `services/api/src/api/tasks/schemas.py`,
  an observable store, and the Board / Done / All views (complete, reopen,
  create, edit, delete, reorder, project filter, done-list paging).
- `Bessel/Support/Theme.swift` — the web dark palette
  (`packages/ui/src/styles/globals.css` `.dark`) converted oklch → sRGB.
  Dark-mode only, per DESIGN.md.

Not implemented yet: creating recurring tasks from the form (recurring tasks
created on web display and complete correctly, spawning the next instance),
cross-column drag on the board (use the status field in the edit sheet), and
the other dashboard modules.
