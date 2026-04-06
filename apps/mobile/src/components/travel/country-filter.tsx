import { useState } from "react";
import { View, Pressable, ScrollView } from "react-native";
import { Text } from "@/components/shared/text";
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
        style={{ marginBottom: 4 }}
      >
        {/* Main filter chip */}
        <Pressable
          onPress={() => setShowPicker(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            borderRadius: 9999,
            paddingHorizontal: 14,
            paddingVertical: 8,
            backgroundColor: hasFilter ? theme.colors.text : theme.colors.surfaceRaised,
          }}
        >
          <MapPin size={13} color={hasFilter ? theme.colors.monochrome : theme.colors.subtext} />
          <Text
            variant="body"
            color={hasFilter ? "monochrome" : "subtext"}
          >
            {label}
          </Text>
          <ChevronDown size={13} color={hasFilter ? theme.colors.monochrome : theme.colors.subtext} />
        </Pressable>

        {/* Clear filter chip */}
        {hasFilter && (
          <Pressable
            onPress={onClear}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.colors.surfaceRaised }}
          >
            <X size={13} color={theme.colors.subtext} />
            <Text variant="label" color="subtext">Clear</Text>
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
      <Text variant="title" color="text" style={{ marginBottom: 12 }}>Filter by Country</Text>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.colors.surfaceRaised, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16 }}>
        <Search size={16} color={theme.colors.subtext} />
        <Input
          placeholder="Search countries..."
          value={search}
          onChangeText={setSearch}
          autoFocus
          style={{ flex: 1 }}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <X size={16} color={theme.colors.subtext} />
          </Pressable>
        )}
      </View>

      {filtered.length === 0 ? (
        <Text variant="label" color="subtext" style={{ textAlign: "center", paddingVertical: 24 }}>No countries found</Text>
      ) : (
        filtered.map((country) => {
          const isSelected = selectedCountries.includes(country);
          return (
            <Pressable
              key={country}
              onPress={() => onToggle(country)}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, paddingHorizontal: 4, borderRadius: 12 }}
            >
              <Text variant={isSelected ? "body" : "label"} color={isSelected ? "text" : "subtext"}>
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
