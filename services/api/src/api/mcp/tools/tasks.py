"""Task tools: plan the day, find, add, update, complete, and hand a task to a coding agent."""

from collections import Counter
from collections.abc import Sequence
from datetime import date, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from mcp.server.mcpserver import Context
from mcp.server.mcpserver.exceptions import ToolError
from pydantic import Field
from sqlalchemy import func, nulls_last

from api.common.schemas import Schema
from api.common.utils import utc_now
from api.mcp.context import user_session
from api.mcp.dates import Day, TimezoneParam, local_window, parse_day, resolve_timezone, today_in
from api.mcp.tools.common import ToolSpec, read, write
from api.models.project import Project
from api.models.task import Task as TaskModel
from api.models.user import User
from api.postgres import AsyncSession
from api.projects.repository import ProjectDeviceConfigRepository, ProjectRepository
from api.tasks.repository import TaskRepository
from api.tasks.schemas import OPEN_TASK_STATUSES, RruleFrequency, TaskCreate, TaskStatus
from api.tasks.service import task_service

MAX_BATCH = 50
MAX_OVERVIEW_GROUP = 30
MAX_COMPLETED_DAYS = 366
# A repeated add of the same open task this soon after the first is a retry, not a new task.
DUPLICATE_WINDOW = timedelta(minutes=10)
OPEN_STATUSES = OPEN_TASK_STATUSES
# What start_task may pick up next; in-review work waits for the user.
WORKABLE_STATUSES = ("todo", "in_progress")

Priority = Literal["none", "low", "medium", "high", "urgent"]
PRIORITIES: tuple[Priority, ...] = ("none", "low", "medium", "high", "urgent")
Weekday = Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
WEEKDAYS: tuple[Weekday, ...] = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
ResponseFormat = Annotated[
  Literal["concise", "detailed"],
  Field(description="'concise' (default) for lists; 'detailed' adds notes, attachments and timestamps."),
]


# MARK: - Output


class Task(Schema):
  id: UUID
  title: str
  status: TaskStatus
  priority: Priority
  due: date | None
  due_label: str | None = Field(description="The due day relative to today, e.g. 'today', 'overdue by 2 days', 'in 3 days (Sat)'.")
  project: str | None
  tags: list[str] | None
  repeats: str | None = Field(description="How a routine repeats, e.g. 'every 2 weeks on Mon'; null for one-off tasks.")
  notes: str | None = Field(default=None, description="Only in detailed responses.")
  attachments: list[str] | None = Field(default=None, description="Attached image file names; only in detailed responses.")
  created_at: datetime | None = Field(default=None, description="Only in detailed responses.")
  completed_at: datetime | None = None


class Tasks(Schema):
  total_count: int = Field(description="All matching tasks, including any beyond `limit`.")
  tasks: list[Task]


class ProjectSummary(Schema):
  name: str
  open_tasks: int


class OverviewCounts(Schema):
  open: int
  in_progress: int
  in_review: int
  overdue: int
  due_today: int
  next_6_days: int
  later: int
  no_due_date: int


class TaskOverview(Schema):
  today: date
  timezone: str
  in_progress: list[Task]
  in_review: list[Task] = Field(description="Finished work waiting for the user to check it.")
  overdue: list[Task] = Field(description="Most overdue first.")
  due_today: list[Task]
  next_6_days: list[Task] = Field(description="Due tomorrow through 6 days from now, soonest first.")
  routines_due: list[Task] = Field(description="Repeating tasks due today or earlier.")
  counts: OverviewCounts = Field(description="Open one-off tasks per group; lists above are capped at 30.")
  projects: list[ProjectSummary] = Field(description="Every project with its open task count, most open first.")
  tags: list[str]


class CompletedTasks(Schema):
  total_count: int
  per_project: dict[str, int] = Field(description="Completed tasks per project in the range; '(no project)' for the rest.")
  tasks: list[Task] = Field(description="Most recently completed first.")


class AddedTasks(Schema):
  created: list[Task]
  already_existed: list[Task] = Field(description="Open tasks with the same title and project added in the last 10 minutes; not created again.")


class CompletedTask(Schema):
  task: Task
  next_occurrence: Task | None = Field(description="The next occurrence a routine spawned.")


