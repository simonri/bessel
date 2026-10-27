from pydantic import Field

from api.common.schemas import Schema


class AddressSuggestion(Schema):
  place_id: str = Field(description="Pass to Get Address for the address's parts.")
  main_text: str = Field(description="The street and number, e.g. 'Drottninggatan 5'.")
  secondary_text: str | None = Field(description="Where it is, e.g. 'Stockholm, Sverige'.")


class AddressSuggestionsResponse(Schema):
  suggestions: list[AddressSuggestion]


class AddressParts(Schema):
  """An address in the parts an address book keeps, with where it is when known."""

  formatted: str = Field(min_length=1, max_length=1000, description="The whole address on one line, as Google writes it.")
  street_address: str | None = Field(default=None, max_length=500)
  postal_code: str | None = Field(default=None, max_length=50)
  city: str | None = Field(default=None, max_length=200)
  region: str | None = Field(default=None, max_length=200)
  country: str | None = Field(default=None, max_length=200)
  country_code: str | None = Field(default=None, max_length=2)
  latitude: float | None = Field(default=None, ge=-90, le=90)
  longitude: float | None = Field(default=None, ge=-180, le=180)
