"""Applies Bessel's event changes to Google Calendar.

Edits always PATCH only the changed fields, so reminders, attachments and other
properties Bessel doesn't model survive. Repeating events follow Google's own
model: occurrences are instances of a parent event, "this and following" splits
the parent into two series.
"""

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

from api.calendars.edits import EditScope, EventChanges, EventTiming, Reply, TargetEvent, UnsupportedEditError, parse_moment, wall_clock_delta
from api.calendars.google import GoogleCalendarClient
from api.calendars.providers import ProviderError
from api.calendars.recurrence import shift_weekdays, split_rule

# Fields worth carrying over when "this and following" starts a new series.
_SERIES_COPY_FIELDS = (
  "summary",
  "description",
  "location",
  "colorId",
  "transparency",
  "visibility",
  "attendees",
  "reminders",
  "guestsCanInviteOthers",
  "guestsCanModify",
  "guestsCanSeeOtherGuests",
  "extendedProperties",
  "conferenceData",
  "source",
)
_EXDATE = re.compile(r"^EXDATE(?P<params>(?:;[^:]*)?):(?P<values>.+)$")


def time_field(value: datetime | date, time_zone: str) -> dict[str, str]:
  if isinstance(value, datetime):
    local = value.astimezone(ZoneInfo(time_zone)).replace(tzinfo=None)
    return {"dateTime": local.isoformat(timespec="seconds"), "timeZone": time_zone}
  return {"date": value.isoformat()}


def parse_time_field(field: dict[str, Any], fallback_zone: str) -> datetime | date:
  if "date" in field:
    return date.fromisoformat(field["date"])
  moment = datetime.fromisoformat(field["dateTime"])
  if moment.tzinfo is None:
    moment = moment.replace(tzinfo=ZoneInfo(field.get("timeZone") or fallback_zone))
  return moment


def _attendees(emails: tuple[str, ...], current: list[dict[str, Any]]) -> list[dict[str, Any]]:
  """New guest list that keeps existing guests' responses and details."""
  by_email = {a.get("email", "").lower(): a for a in current}
  return [by_email.get(email.lower(), {"email": email}) for email in emails]


def changes_body(changes: EventChanges, *, current: dict[str, Any] | None = None) -> dict[str, Any]:
  """PATCH/insert body for the provided fields (recurrence is handled by callers)."""
  body: dict[str, Any] = {}
  if changes.has("title"):
    body["summary"] = changes.title
  if changes.has("timing") and changes.timing is not None:
    body["start"] = time_field(changes.timing.start, changes.timing.time_zone)
    body["end"] = time_field(changes.timing.end, changes.timing.time_zone)
  if changes.has("location"):
    body["location"] = changes.location or ""
  if changes.has("description"):
    body["description"] = changes.description or ""
  if changes.has("attendees"):
    body["attendees"] = _attendees(changes.attendees, (current or {}).get("attendees", []))
  if changes.has("busy"):
    body["transparency"] = "opaque" if changes.busy else "transparent"
  if changes.has("color_id"):
    # Null clears the event's colour back to the calendar's.
    body["colorId"] = changes.color_id
  if changes.has("add_conference") and changes.add_conference and not (current or {}).get("conferenceData"):
    body["conferenceData"] = {"createRequest": {"requestId": uuid4().hex, "conferenceSolutionKey": {"type": "hangoutsMeet"}}}
  return body


@dataclass(frozen=True, slots=True)
class _Recurrence:
  """A parent event's recurrence lines, split into its rule and its exclusions."""

  rule: str | None
  exdates: list[datetime | date]
  other: list[str]

  @classmethod
  def parse(cls, lines: list[str], time_zone: str) -> "_Recurrence":
    rule: str | None = None
    exdates: list[datetime | date] = []
    other: list[str] = []
    for line in lines:
      if line.startswith("RRULE:"):
        rule = line.removeprefix("RRULE:")
      elif match := _EXDATE.match(line):
        exdates.extend(_parse_exdate(match["params"], match["values"], time_zone))
      else:
        other.append(line)
    return cls(rule, exdates, other)

  def lines(self, time_zone: str) -> list[str]:
    lines = [f"RRULE:{self.rule}"] if self.rule else []
    lines.extend(_format_exdate(value, time_zone) for value in self.exdates)
    return lines + self.other


