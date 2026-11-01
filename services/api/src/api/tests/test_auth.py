import time
from collections.abc import Iterator

import httpx
import pytest
from api.auth.dependencies import JWKS_CACHE_TTL, JWKSClient, decode_access_token
from api.exceptions import ServiceUnavailableError
from api.idempotency import identify_bearer
from api.settings import settings
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import jwk, jwt
from pytest_mock import MockerFixture

AUDIENCE = "https://api.bessel-test.example.com"


@pytest.fixture
def key(mocker: MockerFixture) -> Iterator[rsa.RSAPrivateKey]:
  mocker.patch.object(settings, "AUTH0_DOMAIN", "bessel-test.example.com")
  mocker.patch.object(settings, "AUTH0_AUDIENCE", AUDIENCE)
  JWKSClient.clear_cache()
  yield rsa.generate_private_key(public_exponent=65537, key_size=2048)
  JWKSClient.clear_cache()


def _jwks(key: rsa.RSAPrivateKey) -> dict:
  public_pem = key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
  return {"keys": [{**jwk.construct(public_pem, "RS256").to_dict(), "kid": "test-kid"}]}


def _token(key: rsa.RSAPrivateKey) -> str:
  now = int(time.time())
  claims = {"iss": f"https://{settings.AUTH0_DOMAIN}/", "sub": "auth0|someone", "aud": AUDIENCE, "iat": now, "exp": now + 3600}
  pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
  return jwt.encode(claims, pem, algorithm="RS256", headers={"kid": "test-kid"})


def _auth0_down(mocker: MockerFixture) -> None:
  mocker.patch.object(httpx.AsyncClient, "get", mocker.AsyncMock(side_effect=httpx.ConnectTimeout("Auth0 is down")))


class TestAuth0Unreachable:
  @pytest.mark.asyncio
  async def test_tokens_are_checked_against_the_cached_keys_once_they_are_stale(self, key: rsa.RSAPrivateKey, mocker: MockerFixture) -> None:
    JWKSClient._jwks = _jwks(key)
    JWKSClient._cache_timestamp = time.monotonic() - JWKS_CACHE_TTL - 1
    _auth0_down(mocker)

    claims = await decode_access_token(_token(key), audience=AUDIENCE)

    assert claims["sub"] == "auth0|someone"
    assert await identify_bearer({"type": "http", "headers": [(b"authorization", f"Bearer {_token(key)}".encode())]}) == "auth0|someone"

  @pytest.mark.asyncio
  async def test_without_any_keys_it_is_a_503(self, key: rsa.RSAPrivateKey, mocker: MockerFixture) -> None:
    _auth0_down(mocker)

    with pytest.raises(ServiceUnavailableError) as raised:
      await decode_access_token(_token(key), audience=AUDIENCE)

    assert raised.value.status_code == 503
    assert await identify_bearer({"type": "http", "headers": [(b"authorization", f"Bearer {_token(key)}".encode())]}) is None