class CompleteResult(Schema):
  completed: list[CompletedTask]
  already_done: list[UUID]


class StartedTask(Schema):
  task: Task
  project_paths: list[str] = Field(description="Folders the task's project is linked to on the user's machines.")
  brief: str = Field(description="A ready-to-use brief for working on the task.")


# MARK: - Inputs


class Repeat(Schema):
  every: Literal["day", "week", "month", "year"]
  interval: int = Field(default=1, ge=1, le=365, description="E.g. 2 with every='week' for every other week.")
  weekday: Weekday | None = Field(default=None, description="For weekly routines: the day it falls on.")
  day_of_month: int | None = Field(default=None, ge=1, le=31, description="For monthly routines.")


class NewTask(Schema):
  title: str = Field(min_length=1, max_length=500)
  notes: str | None = None
  due: Day | None = None
  priority: Priority = "none"
  project: str | None = Field(default=None, description="An existing project name (loosely matched). See get_task_overview for the list.")
  new_project: bool = Field(default=False, description="Create `project` if it doesn't exist yet. Only when the user asked for a new project.")
  tags: list[str] | None = None
  status: Literal["todo", "in_progress"] = "todo"
  repeat: Repeat | None = Field(default=None, description="Makes the task a routine that comes back after each completion.")


class TaskChange(Schema):
  task_id: UUID
  title: str | None = Field(default=None, min_length=1, max_length=500)
  notes: str | None = Field(default=None, description="Replaces the notes. Prefer append_note to keep what's there.")
  append_note: str | None = Field(default=None, description="Added to the end of the notes on a new line, dated.")
  due: str | None = Field(default=None, description="A day (same formats as elsewhere), or 'none' to clear it.")
  priority: Priority | None = None
  project: str | None = Field(default=None, description="An existing project name, or 'none' to remove the task from its project.")
  tags: list[str] | None = Field(default=None, description="Replaces the tags.")
  status: Literal["todo", "in_progress", "in_review", "cancelled"] | None = Field(
    default=None, description="'in_review' when the work is finished and the user should check it. Use complete_tasks to mark tasks done."
  )
  repeat: Repeat | None = None
  stop_repeating: bool = Field(default=False, description="Turns a routine into a one-off task.")


# MARK: - Helpers


def _due_label(due: date | None, today: date) -> str | None:
  if due is None:
    return None
  days = (due - today).days
  if days == 0:
    return "today"
  if days == 1:
    return "tomorrow"
  if days < 0:
    return "overdue by 1 day" if days == -1 else f"overdue by {-days} days"
  if days < 7:
    return f"in {days} days ({due.strftime('%a')})"
  return f"in {days} days"


def _repeats(task: TaskModel) -> str | None:
  if not task.is_recurring or not task.rrule_frequency:
    return None
  unit = {"daily": "day", "weekly": "week", "monthly": "month", "yearly": "year"}[task.rrule_frequency]
  interval = task.rrule_interval or 1
  label = f"every {unit}" if interval == 1 else f"every {interval} {unit}s"
  if task.rrule_frequency == "weekly" and task.rrule_day_of_week is not None:
    label += f" on {WEEKDAYS[task.rrule_day_of_week].capitalize()}"
  if task.rrule_frequency == "monthly" and task.rrule_day_of_month is not None:
    label += f" on day {task.rrule_day_of_month}"
  return label


def to_task(task: TaskModel, today: date, *, detailed: bool = False) -> Task:
  return Task(
    id=task.id,
    title=task.title,
    status=TaskStatus(task.status),
    priority=PRIORITIES[task.priority],
    due=task.due_date,
    due_label=_due_label(task.due_date, today) if task.status in OPEN_STATUSES else None,
    project=task.project_obj.name if task.project_obj else None,
    tags=task.tags or None,
    repeats=_repeats(task),
    notes=task.description if detailed else None,
    attachments=[a.filename for a in task.attachments] if detailed else None,
    created_at=task.created_at if detailed else None,
    completed_at=task.completed_at,
  )


