import { createTheme } from "@shopify/restyle";

const palette = {
  // Base
  white: "#fafafa",
  black: "#09090b",

  // Zinc scale
  zinc50: "#fafafa",
  zinc100: "#f4f4f5",
  zinc200: "#e4e4e7",
  zinc300: "#d4d4d8",
  zinc400: "#a1a1aa",
  zinc500: "#71717a",
  zinc600: "#52525b",
  zinc700: "#3f3f46",
  zinc800: "#27272a",
  zinc900: "#18181b",
  zinc950: "#09090b",

  // Semantic
  green500: "#22c55e",
  green600: "#16a34a",
  red500: "#ef4444",
  amber500: "#eab308",
  blue500: "#3b82f6",
  orange500: "#f97316",
  purple500: "#a855f7",
  cyan500: "#06b6d4",
  indigo500: "#6366f1",
  pink500: "#ec4899",

  transparent: "transparent",
};

const theme = createTheme({
  colors: {
    // Core
    background: palette.black,
    foreground: palette.white,
    card: "#0a0a0a",
    cardForeground: palette.white,

    // Interactive
    primary: palette.white,
    primaryForeground: palette.zinc900,
    secondary: palette.zinc800,
    secondaryForeground: palette.white,

    // Muted
    muted: palette.zinc800,
    mutedForeground: palette.zinc400,

    // Accent
    accent: palette.zinc800,
    accentForeground: palette.white,

    // Destructive
    destructive: palette.red500,

    // Border / Ring
    border: palette.zinc800,
    ring: palette.zinc300,

    // Surfaces
    surface: "#171717",
    surfaceRaised: palette.zinc800,
    surfaceOverlay: "rgba(0,0,0,0.6)",

    // Status
    success: palette.green500,
    warning: palette.amber500,
    error: palette.red500,
    info: palette.blue500,

    // Palette access
    ...palette,

    transparent: palette.transparent,
  },

  spacing: {
    "0": 0,
    "1": 4,
    "1.5": 6,
    "2": 8,
    "2.5": 10,
    "3": 12,
    "3.5": 14,
    "4": 16,
    "5": 20,
    "6": 24,
    "8": 32,
    "10": 40,
    "12": 48,
    "16": 64,
    "20": 80,
  },

  borderRadii: {
    none: 0,
    sm: 6,
    md: 8,
    lg: 12,
    xl: 16,
    "2xl": 20,
    "3xl": 24,
    full: 9999,
  },

  textVariants: {
    defaults: {
      color: "foreground",
      fontSize: 14,
    },
    h1: {
      color: "foreground",
      fontSize: 30,
      fontWeight: "700",
      lineHeight: 36,
    },
    h2: {
      color: "foreground",
      fontSize: 24,
      fontWeight: "700",
      lineHeight: 32,
    },
    h3: {
      color: "foreground",
      fontSize: 20,
      fontWeight: "600",
      lineHeight: 28,
    },
    body: {
      color: "foreground",
      fontSize: 14,
      lineHeight: 20,
    },
    bodyLarge: {
      color: "foreground",
      fontSize: 16,
      lineHeight: 24,
    },
    label: {
      color: "foreground",
      fontSize: 14,
      fontWeight: "500",
      lineHeight: 20,
    },
    caption: {
      color: "mutedForeground",
      fontSize: 12,
      lineHeight: 16,
    },
    small: {
      color: "mutedForeground",
      fontSize: 11,
      lineHeight: 14,
    },
    sectionHeader: {
      color: "mutedForeground",
      fontSize: 11,
      fontWeight: "500",
      lineHeight: 14,
      textTransform: "uppercase" as const,
      letterSpacing: 0.5,
    },
  },
});

export type Theme = typeof theme;
export default theme;
