"""Applies Bessel's event changes to iCloud (CalDAV) events.

CalDAV has no patch: the whole .ics resource is fetched, edited and written
back with If-Match. Edits change only the properties Bessel manages, so alarms,
attachments and X-APPLE-* properties survive. A repeating event lives in one
resource as a master VEVENT plus overrides (RECURRENCE-ID) and EXDATEs.
"""

from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import uuid4

import httpx
from icalendar import Calendar as ICalendar
from icalendar import Event as IEvent
from icalendar import vRecur

from api.calendars.edits import EditScope, EventChanges, EventTiming, TargetEvent, UnsupportedEditError, wall_clock_delta
from api.calendars.google_edits import day_shift, series_timing
from api.calendars.icloud import ICloudCalendarClient
from api.calendars.providers import ProviderConflictError, ProviderError
from api.calendars.recurrence import format_rule, parse_rule, shift_weekdays, split_rule

PRODID = "-//Bessel//Calendar//EN"
_MANAGED_TIME_PROPS = ("DTSTART", "DTEND", "DURATION")
_SERIES_ONLY_PROPS = ("RRULE", "RDATE", "EXDATE")

Moment = datetime | date


# --- value helpers -----------------------------------------------------------


def _moment(value: Any) -> Moment:
  """Unwraps an icalendar date property into a date or datetime."""
  moment = getattr(value, "dt", value)
  if not isinstance(moment, (datetime, date)):
    raise ProviderError("The event's data on iCloud has an unexpected date value")
  return moment


def _start(component: IEvent) -> Moment:
  return _moment(component.get("DTSTART"))


def _key(value: Moment) -> Moment:
  """Comparable form: aware datetimes in UTC, floating ones read as UTC, dates as-is."""
  if isinstance(value, datetime):
    return value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)
  return value


def _same(a: Moment, b: Moment) -> bool:
  if isinstance(a, datetime) != isinstance(b, datetime):
    return False
  return _key(a) == _key(b)


def _before(value: Moment, boundary: Moment) -> bool:
  if isinstance(value, datetime) and isinstance(boundary, datetime):
    return _key(value) < _key(boundary)
  as_date = value.date() if isinstance(value, datetime) else value
  return as_date < (boundary.date() if isinstance(boundary, datetime) else boundary)


def _like(reference: Moment, moment: Moment) -> Moment:
  """`moment` in the same value type and zone as `reference` (RFC 5545 requires
  RECURRENCE-ID and EXDATE to match DTSTART)."""
  if not isinstance(reference, datetime):
    return moment.date() if isinstance(moment, datetime) else moment
  if not isinstance(moment, datetime):
    return datetime.combine(moment, reference.timetz())
  if reference.tzinfo is None:
    return moment.astimezone(UTC).replace(tzinfo=None) if moment.tzinfo else moment
  return moment.astimezone(reference.tzinfo)


def _zone_name(value: Moment, fallback: str) -> str:
  if isinstance(value, datetime) and value.tzinfo is not None:
    key = getattr(value.tzinfo, "key", None)
    if key:
      return key
  return fallback


def _shift(value: Moment, delta: timedelta, zone_value: Moment) -> Moment:
  """Moves by a wall-clock delta in the value's own zone (DST-safe)."""
  if isinstance(value, datetime):
    tz = value.tzinfo
    naive = value.replace(tzinfo=None) + delta
    return naive.replace(tzinfo=tz) if tz else naive
  return value + timedelta(days=delta.days)


def _set(component: IEvent, name: str, value: object) -> None:
  component.pop(name, None)
  component.add(name, value)


def _exdates(component: IEvent) -> list[Moment]:
  raw = component.get("EXDATE")
  lists = raw if isinstance(raw, list) else [raw] if raw is not None else []
  return [_moment(entry) for value_list in lists for entry in getattr(value_list, "dts", [])]


def _set_exdates(component: IEvent, values: list[Moment]) -> None:
  component.pop("EXDATE", None)
  for value in values:
    component.add("EXDATE", value)


def _recurrence_id(component: IEvent) -> Moment | None:
  value = component.get("RECURRENCE-ID")
  return _moment(value) if value is not None else None


def _rule(component: IEvent) -> str | None:
  value = component.get("RRULE")
  if value is None:
    return None
  raw = value.to_ical()
  return raw.decode() if isinstance(raw, bytes) else str(raw)


def _set_rule(component: IEvent, rule: str | None) -> None:
  component.pop("RRULE", None)
  if rule:
    component.add("RRULE", vRecur.from_ical(format_rule(parse_rule(rule))))


# --- document helpers --------------------------------------------------------


def _parse(data: str) -> ICalendar:
  return ICalendar.from_ical(data)