def _repeat_fields(repeat: Repeat) -> dict[str, object]:
  frequency = {"day": RruleFrequency.daily, "week": RruleFrequency.weekly, "month": RruleFrequency.monthly, "year": RruleFrequency.yearly}[repeat.every]
  return {
    "is_recurring": True,
    "rrule_frequency": frequency,
    "rrule_interval": repeat.interval,
    "rrule_day_of_week": WEEKDAYS.index(repeat.weekday) if repeat.weekday else None,
    "rrule_day_of_month": repeat.day_of_month,
  }


def match_project(name: str, projects: Sequence[Project]) -> Project | None:
  """The project `name` refers to: exact (any case), else the only one starting with or containing it."""
  wanted = name.strip().casefold()
  for candidates in (
    [p for p in projects if p.name.casefold() == wanted],
    [p for p in projects if p.name.casefold().startswith(wanted)],
    [p for p in projects if wanted in p.name.casefold()],
  ):
    if len(candidates) == 1:
      return candidates[0]
    if len(candidates) > 1:
      raise ToolError(f"{name!r} matches several projects: {', '.join(p.name for p in candidates)}. Use the full name.")
  return None


def _unknown_project(name: str, projects: Sequence[Project]) -> ToolError:
  names = ", ".join(sorted(p.name for p in projects)) or "none yet"
  return ToolError(f"No project called {name!r}. The user's projects: {names}. Set new_project=true only if the user wants a new one.")


def _tz_today(user: User, timezone: str | None) -> tuple[ZoneInfo, date]:
  tz = resolve_timezone(user, timezone)
  return tz, today_in(tz)


async def _owned_tasks(session: AsyncSession, user: User, task_ids: Sequence[UUID]) -> dict[UUID, TaskModel]:
  """The user's tasks by id, failing on any id that isn't theirs before anything changes."""
  if len(task_ids) > MAX_BATCH:
    raise ToolError(f"At most {MAX_BATCH} tasks per call.")
  tasks = {t.id: t for t in await TaskRepository.from_session(session).list_by_ids_for_user(list(task_ids), user.id)}
  missing = [str(task_id) for task_id in task_ids if task_id not in tasks]
  if missing:
    raise ToolError(f"No task with id {', '.join(missing)}. Nothing was changed. Use find_tasks to look up ids.")
  return tasks


def _dated_note(existing: str | None, note: str, today: date) -> str:
  entry = f"[{today.isoformat()}] {note.strip()}"
  return f"{existing.rstrip()}\n\n{entry}" if existing and existing.strip() else entry


# MARK: - Read tools


async def get_task_overview(ctx: Context, timezone: TimezoneParam = None) -> TaskOverview:
  """What's on the user's plate: tasks in progress, overdue, due today and over the next 6 days, routines due,
  plus every project and tag (the names other task tools accept).

  Call it first for "what should I focus on today?", a morning plan, "what's overdue?", or before adding tasks
  so you know the existing projects.
  """
  async with user_session(ctx) as (session, user):
    tz, today = _tz_today(user, timezone)
    repo = TaskRepository.from_session(session)
    open_tasks = await repo.get_all(
      repo.get_filtered_statement(user.id, statuses=OPEN_STATUSES).order_by(nulls_last(TaskModel.due_date.asc()), TaskModel.priority.desc(), TaskModel.position)
    )
    projects = await ProjectRepository.from_session(session).list_for_user(user.id)
    open_counts = await repo.open_counts_by_project(user.id)
    tags = await repo.list_tags(user.id)

    in_progress, in_review, overdue, due_today, soon, routines = [], [], [], [], [], []
    counts = Counter[str]()
    for task in open_tasks:
      if task.is_recurring:
        if task.due_date is None or task.due_date <= today:
          routines.append(task)
        continue
      counts["open"] += 1
      if task.status == "in_review":
        counts["in_review"] += 1
        in_review.append(task)
        continue
      if task.status == "in_progress":
        counts["in_progress"] += 1
        in_progress.append(task)
        continue
      if task.due_date is None:
        counts["no_due_date"] += 1
      elif task.due_date < today:
        counts["overdue"] += 1
        overdue.append(task)
      elif task.due_date == today:
        counts["due_today"] += 1
        due_today.append(task)
      elif task.due_date <= today + timedelta(days=6):
        counts["next_6_days"] += 1
        soon.append(task)
      else:
        counts["later"] += 1

    def shown(tasks: list[TaskModel]) -> list[Task]:
      return [to_task(t, today) for t in tasks[:MAX_OVERVIEW_GROUP]]

    return TaskOverview(
      today=today,
      timezone=tz.key,
      in_progress=shown(in_progress),
      in_review=shown(in_review),
      overdue=shown(overdue),
      due_today=shown(due_today),
      next_6_days=shown(soon),
      routines_due=shown(routines),
      counts=OverviewCounts(**{field: counts[field] for field in OverviewCounts.model_fields}),
      projects=sorted(
        (ProjectSummary(name=p.name, open_tasks=open_counts.get(p.id, 0)) for p in projects),
        key=lambda p: (-p.open_tasks, p.name.casefold()),
      ),
      tags=tags,
    )


