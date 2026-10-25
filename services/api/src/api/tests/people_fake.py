"""An in-memory Google People API (connections with sync tokens), served over httpx.MockTransport."""

import copy
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
    if request.url.host == "oauth2.googleapis.com":
      if self.token_status != 200:
        return httpx.Response(self.token_status, json={"error": "invalid_grant"})
      return httpx.Response(200, json={"access_token": "token", "scope": "https://www.googleapis.com/auth/contacts.readonly"})
    assert request.url.path == "/v1/people/me/connections", request.url.path
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
