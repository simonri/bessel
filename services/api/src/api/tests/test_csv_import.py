import pytest
from api.exceptions import ValidationError
from api.transactions.parsers.csv_parser import _BREAK, _join_broken_rows


class TestBrokenRows:
  def test_a_field_over_several_lines_is_one_row(self) -> None:
    lines = ["Datum;Text;Belopp\n", "2026-10-01;Betalning\n", "utland\n", "Mottagare: Shop;-5\n", "2026-10-02;ICA;-7\n"]
    rows = _join_broken_rows(lines, ";").splitlines()
    assert rows == ["Datum;Text;Belopp", f"2026-10-01;Betalning{_BREAK}utland{_BREAK}Mottagare: Shop;-5", "2026-10-02;ICA;-7"]

  def test_a_file_of_lines_that_never_complete_a_row_is_refused(self) -> None:
    # Joining them all made one upload take hours of the API's only worker.
    header = ";".join(f"c{i}" for i in range(50)) + "\n"
    with pytest.raises(ValidationError):
      _join_broken_rows([header] + ["x\n"] * 100_000, ";")