async def find_tasks(
  ctx: Context,
  search: Annotated[str | None, Field(description="Case-insensitive text in the title or notes.")] = None,
  project: Annotated[str | None, Field(description="Project name, loosely matched.")] = None,
  tag: str | None = None,
  status: Literal["open", "todo", "in_progress", "in_review", "done", "cancelled", "any"] = "open",
  due: Annotated[
    Literal["overdue", "today", "tomorrow", "this_week", "next_7_days", "no_date"] | None,
    Field(description="'this_week' is Monday to Sunday of the current week."),
  ] = None,
  due_from: Annotated[str | None, Field(description="Due on or after this day.")] = None,
  due_to: Annotated[str | None, Field(description="Due on or before this day.")] = None,
  min_priority: Priority | None = None,
  routines: Annotated[bool | None, Field(description="true for repeating tasks only, false to leave them out.")] = None,
  sort: Literal["due", "priority", "updated", "created"] = "due",
  limit: Annotated[int, Field(ge=1, le=200)] = 50,
  response_format: ResponseFormat = "concise",
  timezone: TimezoneParam = None,
) -> Tasks:
  """Tasks matching any combination of filters, by default open ones sorted by due date then priority.

  For "anything urgent for Bessel this week?", "do I have a task about the passport?", "what's in progress?",
  "what has no due date?". For finished work use find_completed_tasks.
  """
  async with user_session(ctx) as (session, user):
    tz, today = _tz_today(user, timezone)
    project_id = None
    if project is not None:
      projects = await ProjectRepository.from_session(session).list_for_user(user.id)
      matched = match_project(project, projects)
      if matched is None:
        raise _unknown_project(project, projects)
      project_id = matched.id

    start, end = (parse_day(due_from, today) if due_from else None), (parse_day(due_to, today) if due_to else None)
    has_due_date = None
    match due:
      case "overdue":
        end = today - timedelta(days=1)
      case "today":
        start = end = today
      case "tomorrow":
        start = end = today + timedelta(days=1)
      case "this_week":
        start, end = today - timedelta(days=today.weekday()), today + timedelta(days=6 - today.weekday())
      case "next_7_days":
        start, end = today, today + timedelta(days=6)
      case "no_date":
        has_due_date = False

    statuses = {"open": OPEN_STATUSES, "any": None}.get(status, (status,))
    repo = TaskRepository.from_session(session)
    statement = repo.get_filtered_statement(
      user.id,
      statuses=statuses,
      search=search,
      project_id=project_id,
      tag=tag,
      min_priority=PRIORITIES.index(min_priority) if min_priority else None,
      due_from=start,
      due_to=end,
      has_due_date=has_due_date,
      is_recurring=routines,
    )
    order = {
      "due": (nulls_last(TaskModel.due_date.asc()), TaskModel.priority.desc(), TaskModel.position),
      "priority": (TaskModel.priority.desc(), nulls_last(TaskModel.due_date.asc()), TaskModel.position),
      "updated": (func.coalesce(TaskModel.modified_at, TaskModel.created_at).desc(),),
      "created": (TaskModel.created_at.desc(),),
    }[sort]
    rows, total_count = await repo.paginate(statement.order_by(*order, TaskModel.id), limit=limit, page=1)
    detailed = response_format == "detailed"
    return Tasks(total_count=total_count, tasks=[to_task(t, today, detailed=detailed) for t in rows])


