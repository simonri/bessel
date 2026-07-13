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
| Release | Bessel | `com.simonri.bessel` | `https://api.getbessel.com` |

Xcode's Run button and `scripts/deploy.sh` install the Debug (dev) app
directly. The prod app is distributed through **AltStore** (below). With
AltStore itself that's 3/3 free-team app slots — nothing else can be sideloaded.

## Setup

1. **Config** — copy `Config/Dev.example.xcconfig` → `Config/Dev.xcconfig` and
   `Config/Prod.example.xcconfig` → `Config/Prod.xcconfig`, and fill in the
   Auth0 values (same as `VITE_AUTH0_*` in `apps/web/.env`). Dev's
   `API_BASE_URL` must be reachable *from the phone* — the Mac's LAN IP, not
   localhost.
2. **Auth0 dashboard** — add both native callbacks to the application's
   *Allowed Callback URLs*:
   `com.simonri.bessel://<AUTH0_DOMAIN>/ios/com.simonri.bessel/callback`,
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
  (keep the bundle ID stable).
- No paid capabilities: **no push notifications** (APNs), App Groups, iCloud,
  Sign in with Apple, or universal links. Custom URL schemes, Keychain (own app),
  and local notifications all work — which is why auth uses the
  `com.simonri.bessel://` scheme rather than universal links.

### Prod app via AltStore

The prod app is installed and refreshed by AltStore, which re-signs it in the
background whenever the phone can reach AltServer on the Mac (same Wi-Fi):

- Ship a new prod build: `make ios-deploy` (or `apps/ios/scripts/export-ipa.sh`
  directly) → builds, writes `Bessel.ipa` to iCloud Drive/Bessel and
  `apps/ios/build/Bessel.ipa`, then runs the "Ship IPA" Shortcut to pop the
  AirDrop share sheet with the .ipa pre-loaded — tap the phone, then on the
  phone tap Accept (iOS offers "Open in AltStore" automatically for .ipa
  files). AltStore only *re-signs* the build it was given; new code always
  goes through a new .ipa.
- One-time setup for the Shortcut (Shortcuts app → **+** → name it "Ship IPA"):
  add a **Get File** action (so it accepts an input file) and a **Share**
  action fed from that file. If the Shortcut doesn't exist yet, the script
  just skips straight to the old manual flow (open Bessel.ipa from Files and
  share to AltStore).
- AltStore rewrites the bundle ID when re-signing. Sign-in survives because the
  OAuth callback scheme is baked into Info.plist (`AUTH_CALLBACK_SCHEME`)
  rather than read from the runtime bundle ID.
- Requirements: AltServer running on the Mac (menu-bar app, signed into the
  Apple ID), Background App Refresh enabled for AltStore on the phone.

### Auto-renewing the dev app's 7-day signature

`scripts/deploy.sh` rebuilds and reinstalls the dev app over Wi-Fi (`xcodebuild
-allowProvisioningUpdates` + `xcrun devicectl`). The launchd agent runs it
Mondays and Fridays at 09:00 so the gap never exceeds ~4 days; launchd runs
missed jobs at next wake:

```bash
cp scripts/com.simonri.bessel.refresh.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.simonri.bessel.refresh.plist
```

Requirements at refresh time: Mac awake, phone on the same Wi-Fi, Apple ID
session in Xcode still valid. That session expires every month or two and needs
an interactive re-login (2FA) — the script posts a macOS notification when the
refresh fails so it doesn't die silently. Logs: `/tmp/bessel-ios-refresh.log`.

Manual refresh any time:

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
