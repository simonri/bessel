from datetime import date, timedelta
from uuid import UUID, uuid4

from api.models.recurring_series import RecurringKind
from api.models.transaction import TransactionDirection
from api.recurring.detection import RecurringCadence, PriceChange, RecurringStatus, detect, occurrences
from api.transactions.repository import RecurringRow

DEBIT, CREDIT = TransactionDirection.debit, TransactionDirection.credit
CHECKING = UUID("00000000-0000-0000-0000-00000000000a")


def _row(
  day: date,
  amount: int,
  description: str,
  *,
  direction: TransactionDirection = DEBIT,
  currency: str = "SEK",
  name: str | None = None,
  business: bool = False,
) -> RecurringRow:
  return RecurringRow(uuid4(), day, amount, currency, direction, name, description, CHECKING, business)


def _monthly(day: int, months: list[tuple[int, int]], amount: int, description: str, **fields: object) -> list[RecurringRow]:
  return [_row(date(year, month, day), amount, description, **fields) for year, month in months]  # type: ignore[arg-type]


MAY_TO_OCT = [(2026, m) for m in range(5, 11)]


class TestMonthly:
  def test_a_card_subscription_with_a_new_reference_each_month_is_one_series(self) -> None:
    rows = [_row(date(2026, m, 5), 11_900, f"SPOTIFY P{m}A7C{m}") for m in range(5, 11)]

    [series] = detect(rows, today=date(2026, 10, 20))

    assert (series.name, series.kind, series.cadence, series.status) == ("SPOTIFY", RecurringKind.subscription, RecurringCadence.monthly, RecurringStatus.active)
    assert (series.typical_amount, series.count, series.next_date) == (11_900, 6, date(2026, 11, 5))
    assert not series.variable

  def test_an_autogiro_moved_past_a_weekend_keeps_its_day(self) -> None:
    # The 27th fell on a Saturday in June and a Sunday in September: the bank took it the Monday after.
    days = [date(2026, 5, 27), date(2026, 6, 29), date(2026, 7, 27), date(2026, 8, 27), date(2026, 9, 28), date(2026, 10, 27)]
    rows = [_row(day, 45_000, "AUTOGIRO HEMFORSAKRING") for day in days]

    [series] = detect(rows, today=date(2026, 11, 2))

    assert (series.kind, series.anchor_day, series.next_date) == (RecurringKind.bill, 27, date(2026, 11, 27))
    # December 27th is a Sunday.
    assert occurrences(series, date(2026, 11, 2), date(2027, 1, 31)) == [date(2026, 11, 27), date(2026, 12, 28), date(2027, 1, 27)]

  def test_salary_due_at_a_weekend_comes_the_friday_before(self) -> None:
    rows = [_row(date(2026, m, 25), 3_000_000, "LON", direction=CREDIT) for m in (1, 2, 3)]
    rows[0] = rows[0]._replace(transaction_date=date(2026, 1, 23))

    [series] = detect(rows, today=date(2026, 4, 1))

    assert (series.kind, series.next_date) == (RecurringKind.income, date(2026, 4, 24))

  def test_a_price_rise_is_kept_in_the_series_and_reported(self) -> None:
    rows = _monthly(12, MAY_TO_OCT[:4], 9_900, "STREAMIO") + _monthly(12, MAY_TO_OCT[4:], 12_900, "STREAMIO")

    [series] = detect(rows, today=date(2026, 10, 20))

    assert series.typical_amount == 12_900
    assert series.price_changes == (PriceChange(date(2026, 9, 12), 9_900, 12_900),)
    assert not series.variable

  def test_a_rise_seen_only_on_the_latest_charge_already_counts(self) -> None:
    rows = _monthly(12, MAY_TO_OCT[:5], 9_900, "STREAMIO") + _monthly(12, MAY_TO_OCT[5:], 10_900, "STREAMIO")

    [series] = detect(rows, today=date(2026, 10, 20))

    assert series.price_changes == (PriceChange(date(2026, 10, 12), 9_900, 10_900),)
    assert series.typical_amount == 10_900

  def test_a_bill_that_varies_is_one_series_at_its_recent_middle(self) -> None:
    amounts = [41_000, 38_000, 52_000, 66_000, 81_000, 97_000]
    rows = [_row(date(2026, 5 + i, 30), amount, "ELBOLAGET") for i, amount in enumerate(amounts)]

    [series] = detect(rows, today=date(2026, 10, 31))

    assert series.variable
    assert series.typical_amount == 81_000
    assert series.price_changes == ()

  def test_one_missed_month_does_not_break_it(self) -> None:
    rows = _monthly(3, [(2026, 4), (2026, 5), (2026, 7), (2026, 8), (2026, 9), (2026, 10)], 25_000, "GYMMET")

    [series] = detect(rows, today=date(2026, 10, 10))

    assert (series.cadence, series.count) == (RecurringCadence.monthly, 6)

  def test_two_payments_are_not_enough(self) -> None:
    assert detect(_monthly(3, [(2026, 9), (2026, 10)], 25_000, "GYMMET"), today=date(2026, 10, 10)) == []

  def test_a_shop_visited_now_and_then_is_not_a_bill(self) -> None:
    days = [date(2026, 9, 1), date(2026, 9, 4), date(2026, 9, 13), date(2026, 9, 30), date(2026, 10, 2), date(2026, 10, 21)]
    rows = [_row(day, 30_000 + i * 1_000, "ICA NARA") for i, day in enumerate(days)]

    assert detect(rows, today=date(2026, 10, 22)) == []


