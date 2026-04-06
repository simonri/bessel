import { buttonVariants } from "@/design-system/button-variants";
import { textVariants } from "@/design-system/text-variants";
import { createTheme } from "@shopify/restyle";

// ---------------------------------------------------------------------------
// Palette — Linear dark theme neutrals + semantic colors
// ---------------------------------------------------------------------------

export const palette = {
  // Neutrals (dark end)
  gray950: "#0A0A0A",
  gray900: "#0D0D0D",
  gray850: "#171717",
  gray800: "#212121",
  gray750: "#292929",
  gray700: "#2E2E2E",
  gray600: "#303030",

  // Mid grays
  gray575: "#5D5D5D",
  gray500: "#848484",
  gray450: "#989898",
  gray400: "#9E9E9E",

  // Light grays
  gray350: "#E0E0E0",
  gray300: "#E4E4E4",
  gray200: "#F0F0F0",
  gray100: "#F5F5F5",
  gray50: "#FAFAFA",
  white: "#FFFFFF",

  black: "#000000",

  // Brand / accent
  indigo: "#5E6AD2",
  blue: "#4161DA",
  lightBlue: "#4EA7FC",
  purple: "#845AB9",
  violet: "#7482FF",

  // Semantic
  green: "#4CB782",
  teal: "#3C6E6C",
  red: "#EB5757",
  orange: "#F2994A",
  yellow: "#F2C94C",

  // Status / priority
  statusPurple: "#845AB9",
  statusBlue: "#5987C7",
  statusOrange: "#E19B48",
  statusRed: "#ED7669",
  statusYellow: "#D7C45C",
  statusSalmon: "#E78D71",
  statusTeal: "#3C6E6C",
  statusPink: "#E57BB3",
} as const

// ---------------------------------------------------------------------------
// Semantic color tokens (dark mode)
// ---------------------------------------------------------------------------

export const colors = {
  // Core
  background: palette.gray900,
  text: palette.white,
  subtext: palette.gray575,
  primary: palette.lightBlue,
  secondary: palette.gray700,
  border: palette.gray600,
  borderSubtle: palette.gray800,
  card: palette.gray850,
  monochrome: palette.black,
  monochromeInverted: palette.white,

  // Surfaces
  surface: palette.gray900,
  surfaceRaised: palette.gray800,
  surfaceElevated: palette.gray750,
  surfaceHover: palette.gray700,

  // Text levels
  textPrimary: palette.white,
  textSecondary: palette.gray200,
  textTertiary: palette.gray350,
  textMuted: palette.gray575,
  textFaint: palette.gray400,
  textSubtle: palette.gray500,

  // Overlays
  overlay: "rgba(0,0,0,0.50)",
  overlay25: "rgba(0,0,0,0.25)",
  overlay12: "rgba(0,0,0,0.10)",
  overlay08: "rgba(0,0,0,0.06)",
  disabled: "rgba(255,255,255,0.06)",

  // Input
  inputBackground: palette.gray800,
  inputPlaceholder: palette.gray575,

  // Accent
  accent: palette.lightBlue,
  accentSecondary: palette.green,
  link: palette.violet,

  // Semantic
  error: palette.red,
  errorSubtle: "rgba(235,87,87,0.15)",
  warning: palette.orange,
  success: palette.green,
  successSubtle: "rgba(76,183,130,0.15)",
  info: palette.lightBlue,

  // Status pills
  statusGreen: palette.green,
  statusGreenBg: "rgba(76,183,130,0.15)",
  statusYellow: palette.yellow,
  statusYellowBg: "rgba(242,201,76,0.15)",
  statusRed: palette.red,
  statusRedBg: "rgba(235,87,87,0.15)",
  statusBlue: palette.lightBlue,
  statusBlueBg: "rgba(78,167,252,0.15)",
  statusOrange: palette.orange,
  statusOrangeBg: "rgba(242,153,74,0.15)",
  statusPurple: palette.purple,
  statusPurpleBg: "rgba(132,90,185,0.15)",
} as const

// ---------------------------------------------------------------------------
// Spacing — named tokens from Linear
// ---------------------------------------------------------------------------

export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  "2xl": 20,
  "3xl": 24,
  "4xl": 32,
  "5xl": 40,
  "6xl": 48,
  "7xl": 56,
  "8xl": 64,
  "9xl": 80,
  "10xl": 120,
} as const

// ---------------------------------------------------------------------------
// Dimensions (kept for backward compat with components using dimension tokens)
// ---------------------------------------------------------------------------

export const dimension = {
  "dimension-1": 1,
  "dimension-2": 2,
  "dimension-4": 4,
  "dimension-6": 6,
  "dimension-8": 8,
  "dimension-10": 10,
  "dimension-12": 12,
  "dimension-16": 16,
  "dimension-24": 24,
  "dimension-32": 32,
  "dimension-40": 40,
  "dimension-48": 48,
  "dimension-50": 50,
  "dimension-54": 54,
  "dimension-56": 56,
  "dimension-64": 64,
  "dimension-80": 80,
  "dimension-120": 120,
} as const

// ---------------------------------------------------------------------------
// Border Radii — Linear tokens
// ---------------------------------------------------------------------------

export const borderRadii = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  "2xl": 20,
  "3xl": 24,
  "4xl": 32,
  full: 9999,
} as const

// ---------------------------------------------------------------------------
// Shadows — Linear tokens
// ---------------------------------------------------------------------------

export const shadows = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
} as const

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

const theme = createTheme({
  colors,
  dimension,
  spacing,
  borderRadii,
  textVariants,
  buttonVariants,
})

export type Theme = typeof theme
export default theme
export type ColorToken = keyof typeof colors
export type SpacingToken = keyof typeof spacing
export type BorderRadiiToken = keyof typeof borderRadii
export type DimensionToken = keyof typeof dimension