async def find_completed_tasks(
  ctx: Context,
  start: Day = "7 days ago",
  end: Day = "today",
  project: Annotated[str | None, Field(description="Project name, loosely matched.")] = None,
  search: str | None = None,
  limit: Annotated[int, Field(ge=1, le=200)] = 100,
  timezone: TimezoneParam = None,
) -> CompletedTasks:
  """Tasks the user completed between two days (inclusive), with a per-project count.

  For a weekly review, a standup ("what did I do yesterday?"), or "write up what I got done this month".
  """
  async with user_session(ctx) as (session, user):
    tz, today = _tz_today(user, timezone)
    window_start, window_end = local_window(parse_day(start, today), parse_day(end, today), tz, max_days=MAX_COMPLETED_DAYS)
    project_id = None
    if project is not None:
      projects = await ProjectRepository.from_session(session).list_for_user(user.id)
      matched = match_project(project, projects)
      if matched is None:
        raise _unknown_project(project, projects)
      project_id = matched.id
    repo = TaskRepository.from_session(session)
    statement = repo.get_filtered_statement(
      user.id, statuses=("done",), project_id=project_id, search=search, completed_after=window_start, completed_before=window_end
    )
    every = await repo.get_all(statement.order_by(TaskModel.completed_at.desc(), TaskModel.id))
    per_project = Counter(t.project_obj.name if t.project_obj else "(no project)" for t in every)
    return CompletedTasks(total_count=len(every), per_project=dict(per_project.most_common()), tasks=[to_task(t, today) for t in every[:limit]])


async def get_task(ctx: Context, task_id: UUID, timezone: TimezoneParam = None) -> Task:
  """One task in full, with its notes and attachments."""
  async with user_session(ctx) as (session, user):
    _, today = _tz_today(user, timezone)
    task = await TaskRepository.from_session(session).get_owned_or_404(task_id, user.id, not_found_message="Task not found.")
    return to_task(task, today, detailed=True)


# MARK: - Write tools


async def add_tasks(ctx: Context, tasks: Annotated[list[NewTask], Field(min_length=1, max_length=MAX_BATCH)], timezone: TimezoneParam = None) -> AddedTasks:
  """Adds one or more tasks in one go.

  For "remind me to renew my passport next week", turning meeting notes or a brain dump into tasks, or filing
  follow-ups from a code review under a project. Use existing project names (get_task_overview lists them).
  Retrying the same add within 10 minutes doesn't create duplicates.
  """
  async with user_session(ctx) as (session, user):
    _, today = _tz_today(user, timezone)
    projects = await ProjectRepository.from_session(session).list_for_user(user.id)

    # Everything is checked before the first task is created.
    prepared: list[tuple[NewTask, str | None, Project | None, date | None]] = []
    for item in tasks:
      project_name, project_obj = None, None
      if item.project is not None:
        project_obj = match_project(item.project, projects)
        if project_obj is None and not item.new_project:
          raise _unknown_project(item.project, projects)
        project_name = project_obj.name if project_obj else item.project.strip()
      prepared.append((item, project_name, project_obj, parse_day(item.due, today) if item.due else None))

    repo = TaskRepository.from_session(session)
    created: list[Task] = []
    existed: list[Task] = []
    for item, project_name, project_obj, due_date in prepared:
      duplicate = await repo.find_recent_open_by_title(user.id, item.title.strip(), project_obj.id if project_obj else None, utc_now() - DUPLICATE_WINDOW)
      if duplicate is not None:
        existed.append(to_task(duplicate, today))
        continue
      body = TaskCreate(
        title=item.title.strip(),
        description=item.notes,
        status=TaskStatus(item.status),
        priority=PRIORITIES.index(item.priority),
        due_date=due_date,
        project=project_name,
        tags=item.tags,
        **(_repeat_fields(item.repeat) if item.repeat else {}),
      )
      created.append(to_task(await task_service.create(session, user.id, body), today))
    return AddedTasks(created=created, already_existed=existed)


