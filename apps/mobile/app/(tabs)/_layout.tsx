import { useState, useEffect, useRef } from "react";
import { View, Pressable, Text, Animated } from "react-native";
import { Tabs, router } from "expo-router";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

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

function FloatingTabBar({
  state,
  navigation,
}: {
  state: any;
  descriptors: any;
  navigation: any;
}) {
  const insets = useSafeAreaInsets();
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

  const bottomPadding = Math.max((insets.bottom - 20) * 2, 4);

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
            backgroundColor: "rgba(0,0,0,0.5)",
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
            bottom: bottomPadding + 76,
            right: 24,
            opacity: expandAnim,
            transform: [{ translateY: menuTranslateY }, { scale: menuScale }],
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.4,
            shadowRadius: 16,
            elevation: 12,
          }}
          className="bg-zinc-800 rounded-2xl py-2 px-1 min-w-[200px]"
        >
          {MORE_ITEMS.map((item) => (
            <Pressable
              key={item.title}
              onPress={() => handleMenuItemPress(item.href)}
              className="flex-row items-center gap-3 px-4 py-3 rounded-xl active:bg-zinc-700"
            >
              <item.icon size={20} color="#a1a1aa" />
              <Text className="text-[15px] font-medium text-foreground">
                {item.title}
              </Text>
            </Pressable>
          ))}
        </Animated.View>
      )}

      {/* Gradient fade behind tab bar */}
      <View
        pointerEvents="none"
        className="absolute bottom-0 left-0 right-0"
        style={{ height: bottomPadding + 90 }}
      >
        <LinearGradient
          colors={["transparent", "rgba(9,9,11,0.8)", "#09090b"]}
          locations={[0, 0.5, 1]}
          style={{ flex: 1 }}
        />
      </View>

      {/* Tab bar */}
      <View
        style={{ paddingBottom: bottomPadding }}
        className="absolute bottom-0 left-0 right-0 items-center"
      >
        <View
          className="flex-row items-center bg-zinc-800 rounded-full px-1.5 py-1.5 gap-0.5"
          style={{
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
                style={{ width: Math.round(47 * 1.5), height: 47 }}
                className={`items-center justify-center rounded-full ${
                  isFocused || (isMore && menuOpen) ? "bg-zinc-700" : ""
                }`}
              >
                <Icon
                  size={21}
                  color={isFocused || (isMore && menuOpen) ? "#fafafa" : "#71717a"}
                />
              </Pressable>
            );
          })}
        </View>
      </View>
    </>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Dashboard" }} />
      <Tabs.Screen name="travel" options={{ title: "Travel" }} />
      <Tabs.Screen name="tasks" options={{ title: "Tasks" }} />
      <Tabs.Screen name="more" options={{ title: "More" }} />
      {/* Hidden from tab bar, navigable from More menu */}
      <Tabs.Screen name="transactions" options={{ href: null }} />
      <Tabs.Screen name="accounts" options={{ href: null }} />
      <Tabs.Screen name="investments" options={{ href: null }} />
      <Tabs.Screen name="journal" options={{ href: null }} />
      <Tabs.Screen name="workout" options={{ href: null }} />
      <Tabs.Screen name="reports" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}
