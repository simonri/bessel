import datetime

from pydantic import Field

from api.common.schemas import Schema

ATTRIBUTION = "Weather data from MET Norway (yr.no), CC BY 4.0. Place lookup © OpenStreetMap contributors."


class WeatherNow(Schema):
  time: datetime.datetime = Field(description="Local time of the reading.")
  temperature: float = Field(description="°C.")
  feels_like: float | None = Field(description="°C.")
  condition: str | None = Field(description="E.g. 'Partly cloudy' or 'Light rain showers'.")
  precipitation_next_hour: float | None = Field(description="mm.")
  wind_speed: float = Field(description="m/s.")
  wind_gust: float | None = Field(description="m/s.")
  wind_from_direction: float = Field(description="Degrees, 0 = from the north.")
  humidity: float = Field(description="%.")


class WeatherHour(Schema):
  time: datetime.datetime = Field(description="Local start of the hour.")
  temperature: float = Field(description="°C.")
  condition: str | None
  precipitation: float | None = Field(description="mm during the hour.")
  precipitation_probability: float | None = Field(description="%.")
  wind_speed: float = Field(description="m/s.")


class WeatherDay(Schema):
  date: datetime.date = Field(description="Local day.")
  temperature_min: float = Field(description="°C.")
  temperature_max: float = Field(description="°C.")
  condition: str | None = Field(description="How the day looks around midday.")
  precipitation: float = Field(description="mm over the day.")
  precipitation_probability_max: float | None = Field(description="%.")
  thunder_probability_max: float | None = Field(description="%; only known for the first days.")
  wind_speed_max: float = Field(description="m/s.")
  wind_gust_max: float | None = Field(description="m/s.")


class WeatherForecast(Schema):
  location: str | None = Field(description="The place the forecast is for, as found from the name given.")
  latitude: float
  longitude: float
  timezone: str
  updated_at: datetime.datetime = Field(description="When Yr last updated this forecast.")
  now: WeatherNow
  hours: list[WeatherHour] = Field(description="The next hours, one by one.")
  days: list[WeatherDay] = Field(description="Day by day, starting today.")
  attribution: str = Field(default=ATTRIBUTION)
