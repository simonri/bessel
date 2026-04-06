from datetime import date

from pydantic import Field

from api.common.schemas import Schema

WMO_WEATHER_LABELS: dict[int, str] = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snowfall",
    73: "Moderate snowfall",
    75: "Heavy snowfall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}


def weather_label_from_code(code: int) -> str:
    return WMO_WEATHER_LABELS.get(code, "Unknown")


class WeatherResponse(Schema):
    date: date = Field(description="Date of the weather data.")
    temperature_max: float = Field(description="Maximum temperature in Celsius.")
    temperature_min: float = Field(description="Minimum temperature in Celsius.")
    weather_code: int = Field(description="WMO weather interpretation code.")
    weather_label: str = Field(description="Human-readable weather condition.")