async def update_tasks(ctx: Context, changes: Annotated[list[TaskChange], Field(min_length=1, max_length=MAX_BATCH)], timezone: TimezoneParam = None) -> Tasks:
  """Changes one or more tasks: reschedule, re-prioritize, move between projects, start, cancel, rename,
  retag, or append a progress note.

  For "push all overdue Personal tasks to Saturday", "bump the passport task to urgent", "I'm starting on X",
  or a coding agent noting what it did. Only the fields given change. All changes apply or none do.
  """
  async with user_session(ctx) as (session, user):
    _, today = _tz_today(user, timezone)
    owned = await _owned_tasks(session, user, [c.task_id for c in changes])
    projects = await ProjectRepository.from_session(session).list_for_user(user.id)

    planned: list[tuple[TaskModel, dict[str, object]]] = []
    for change in changes:
      task = owned[change.task_id]
      fields: dict[str, object] = {}
      if change.title is not None:
        fields["title"] = change.title.strip()
      if change.notes is not None:
        fields["description"] = change.notes
      if change.append_note:
        fields["description"] = _dated_note(str(fields.get("description", task.description) or ""), change.append_note, today)
      if change.due is not None:
        fields["due_date"] = None if change.due.strip().lower() == "none" else parse_day(change.due, today)
      if change.priority is not None:
        fields["priority"] = PRIORITIES.index(change.priority)
      if change.project is not None:
        if change.project.strip().lower() == "none":
          fields["project"] = None
        else:
          matched = match_project(change.project, projects)
          if matched is None:
            raise _unknown_project(change.project, projects)
          fields["project"] = matched.name
      if change.tags is not None:
        fields["tags"] = change.tags
      if change.status is not None:
        if task.status == "done":
          raise ToolError(f"{task.title!r} is done. Use undo_complete_tasks to reopen it first. Nothing was changed.")
        fields["status"] = change.status
      if change.repeat is not None:
        fields.update(_repeat_fields(change.repeat))
      if change.stop_repeating:
        fields.update(is_recurring=False, rrule_frequency=None)
      planned.append((task, fields))

    for task, fields in planned:
      await task_service.update(session, task, fields)
    updated = [to_task(task, today) for task, _ in planned]
    return Tasks(total_count=len(updated), tasks=updated)


async def complete_tasks(
  ctx: Context, task_ids: Annotated[list[UUID], Field(min_length=1, max_length=MAX_BATCH)], timezone: TimezoneParam = None
) -> CompleteResult:
  """Marks tasks done. A completed routine schedules its next occurrence, which is returned.

  For "I paid rent and did the laundry", or a coding agent finishing the task it started.
  """
  async with user_session(ctx) as (session, user):
    _, today = _tz_today(user, timezone)
    owned = await _owned_tasks(session, user, task_ids)
    completed: list[CompletedTask] = []
    already_done: list[UUID] = []
    for task_id in task_ids:
      task = owned[task_id]
      if task.status == "done":
        already_done.append(task_id)
        continue
      next_task = await task_service.complete(session, task)
      completed.append(CompletedTask(task=to_task(task, today), next_occurrence=to_task(next_task, today) if next_task else None))
    return CompleteResult(completed=completed, already_done=already_done)


async def undo_complete_tasks(
  ctx: Context, task_ids: Annotated[list[UUID], Field(min_length=1, max_length=MAX_BATCH)], timezone: TimezoneParam = None
) -> Tasks:
  """Reopens completed tasks, also removing the next occurrence a completed routine scheduled.

  For "oops, I didn't actually finish that" right after complete_tasks.
  """
  async with user_session(ctx) as (session, user):
    _, today = _tz_today(user, timezone)
    owned = await _owned_tasks(session, user, task_ids)
    for task_id in task_ids:
      await task_service.undo_complete(session, owned[task_id])
    reopened = [to_task(owned[task_id], today) for task_id in task_ids]
    return Tasks(total_count=len(reopened), tasks=reopened)


async def _project_paths(session: AsyncSession, projects: Sequence[Project]) -> dict[UUID, list[str]]:
  paths: dict[UUID, list[str]] = {p.id: [p.path] if p.path else [] for p in projects}
  for config in await ProjectDeviceConfigRepository.from_session(session).list_for_projects([p.id for p in projects]):
    if config.path and config.path not in paths[config.project_id]:
      paths[config.project_id].append(config.path)
  return paths