def _serialize(calendar: ICalendar) -> str:
  calendar.add_missing_timezones()
  raw = calendar.to_ical()
  return raw.decode() if isinstance(raw, bytes) else str(raw)


def _components(calendar: ICalendar, uid: str) -> tuple[IEvent, list[IEvent]]:
  events = [c for c in calendar.walk("VEVENT") if isinstance(c, IEvent) and str(c.get("UID")) == uid]
  master = next((c for c in events if c.get("RECURRENCE-ID") is None), None)
  if master is None:
    raise ProviderError("The event's data on iCloud is missing its main entry")
  return master, [c for c in events if c is not master]


def _touch(component: IEvent, now: datetime) -> None:
  _set(component, "DTSTAMP", now)
  _set(component, "LAST-MODIFIED", now)
  _set(component, "SEQUENCE", int(component.get("SEQUENCE", 0)) + 1)


def _apply_fields(component: IEvent, changes: EventChanges) -> None:
  """Writes the provided non-time fields."""
  if changes.has("title"):
    _set(component, "SUMMARY", changes.title)
  for name, prop in (("location", "LOCATION"), ("description", "DESCRIPTION")):
    if changes.has(name):
      value = getattr(changes, name)
      component.pop(prop, None)
      if value:
        component.add(prop, value)
  if changes.has("busy"):
    _set(component, "TRANSP", "OPAQUE" if changes.busy else "TRANSPARENT")


def _set_times(component: IEvent, start: Moment, end: Moment) -> None:
  for prop in _MANAGED_TIME_PROPS:
    component.pop(prop, None)
  component.add("DTSTART", start)
  component.add("DTEND", end)


def _copy(source: IEvent, *, skip: tuple[str, ...]) -> IEvent:
  """A copy of a VEVENT (with its VALARMs) minus the listed properties."""
  copied = IEvent.from_ical(source.to_ical())
  assert isinstance(copied, IEvent)
  for prop in skip:
    copied.pop(prop, None)
  return copied


def _check_supported(changes: EventChanges) -> None:
  if changes.has("attendees"):
    raise UnsupportedEditError("Guests on iCloud events can't be changed from Bessel")
  if changes.has("add_conference") and changes.add_conference:
    raise UnsupportedEditError("Video calls can only be added to Google events")


# --- edits -------------------------------------------------------------------


def build_event(uid: str, changes: EventChanges, now: datetime) -> str:
  if changes.timing is None:
    raise ValueError("A new event needs a start and end")
  calendar = ICalendar()
  calendar.add("PRODID", PRODID)
  calendar.add("VERSION", "2.0")
  event = IEvent()
  event.add("UID", uid)
  event.add("DTSTAMP", now)
  event.add("CREATED", now)
  event.add("SEQUENCE", 0)
  _set_times(event, changes.timing.start, changes.timing.end)
  _apply_fields(event, changes)
  if not changes.has("title"):
    event.add("SUMMARY", "")
  _set_rule(event, changes.rule if changes.has("rule") else None)
  calendar.add_component(event)
  return _serialize(calendar)


def edit_event(data: str, uid: str, changes: EventChanges, now: datetime) -> str:
  """Edits a non-repeating event, or turns it into a repeating one."""
  calendar = _parse(data)
  master, _ = _components(calendar, uid)
  if changes.timing is not None:
    _set_times(master, changes.timing.start, changes.timing.end)
  _apply_fields(master, changes)
  if changes.has("rule"):
    _set_rule(master, changes.rule)
  _touch(master, now)
  return _serialize(calendar)


def edit_occurrence(data: str, uid: str, slot: Moment, start: Moment, end: Moment, changes: EventChanges, now: datetime) -> str:
  """Edits one occurrence by adding or updating its override."""
  if changes.has("rule"):
    raise UnsupportedEditError("A single occurrence can't change how the series repeats")
  calendar = _parse(data)
  master, overrides = _components(calendar, uid)
  master_start = _start(master)
  override = next((o for o in overrides if (rid := _recurrence_id(o)) is not None and _same(rid, _like(master_start, slot))), None)
  if override is None:
    override = _copy(master, skip=(*_SERIES_ONLY_PROPS, *_MANAGED_TIME_PROPS, "RECURRENCE-ID", "SEQUENCE"))
    override.add("RECURRENCE-ID", _like(master_start, slot))
    override.add("SEQUENCE", int(master.get("SEQUENCE", 0)))
    _set_times(override, start, end)
    calendar.add_component(override)
  if changes.timing is not None:
    _set_times(override, changes.timing.start, changes.timing.end)
  _apply_fields(override, changes)
  _touch(override, now)
  return _serialize(calendar)


