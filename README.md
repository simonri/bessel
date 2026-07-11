# Bessel

As AI advances, its ability to optimize our lives grows — but only as fast as the data behind it. The missing piece isn't intelligence, it's context.

Bessel is a personal life dashboard that aggregates data across all domains of your life: finances, health, fitness, travel, habits, and more. The goal is a single place where your data lives, so AI has the full picture it needs to actually understand your life and surface meaningful ways to improve it.

## Stack

- **Backend**: Python / FastAPI, PostgreSQL, Redis
- **Frontend**: TypeScript / TanStack Start
- **Workers**: Dramatiq background jobs

## Development

See [CLAUDE.md](CLAUDE.md) for architecture overview and development commands.

## Desktop app (macOS)

The macOS build isn't code-signed or notarized, so Gatekeeper will refuse to
open it and say **"Bessel is damaged and can't be opened, you should move it
to the Trash"**. The app isn't actually damaged — macOS just shows this for
any unsigned app downloaded via a browser. To open it, clear the quarantine
flag after installing:

```bash
xattr -cr /Applications/Bessel.app
```

## Desktop app (Windows)

The Windows build isn't code-signed either, so SmartScreen will show **"Windows
protected your PC"** on first launch. Click **More info → Run anyway** to
proceed.
