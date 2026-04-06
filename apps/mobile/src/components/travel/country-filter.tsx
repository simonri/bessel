import { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { MapPin, ChevronDown, Check, Search, X } from "lucide-react-native";
import { BottomSheet } from "@/components/shared/sheet";
import { Input } from "@/components/shared/input";
import { useTheme } from "@/design-system";

export function CountryFilterBar({
  countries,
  selectedCountries,
  onToggle,
  onClear,
}: {
  countries: string[];
  selectedCountries: string[];
  onToggle: (country: string) => void;
  onClear: () => void;
}) {
  const theme = useTheme();
  const [showPicker, setShowPicker] = useState(false);
  const hasFilter = selectedCountries.length > 0;

  const label = hasFilter
    ? selectedCountries.length === 1
      ? selectedCountries[0]
      : `${selectedCountries.length} countries`
    : "All countries";

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        className="mb-1"
      >
        {/* Main filter chip */}
        <Pressable
          onPress={() => setShowPicker(true)}
          className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-2 ${
            hasFilter ? "bg-foreground" : "bg-zinc-800"
          }`}
        >
          <MapPin size={13} color={hasFilter ? theme.colors.monochrome : theme.colors.subtext} />
          <Text
            className={`text-sm font-medium ${
              hasFilter ? "text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {label}
          </Text>
          <ChevronDown size={13} color={hasFilter ? theme.colors.monochrome : theme.colors.subtext} />
        </Pressable>

        {/* Clear filter chip */}
        {hasFilter && (
          <Pressable
            onPress={onClear}
            className="flex-row items-center gap-1 rounded-full px-3 py-2 bg-zinc-800"
          >
            <X size={13} color={theme.colors.subtext} />
            <Text className="text-sm text-muted-foreground">Clear</Text>
          </Pressable>
        )}
      </ScrollView>

      {showPicker && (
        <CountryPickerSheet
          countries={countries}
          selectedCountries={selectedCountries}
          onToggle={onToggle}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
}

function CountryPickerSheet({
  countries,
  selectedCountries,
  onToggle,
  onClose,
}: {
  countries: string[];
  selectedCountries: string[];
  onToggle: (country: string) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [search, setSearch] = useState("");
  const q = search.toLowerCase().trim();
  const filtered = q
    ? countries.filter((c) => c.toLowerCase().includes(q))
    : countries;

  return (
    <BottomSheet onDismiss={onClose}>
      <Text className="text-foreground text-lg font-bold mb-3">Filter by Country</Text>

      <View className="flex-row items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2.5 mb-4">
        <Search size={16} color={theme.colors.subtext} />
        <Input
          placeholder="Search countries..."
          value={search}
          onChangeText={setSearch}
          autoFocus
          className="flex-1"
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <X size={16} color={theme.colors.subtext} />
          </Pressable>
        )}
      </View>

      {filtered.length === 0 ? (
        <Text className="text-muted-foreground text-sm text-center py-6">No countries found</Text>
      ) : (
        filtered.map((country) => {
          const isSelected = selectedCountries.includes(country);
          return (
            <Pressable
              key={country}
              onPress={() => onToggle(country)}
              className="flex-row items-center justify-between py-3 px-1 active:bg-zinc-800/60 rounded-xl"
            >
              <Text className={`text-[15px] ${isSelected ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                {country}
              </Text>
              {isSelected && <Check size={18} color={theme.colors.statusGreen} />}
            </Pressable>
          );
        })
      )}
    </BottomSheet>
  );
}
