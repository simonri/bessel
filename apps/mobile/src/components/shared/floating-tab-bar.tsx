import { useState, useEffect, useRef } from "react";
import { View, Pressable, Animated } from "react-native";
import { Text } from "@/components/shared/text";
import { router } from "expo-router";
import {
  LayoutDashboard,
  MapPin,
  CheckSquare,
  Menu,
  X,
  ArrowLeftRight,
  Landmark,
  TrendingUp,
  BookOpen,
  Dumbbell,
  PieChart,
  Settings,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useBottomSpacing } from "@/lib/safe-area";
import { useTheme } from "@/design-system";

const VISIBLE_TABS = ["index", "travel", "tasks", "more"] as const;
const TAB_ICONS: Record<string, typeof LayoutDashboard> = {
  index: LayoutDashboard,
  travel: MapPin,
  tasks: CheckSquare,
  more: Menu,
};

const MORE_ITEMS = [
  { title: "Transactions", icon: ArrowLeftRight, href: "/(tabs)/transactions" },
  { title: "Accounts", icon: Landmark, href: "/(tabs)/accounts" },
  { title: "Investments", icon: TrendingUp, href: "/(tabs)/investments" },
  { title: "Journal", icon: BookOpen, href: "/(tabs)/journal" },
  { title: "Workout", icon: Dumbbell, href: "/(tabs)/workout" },
  { title: "Reports", icon: PieChart, href: "/(tabs)/reports" },
  { title: "Settings", icon: Settings, href: "/(tabs)/settings" },
] as const;

export function FloatingTabBar({
  state,
  navigation,
}: {
  state: any;
  descriptors: any;
  navigation: any;
}) {
  const bottomSpacing = useBottomSpacing();
  const theme = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const expandAnim = useRef(new Animated.Value(0)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(expandAnim, {
        toValue: menuOpen ? 1 : 0,
        damping: 20,
        stiffness: 300,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: menuOpen ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [menuOpen]);

  const handleMorePress = () => {
    setMenuOpen((prev) => !prev);
  };

  const handleMenuItemPress = (href: string) => {
    setMenuOpen(false);
    router.push(href as any);
  };

  const menuTranslateY = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [20, 0],
  });

  const menuScale = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1],
  });

  return (
    <>
      {/* Backdrop */}
      {menuOpen && (
        <Animated.View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: theme.colors.overlay,
            opacity: backdropAnim,
          }}
        >
          <Pressable
            style={{ flex: 1 }}
            onPress={() => setMenuOpen(false)}
          />
        </Animated.View>
      )}

      {/* Expanded menu */}
      {menuOpen && (
        <Animated.View
          style={{
            position: "absolute",
            bottom: bottomSpacing + 76,
            right: 24,
            opacity: expandAnim,
            transform: [{ translateY: menuTranslateY }, { scale: menuScale }],
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.4,
            shadowRadius: 16,
            elevation: 12,
            backgroundColor: theme.colors.surfaceRaised,
            borderRadius: 16,
            paddingVertical: 8,
            paddingHorizontal: 4,
            minWidth: 200,
          }}
        >
          {MORE_ITEMS.map((item) => (
            <Pressable
              key={item.title}
              onPress={() => handleMenuItemPress(item.href)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: pressed ? theme.colors.surfaceHover : "transparent",
              })}
            >
              <item.icon size={20} color={theme.colors.subtext} />
              <Text variant="body" color="text">
                {item.title}
              </Text>
            </Pressable>
          ))}
        </Animated.View>
      )}

      {/* Gradient fade behind tab bar */}
      <View
        pointerEvents="none"
        style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: bottomSpacing + 90 }}
      >
        <LinearGradient
          colors={["transparent", `${theme.colors.background}cc`, theme.colors.background]}
          locations={[0, 0.5, 1]}
          style={{ flex: 1 }}
        />
      </View>

      {/* Tab bar */}
      <View
        style={{ paddingBottom: bottomSpacing, position: "absolute", bottom: 0, left: 0, right: 0, alignItems: "center" }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: theme.colors.surfaceRaised,
            borderRadius: 9999,
            paddingHorizontal: 6,
            paddingVertical: 6,
            gap: 2,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 12,
            elevation: 8,
          }}
        >
          {state.routes.map((route: any, routeIndex: number) => {
            if (!VISIBLE_TABS.includes(route.name)) return null;
            const isMore = route.name === "more";
            const isFocused = !isMore && state.index === routeIndex;
            const Icon = isMore && menuOpen ? X : TAB_ICONS[route.name];

            const onPress = () => {
              if (isMore) {
                handleMorePress();
                return;
              }
              setMenuOpen(false);
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                style={{
                  width: Math.round(47 * 1.5),
                  height: 47,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 9999,
                  backgroundColor: isFocused || (isMore && menuOpen) ? theme.colors.surfaceHover : "transparent",
                }}
              >
                <Icon
                  size={21}
                  color={isFocused || (isMore && menuOpen) ? theme.colors.text : theme.colors.subtext}
                />
              </Pressable>
            );
          })}
        </View>
      </View>
    </>
  );
}
