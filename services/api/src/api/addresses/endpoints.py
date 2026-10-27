import structlog
from fastapi import APIRouter, Query

from api.addresses import google
from api.addresses.schemas import AddressParts, AddressSuggestion, AddressSuggestionsResponse
from api.exceptions import ResourceNotFound, ServiceUnavailableError
from api.logging import Logger
from api.settings import settings
from api.users.dependencies import CurrentDBUser

log: Logger = structlog.get_logger()

router = APIRouter(prefix="/addresses", tags=["addresses"])

Session = Query(
  min_length=8,
  max_length=100,
  description="One id per address being typed, sent with every suggestion request and the final Get Address; start a new one after a pick.",
)


@router.get("/suggestions", summary="Suggest Addresses", response_model=AddressSuggestionsResponse)
async def suggest_addresses(
  current_user: CurrentDBUser,
  text: str = Query(min_length=3, max_length=200, description="What has been typed so far."),
  session: str = Session,
) -> AddressSuggestionsResponse:
  """Street addresses matching what's typed, best first. Empty when address search isn't configured."""
  if not settings.GOOGLE_PLACES_API_KEY:
    return AddressSuggestionsResponse(suggestions=[])
  try:
    found = await google.suggest(text, session, settings.GOOGLE_PLACES_API_KEY)
  except google.AddressLookupError as e:
    # What was typed is someone's address: log only that it failed.
    log.warning("address_suggest_failed", reason=str(e))
    raise ServiceUnavailableError("Address search is unavailable right now.", status_code=502) from e
  return AddressSuggestionsResponse(suggestions=[AddressSuggestion(place_id=s.place_id, main_text=s.main_text, secondary_text=s.secondary_text) for s in found])


@router.get("/{place_id}", summary="Get Address", response_model=AddressParts)
async def get_address(current_user: CurrentDBUser, place_id: str, session: str = Session) -> AddressParts:
  """A suggested address in the parts an address book keeps, with its coordinates."""
  if not settings.GOOGLE_PLACES_API_KEY:
    raise ResourceNotFound("Address search isn't set up.")
  try:
    parts = await google.details(place_id, session, settings.GOOGLE_PLACES_API_KEY)
  except google.AddressLookupError as e:
    log.warning("address_details_failed", reason=str(e))
    raise ServiceUnavailableError("Address search is unavailable right now.", status_code=502) from e
  if parts is None or not parts.formatted:
    raise ResourceNotFound("That address wasn't found.")
  return AddressParts(
    formatted=parts.formatted,
    street_address=parts.street_address,
    postal_code=parts.postal_code,
    city=parts.city,
    region=parts.region,
    country=parts.country,
    country_code=parts.country_code,
    latitude=parts.latitude,
    longitude=parts.longitude,
  )
