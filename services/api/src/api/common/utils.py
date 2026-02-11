import uuid
from datetime import UTC, datetime


def utc_now() -> datetime:
  return datetime.now(UTC)


def make_timezone_naive(dt: datetime) -> datetime:
  """Convert timezone-aware datetime to timezone-naive UTC datetime."""
  if dt.tzinfo is not None:
    # Convert to UTC and remove timezone info
    return dt.astimezone().replace(tzinfo=None)
  return dt


def unix_to_db_time(unix_timestamp: int) -> datetime:
  dt_utc = datetime.fromtimestamp(unix_timestamp, tz=UTC)
  return dt_utc.replace(tzinfo=None)


def generate_uuid() -> uuid.UUID:
  return uuid.uuid4()
