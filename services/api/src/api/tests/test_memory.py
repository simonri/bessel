from datetime import date

import pytest
from api.models.memory_fact import MemoryFact, MemoryKind, MemoryStatus
from api.models.user import User
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


async def add_fact(session: AsyncSession, user: User, attribute: str, statement: str, **extra: object) -> MemoryFact:
  fact = MemoryFact(
    user_id=user.id,
    area=extra.pop("area", "kropp/kläder"),
    attribute=attribute,
    statement=statement,
    kind=extra.pop("kind", MemoryKind.inferred),
    status=extra.pop("status", MemoryStatus.hypothesis),
    importance=extra.pop("importance", 3),
    **extra,
  )
  session.add(fact)
  await session.flush()
  return fact


class TestListMemoryFacts:
  @pytest.mark.asyncio
  async def test_lists_what_is_known_now_most_important_first(self, client: AsyncClient, session: AsyncSession, user: User, other_user: User) -> None:
    await add_fact(session, user, "skostorlek", "44", importance=2)
    await add_fact(session, user, "sömnmål", "Släckt 02:00", area="sömn", importance=5)
    await add_fact(session, user, "stad", "Bor i Uppsala", area="identitet", valid_to=date(2025, 1, 1))
    await add_fact(session, user, "kronotyp", "Morgonmänniska", area="rytm", status=MemoryStatus.rejected)
    await add_fact(session, other_user, "skostorlek", "39")

    resp = await client.get("/v1/memory/facts")

    assert resp.status_code == 200
    assert [(f["attribute"], f["statement"]) for f in resp.json()["facts"]] == [("sömnmål", "Släckt 02:00"), ("skostorlek", "44")]


class TestCorrectMemoryFact:
  @pytest.mark.asyncio
  async def test_a_correction_becomes_the_users_own_confirmed_fact(self, client: AsyncClient, session: AsyncSession, user: User) -> None:
    fact = await add_fact(session, user, "skostorlek", "44")

    resp = await client.patch(f"/v1/memory/facts/{fact.id}", json={"statement": "45", "importance": 4})

    assert resp.status_code == 200
    body = resp.json()
    assert (body["statement"], body["importance"], body["kind"], body["status"]) == ("45", 4, "corrected", "confirmed")
    assert body["area"] == "kropp/kläder"

  @pytest.mark.asyncio
  async def test_cannot_rename_onto_an_attribute_already_known(self, client: AsyncClient, session: AsyncSession, user: User) -> None:
    await add_fact(session, user, "skostorlek", "44")
    jeans = await add_fact(session, user, "jeansstorlek", "32")

    resp = await client.patch(f"/v1/memory/facts/{jeans.id}", json={"attribute": "Skostorlek"})

    assert resp.status_code == 400

  @pytest.mark.asyncio
  async def test_another_users_fact_is_not_found(self, client: AsyncClient, session: AsyncSession, other_user: User) -> None:
    theirs = await add_fact(session, other_user, "skostorlek", "39")

    assert (await client.patch(f"/v1/memory/facts/{theirs.id}", json={"statement": "40"})).status_code == 404
    assert (await client.delete(f"/v1/memory/facts/{theirs.id}")).status_code == 404


class TestForgetMemoryFact:
  @pytest.mark.asyncio
  async def test_a_forgotten_fact_is_gone(self, client: AsyncClient, session: AsyncSession, user: User) -> None:
    fact = await add_fact(session, user, "skostorlek", "44")

    resp = await client.delete(f"/v1/memory/facts/{fact.id}")

    assert resp.status_code == 204
    assert (await client.get("/v1/memory/facts")).json()["facts"] == []
    assert (await client.delete(f"/v1/memory/facts/{fact.id}")).status_code == 404