def edit_series(data: str, uid: str, slot: Moment, changes: EventChanges, now: datetime, zone: str) -> str:
  """Edits every occurrence; a time change moves the series as far as `slot` moved."""
  calendar = _parse(data)
  master, overrides = _components(calendar, uid)
  master_start = _start(master)
  zone = _zone_name(master_start, zone)
  rule = _rule(master)

  if changes.timing is not None:
    new_start, new_end = series_timing(master_start, slot, changes.timing, zone)
    same_kind = isinstance(new_start, datetime) == isinstance(master_start, datetime)
    delta = wall_clock_delta(slot, changes.timing.start, zone)
    if rule and not changes.has("rule"):
      rule = shift_weekdays(rule, day_shift(slot, changes.timing.start, zone))
    _set_times(master, new_start, new_end)
    _set_exdates(master, [_shift(v, delta, v) for v in _exdates(master)] if same_kind else [])
    for override in overrides:
      rid = _recurrence_id(override)
      if not same_kind or rid is None:
        calendar.subcomponents.remove(override)
        continue
      _set(override, "RECURRENCE-ID", _shift(rid, delta, rid))
  if changes.has("rule"):
    rule = changes.rule
    if not rule:
      # A series that stops repeating keeps only its first occurrence.
      _set_exdates(master, [])
      for override in overrides:
        if override in calendar.subcomponents:
          calendar.subcomponents.remove(override)
  _set_rule(master, rule)
  _apply_fields(master, changes)
  for override in overrides:
    if override in calendar.subcomponents:
      _apply_fields(override, _without_timing(changes))
      _touch(override, now)
  _touch(master, now)
  return _serialize(calendar)


def split_series(
  data: str,
  uid: str,
  slot: Moment,
  start: Moment,
  end: Moment,
  changes: EventChanges,
  new_uid: str,
  now: datetime,
  zone: str,
) -> tuple[str, str] | None:
  """Ends the series before `slot` and starts a new one there with the changes.

  Returns (original, new) documents, or None when `slot` is the first
  occurrence (the whole series changes instead).
  """
  calendar = _parse(data)
  master, overrides = _components(calendar, uid)
  master_start = _start(master)
  zone = _zone_name(master_start, zone)
  rule = _rule(master)
  if rule is None:
    raise UnsupportedEditError("This event's repeat rule can't be split")
  head_rule, tail_rule = split_rule(rule, master_start, _like(master_start, slot))
  if head_rule is None:
    return None

  timing = changes.timing or EventTiming(start, end, zone)
  delta = wall_clock_delta(slot, timing.start, zone)
  same_kind = isinstance(timing.start, datetime) == isinstance(master_start, datetime)

  new_calendar = ICalendar()
  new_calendar.add("PRODID", PRODID)
  new_calendar.add("VERSION", "2.0")
  new_master = _copy(master, skip=(*_SERIES_ONLY_PROPS, *_MANAGED_TIME_PROPS, "UID", "SEQUENCE", "CREATED"))
  new_master.add("UID", new_uid)
  new_master.add("CREATED", now)
  new_master.add("SEQUENCE", 0)
  _set_times(new_master, timing.start, timing.end)
  new_rule = changes.rule if changes.has("rule") else shift_weekdays(tail_rule, day_shift(slot, timing.start, zone))
  _set_rule(new_master, new_rule)
  if new_rule and same_kind:
    _set_exdates(new_master, [_shift(v, delta, v) for v in _exdates(master) if not _before(v, slot)])
  _apply_fields(new_master, changes)
  new_calendar.add_component(new_master)

  for override in overrides:
    rid = _recurrence_id(override)
    if rid is None or _before(rid, slot):
      continue
    calendar.subcomponents.remove(override)
    if new_rule and same_kind:
      moved = _copy(override, skip=("UID", "RECURRENCE-ID"))
      moved.add("UID", new_uid)
      moved.add("RECURRENCE-ID", _shift(rid, delta, rid))
      _apply_fields(moved, _without_timing(changes))
      new_calendar.add_component(moved)

  _set_rule(master, head_rule)
  _set_exdates(master, [v for v in _exdates(master) if _before(v, slot)])
  _touch(master, now)
  return _serialize(calendar), _serialize(new_calendar)


def delete_occurrence(data: str, uid: str, slot: Moment, now: datetime) -> str:
  calendar = _parse(data)
  master, overrides = _components(calendar, uid)
  master_start = _start(master)
  for override in overrides:
    rid = _recurrence_id(override)
    if rid is not None and _same(rid, _like(master_start, slot)):
      calendar.subcomponents.remove(override)
  _set_exdates(master, [*_exdates(master), _like(master_start, slot)])
  _touch(master, now)
  return _serialize(calendar)


