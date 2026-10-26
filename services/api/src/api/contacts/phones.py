"""Phone numbers are saved compact ("0701234567", "+46701234567") and spaced only for display."""

import re

import phonenumbers

# Numbers without a country code are read as Swedish.
DEFAULT_REGION = "SE"
_TRUNK_ZERO = re.compile(r"\(0\)")
# Dial pause and wait characters and * / # codes are kept; spacing and punctuation aren't.
_NOT_DIALLED = re.compile(r"[^\d+*#,;]")


def compact_phone(number: str) -> str:
  """The number as it's dialled: "+46 (0)70-123 45 67" becomes "+46701234567". Text without digits is kept as written."""
  compact = _NOT_DIALLED.sub("", _TRUNK_ZERO.sub("", number))
  return compact if any(c.isdigit() for c in compact) else number.strip()


def display_phone(number: str) -> str:
  """Swedish numbers in the national style ("070-123 45 67"), others internationally ("+44 20 7946 0958").
  A number that can't be read is shown as saved."""
  try:
    parsed = phonenumbers.parse(compact_phone(number), DEFAULT_REGION)
  except phonenumbers.NumberParseException:
    return number
  if not phonenumbers.is_valid_number(parsed):
    return number
  style = (
    phonenumbers.PhoneNumberFormat.NATIONAL if phonenumbers.region_code_for_number(parsed) == DEFAULT_REGION else phonenumbers.PhoneNumberFormat.INTERNATIONAL
  )
  return phonenumbers.format_number(parsed, style)
