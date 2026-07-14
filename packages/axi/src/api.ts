import { AxiError } from "axi-sdk-js";

// Matches the default baked into packages/client/src/client.gen.ts. Kept as a
// literal here rather than importing that module: importing it would pull in
// its whole @hey-api-generated client (and transitively @tanstack/react-query)
// into this CLI's bundle for a single string constant.
const DEFAULT_BASE_URL = "https://api.getbessel.com";

export function resolveBaseUrl(): string {
  return process.env.BESSEL_API_BASE_URL || DEFAULT_BASE_URL;
}

/**
 * Wire shape of GET /v1/tasks — hand-typed rather than importing
 * TaskSchema/TaskListResponse from @bessel/client: that package's generated
 * types model timestamp fields as `Date`, which is only true after its
 * response transformer runs. This CLI calls the API directly with plain
 * fetch, so timestamps here are the raw ISO strings the API actually sends.
 */
export interface RawTask {
  id: string;
  created_at: string;
  modified_at: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  due_date: string | null;
  completed_at: string | null;
  project: string | null;
  area: string | null;
  tags: string[] | null;
  position: number;
  is_recurring: boolean;
  rrule_frequency: string | null;
  rrule_interval: number | null;
  rrule_day_of_week: number | null;
  rrule_day_of_month: number | null;
  parent_task_id: string | null;
}

export interface RawTaskListResponse {
  items: RawTask[];
  pagination: { total_count: number; max_page: number };
}

export interface ListTasksParams {
  status?: string[];
  priority?: number;
  project?: string;
  area?: string;
  isRecurring?: boolean;
  page?: number;
  limit?: number;
}

function buildQuery(params: ListTasksParams): string {
  const qs = new URLSearchParams();
  for (const s of params.status ?? []) qs.append("status", s);
  if (params.priority !== undefined)
    qs.set("priority", String(params.priority));
  if (params.project !== undefined) qs.set("project", params.project);
  if (params.area !== undefined) qs.set("area", params.area);
  if (params.isRecurring !== undefined)
    qs.set("is_recurring", String(params.isRecurring));
  qs.set("page", String(params.page ?? 1));
  qs.set("limit", String(params.limit ?? 100));
  const s = qs.toString();
  return s ? `?${s}` : "";
}

async function apiError(response: Response): Promise<AxiError> {
  const body = await response.text();
  if (response.status === 401) {
    return new AxiError(
      "The Bessel API rejected this request's credentials",
      "UNAUTHORIZED",
      ["Run `bessel-axi auth login` to re-broker a token"],
    );
  }
  return new AxiError(
    `Bessel API request failed (${response.status}): ${body.slice(0, 300)}`,
    "API_ERROR",
  );
}

export async function listTasks(
  token: string,
  params: ListTasksParams,
): Promise<RawTaskListResponse> {
  const response = await fetch(
    `${resolveBaseUrl()}/v1/tasks${buildQuery(params)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!response.ok) throw await apiError(response);
  return (await response.json()) as RawTaskListResponse;
}