class TestOtherCadences:
  def test_a_fixed_weekly_amount(self) -> None:
    start = date(2026, 9, 4)
    rows = [_row(start + timedelta(weeks=w), 20_000, "SWISH VECKOPENG") for w in range(5)]

    [series] = detect(rows, today=date(2026, 10, 5))

    assert (series.cadence, series.next_date) == (RecurringCadence.weekly, date(2026, 10, 9))
    assert occurrences(series, date(2026, 10, 5), date(2026, 10, 31)) == [date(2026, 10, 9), date(2026, 10, 16), date(2026, 10, 23), date(2026, 10, 30)]
    assert series.monthly_amount == round(20_000 * 52 / 12)

  def test_a_weekly_food_shop_of_changing_amounts_is_not_a_bill(self) -> None:
    start = date(2026, 9, 5)
    rows = [_row(start + timedelta(weeks=w), 80_000 + w * 9_000, "WILLYS") for w in range(6)]

    assert detect(rows, today=date(2026, 10, 12)) == []

  def test_quarterly(self) -> None:
    rows = _monthly(15, [(2026, 1), (2026, 4), (2026, 7), (2026, 10)], 150_000, "BRF AVGIFT")

    [series] = detect(rows, today=date(2026, 10, 20))

    assert (series.cadence, series.next_date) == (RecurringCadence.quarterly, date(2027, 1, 15))
    assert series.monthly_amount == 50_000

  def test_yearly(self) -> None:
    rows = [_row(date(2024, 11, 20), 59_900, "DOMANNAMN.SE"), _row(date(2025, 11, 20), 59_900, "DOMANNAMN.SE")]

    [series] = detect(rows, today=date(2026, 11, 3))

    assert (series.cadence, series.next_date, series.status) == (RecurringCadence.yearly, date(2026, 11, 20), RecurringStatus.active)


class TestGrouping:
  def test_the_users_name_joins_two_bank_texts(self) -> None:
    rows = [
      _row(date(2026, m, 8), 29_900, "TELIA SVERIGE" if m % 2 else "TELIA MOBIL AB", name="Mobil") for m in range(6, 11)
    ]

    [series] = detect(rows, today=date(2026, 10, 20))

    assert (series.name, series.count) == ("Mobil", 5)

  def test_two_plans_from_one_shop_are_two_series(self) -> None:
    rows = _monthly(2, MAY_TO_OCT, 4_900, "APPLE.COM/BILL") + _monthly(17, MAY_TO_OCT, 13_900, "APPLE.COM/BILL")

    found = detect(rows, today=date(2026, 10, 20))

    assert sorted((s.typical_amount, s.next_date) for s in found) == [(4_900, date(2026, 11, 2)), (13_900, date(2026, 11, 17))]
    assert len({s.key for s in found}) == 1

  def test_currencies_and_owners_stay_apart(self) -> None:
    rows = (
      _monthly(4, MAY_TO_OCT, 1_000, "HOSTING")
      + _monthly(4, MAY_TO_OCT, 1_000, "HOSTING", currency="EUR")
      + _monthly(4, MAY_TO_OCT, 1_000, "HOSTING", business=True)
    )

    found = detect(rows, today=date(2026, 10, 20))

    assert sorted((s.currency, s.business, s.count) for s in found) == [("EUR", False, 6), ("SEK", False, 6), ("SEK", True, 6)]

  def test_money_in_and_out_under_one_name_stay_apart(self) -> None:
    rows = _monthly(4, MAY_TO_OCT, 50_000, "SWISH ANNA") + _monthly(20, MAY_TO_OCT, 50_000, "SWISH ANNA", direction=CREDIT)

    found = detect(rows, today=date(2026, 10, 25))

    assert sorted(s.kind for s in found) == [RecurringKind.bill, RecurringKind.income]


class TestStatus:
  ROWS = _monthly(10, MAY_TO_OCT, 19_900, "TIDNINGEN")

  def test_on_time_within_a_few_days(self) -> None:
    [series] = detect(self.ROWS, today=date(2026, 11, 14))

    assert (series.status, series.next_date) == (RecurringStatus.active, date(2026, 11, 10))

  def test_late_once_the_payment_is_overdue(self) -> None:
    [series] = detect(self.ROWS, today=date(2026, 11, 15))

    assert (series.status, series.next_date) == (RecurringStatus.late, date(2026, 11, 10))

  def test_ended_after_two_missed(self) -> None:
    [series] = detect(self.ROWS, today=date(2026, 12, 15))

    assert (series.status, series.next_date) == (RecurringStatus.ended, None)
    assert occurrences(series, date(2026, 12, 15), date(2027, 3, 1)) == []
