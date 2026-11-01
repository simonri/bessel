import time
from typing import Any

import pytest
from api.auth.dependencies import JWKSClient, verify_token
from api.settings import settings
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwk, jwt
from pytest_mock import MockerFixture

WEB_APP = "web-app-client-id"


@pytest.fixture
def signing_key(mocker: MockerFixture) -> rsa.RSAPrivateKey:
  key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
  public_pem = key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
  jwks = {"keys": [{**jwk.construct(public_pem, "RS256").to_dict(), "kid": "test-kid"}]}
  mocker.patch.object(JWKSClient, "get_jwks", mocker.AsyncMock(return_value=jwks))
  mocker.patch.object(settings, "AUTH0_DOMAIN", "bessel-test.example.com")
  mocker.patch.object(settings, "AUTH0_AUDIENCE", "https://api.bessel.test")
  return key


async def _verify(key: rsa.RSAPrivateKey, **overrides: Any) -> str:
  now = int(time.time())
  claims = {
    "iss": f"https://{settings.AUTH0_DOMAIN}/",
    "sub": "auth0|someone",
    "aud": settings.AUTH0_AUDIENCE,
    "azp": WEB_APP,
    "iat": now,
    "exp": now + 3600,
  } | overrides
  pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
  token = jwt.encode(claims, pem, algorithm="RS256", headers={"kid": "test-kid"})
  return (await verify_token(HTTPAuthorizationCredentials(scheme="Bearer", credentials=token))).sub


class TestWebApiTokens:
  @pytest.mark.asyncio
  async def test_only_our_own_apps_tokens_are_accepted(self, signing_key: rsa.RSAPrivateKey, mocker: MockerFixture) -> None:
    # Anyone can register an app in the tenant (for MCP); its token for the web API's audience must not pass.
    mocker.patch.object(settings, "AUTH0_CLIENT_IDS", [WEB_APP, "ios-app-client-id"])

    assert await _verify(signing_key) == "auth0|someone"
    assert await _verify(signing_key, azp="ios-app-client-id") == "auth0|someone"
    for other in ({"azp": "registered-by-an-attacker"}, {"azp": None}):
      with pytest.raises(HTTPException) as refused:
        await _verify(signing_key, **other)
      assert refused.value.status_code == 401

  @pytest.mark.asyncio
  async def test_without_a_list_any_app_is_accepted(self, signing_key: rsa.RSAPrivateKey, mocker: MockerFixture) -> None:
    mocker.patch.object(settings, "AUTH0_CLIENT_IDS", [])
    assert await _verify(signing_key, azp="anything") == "auth0|someone"