def _parse_exdate(params: str, values: str, time_zone: str) -> list[datetime | date]:
  param_map = dict(p.split("=", 1) for p in params.strip(";").split(";") if "=" in p)
  if param_map.get("VALUE") == "DATE":
    return [datetime.strptime(v, "%Y%m%d").date() for v in values.split(",")]
  parsed: list[datetime | date] = []
  for value in values.split(","):
    moment = datetime.strptime(value.rstrip("Z"), "%Y%m%dT%H%M%S")
    zone = ZoneInfo("UTC") if value.endswith("Z") else ZoneInfo(param_map.get("TZID", time_zone))
    parsed.append(moment.replace(tzinfo=zone))
  return parsed


def _format_exdate(value: datetime | date, time_zone: str) -> str:
  if isinstance(value, datetime):
    return f"EXDATE;TZID={time_zone}:{value.astimezone(ZoneInfo(time_zone)).strftime('%Y%m%dT%H%M%S')}"
  return f"EXDATE;VALUE=DATE:{value.strftime('%Y%m%d')}"


def _before(value: datetime | date, boundary: datetime | date) -> bool:
  if isinstance(value, datetime) and isinstance(boundary, datetime):
    return value < boundary
  as_date = value.date() if isinstance(value, datetime) else value
  return as_date < (boundary.date() if isinstance(boundary, datetime) else boundary)


