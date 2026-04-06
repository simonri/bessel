import { useEffect, useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/shared/text";
import { useQuery } from "@tanstack/react-query";
import { getWeatherForecastV1WeatherGetOptions } from "@metron/client";
import type { WeatherDaySchema } from "@metron/client";
import {
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudFog,
  CloudDrizzle,
  Droplets,
  MapPin,
  type LucideIcon,
} from "lucide-react-native";
import * as Location from "expo-location";
import { client } from "@/lib/client";
import { useTheme } from "@/design-system";

function getWeatherIcon(code: number): { icon: LucideIcon; color: string } {
  if (code === 0) return { icon: Sun, color: "#F2C94C" };
  if (code <= 3) return { icon: Cloud, color: "#94a3b8" };
  if (code <= 48) return { icon: CloudFog, color: "#94a3b8" };
  if (code <= 57) return { icon: CloudDrizzle, color: "#4EA7FC" };
  if (code <= 67) return { icon: CloudRain, color: "#4161DA" };
  if (code <= 77) return { icon: CloudSnow, color: "#E0E0E0" };
  if (code <= 82) return { icon: CloudRain, color: "#4161DA" };
  if (code <= 86) return { icon: CloudSnow, color: "#E0E0E0" };
  return { icon: CloudLightning, color: "#845AB9" };
}

function formatDayLabel(date: Date, index: number): string {
  if (index === 0) return "Today";
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

function ForecastRow({ day, index }: { day: WeatherDaySchema; index: number }) {
  const theme = useTheme();
  const { icon: Icon, color: iconColor } = getWeatherIcon(day.weather_code);
  const hasPrecip = day.precipitation_probability_max > 0;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12 }}>
      <Text variant="body" color="text" style={{ width: 48 }}>
        {formatDayLabel(day.date, index)}
      </Text>
      <View style={{ width: 40, alignItems: "center" }}>
        <Icon size={20} color={iconColor} />
      </View>
      <View style={{ width: 48, flexDirection: "row", alignItems: "center" }}>
        {hasPrecip ? (
          <>
            <Droplets size={12} color={theme.colors.accent} />
            <Text variant="caption" color="statusBlue" style={{ marginLeft: 2 }}>
              {day.precipitation_probability_max}%
            </Text>
          </>
        ) : null}
      </View>
      <View style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text variant="body" color="text" style={{ width: 40, textAlign: "right" }}>
          {Math.round(day.temperature_max)}°
        </Text>
        <Text variant="label" color="subtext" style={{ width: 40, textAlign: "right" }}>
          {Math.round(day.apparent_temperature_max)}°
        </Text>
      </View>
    </View>
  );
}

export function WeatherWidget() {
  const theme = useTheme();
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [locationLoading, setLocationLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationDenied(true);
        setLocationLoading(false);
        return;
      }
      const location = await Location.getLastKnownPositionAsync();
      const pos = location ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });

      const [place] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      if (place) {
        setLocationName(place.city || place.subregion || place.region || null);
      }
      setLocationLoading(false);
    })();
  }, []);

  const { data: forecast, isLoading: weatherLoading } = useQuery({
    ...getWeatherForecastV1WeatherGetOptions({
      client,
      query: { lat: coords?.lat ?? 0, lon: coords?.lon ?? 0 },
    }),
    enabled: !!coords,
  });

  if (locationDenied) return null;

  if (locationLoading || weatherLoading || !forecast) {
    return (
      <View style={{ borderRadius: 16, backgroundColor: theme.colors.card, padding: 16 }}>
        <View style={{ gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ height: 16, width: 40, borderRadius: 4, backgroundColor: theme.colors.surfaceRaised }} />
              <View style={{ height: 20, width: 20, borderRadius: 9999, backgroundColor: theme.colors.surfaceRaised }} />
              <View style={{ marginLeft: "auto", height: 16, width: 64, borderRadius: 4, backgroundColor: theme.colors.surfaceRaised }} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  const today = forecast.days[0];
  const { icon: TodayIcon, color: todayIconColor } = getWeatherIcon(today.weather_code);

  return (
    <View style={{ borderRadius: 16, backgroundColor: theme.colors.card, padding: 16 }}>
      {/* Today hero */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingBottom: 12 }}>
        <TodayIcon size={40} color={todayIconColor} />
        <View style={{ marginLeft: 12 }}>
          <Text variant="heading" color="text">
            {Math.round(today.temperature_max)}°
          </Text>
          <Text variant="label" color="subtext">{today.weather_label}</Text>
        </View>
        {locationName && (
          <View style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 4 }}>
            <MapPin size={12} color={theme.colors.textSubtle} />
            <Text variant="label" color="subtext">{locationName}</Text>
          </View>
        )}
      </View>

      {/* Column headers */}
      <View style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderColor: theme.colors.surfaceRaised, paddingBottom: 8 }}>
        <Text variant="caption" color="subtext" style={{ width: 48 }}>Day</Text>
        <View style={{ width: 40 }} />
        <View style={{ width: 48 }} />
        <View style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text variant="caption" color="subtext" style={{ width: 40, textAlign: "right" }}>High</Text>
          <Text variant="caption" color="subtext" style={{ width: 40, textAlign: "right" }}>Feel</Text>
        </View>
      </View>

      {/* Forecast rows */}
      {forecast.days.slice(0, 4).map((day, i) => (
        <ForecastRow key={day.date} day={day} index={i} />
      ))}
    </View>
  );
}
