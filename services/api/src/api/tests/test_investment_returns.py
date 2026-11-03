from datetime import date, timedelta

import pytest
from api.investments.returns import Ledger, Returns, combine, period_returns, values_on

START = date(2026, 1, 1)


def day(n: int) -> date:
  return START + timedelta(days=n)


class TestTimeWeighted:
  def test_without_flows_it_is_the_growth_in_value(self) -> None:
    found = period_returns(Ledger(values={day(0): 1000, day(1): 1100, day(2): 1210}), start=None, end=day(2))

    assert found.time_weighted == pytest.approx(0.21)
    assert found.money_weighted == pytest.approx(0.21)
    assert (found.start, found.end, found.gain, found.net_flows) == (day(0), day(2), 210, 0)

  def test_a_deposit_on_a_valuation_day_does_not_count_as_a_gain(self) -> None:
    # Up 10%, then 1000 put in, then down 10%: chained that's 1.1 x 0.9.
    ledger = Ledger(values={day(0): 1000, day(10): 2100, day(20): 1890}, flows={day(10): 1000})

    found = period_returns(ledger, start=None, end=day(20))

    assert found.time_weighted == pytest.approx(-0.01)
    assert found.gain == 1890 - 1000 - 1000

  def test_a_deposit_between_valuations_counts_for_the_part_of_the_stretch_it_was_in(self) -> None:
    # Modified Dietz: 100 made on 1000 for ten days plus 500 for the last five, so on 1250.
    ledger = Ledger(values={day(0): 1000, day(10): 1600}, flows={day(5): 500})

    assert period_returns(ledger, start=None, end=day(10)).time_weighted == pytest.approx(0.08)

  def test_money_put_into_an_empty_account_and_invested_that_day_earns_from_then(self) -> None:
    # 1000 in on day 1 and already worth 1010 by its end: 1% on the 1000, then 10%.
    ledger = Ledger(values={day(0): 0, day(1): 1010, day(2): 1111}, flows={day(1): 1000})

    found = period_returns(ledger, start=None, end=day(2))

    assert found.time_weighted == pytest.approx(1.01 * 1.1 - 1)
    assert found.time_weighted_unavailable is None

  def test_a_stretch_at_zero_with_nothing_moved_counts_as_no_change(self) -> None:
    # Emptied on day 1, empty on day 2, 500 back in on day 3 that's worth 550 by its end.
    ledger = Ledger(values={day(0): 1000, day(1): 0, day(2): 0, day(3): 550}, flows={day(1): -1000, day(3): 500})

    assert period_returns(ledger, start=None, end=day(3)).time_weighted == pytest.approx(0.10)

  def test_a_value_below_zero_has_no_return_and_says_why(self) -> None:
    found = period_returns(Ledger(values={day(0): -500, day(1): 200}), start=None, end=day(1))

    assert found.time_weighted is None
    assert "zero or below" in (found.time_weighted_unavailable or "")

  def test_flows_on_or_before_the_start_are_already_in_the_start_value(self) -> None:
    ledger = Ledger(values={day(0): 1000, day(1): 1100}, flows={day(0): 1000, day(-3): 5000})

    found = period_returns(ledger, start=None, end=day(1))

    assert (found.time_weighted, found.net_flows) == (pytest.approx(0.10), 0)


class TestMoneyWeighted:
  def test_weighs_each_krona_by_how_long_it_was_in(self) -> None:
    # -1000 at day 0, -1000 at day 10, +1890 at day 20. With x = e^(-10g): 1890x² - 1000x - 1000 = 0,
    # x = (1000 + √(1000² + 4·1890·1000)) / 3780, and over the 20 days 1/x² - 1.
    ledger = Ledger(values={day(0): 1000, day(10): 2100, day(20): 1890}, flows={day(10): 1000})

    assert period_returns(ledger, start=None, end=day(20)).money_weighted == pytest.approx(-0.0728739, abs=1e-6)

  def test_a_withdrawal_comes_back_to_the_investor(self) -> None:
    # 1000 in, 600 out after ten days, 550 left after twenty: 1000 = 600 e^(-10g) + 550 e^(-20g).
    ledger = Ledger(values={day(0): 1000, day(10): 450, day(20): 550}, flows={day(10): -600})

    found = period_returns(ledger, start=None, end=day(20))

    x = (-600 + (600**2 + 4 * 550 * 1000) ** 0.5) / (2 * 550)
    assert found.money_weighted == pytest.approx(1 / x**2 - 1, abs=1e-9)
    assert found.net_flows == -600

  def test_money_only_going_one_way_has_no_rate(self) -> None:
    ledger = Ledger(values={day(0): 0, day(5): 0}, flows={day(3): 1000})

    found = period_returns(ledger, start=None, end=day(5))

    assert found.money_weighted is None
    assert "one way" in (found.money_weighted_unavailable or "")


class TestRange:
  LEDGER = Ledger(values={day(0): 1000, day(10): 1100, day(20): 1210, day(30): 1331})

  def test_starts_from_the_last_value_on_or_before_the_range_start(self) -> None:
    found = period_returns(self.LEDGER, start=day(15), end=day(30))

    assert (found.start, found.start_value) == (day(10), 1100)
    assert found.time_weighted == pytest.approx(0.21)

  def test_values_that_only_begin_inside_the_range_start_there(self) -> None:
    found = period_returns(self.LEDGER, start=day(-100), end=day(30))

    assert found.start == day(0)
    assert found.time_weighted == pytest.approx(0.331)

  def test_ends_at_the_last_value_on_or_before_the_end(self) -> None:
    assert period_returns(self.LEDGER, start=None, end=day(25)).end == day(20)

  def test_one_value_in_range_is_too_short(self) -> None:
    found = period_returns(self.LEDGER, start=day(30), end=day(30))

    assert (found.time_weighted, found.money_weighted) == (None, None)
    assert "two different days" in (found.time_weighted_unavailable or "")

  def test_no_values_says_where_they_come_from(self) -> None:
    assert "first broker sync" in (period_returns(Ledger(values={}), start=None, end=day(1)).time_weighted_unavailable or "")

  def test_only_a_year_or_more_is_given_per_year(self) -> None:
    year = Returns(start=day(0), end=day(730))

    assert Returns(start=day(0), end=day(364)).annualized(0.1) is None
    assert year.annualized(0.21) == pytest.approx(0.10)


class TestCombine:
  def test_an_account_valued_from_later_joins_without_counting_as_a_gain(self) -> None:
    first = Ledger(values={day(0): 1000, day(5): 1050, day(10): 1100})
    later = Ledger(values={day(5): 500, day(10): 550}, flows={day(2): 400, day(5): 100})

    together = combine([first, later])

    assert together.values == {day(0): 1000, day(5): 1550, day(10): 1650}
    assert together.flows == {day(5): 500}
    # 50 made on 1000, then 100 on 1550.
    assert period_returns(together, start=None, end=day(10)).time_weighted == pytest.approx(1.05 * 1650 / 1550 - 1)


class TestValuesOn:
  def test_cash_then_plus_the_latest_holdings_from_the_first_snapshot(self) -> None:
    values = values_on(
      [day(0), day(1), day(2), day(3)],
      base_balance=100,
      daily_net={day(0): 1000, day(2): -500},
      holdings={day(1): 400, day(3): 600},
    )

    assert values == {day(1): 1100 + 400, day(2): 600 + 400, day(3): 600 + 600}

  def test_nothing_without_snapshots(self) -> None:
    assert values_on([day(0)], base_balance=100, daily_net={}, holdings={}) == {}
