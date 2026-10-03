"""In-memory stand-ins for Google Calendar and iCloud CalDAV, served over httpx.MockTransport."""

import copy
import json
import re
import time
from dataclasses import dataclass, field
from itertools import count
from typing import Any
from urllib.parse import unquote
from xml.sax.saxutils import escape

import httpx

_GOOGLE_WATCH = re.compile(r"^/calendar/v3/calendars/(?P<calendar>[^/]+)/events/watch$")
_GOOGLE_EVENT = re.compile(r"^/calendar/v3/calendars/(?P<calendar>[^/]+)/events(?:/(?P<event>[^/]+))?(?P<move>/move)?$")


@dataclass
class GoogleRequest:
  method: str
  path: str
  params: dict[str, str]
  headers: dict[str, str]
  body: dict[str, Any] | None


@dataclass
class FakeGoogleCalendar:
  """Google's Events API, enough of it for Bessel's writes, with real ETag checks."""

  events: dict[str, dict[str, dict[str, Any]]] = field(default_factory=dict)
  requests: list[GoogleRequest] = field(default_factory=list)
  # Scopes the token endpoint reports as granted.
  scope: str = "openid email https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events"
  # (method, event_id) -> (status, error body) to return instead of handling the call.
  failures: dict[tuple[str, str], tuple[int, dict[str, Any]]] = field(default_factory=dict)
  # Push channels: id -> (calendar id, address, token, resource id).
  channels: dict[str, tuple[str, str, str, str]] = field(default_factory=dict)
  stopped: list[tuple[str, str]] = field(default_factory=list)
  # Calendar id -> (status, error body) its watch request fails with.
  watch_failures: dict[str, tuple[int, dict[str, Any]]] = field(default_factory=dict)
  channel_lifetime_ms: int = 7 * 86_400_000
  now_ms: int = field(default_factory=lambda: int(time.time() * 1000))
  _ids: count = field(default_factory=lambda: count(1))

  def add(self, calendar_id: str, event: dict[str, Any]) -> dict[str, Any]:
    stored = {"etag": f'"{next(self._ids)}"', **event}
    self.events.setdefault(calendar_id, {})[stored["id"]] = stored
    return stored

  def get(self, calendar_id: str, event_id: str) -> dict[str, Any]:
    return self.events[calendar_id][event_id]

  def writes(self) -> list[GoogleRequest]:
    return [r for r in self.requests if r.method != "GET"]

  def transport(self) -> httpx.MockTransport:
    return httpx.MockTransport(self._handle)

  def _handle(self, request: httpx.Request) -> httpx.Response:
    if request.url.host == "oauth2.googleapis.com":
      return httpx.Response(200, json={"access_token": "token", "scope": self.scope})
    path = request.url.raw_path.decode().split("?")[0]
    if (watch := _GOOGLE_WATCH.match(path)) is not None:
      return self._watch(unquote(watch["calendar"]), json.loads(request.content))
    if path == "/calendar/v3/channels/stop":
      body = json.loads(request.content)
      self.stopped.append((body["id"], body["resourceId"]))
      return httpx.Response(204) if self.channels.pop(body["id"], None) else httpx.Response(404)
    match = _GOOGLE_EVENT.match(path)
    if not match:
      return httpx.Response(404, json={"error": {"code": 404, "message": "Not Found"}})
    calendar_id = unquote(match["calendar"])
    event_id = unquote(match["event"]) if match["event"] else None
    body = json.loads(request.content) if request.content else None
    self.requests.append(GoogleRequest(request.method, request.url.path, dict(request.url.params), dict(request.headers), body))
    if (failure := self.failures.get((request.method, event_id or ""))) is not None:
      return httpx.Response(failure[0], json=failure[1])

    calendar = self.events.setdefault(calendar_id, {})
    if request.method == "POST" and event_id is None:
      created = {"id": f"new{next(self._ids)}", "etag": f'"{next(self._ids)}"', **(body or {})}
      if "conferenceData" in created and "createRequest" in created["conferenceData"]:
        created["conferenceData"] = {"entryPoints": [{"entryPointType": "video", "uri": "https://meet.google.com/new-link"}]}
      calendar[created["id"]] = created
      return httpx.Response(200, json=created)
    if event_id is None and request.method == "GET":
      return httpx.Response(200, json={"items": list(calendar.values())})
    if event_id is None:
      return httpx.Response(405)
    event = calendar.get(event_id)
    if event is None:
      return httpx.Response(404, json={"error": {"code": 404, "message": "Not Found"}})
    if_match = request.headers.get("If-Match")
    if if_match and if_match != event["etag"]:
      return httpx.Response(412, json={"error": {"code": 412, "message": "Precondition Failed"}})

    if request.method == "GET":
      return httpx.Response(200, json=event)
    if request.method == "PATCH":
      event.update(copy.deepcopy(body or {}))
      event["etag"] = f'"{next(self._ids)}"'
      return httpx.Response(200, json=event)
    if request.method == "DELETE":
      del calendar[event_id]
      return httpx.Response(204)
    if request.method == "POST" and match["move"]:
      destination = request.url.params["destination"]
      moved = calendar.pop(event_id)
      moved["etag"] = f'"{next(self._ids)}"'
      self.events.setdefault(destination, {})[event_id] = moved
      return httpx.Response(200, json=moved)
    return httpx.Response(405)

  def _watch(self, calendar_id: str, body: dict[str, Any]) -> httpx.Response:
    if (failure := self.watch_failures.get(calendar_id)) is not None:
      return httpx.Response(failure[0], json=failure[1])
    resource_id = f"resource-{calendar_id}"
    self.channels[body["id"]] = (calendar_id, body["address"], body["token"], resource_id)
    return httpx.Response(
      200,
      json={"kind": "api#channel", "id": body["id"], "resourceId": resource_id, "expiration": str(self.now_ms + self.channel_lifetime_ms)},
    )


