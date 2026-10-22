import pytest
from api.investments.kinds import investment_kind


class TestInvestmentKind:
  @pytest.mark.parametrize(
    ("transaction_type", "description", "kind"),
    [
      ("BUY", "Köp Investor B", "buy"),
      ("SELL", "Sälj Investor B", "sell"),
      ("DEPOSIT", "Insättning", "deposit"),
      ("WITHDRAW", "Uttag", "withdrawal"),
      ("DIVIDEND", "Utdelning", "dividend"),
      ("INTEREST", "Utlåningsränta", "interest"),
      ("UNKNOWN", "Avkastningsskatt", "tax"),
      ("UNKNOWN", "Riskpremie", "fee"),
      ("UNKNOWN", "Övertrasseringsavgift", "fee"),
      ("UNKNOWN", "Köp av tjänst Morgonrapport och Affärsförslag (moms)", "fee"),
      ("UNKNOWN", "Utdelning CIBUS 0.817145 SEK/aktie", "dividend"),
      ("UNKNOWN", "Något helt nytt", None),
      (None, "Skatteverket", None),
    ],
  )
  def test_the_brokers_kind_or_its_text_says_what_a_movement_is(self, transaction_type: str | None, description: str, kind: str | None) -> None:
    assert investment_kind(transaction_type, description) == kind
