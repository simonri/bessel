import { useEffect, useState } from "react";
import { View, Text } from "react-native";
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

function getWeatherIcon(code: number): { icon: LucideIcon; color: string } {
  if (code === 0) return { icon: Sun, color: "#facc15" };
  if (code <= 3) return { icon: Cloud, color: "#94a3b8" };
  if (code <= 48) return { icon: CloudFog, color: "#94a3b8" };
  if (code <= 57) return { icon: CloudDrizzle, color: "#60a5fa" };
  if (code <= 67) return { icon: CloudRain, color: "#3b82f6" };
  if (code <= 77) return { icon: CloudSnow, color: "#e2e8f0" };
  if (code <= 82) return { icon: CloudRain, color: "#3b82f6" };
  if (code <= 86) return { icon: CloudSnow, color: "#e2e8f0" };
  return { icon: CloudLightning, color: "#a78bfa" };
}

function formatDayLabel(date: Date, index: number): string {
  if (index === 0) return "Today";
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

function ForecastRow({ day, index }: { day: WeatherDaySchema; index: number }) {
  const { icon: Icon, color: iconColor } = getWeatherIcon(day.weather_code);
  const hasPrecip = day.precipitation_probability_max > 0;

  return (
    <View className="flex-row items-center py-3">
      <Text className="w-12 text-sm font-medium text-foreground">
        {formatDayLabel(day.date, index)}
      </Text>
      <View className="w-10 items-center">
        <Icon size={20} color={iconColor} />
      </View>
      <View className="w-12 flex-row items-center">
        {hasPrecip ? (
          <>
            <Droplets size={12} color="#60a5fa" />
            <Text className="ml-0.5 text-xs text-blue-400">
              {day.precipitation_probability_max}%
            </Text>
          </>
        ) : null}
      </View>
      <View className="ml-auto flex-row items-center gap-3">
        <Text className="w-10 text-right text-sm font-semibold text-foreground">
          {Math.round(day.temperature_max)}°
        </Text>
        <Text className="w-10 text-right text-sm text-muted-foreground">
          {Math.round(day.apparent_temperature_max)}°
        </Text>
      </View>
    </View>
  );
}

export function WeatherWidget() {
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
      <View className="rounded-2xl bg-card p-4">
        <View className="gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} className="flex-row items-center gap-3">
              <View className="h-4 w-10 rounded bg-muted" />
              <View className="h-5 w-5 rounded-full bg-muted" />
              <View className="ml-auto h-4 w-16 rounded bg-muted" />
            </View>
          ))}
        </View>
      </View>
    );
  }

  const today = forecast.days[0];
  const { icon: TodayIcon, color: todayIconColor } = getWeatherIcon(today.weather_code);

  return (
    <View className="rounded-2xl bg-card p-4">
      {/* Today hero */}
      <View className="flex-row items-center pb-3">
        <TodayIcon size={40} color={todayIconColor} />
        <View className="ml-3">
          <Text className="text-3xl font-bold text-foreground">
            {Math.round(today.temperature_max)}°
          </Text>
          <Text className="text-sm text-muted-foreground">{today.weather_label}</Text>
        </View>
        {locationName && (
          <View className="ml-auto flex-row items-center gap-1">
            <MapPin size={12} color="#71717a" />
            <Text className="text-sm text-muted-foreground">{locationName}</Text>
          </View>
        )}
      </View>

      {/* Column headers */}
      <View className="flex-row items-center border-b border-border pb-2">
        <Text className="w-12 text-xs text-muted-foreground">Day</Text>
        <View className="w-10" />
        <View className="w-12" />
        <View className="ml-auto flex-row items-center gap-3">
          <Text className="w-10 text-right text-xs text-muted-foreground">High</Text>
          <Text className="w-10 text-right text-xs text-muted-foreground">Feel</Text>
        </View>
      </View>

      {/* Forecast rows */}
      {forecast.days.map((day, i) => (
        <ForecastRow key={day.date} day={day} index={i} />
      ))}
    </View>
  );
}
