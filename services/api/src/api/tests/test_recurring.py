from datetime import date
from typing import Any
from uuid import uuid4

import pytest
import pytest_asyncio
from api.models.bank_account import BankAccount
from api.models.recurring_series import RecurringSeries
from api.models.transaction import Transaction, TransactionDirection
from api.models.user import User
from api.postgres import AsyncSession
from api.recurring import endpoints
from api.tests.fixtures.database import SaveFixture
from httpx import AsyncClient
from sqlalchemy import select

TODAY = date(2026, 10, 1)
DEBIT, CREDIT = TransactionDirection.debit, TransactionDirection.credit
MONTHS = range(4, 10)


@pytest.fixture(autouse=True)
def frozen_today(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(endpoints, "_today", lambda user: TODAY)


async def _account(save_fixture: SaveFixture, user: User, name: str, **fields: Any) -> BankAccount:
  account = BankAccount(name=name, currency="SEK", base_balance=0, subtype=fields.pop("subtype", "checking"), user_id=user.id, **fields)
  await save_fixture(account)
  return account


async def _monthly(
  save_fixture: SaveFixture, account: BankAccount, day: int, amount: int, description: str, *, direction: TransactionDirection = DEBIT, **fields: Any
) -> None:
  for month in MONTHS:
    await save_fixture(
      Transaction(
        amount=amount,
        currency="SEK",
        transaction_date=date(2026, month, day),
        direction=direction,
        dedup_hash=uuid4().hex,
        description=description,
        bank_account_id=account.id,
        user_id=account.user_id,
        **fields,
      )
    )


async def _recurring(client: AsyncClient, **params: Any) -> dict[str, Any]:
  resp = await client.get("/v1/recurring", params=params)
  assert resp.status_code == 200, resp.text
  return resp.json()


@pytest_asyncio.fixture
async def checking(save_fixture: SaveFixture, user: User) -> BankAccount:
  return await _account(save_fixture, user, "Lönekonto")


class TestDetected:
  @pytest.mark.asyncio
  async def test_lists_series_with_what_is_due_and_monthly_totals(self, client: AsyncClient, save_fixture: SaveFixture, checking: BankAccount) -> None:
    await _monthly(save_fixture, checking, 5, 11_900, "SPOTIFY")
    await _monthly(save_fixture, checking, 27, 45_000, "AUTOGIRO FORSAKRING")
    await _monthly(save_fixture, checking, 25, 2_500_000, "LON", direction=CREDIT)

    body = await _recurring(client)

    by_name = {s["name"]: s for s in body["series"]}
    assert {n: (s["kind"], s["cadence"], s["next_date"]) for n, s in by_name.items()} == {
      "SPOTIFY": ("subscription", "monthly", "2026-10-05"),
      "AUTOGIRO FORSAKRING": ("bill", "monthly", "2026-10-27"),
      # The 25th is a Sunday.
      "LON": ("income", "monthly", "2026-10-23"),
    }
    assert [(u["name"], u["date"], u["amount"]) for u in body["upcoming"]] == [
      ("SPOTIFY", "2026-10-05", 11_900),
      ("LON", "2026-10-23", 2_500_000),
      ("AUTOGIRO FORSAKRING", "2026-10-27", 45_000),
    ]
    assert body["totals"] == [{"currency": "SEK", "is_business": False, "money_out": 56_900, "subscriptions": 11_900, "money_in": 2_500_000}]

  @pytest.mark.asyncio
  async def test_days_limits_what_is_upcoming(self, client: AsyncClient, save_fixture: SaveFixture, checking: BankAccount) -> None:
    await _monthly(save_fixture, checking, 5, 11_900, "SPOTIFY")

    assert (await _recurring(client, days=4))["upcoming"] == []
    assert len((await _recurring(client, days=5))["upcoming"]) == 1

  @pytest.mark.asyncio
  async def test_moves_between_own_accounts_and_card_repayments_are_left_out(
    self, client: AsyncClient, save_fixture: SaveFixture, user: User, checking: BankAccount
  ) -> None:
    card = await _account(save_fixture, user, "Kort", subtype="credit_card")
    isk = await _account(save_fixture, user, "ISK", subtype="isk")
    await _monthly(save_fixture, checking, 1, 200_000, "TILL SPARKONTO", transfer_id=uuid4())
    await _monthly(save_fixture, card, 28, 150_000, "INBETALNING", direction=CREDIT)
    await _monthly(save_fixture, isk, 2, 100_000, "MANADSSPAR")

    assert (await _recurring(client))["series"] == []

  @pytest.mark.asyncio
  async def test_paying_off_pay_later_stays_a_bill_on_the_paying_account(
    self, client: AsyncClient, save_fixture: SaveFixture, user: User, checking: BankAccount
  ) -> None:
    klarna = await _account(save_fixture, user, "Klarna", subtype="credit_card")
    savings = await _account(save_fixture, user, "Sparkonto", subtype="savings")
    for month in MONTHS:
      instalment, saving = uuid4(), uuid4()
      for account, direction, transfer_id, text in (
        (checking, DEBIT, instalment, "KLARNA"),
        (klarna, CREDIT, instalment, "INBETALNING"),
        (checking, DEBIT, saving, "TILL SPARKONTO"),
        (savings, CREDIT, saving, "FRAN LONEKONTO"),
      ):
        await save_fixture(
          Transaction(
            amount=60_000 if transfer_id == instalment else 200_000,
            currency="SEK",
            transaction_date=date(2026, month, 28),
            direction=direction,
            dedup_hash=uuid4().hex,
            description=text,
            bank_account_id=account.id,
            user_id=account.user_id,
            transfer_id=transfer_id,
          )
        )

    series = (await _recurring(client))["series"]

    assert [(s["name"], s["bank_account_id"], s["direction"]) for s in series] == [("KLARNA", str(checking.id), "debit")]

  @pytest.mark.asyncio
  async def test_a_company_cost_paid_privately_counts_as_the_companys(self, client: AsyncClient, save_fixture: SaveFixture, checking: BankAccount) -> None:
    await _monthly(save_fixture, checking, 9, 30_000, "CLOUD HOSTING", is_business=True)

    body = await _recurring(client)

    assert [s["is_business"] for s in body["series"]] == [True]
    assert [(t["is_business"], t["money_out"]) for t in body["totals"]] == [(True, 30_000)]

  @pytest.mark.asyncio
  async def test_another_users_money_stays_theirs(self, client: AsyncClient, save_fixture: SaveFixture, other_user: User) -> None:
    theirs = await _account(save_fixture, other_user, "Theirs")
    await _monthly(save_fixture, theirs, 5, 11_900, "SPOTIFY")

    assert (await _recurring(client))["series"] == []


class TestReview:
  @pytest_asyncio.fixture(autouse=True)
  async def gym(self, save_fixture: SaveFixture, checking: BankAccount) -> None:
    await _monthly(save_fixture, checking, 3, 39_900, "GYMKEDJAN")

  async def _review(self, client: AsyncClient, **fields: Any) -> dict[str, Any]:
    [series] = (await _recurring(client))["series"]
    resp = await client.post("/v1/recurring/reviews", json={"key": series["key"], "typical_amount": series["typical_amount"], **fields})
    assert resp.status_code == 201, resp.text
    return resp.json()

  @pytest.mark.asyncio
  async def test_dismissed_stays_listed_but_out_of_upcoming_and_totals(self, client: AsyncClient) -> None:
    review = await self._review(client, decision="dismissed")

    body = await _recurring(client)

    assert [(s["decision"], s["review_id"]) for s in body["series"]] == [("dismissed", review["id"])]
    assert (body["upcoming"], body["totals"]) == ([], [])

  @pytest.mark.asyncio
  async def test_rename_and_change_kind_then_go_back(self, client: AsyncClient) -> None:
    review = await self._review(client, name="Gym", kind="subscription")
    [series] = (await _recurring(client))["series"]
    assert (series["name"], series["detected_name"], series["kind"]) == ("Gym", "GYMKEDJAN", "subscription")
    assert (await _recurring(client))["totals"][0]["subscriptions"] == 39_900

    resp = await client.patch(f"/v1/recurring/reviews/{review['id']}", json={"name": None, "decision": "confirmed"})
    assert resp.status_code == 200, resp.text
    [series] = (await _recurring(client))["series"]
    assert (series["name"], series["kind"], series["decision"]) == ("GYMKEDJAN", "subscription", "confirmed")

    assert (await client.delete(f"/v1/recurring/reviews/{review['id']}")).status_code == 204
    [series] = (await _recurring(client))["series"]
    assert (series["kind"], series["decision"], series["review_id"]) == ("bill", None, None)

  @pytest.mark.asyncio
  async def test_a_second_quick_action_changes_the_same_review(self, client: AsyncClient, session: AsyncSession, user: User) -> None:
    # The page sends both before its list comes back with the first one's id.
    first = await self._review(client, decision="dismissed")
    second = await self._review(client, name="Gym")

    assert second["id"] == first["id"]
    assert (second["decision"], second["name"]) == ("dismissed", "Gym")
    rows = (await session.execute(select(RecurringSeries).where(RecurringSeries.user_id == user.id))).scalars().all()
    assert len(rows) == 1
    [series] = (await _recurring(client))["series"]
    assert (series["review_id"], series["decision"], series["name"]) == (first["id"], "dismissed", "Gym")

  @pytest.mark.asyncio
  async def test_a_dismissal_survives_a_price_rise(self, client: AsyncClient, save_fixture: SaveFixture, checking: BankAccount) -> None:
    await self._review(client, decision="dismissed")
    await save_fixture(
      Transaction(
        amount=44_900,
        currency="SEK",
        transaction_date=date(2026, 10, 1),
        direction=DEBIT,
        dedup_hash=uuid4().hex,
        description="GYMKEDJAN",
        bank_account_id=checking.id,
        user_id=checking.user_id,
      )
    )

    [series] = (await _recurring(client))["series"]

    assert (series["typical_amount"], series["decision"]) == (44_900, "dismissed")

  @pytest.mark.asyncio
  async def test_two_plans_each_keep_their_own_review(self, client: AsyncClient, save_fixture: SaveFixture, checking: BankAccount) -> None:
    await _monthly(save_fixture, checking, 18, 99_900, "GYMKEDJAN")
    series = (await _recurring(client))["series"]
    cheap = next(s for s in series if s["typical_amount"] == 39_900)
    await client.post("/v1/recurring/reviews", json={"key": cheap["key"], "typical_amount": 39_900, "name": "Gym, me"})

    names = sorted((s["typical_amount"], s["name"]) for s in (await _recurring(client))["series"])

    assert names == [(39_900, "Gym, me"), (99_900, "GYMKEDJAN")]

  @pytest.mark.asyncio
  async def test_another_users_review_cannot_be_changed(self, client: AsyncClient, save_fixture: SaveFixture, other_user: User) -> None:
    theirs = RecurringSeries(user_id=other_user.id, key="debit|SEK|personal|x", typical_amount=1)
    await save_fixture(theirs)

    assert (await client.patch(f"/v1/recurring/reviews/{theirs.id}", json={"name": "Mine"})).status_code == 404
    assert (await client.delete(f"/v1/recurring/reviews/{theirs.id}")).status_code == 404