class GoogleEventEditor:
  def __init__(self, client: GoogleCalendarClient, access_token: str, *, send_updates: bool, time_zone: str = "UTC") -> None:
    self.client = client
    self.token = access_token
    self.send_updates = send_updates
    # The zone the user is viewing in; used when Google's data carries none.
    self.time_zone = time_zone

  async def create(self, calendar_id: str, changes: EventChanges) -> str:
    body = changes_body(changes)
    if changes.has("rule") and changes.rule:
      body["recurrence"] = [f"RRULE:{changes.rule}"]
    created = await self.client.create_event(self.token, calendar_id, body, send_updates=self.send_updates)
    return created["id"]

  async def update(self, target: TargetEvent, changes: EventChanges, scope: EditScope, destination: str | None = None) -> str:
    """Applies the change and returns the id of the event (or series) to show."""
    calendar_id = target.calendar_external_id
    etag = target.etag
    if destination and destination != calendar_id:
      if target.recurring and scope != EditScope.all:
        raise UnsupportedEditError("Only a whole repeating series can move to another calendar")
      moved = await self.client.move_event(self.token, calendar_id, target.series_id or target.external_id, destination, send_updates=self.send_updates)
      calendar_id, etag = destination, moved.get("etag")
      if not changes.provided:
        return target.external_id

    if not target.recurring:
      return await self._update_single(calendar_id, target.external_id, etag, changes)
    if scope == EditScope.this:
      if changes.has("rule"):
        raise UnsupportedEditError("A single occurrence can't change how the series repeats")
      current = await self.client.get_event(self.token, calendar_id, target.external_id) if changes.has("attendees") else None
      await self.client.patch_event(
        self.token, calendar_id, target.external_id, changes_body(changes, current=current), etag=etag, send_updates=self.send_updates
      )
      return target.external_id

    parent = await self.client.get_event(self.token, calendar_id, target.series_id or "")
    zone = parent.get("start", {}).get("timeZone") or (changes.timing.time_zone if changes.timing else self.time_zone)
    parent_start = parse_time_field(parent["start"], zone)
    if scope == EditScope.following and _before(parent_start, target.original_slot()):
      return await self._update_following(calendar_id, target, parent, parent_start, zone, changes)
    await self._update_series(calendar_id, target, parent, parent_start, zone, changes)
    return target.series_id or target.external_id

  async def respond(self, target: TargetEvent, reply: Reply, scope: EditScope) -> str:
    """Answers an invitation as this account; returns the id of the event to show."""
    if target.recurring and scope == EditScope.following:
      raise UnsupportedEditError("Answer this occurrence or the whole series")
    event_id = (target.series_id or target.external_id) if target.recurring and scope == EditScope.all else target.external_id
    current = await self.client.get_event(self.token, target.calendar_external_id, event_id)
    attendees = current.get("attendees", [])
    if not any(a.get("self") for a in attendees):
      raise UnsupportedEditError("You're not a guest of this event")
    # Google replaces the whole list, so send everyone back with only our reply changed.
    body = {"attendees": [{**a, "responseStatus": reply} if a.get("self") else a for a in attendees]}
    await self.client.patch_event(self.token, target.calendar_external_id, event_id, body, etag=current.get("etag"), send_updates=self.send_updates)
    return event_id

  async def _update_single(self, calendar_id: str, event_id: str, etag: str | None, changes: EventChanges) -> str:
    current = await self.client.get_event(self.token, calendar_id, event_id) if changes.has("attendees") or changes.has("rule") else None
    body = changes_body(changes, current=current)
    if changes.has("rule") and changes.rule:
      body["recurrence"] = [f"RRULE:{changes.rule}"]
      # A repeating event needs a zone on its start; reuse the event's own times.
      if "start" not in body and current is not None and "dateTime" in current.get("start", {}):
        zone = current["start"].get("timeZone") or (changes.timing.time_zone if changes.timing else self.time_zone)
        body["start"] = {**current["start"], "timeZone": zone}
        body["end"] = {**current["end"], "timeZone": current["end"].get("timeZone") or zone}
    await self.client.patch_event(self.token, calendar_id, event_id, body, etag=etag, send_updates=self.send_updates)
    return event_id

  async def _update_series(
    self,
    calendar_id: str,
    target: TargetEvent,
    parent: dict[str, Any],
    parent_start: datetime | date,
    zone: str,
    changes: EventChanges,
  ) -> None:
    body = changes_body(changes, current=parent)
    recurrence = _Recurrence.parse(parent.get("recurrence", []), zone)
    if changes.has("timing") and changes.timing is not None:
      # Move the whole series by however far this occurrence moved.
      new_start, new_end = series_timing(parent_start, target.original_slot(), changes.timing, zone)
      body["start"] = time_field(new_start, changes.timing.time_zone)
      body["end"] = time_field(new_end, changes.timing.time_zone)
      days = day_shift(target.original_slot(), changes.timing.start, zone)
      same_kind = isinstance(new_start, datetime) == isinstance(parent_start, datetime)
      delta = wall_clock_delta(target.original_slot(), changes.timing.start, zone)
      recurrence = _Recurrence(
        rule=shift_weekdays(recurrence.rule, days) if recurrence.rule and not changes.has("rule") else recurrence.rule,
        # Exclusions must match the start's type; they can't survive a timed/all-day switch.
        exdates=[_shift(value, delta, zone) for value in recurrence.exdates] if same_kind else [],
        other=recurrence.other,
      )
    if changes.has("rule"):
      recurrence = _Recurrence(changes.rule, recurrence.exdates if changes.rule else [], recurrence.other)
    if recurrence.lines(zone) != parent.get("recurrence", []):
      body["recurrence"] = recurrence.lines(zone)
    await self.client.patch_event(self.token, calendar_id, parent["id"], body, etag=parent.get("etag"), send_updates=self.send_updates)

  async def _update_following(
    self,
    calendar_id: str,
    target: TargetEvent,
    parent: dict[str, Any],
    parent_start: datetime | date,
    zone: str,
    changes: EventChanges,
  ) -> str:
    split_at = target.original_slot()
    recurrence = _Recurrence.parse(parent.get("recurrence", []), zone)
    if recurrence.rule is None:
      raise UnsupportedEditError("This event's repeat rule can't be split")
    head_rule, tail_rule = split_rule(recurrence.rule, parent_start, split_at)

    timing = changes.timing or EventTiming(target.start, target.end, zone)
    delta = wall_clock_delta(target.original_slot(), timing.start, zone)
    new_rule = changes.rule if changes.has("rule") else shift_weekdays(tail_rule, day_shift(target.original_slot(), timing.start, zone))
    same_kind = isinstance(timing.start, datetime) == isinstance(split_at, datetime)
    tail_exdates = [_shift(v, delta, zone) for v in recurrence.exdates if not _before(v, split_at)] if same_kind else []

    body = {key: parent[key] for key in _SERIES_COPY_FIELDS if key in parent}
    body |= changes_body(changes, current=parent)
    body["start"] = time_field(timing.start, timing.time_zone)
    body["end"] = time_field(timing.end, timing.time_zone)
    body["recurrence"] = _Recurrence(new_rule, tail_exdates if new_rule else [], recurrence.other).lines(zone) if new_rule else []
    created = await self.client.create_event(self.token, calendar_id, body, send_updates=self.send_updates)

    head = _Recurrence(head_rule, [v for v in recurrence.exdates if _before(v, split_at)], recurrence.other)
    try:
      await self.client.patch_event(
        self.token, calendar_id, parent["id"], {"recurrence": head.lines(zone)}, etag=parent.get("etag"), send_updates=self.send_updates
      )
    except ProviderError:
      # Don't leave the occurrences duplicated across two series.
      await self.client.delete_event(self.token, calendar_id, created["id"], etag=None, send_updates=False)
      raise
    return created["id"]

  async def delete(self, target: TargetEvent, scope: EditScope) -> None:
    calendar_id = target.calendar_external_id
    if not target.recurring or scope == EditScope.this:
      await self.client.delete_event(self.token, calendar_id, target.external_id, etag=target.etag, send_updates=self.send_updates)
      return
    parent = await self.client.get_event(self.token, calendar_id, target.series_id or "")
    zone = parent.get("start", {}).get("timeZone") or self.time_zone
    parent_start = parse_time_field(parent["start"], zone)
    split_at = target.original_slot()
    recurrence = _Recurrence.parse(parent.get("recurrence", []), zone)
    if scope == EditScope.all or not _before(parent_start, split_at) or recurrence.rule is None:
      await self.client.delete_event(self.token, calendar_id, parent["id"], etag=parent.get("etag"), send_updates=self.send_updates)
      return
    head_rule, _ = split_rule(recurrence.rule, parent_start, split_at)
    head = _Recurrence(head_rule, [v for v in recurrence.exdates if _before(v, split_at)], recurrence.other)
    await self.client.patch_event(
      self.token, calendar_id, parent["id"], {"recurrence": head.lines(zone)}, etag=parent.get("etag"), send_updates=self.send_updates
    )