def google_error(status: int, reason: str, message: str = "error") -> tuple[int, dict[str, Any]]:
  return status, {"error": {"code": status, "message": message, "errors": [{"reason": reason}]}}


@dataclass
class FakeCalDAV:
  """A CalDAV collection store: PUT/GET/DELETE of .ics resources with ETags."""

  resources: dict[str, tuple[str, str]] = field(default_factory=dict)
  requests: list[tuple[str, str, dict[str, str]]] = field(default_factory=list)
  failures: dict[tuple[str, str], int] = field(default_factory=dict)
  _ids: count = field(default_factory=lambda: count(1))

  def put(self, href: str, data: str) -> str:
    etag = f'"e{next(self._ids)}"'
    self.resources[href] = (data, etag)
    return etag

  def data(self, href: str) -> str:
    return self.resources[href][0]

  def transport(self) -> httpx.MockTransport:
    return httpx.MockTransport(self._handle)

  def _handle(self, request: httpx.Request) -> httpx.Response:
    href = str(request.url)
    self.requests.append((request.method, href, dict(request.headers)))
    if request.method in ("PROPFIND", "REPORT"):
      return self._dav(request, href)
    if (status := self.failures.get((request.method, href))) is not None:
      return httpx.Response(status)
    existing = self.resources.get(href)
    if request.method == "GET":
      if existing is None:
        return httpx.Response(404)
      return httpx.Response(200, text=existing[0], headers={"ETag": existing[1]})
    if request.method == "PUT":
      if request.headers.get("If-None-Match") == "*" and existing is not None:
        return httpx.Response(412)
      if (if_match := request.headers.get("If-Match")) and (existing is None or existing[1] != if_match):
        return httpx.Response(412)
      etag = self.put(href, request.content.decode())
      return httpx.Response(201 if existing is None else 204, headers={"ETag": etag})
    if request.method == "DELETE":
      if existing is None:
        return httpx.Response(404)
      if (if_match := request.headers.get("If-Match")) and existing[1] != if_match:
        return httpx.Response(412)
      del self.resources[href]
      return httpx.Response(204)
    return httpx.Response(405)

  def _dav(self, request: httpx.Request, href: str) -> httpx.Response:
    principal = f"{CALDAV_ORIGIN}/1234/principal/"
    if href == f"{CALDAV_ORIGIN}/":
      return _multistatus(_dav_response("/", f"<d:current-user-principal><d:href>{principal}</d:href></d:current-user-principal>"))
    if href == principal:
      return _multistatus(_dav_response(principal, f"<c:calendar-home-set><d:href>{CALDAV_HOME}</d:href></c:calendar-home-set>"))
    if request.method == "REPORT":
      responses = [
        _dav_response(resource_href, f"<d:getetag>{etag}</d:getetag><c:calendar-data>{escape(data)}</c:calendar-data>")
        for resource_href, (data, etag) in self.resources.items()
        if resource_href.startswith(href)
      ]
      return _multistatus(*responses)
    return httpx.Response(404)


CALDAV_ORIGIN = "https://caldav.icloud.com"
CALDAV_HOME = f"{CALDAV_ORIGIN}/1234/calendars/"


def _dav_response(href: str, prop: str) -> str:
  return f"<d:response><d:href>{href}</d:href><d:propstat><d:prop>{prop}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>"


def _multistatus(*responses: str) -> httpx.Response:
  namespaces = 'xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"'
  return httpx.Response(207, text=f'<?xml version="1.0"?><d:multistatus {namespaces}>{"".join(responses)}</d:multistatus>')
