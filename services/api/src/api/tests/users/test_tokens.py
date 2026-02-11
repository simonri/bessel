import uuid

from api.users.tokens import generate_unsubscribe_token, verify_unsubscribe_token


class TestUnsubscribeTokens:
  def test_generate_and_verify_token(self):
    """Token can be generated and verified"""
    user_id = uuid.uuid4()

    token = generate_unsubscribe_token(user_id)
    verified_id = verify_unsubscribe_token(token)

    assert verified_id == user_id

  def test_token_is_url_safe(self):
    """Token only contains URL-safe characters"""
    user_id = uuid.uuid4()
    token = generate_unsubscribe_token(user_id)

    # URL-safe base64 uses only alphanumeric, dash, and underscore
    assert all(c.isalnum() or c in "-_" for c in token)

  def test_token_is_short(self):
    """Token is reasonably short for URLs"""
    user_id = uuid.uuid4()
    token = generate_unsubscribe_token(user_id)

    # 24 bytes = 32 chars base64 (without padding)
    assert len(token) == 32

  def test_invalid_token_returns_none(self):
    """Invalid token returns None"""
    assert verify_unsubscribe_token("invalid") is None
    assert verify_unsubscribe_token("") is None
    assert verify_unsubscribe_token("x" * 32) is None

  def test_tampered_token_returns_none(self):
    """Tampered token fails verification"""
    user_id = uuid.uuid4()
    token = generate_unsubscribe_token(user_id)

    # Change one character
    tampered = token[:-1] + ("A" if token[-1] != "A" else "B")
    assert verify_unsubscribe_token(tampered) is None

  def test_different_users_get_different_tokens(self):
    """Different users get different tokens"""
    user1 = uuid.uuid4()
    user2 = uuid.uuid4()

    token1 = generate_unsubscribe_token(user1)
    token2 = generate_unsubscribe_token(user2)

    assert token1 != token2