def _shift(value: datetime | date, delta: timedelta, zone: str) -> datetime | date:
  """Moves a moment by a wall-clock delta (DST-safe), or a date by whole days."""
  if isinstance(value, datetime):
    tz = ZoneInfo(zone)
    return (value.astimezone(tz).replace(tzinfo=None) + delta).replace(tzinfo=tz)
  return value + timedelta(days=delta.days)


def day_shift(old: datetime | date, new: datetime | date, zone: str) -> int:
  """Calendar days between two moments, read in `zone` (not timedelta.days,
  which turns "one hour earlier" into -1 day)."""
  tz = ZoneInfo(zone)
  old_day = old.astimezone(tz).date() if isinstance(old, datetime) else old
  new_day = new.astimezone(tz).date() if isinstance(new, datetime) else new
  return (new_day - old_day).days


def series_timing(
  parent_start: datetime | date,
  occurrence_slot: datetime | date,
  timing: EventTiming,
  zone: str,
) -> tuple[datetime | date, datetime | date]:
  """New start/end for a whole series after one occurrence was moved to `timing`.

  The series start moves as far as the occurrence did; switching between timed
  and all-day keeps the series' first day and takes the new time of day.
  """
  days = day_shift(occurrence_slot, timing.start, zone)
  if isinstance(timing.start, datetime):
    if isinstance(parent_start, datetime):
      start: datetime | date = _shift(parent_start, wall_clock_delta(occurrence_slot, timing.start, zone), zone)
    else:
      local = timing.start.astimezone(ZoneInfo(timing.time_zone))
      start = datetime.combine(parent_start + timedelta(days=days), local.time(), tzinfo=ZoneInfo(timing.time_zone))
    return start, start + (timing.end - timing.start)
  first_day = parent_start.astimezone(ZoneInfo(zone)).date() if isinstance(parent_start, datetime) else parent_start
  start = first_day + timedelta(days=days)
  return start, start + (timing.end - timing.start)


__all__ = ["GoogleEventEditor", "changes_body", "day_shift", "parse_moment", "parse_time_field", "series_timing", "time_field"]
