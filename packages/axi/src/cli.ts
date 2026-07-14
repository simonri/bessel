import { AxiError, runAxiCli } from "axi-sdk-js";
import {
  cachedTokenStatus,
  checkBrokerReachable,
  clearCache,
  forceRebroker,
} from "./auth.js";
import { TASKS_HELP, tasksCommand } from "./tasks.js";

export const DESCRIPTION =
  "Agent-ergonomic CLI for your personal Bessel data. Prefer this over the API directly for querying Bessel.";

const VERSION = __BESSEL_AXI_VERSION__;

export const TOP_HELP = `usage: bessel-axi [command] [args] [flags]
commands[2]:
  (none)=home, tasks, auth
flags[2]:
  --help, -v/-V/--version
examples:
  bessel-axi
  bessel-axi tasks list
  bessel-axi tasks list --status todo
  bessel-axi auth status
`;

async function homeCommand(): Promise<Record<string, unknown>> {
  const cache = cachedTokenStatus();
  const brokerReachable = cache.cached ? true : await checkBrokerReachable();
  return {
    auth: cache.cached
      ? "cached token"
      : brokerReachable
        ? "desktop app reachable, not yet authenticated"
        : "desktop app not running",
    help: ["Run `bessel-axi tasks list` to view your tasks"],
  };
}

async function authCommand(args: string[]): Promise<Record<string, unknown>> {
  const sub = args[0];

  if (sub === undefined || sub === "status") {
    const cache = cachedTokenStatus();
    const brokerReachable = await checkBrokerReachable();
    const out: Record<string, unknown> = {
      cached_token: cache.cached,
      valid_for_seconds: cache.validForSeconds,
      broker_reachable: brokerReachable,
    };
    if (!brokerReachable) {
      out.help = ["Open the Bessel desktop app and make sure you're logged in"];
    }
    return out;
  }

  if (sub === "login") {
    await forceRebroker();
    return {
      status: "ok",
      message: "Re-brokered a fresh token from the desktop app",
    };
  }

  if (sub === "logout") {
    clearCache();
    return { status: "ok", message: "Cleared cached credentials" };
  }

  throw new AxiError(`Unknown auth subcommand: ${sub}`, "VALIDATION_ERROR", [
    "Valid subcommands: status, login, logout",
  ]);
}

export async function main(options: { argv?: string[] } = {}): Promise<void> {
  await runAxiCli({
    ...(options.argv ? { argv: options.argv } : {}),
    description: DESCRIPTION,
    version: VERSION,
    topLevelHelp: TOP_HELP,
    home: homeCommand,
    commands: {
      tasks: tasksCommand,
      auth: authCommand,
    },
    getCommandHelp: (command) => (command === "tasks" ? TASKS_HELP : undefined),
  });
}
