import { AxiError } from "axi-sdk-js";
import { type ListTasksParams, listTasks, type RawTask } from "./api.js";
import { getValidToken } from "./auth.js";

export const TASKS_HELP = `usage: bessel-axi tasks list [flags]
flags[8]:
  --status <todo|in_progress|done|cancelled> (repeatable)
  --priority <0-4>
  --project <name>
  --area <name>
  --recurring
  --page <n> (default 1)
  --limit <n> (default 100, API max)
  --fields <a,b,c> or --full (default fields: id, title, status, due_date)
examples:
  bessel-axi tasks list
  bessel-axi tasks list --status todo --status in_progress
  bessel-axi tasks list --project Bessel --fields description,priority
  bessel-axi tasks list --full
`;

const DEFAULT_FIELDS = ["id", "title", "status", "due_date"];
const ALL_FIELDS = [
  "id",
  "title",
  "status",
  "due_date",
  "priority",
  "description",
  "project",
  "area",
  "tags",
  "completed_at",
  "is_recurring",
  "position",
];
const VALID_STATUSES = new Set(["todo", "in_progress", "done", "cancelled"]);
const KNOWN_FLAGS = new Set([
  "--status",
  "--priority",
  "--project",
  "--area",
  "--recurring",
  "--page",
  "--limit",
  "--fields",
  "--full",
]);
const DESCRIPTION_PREVIEW_CHARS = 800;

interface ListFlags {
  status: string[];
  priority: number | undefined;
  project: string | undefined;
  area: string | undefined;
  recurring: boolean;
  page: number;
  limit: number;
  fields: string[];
  full: boolean;
}

function parseListFlags(args: string[]): ListFlags {
  const result: ListFlags = {
    status: [],
    priority: undefined,
    project: undefined,
    area: undefined,
    recurring: false,
    page: 1,
    limit: 100,
    fields: [],
    full: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i] ?? "";
    const eqIndex = arg.indexOf("=");
    const flag = eqIndex !== -1 ? arg.slice(0, eqIndex) : arg;
    let value: string | undefined =
      eqIndex !== -1 ? arg.slice(eqIndex + 1) : undefined;

    if (!KNOWN_FLAGS.has(flag)) {
      throw new AxiError(`Unknown flag: ${flag}`, "VALIDATION_ERROR", [
        `Valid flags: ${[...KNOWN_FLAGS].join(", ")}`,
      ]);
    }

    const isBooleanFlag = flag === "--recurring" || flag === "--full";
    if (!isBooleanFlag && value === undefined) {
      i++;
      value = args[i];
      if (value === undefined) {
        throw new AxiError(`Flag ${flag} requires a value`, "VALIDATION_ERROR");
      }
    }

    switch (flag) {
      case "--status":
        if (!VALID_STATUSES.has(value as string)) {
          throw new AxiError(
            `Invalid --status value: ${value}`,
            "VALIDATION_ERROR",
            [`Valid values: ${[...VALID_STATUSES].join(", ")}`],
          );
        }
        result.status.push(value as string);
        break;
      case "--priority": {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 0 || n > 4) {
          throw new AxiError(
            `Invalid --priority value: ${value}`,
            "VALIDATION_ERROR",
            ["Must be an integer 0-4"],
          );
        }
        result.priority = n;
        break;
      }
      case "--project":
        result.project = value;
        break;
      case "--area":
        result.area = value;
        break;
      case "--recurring":
        result.recurring = true;
        break;
      case "--page": {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1) {
          throw new AxiError(
            `Invalid --page value: ${value}`,
            "VALIDATION_ERROR",
          );
        }
        result.page = n;
        break;
      }
      case "--limit": {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > 100) {
          throw new AxiError(
            `Invalid --limit value: ${value}`,
            "VALIDATION_ERROR",
            ["Must be an integer 1-100"],
          );
        }
        result.limit = n;
        break;
      }
      case "--fields":
        result.fields = (value as string)
          .split(",")
          .map((f) => f.trim())
          .filter(Boolean);
        break;
      case "--full":
        result.full = true;
        break;
    }
    i++;
  }

  for (const field of result.fields) {
    if (!ALL_FIELDS.includes(field)) {
      throw new AxiError(`Unknown field: ${field}`, "VALIDATION_ERROR", [
        `Valid fields: ${ALL_FIELDS.join(", ")}`,
      ]);
    }
  }

  return result;
}

function truncateDescription(text: string): string {
  if (text.length <= DESCRIPTION_PREVIEW_CHARS) return text;
  const preview = text.slice(0, DESCRIPTION_PREVIEW_CHARS);
  return `${preview}… (truncated, ${text.length} chars total — run \`bessel-axi tasks list --full\` for complete text)`;
}

function shapeTask(
  task: RawTask,
  fields: string[],
  truncate: boolean,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (field === "id") {
      out.id = task.id.slice(0, 8);
      continue;
    }
    if (field === "description") {
      out.description = task.description
        ? truncate
          ? truncateDescription(task.description)
          : task.description
        : null;
      continue;
    }
    out[field] = (task as unknown as Record<string, unknown>)[field];
  }
  return out;
}

async function runTasksList(args: string[]): Promise<Record<string, unknown>> {
  const flags = parseListFlags(args);
  const fields = flags.full
    ? ALL_FIELDS
    : flags.fields.length > 0
      ? [...new Set([...DEFAULT_FIELDS, ...flags.fields])]
      : DEFAULT_FIELDS;

  const token = await getValidToken();
  const params: ListTasksParams = {
    status: flags.status.length > 0 ? flags.status : undefined,
    priority: flags.priority,
    project: flags.project,
    area: flags.area,
    isRecurring: flags.recurring ? true : undefined,
    page: flags.page,
    limit: flags.limit,
  };
  const response = await listTasks(token, params);
  const { items, pagination } = response;

  if (items.length === 0) {
    return {
      tasks: [],
      summary: "0 tasks found matching these filters",
      total: pagination.total_count,
    };
  }

  const help = [
    "Run `bessel-axi tasks list --status todo` to filter by status",
    "Run `bessel-axi tasks list --fields description,priority` for more detail per task",
  ];
  if (pagination.total_count > items.length) {
    help.unshift(
      `Run \`bessel-axi tasks list --page ${flags.page + 1}\` for more ` +
        `(showing ${items.length} of ${pagination.total_count} total)`,
    );
  }

  return {
    tasks: items.map((task) => shapeTask(task, fields, !flags.full)),
    summary: `${items.length} of ${pagination.total_count} total`,
    help,
  };
}

export async function tasksCommand(
  args: string[],
): Promise<Record<string, unknown>> {
  const first = args[0];
  if (first === undefined || first.startsWith("-")) {
    return runTasksList(args);
  }
  if (first === "list") {
    return runTasksList(args.slice(1));
  }
  throw new AxiError(`Unknown tasks subcommand: ${first}`, "VALIDATION_ERROR", [
    "Only `bessel-axi tasks list` is supported today",
  ]);
}