def _project_for_path(path: str, projects: Sequence[Project], paths: dict[UUID, list[str]]) -> Project | None:
  """The project whose folder is `path` or the closest folder above it."""
  wanted = path.rstrip("/")
  best: tuple[int, Project] | None = None
  for project in projects:
    for folder in paths[project.id]:
      folder = folder.rstrip("/")
      if (wanted == folder or wanted.startswith(folder + "/")) and (best is None or len(folder) > best[0]):
        best = (len(folder), project)
  return best[1] if best else None


def _brief(task: TaskModel, paths: list[str]) -> str:
  parts = [f"Implement this task:\nTitle: {task.title}"]
  if task.description:
    parts.append(f"Description: {task.description}")
  if task.attachments:
    parts.append(f"Attached images (view them in Bessel): {', '.join(a.filename for a in task.attachments)}")
  if paths:
    parts.append(f"Project folder: {', '.join(paths)}")
  parts.append(f"Task id: {task.id}. Note progress with update_tasks(append_note=...).")
  parts.append("When it's done, call complete_tasks, or update_tasks(status='in_review') if the user should check it first.")
  return "\n\n".join(parts)


async def start_task(
  ctx: Context,
  task_id: Annotated[UUID | None, Field(description="A specific task to start. Leave empty to pick the next one.")] = None,
  project: Annotated[str | None, Field(description="Pick the next task in this project (loosely matched).")] = None,
  project_path: Annotated[str | None, Field(description="The folder you're working in; picks the project linked to it.")] = None,
  timezone: TimezoneParam = None,
) -> StartedTask:
  """Starts working on a task: marks it in progress and returns it with a brief and the project's folders.

  For a coding agent asked to "work on the next Bessel task": pass project_path (the repo folder) or project.
  Without task_id it resumes a task already in progress, else picks the next to-do by due date, priority and
  board order.
  """
  async with user_session(ctx) as (session, user):
    _, today = _tz_today(user, timezone)
    projects = await ProjectRepository.from_session(session).list_for_user(user.id)
    paths = await _project_paths(session, projects)
    repo = TaskRepository.from_session(session)

    if task_id is not None:
      task = (await _owned_tasks(session, user, [task_id]))[task_id]
      if task.status not in OPEN_STATUSES:
        raise ToolError(f"{task.title!r} is {task.status}. Use undo_complete_tasks to reopen it first.")
    else:
      if project_path is not None:
        chosen = _project_for_path(project_path, projects, paths)
        if chosen is None:
          linked = [f"{p.name} ({', '.join(paths[p.id])})" for p in projects if paths[p.id]]
          raise ToolError(f"No project is linked to {project_path}. Linked projects: {'; '.join(linked) or 'none'}. Pass project instead.")
      elif project is not None:
        chosen = match_project(project, projects)
        if chosen is None:
          raise _unknown_project(project, projects)
      else:
        raise ToolError("Pass task_id, project or project_path.")
      statement = repo.get_filtered_statement(user.id, statuses=WORKABLE_STATUSES, project_id=chosen.id, is_recurring=False).order_by(
        (TaskModel.status == "in_progress").desc(), nulls_last(TaskModel.due_date.asc()), TaskModel.priority.desc(), TaskModel.position
      )
      picked = await repo.get_one_or_none(statement.limit(1))
      if picked is None:
        raise ToolError(f"No open tasks in {chosen.name}. Use add_tasks to create one.")
      task = picked

    if task.status != "in_progress":
      await task_service.update(session, task, {"status": "in_progress"})
    task_paths = paths.get(task.project_id, []) if task.project_id else []
    return StartedTask(task=to_task(task, today, detailed=True), project_paths=task_paths, brief=_brief(task, task_paths))


TOOLS: list[ToolSpec] = [
  read(get_task_overview, "Task overview"),
  read(find_tasks, "Find tasks"),
  read(find_completed_tasks, "Completed tasks"),
  read(get_task, "Get task"),
  write(add_tasks, "Add tasks", idempotent=True),
  write(update_tasks, "Update tasks"),
  write(complete_tasks, "Complete tasks", idempotent=True),
  write(undo_complete_tasks, "Undo completing tasks", idempotent=True),
  write(start_task, "Start a task"),
]
