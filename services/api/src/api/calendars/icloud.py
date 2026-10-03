from collections.abc import Iterable
from datetime import UTC, datetime, timedelta
from urllib.parse import urljoin
from xml.etree import ElementTree

import httpx
import recurring_ical_events
from icalendar import Calendar as ICalendar
from icalendar import Event as IEvent

from api.calendars.providers import ProviderAuthError, ProviderCalendar, ProviderEvent, normalize_color

CALDAV_URL = "https://caldav.icloud.com/"
DEFAULT_COLOR = "#34aadc"
NS = {"d": "DAV:", "c": "urn:ietf:params:xml:ns:caldav", "a": "http://apple.com/ns/ical/"}
NS_DECL = " ".join(f'xmlns:{prefix}="{uri}"' for prefix, uri in NS.items())


def _as_aware(value: datetime) -> datetime:
  # Floating times carry no zone; UTC is the least surprising reading.
  return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _occurrence(component: IEvent) -> ProviderEvent:
  uid = str(component.get("UID", ""))
  start, end = component.start, component.end
  recurrence_id = component.get("RECURRENCE-ID")
  instance = recurrence_id.dt if recurrence_id is not None else start
  common = {
    "external_id": f"{uid}/{instance.isoformat()}",
    "title": str(component.get("SUMMARY") or "(No title)"),
    "location": str(component["LOCATION"]) if component.get("LOCATION") else None,
  }
  if isinstance(start, datetime):
    end_at = _as_aware(end) if isinstance(end, datetime) else _as_aware(start)
    return ProviderEvent(**common, all_day=False, start_at=_as_aware(start), end_at=end_at)
  end_date = end if not isinstance(end, datetime) and end > start else start + timedelta(days=1)
  return ProviderEvent(**common, all_day=True, start_date=start, end_date=end_date)


def expand_events(ical_documents: Iterable[str], start: datetime, end: datetime) -> list[ProviderEvent]:
  """Expands each VCALENDAR document into the occurrences overlapping [start, end).

  Expansion happens here rather than on the server so EXDATE and RECURRENCE-ID
  overrides behave the same regardless of the server's CalDAV quirks.
  """
  events: dict[str, ProviderEvent] = {}
  for document in ical_documents:
    calendar = ICalendar.from_ical(document)
    for component in recurring_ical_events.of(calendar).between(start, end):
      if component.name != "VEVENT":
        continue
      event = _occurrence(component)
      events[event.external_id] = event
  return list(events.values())


class ICloudCalendarClient:
  """Minimal read-only CalDAV client: principal -> calendar home -> calendars -> events."""

  def __init__(self, http: httpx.AsyncClient, apple_id: str, app_password: str) -> None:
    self.http = http
    self.auth = httpx.BasicAuth(apple_id, app_password)

  async def list_calendars(self) -> list[ProviderCalendar]:
    principal = await self._find_href(CALDAV_URL, "<d:current-user-principal/>", "d:current-user-principal")
    home = await self._find_href(principal, "<c:calendar-home-set/>", "c:calendar-home-set")
    responses = await self._propfind(
      home,
      "<d:resourcetype/><d:displayname/><a:calendar-color/><c:supported-calendar-component-set/>",
      depth="1",
    )
    calendars: list[ProviderCalendar] = []
    for response in responses:
      prop = _ok_prop(response)
      if prop is None or prop.find("d:resourcetype/c:calendar", NS) is None:
        continue
      # iCloud exposes Reminders lists as VTODO-only calendars.
      components = {comp.get("name") for comp in prop.findall("c:supported-calendar-component-set/c:comp", NS)}
      if components and "VEVENT" not in components:
        continue
      calendars.append(
        ProviderCalendar(
          external_id=urljoin(home, _text(response, "d:href")),
          name=_text(prop, "d:displayname") or "Calendar",
          color=normalize_color(_text(prop, "a:calendar-color"), DEFAULT_COLOR),
        )
      )
    return calendars

  async def list_events(self, calendar_url: str, start: datetime, end: datetime) -> list[ProviderEvent]:
    body = f"""<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query {NS_DECL}>
  <d:prop><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">
    <c:time-range start="{_caldav_time(start)}" end="{_caldav_time(end)}"/>
  </c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>"""
    root = await self._request("REPORT", calendar_url, body, depth="1")
    documents = [data.text for data in root.iterfind("d:response/d:propstat/d:prop/c:calendar-data", NS) if data.text]
    return expand_events(documents, start, end)

  async def _find_href(self, url: str, prop_xml: str, prop_path: str) -> str:
    for response in await self._propfind(url, prop_xml, depth="0"):
      href = response.find(f"d:propstat/d:prop/{prop_path}/d:href", NS)
      if href is not None and href.text:
        return urljoin(url, href.text.strip())
    raise ProviderAuthError("iCloud didn't return a calendar account for these credentials")

  async def _propfind(self, url: str, prop_xml: str, *, depth: str) -> list[ElementTree.Element]:
    body = f'<?xml version="1.0" encoding="utf-8"?><d:propfind {NS_DECL}><d:prop>{prop_xml}</d:prop></d:propfind>'
    return (await self._request("PROPFIND", url, body, depth=depth)).findall("d:response", NS)

  async def _request(self, method: str, url: str, body: str, *, depth: str) -> ElementTree.Element:
    response = await self.http.request(
      method,
      url,
      content=body.encode(),
      auth=self.auth,
      headers={"Depth": depth, "Content-Type": "application/xml; charset=utf-8"},
    )
    if response.status_code in (401, 403):
      raise ProviderAuthError("iCloud rejected the Apple ID or app-specific password")
    response.raise_for_status()
    return ElementTree.fromstring(response.content)


def _ok_prop(response: ElementTree.Element) -> ElementTree.Element | None:
  for propstat in response.findall("d:propstat", NS):
    if " 200 " in (_text(propstat, "d:status") or ""):
      return propstat.find("d:prop", NS)
  return None


def _text(element: ElementTree.Element, path: str) -> str | None:
  found = element.find(path, NS)
  return found.text.strip() if found is not None and found.text else None


def _caldav_time(value: datetime) -> str:
  return value.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")
