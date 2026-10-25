"""An in-memory Google People API (connections with sync tokens), served over httpx.MockTransport."""

import copy
import json
from dataclasses import dataclass, field
from typing import Any

import httpx


@dataclass
class FakePeople:
  """people/me/connections with real sync-token behaviour: a token returns only
  what changed after it was issued, deletions come back with metadata.deleted,
  and an expired token is refused the way Google refuses it."""

  # resource name -> (person, version it last changed at)
  people: dict[str, tuple[dict[str, Any], int]] = field(default_factory=dict)
  version: int = 0
  expired: set[str] = field(default_factory=set)
  expire_with: int = 410
  page_size: int = 1000
  token_status: int = 200
  requests: list[dict[str, str]] = field(default_factory=list)
  # Writes as (method, path, update mask, body).
  writes: list[tuple[str, str, str | None, dict[str, Any] | None]] = field(default_factory=list)
  scope: str = "https://www.googleapis.com/auth/contacts.readonly"
  write_status: int | None = None

  def put(self, resource_name: str, **fields: Any) -> dict[str, Any]:
    self.version += 1
    person = {"resourceName": resource_name, "etag": f"%E{self.version}", "metadata": {"sources": [{"type": "CONTACT"}]}, **fields}
    self.people[resource_name] = (person, self.version)
    return person

  def delete(self, resource_name: str) -> None:
    self.version += 1
    self.people[resource_name] = ({"resourceName": resource_name, "metadata": {"deleted": True}}, self.version)

  def transport(self) -> httpx.MockTransport:
    return httpx.MockTransport(self._handle)

  def _handle(self, request: httpx.Request) -> httpx.Response:
    if request.url.host == "openidconnect.googleapis.com":
      return httpx.Response(200, json={"email": "me@gmail.com"})
    if request.url.host == "oauth2.googleapis.com":
      if self.token_status != 200:
        return httpx.Response(self.token_status, json={"error": "invalid_grant"})
      return httpx.Response(200, json={"access_token": "token", "scope": self.scope})
    if request.url.path != "/v1/people/me/connections":
      return self._person_request(request)
    params = dict(request.url.params)
    self.requests.append(params)
    token = params.get("syncToken")
    if token in self.expired:
      if self.expire_with == 410:
        return httpx.Response(410, json={"error": {"code": 410, "message": "Sync token is expired."}})
      return httpx.Response(400, json={"error": {"code": 400, "details": [{"reason": "EXPIRED_SYNC_TOKEN"}]}})
    since = int(token.removeprefix("t")) if token else 0
    changed = sorted(((v, p) for p, v in self.people.values() if v > since), key=lambda pair: pair[0])
    if not token:
      changed = [(v, p) for v, p in changed if not p["metadata"].get("deleted")]
    start = int(params.get("pageToken", "0"))
    page = changed[start : start + self.page_size]
    body: dict[str, Any] = {"connections": [copy.deepcopy(p) for _, p in page]}
    if start + self.page_size < len(changed):
      body["nextPageToken"] = str(start + self.page_size)
    else:
      body["nextSyncToken"] = f"t{self.version}"
    return httpx.Response(200, json=body)

  def _person_request(self, request: httpx.Request) -> httpx.Response:
    path = request.url.path.removeprefix("/v1/")
    body = json.loads(request.content) if request.content else None
    if request.method != "GET":
      self.writes.append((request.method, path, request.url.params.get("updatePersonFields"), body))
      if self.write_status is not None:
        return httpx.Response(self.write_status, json={"error": {"code": self.write_status, "message": "nope"}})
    if path == "people:createContact" and request.method == "POST":
      self.version += 1
      resource_name = f"people/c{100 + self.version}"
      return httpx.Response(200, json=self.put(resource_name, **body))
    resource_name, _, action = path.partition(":")
    found = self.people.get(resource_name)
    if found is None or found[0]["metadata"].get("deleted"):
      return httpx.Response(404, json={"error": {"code": 404, "status": "NOT_FOUND"}})
    person = found[0]
    if request.method == "GET":
      return httpx.Response(200, json=copy.deepcopy(person))
    if action == "deleteContact":
      self.delete(resource_name)
      return httpx.Response(200, json={})
    assert action == "updateContact", action
    assert body is not None
    if body.get("etag") != person["etag"]:
      return httpx.Response(400, json={"error": {"code": 400, "status": "FAILED_PRECONDITION", "message": "failedPrecondition"}})
    mask = request.url.params["updatePersonFields"].split(",")
    fields = {k: v for k, v in person.items() if k not in ("resourceName", "etag", "metadata")}
    for name in mask:
      fields[name] = body.get(name, [])
    return httpx.Response(200, json=self.put(resource_name, **{k: v for k, v in fields.items() if v}))
