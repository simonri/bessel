import pytest
from api.settings import Settings


class TestSettings:
  @pytest.mark.parametrize("algorithms", [["HS256"], ["RS256", "HS256"], ["none"], []])
  def test_only_rsa_token_algorithms_are_accepted(self, algorithms: list[str]) -> None:
    # An HMAC algorithm would let a token "signed" with Auth0's public key pass python-jose's check.
    with pytest.raises(ValueError, match="AUTH0_ALGORITHMS"):
      Settings(AUTH0_ALGORITHMS=algorithms)

  def test_rsa_algorithms_are_accepted(self) -> None:
    assert Settings(AUTH0_ALGORITHMS=["RS256"]).AUTH0_ALGORITHMS == ["RS256"]
