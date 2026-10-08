# Bessel

As AI advances, its ability to optimize our lives grows — but only as fast as the data behind it. The missing piece isn't intelligence, it's context.

Bessel is a personal life dashboard that aggregates data across all domains of your life: finances, health, fitness, travel, habits, and more. The goal is a single place where your data lives, so AI has the full picture it needs to actually understand your life and surface meaningful ways to improve it.

## Stack

- **Backend**: Python / FastAPI, PostgreSQL, Redis
- **Frontend**: TypeScript / TanStack Start
- **Workers**: Dramatiq background jobs

## Development

See [CLAUDE.md](CLAUDE.md) for architecture overview and development commands.

## Connect Claude (MCP)

Bessel runs a remote MCP server, so Claude can work with your Bessel data. It can plan your day from your tasks and calendar, find free time, add, update and complete tasks, search and save recipes, and read your sleep, workouts and computer activity. It can't delete anything, and it has no access to money or investments. In Claude's prompt menu, **Plan my day** and **Weekly review** start those conversations.

**Server URL:** `https://api.getbessel.com/mcp`

### Claude (web, desktop and mobile)

1. In [claude.ai](https://claude.ai), go to **Settings → Connectors → Add custom connector**.
2. Name it `Bessel`, paste the server URL, and click **Add**. Leave the advanced settings empty.
3. Click **Connect** and sign in with your Bessel account.
4. In a chat, turn on the Bessel connector and ask something like "What's on my calendar this week?"

Once it's added, the connector also works in the Claude desktop and mobile apps.

### Claude Code

```bash
claude mcp add --transport http bessel https://api.getbessel.com/mcp
```

Then run `/mcp` in Claude Code, choose **bessel**, and sign in.

### Local development

The local API serves the same endpoint at `http://localhost:8100/mcp`. Claude's web and desktop apps can't reach `localhost`, so test with Claude Code (`claude mcp add --transport http bessel-local http://localhost:8100/mcp`) or [MCP Inspector](https://github.com/modelcontextprotocol/inspector) (`npx @modelcontextprotocol/inspector`).

Sign-in goes through Auth0. For it to work, the tenant needs an API whose identifier exactly matches each MCP URL. It also needs Dynamic Client Registration and the Resource Parameter Compatibility Profile turned on, and the login connection promoted to domain level. The tools live in `services/api/src/api/mcp/`.

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