def truncate_series(data: str, uid: str, slot: Moment, now: datetime) -> str | None:
  """The series without `slot` and later occurrences, or None if nothing remains."""
  calendar = _parse(data)
  master, overrides = _components(calendar, uid)
  master_start = _start(master)
  rule = _rule(master)
  if rule is None:
    return None
  head_rule, _ = split_rule(rule, master_start, _like(master_start, slot))
  if head_rule is None:
    return None
  for override in overrides:
    rid = _recurrence_id(override)
    if rid is not None and not _before(rid, slot):
      calendar.subcomponents.remove(override)
  _set_rule(master, head_rule)
  _set_exdates(master, [v for v in _exdates(master) if _before(v, slot)])
  _touch(master, now)
  return _serialize(calendar)


def _without_timing(changes: EventChanges) -> EventChanges:
  return EventChanges(
    provided=changes.provided - {"timing", "rule"},
    title=changes.title,
    location=changes.location,
    description=changes.description,
    busy=changes.busy,
  )


def master_start_of(data: str, uid: str) -> Moment:
  master, _ = _components(_parse(data), uid)
  return _start(master)


# --- orchestration -----------------------------------------------------------


def _uid_of(target: TargetEvent) -> str:
  return target.series_id or target.external_id


class ICloudEventEditor:
  def __init__(self, client: ICloudCalendarClient, *, time_zone: str, now: Callable[[], datetime] = lambda: datetime.now(UTC)) -> None:
    self.client = client
    self.time_zone = time_zone
    self.now = now

  async def create(self, calendar_url: str, changes: EventChanges) -> str:
    _check_supported(changes)
    uid = f"{uuid4()}".upper()
    await self.client.put_resource(_resource_href(calendar_url, uid), build_event(uid, changes, self.now()), create=True)
    return uid

  async def update(self, target: TargetEvent, changes: EventChanges, scope: EditScope, destination: str | None = None) -> str:
    """Applies the change and returns the UID of the event (or series) to show."""
    _check_supported(changes)
    href = _require_href(target)
    uid = _uid_of(target)
    moving = destination is not None and destination != target.calendar_external_id
    if moving and target.recurring and scope != EditScope.all:
      raise UnsupportedEditError("Only a whole repeating series can move to another calendar")

    data, etag = await self.client.get_resource(href)
    _check_etag(target, etag)
    now = self.now()
    if not target.recurring:
      updated = edit_event(data, uid, changes, now)
    elif scope == EditScope.this:
      updated = edit_occurrence(data, uid, target.original_slot(), target.start, target.end, changes, now)
    elif scope == EditScope.following:
      new_uid = f"{uuid4()}".upper()
      split = split_series(data, uid, target.original_slot(), target.start, target.end, changes, new_uid, now, self.time_zone)
      if split is not None:
        original, new = split
        new_href = _resource_href(_collection_of(href), new_uid)
        await self.client.put_resource(new_href, new, create=True)
        try:
          await self.client.put_resource(href, original, etag=etag)
        except ProviderError:
          await self.client.delete_resource(new_href, etag=None)
          raise
        return new_uid
      updated = edit_series(data, uid, target.original_slot(), changes, now, self.time_zone)
    else:
      updated = edit_series(data, uid, target.original_slot(), changes, now, self.time_zone)

    if moving and destination is not None:
      # CalDAV moves are a copy into the other collection plus a delete.
      await self.client.put_resource(_resource_href(destination, uid), updated, create=True)
      await self.client.delete_resource(href, etag=etag)
    else:
      await self.client.put_resource(href, updated, etag=etag)
    return uid

  async def delete(self, target: TargetEvent, scope: EditScope) -> None:
    href = _require_href(target)
    uid = _uid_of(target)
    if not target.recurring or scope == EditScope.all:
      await self.client.delete_resource(href, etag=target.etag)
      return
    data, etag = await self.client.get_resource(href)
    _check_etag(target, etag)
    now = self.now()
    if scope == EditScope.this:
      await self.client.put_resource(href, delete_occurrence(data, uid, target.original_slot(), now), etag=etag)
      return
    truncated = truncate_series(data, uid, target.original_slot(), now)
    if truncated is None:
      await self.client.delete_resource(href, etag=etag)
    else:
      await self.client.put_resource(href, truncated, etag=etag)


def _check_etag(target: TargetEvent, current: str | None) -> None:
  if target.etag and current and target.etag != current:
    raise ProviderConflictError("The event changed in iCloud")


def _require_href(target: TargetEvent) -> str:
  if not target.resource_href:
    raise ProviderError("This event hasn't synced its iCloud location yet; sync and try again")
  return target.resource_href


def _collection_of(href: str) -> str:
  return href.rsplit("/", 1)[0] + "/"


def _resource_href(collection: str, uid: str) -> str:
  return str(httpx.URL(collection).join(f"{uid}.ics"))
