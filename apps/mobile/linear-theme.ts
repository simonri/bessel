/**
 * Linear App Theme — extracted from the Android APK (Jetpack Compose)
 *
 * Fonts bundled: Inter Variable, Berkeley Mono Variable, Roboto Medium Numbers
 */

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const palette = {
  // Neutrals (dark end — used as foreground in light mode, background in dark)
  gray950: '#0A0A0A',
  gray900: '#0D0D0D',
  gray850: '#171717',
  gray800: '#212121',
  gray750: '#292929',
  gray700: '#2E2E2E',
  gray600: '#303030',

  // Neutrals (light end — used as foreground in dark mode, background in light)
  white: '#FFFFFF',
  gray50: '#FAFAFA',
  gray100: '#F5F5F5',
  gray150: '#F2F2F2',
  gray200: '#F0F0F0',
  gray250: '#E8E8E8',
  gray300: '#E4E4E4',
  gray350: '#E0E0E0',

  // Mid grays
  gray400: '#9E9E9E',
  gray450: '#989898',
  gray500: '#848484',
  gray550: '#787878',
  gray575: '#5D5D5D',
  gray625: '#5B5B5B',

  // Brand / accent
  indigo: '#5E6AD2',
  blue: '#4161DA',
  lightBlue: '#4EA7FC',
  lightBlueAlt: '#5987C7',
  purple: '#845AB9',
  violet: '#7482FF',

  // Semantic
  green: '#4CB782',
  teal: '#3C6E6C',
  red: '#EB5757',
  orange: '#F2994A',
  yellow: '#F2C94C',
  yellowHighlight: '#FFDA69',

  // Status / priority colors (constant across themes)
  statusPurple: '#845AB9',
  statusBlue: '#5987C7',
  statusOrange: '#E19B48',
  statusRed: '#ED7669',
  statusYellow: '#D7C45C',
  statusSalmon: '#E78D71',
  statusTeal: '#3C6E6C',
  statusPink: '#E57BB3',
} as const;

// ---------------------------------------------------------------------------
// Light & Dark semantic tokens
// ---------------------------------------------------------------------------

export const lightColors = {
  // Text
  textPrimary: palette.gray900,       // #0D0D0D
  textSecondary: palette.gray800,     // #212121
  textTertiary: palette.gray700,      // #2E2E2E
  textMuted: palette.gray450,         // #989898
  textFaint: palette.gray625,         // #5B5B5B
  textSubtle: palette.gray550,        // #787878
  textLink: palette.violet,           // #7482FF

  // Backgrounds
  background: palette.white,          // #FFFFFF
  backgroundSecondary: palette.gray850, // #171717
  backgroundElevated: palette.gray750,  // #292929
  backgroundHover: palette.gray600,     // #303030

  // Surfaces (cards, sheets)
  surface: palette.white,
  surfaceRaised: palette.gray800,     // #212121

  // Borders & separators
  border: palette.gray300,            // #E4E4E4
  borderSubtle: palette.gray200,      // #F0F0F0 (from XML)

  // Overlays (white-based for dark content)
  overlay25: 'rgba(255,255,255,0.25)',
  overlay12: 'rgba(255,255,255,0.12)',
  overlay08: 'rgba(255,255,255,0.08)',
  overlay06: 'rgba(255,255,255,0.06)',
  overlay03: 'rgba(255,255,255,0.03)',

  // Scrim
  scrim: 'rgba(0,0,0,0.50)',

  // Accent
  accent: palette.lightBlue,          // #4EA7FC
  accentSecondary: palette.green,     // #4CB782
  accentTertiary: palette.indigo,     // #5E6AD2
  link: '#4161DA',

  // Semantic
  error: palette.red,                 // #EB5757
  warning: palette.orange,            // #F2994A
  success: palette.green,             // #4CB782
  info: palette.lightBlue,            // #4EA7FC
  highlight: palette.blue,            // #325A96 (selection highlight)
} as const;

export const darkColors = {
  // Text
  textPrimary: palette.white,         // #FFFFFF
  textSecondary: palette.gray200,     // #F0F0F0
  textTertiary: palette.gray350,      // #E0E0E0
  textMuted: palette.gray575,         // #5D5D5D
  textFaint: palette.gray400,         // #9E9E9E
  textSubtle: palette.gray500,        // #848484
  textLink: palette.blue,             // #4161DA

  // Backgrounds
  background: palette.gray900,        // #0D0D0D (from XML night base)
  backgroundSecondary: palette.gray50,  // #FAFAFA
  backgroundElevated: palette.gray200,  // #F0F0F0
  backgroundHover: palette.gray250,     // #E8E8E8

  // Surfaces
  surface: palette.gray900,
  surfaceRaised: palette.gray100,     // #F5F5F5

  // Borders & separators
  border: palette.gray600,            // #303030
  borderSubtle: palette.gray800,      // #212121 (from XML night border)

  // Overlays (black-based for light content)
  overlay25: 'rgba(0,0,0,0.25)',
  overlay12: 'rgba(0,0,0,0.10)',
  overlay08: 'rgba(0,0,0,0.06)',
  overlay06: 'rgba(0,0,0,0.04)',
  overlay03: 'rgba(0,0,0,0.03)',

  // Scrim
  scrim: 'rgba(0,0,0,0.20)',

  // Accent
  accent: palette.lightBlue,          // #4EA7FC
  accentSecondary: palette.green,     // #4CB782
  accentTertiary: palette.indigo,     // #5E6AD2
  link: '#7482FF',

  // Semantic
  error: palette.red,
  warning: palette.orange,
  success: palette.green,
  info: palette.lightBlue,
  highlight: palette.yellowHighlight, // #FFDA69 (dark mode uses yellow)
} as const;

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

export const fontFamilies = {
  sans: 'Inter',
  mono: 'BerkeleyMono',
  numbers: 'RobotoMediumNumbers',
} as const;

/**
 * All text styles use Inter Variable by default.
 * Font sizes in sp (scale-independent pixels) map 1:1 to RN points.
 *
 * Naming follows Material 3 convention as used in the app's Compose source.
 * The first 15 are the "primary" set; the same 15 are duplicated as
 * the "content" set in the Compose Typography object.
 */
export const typography = {
  // Display — large hero text, SemiBold (600)
  displayLarge: {
    fontFamily: fontFamilies.sans,
    fontSize: 48,
    fontWeight: '600' as const,
  },
  displayMedium: {
    fontFamily: fontFamilies.sans,
    fontSize: 40,
    fontWeight: '600' as const,
  },
  displaySmall: {
    fontFamily: fontFamilies.sans,
    fontSize: 32,
    fontWeight: '600' as const,
  },

  // Headline — section headings, Bold (700)
  headlineLarge: {
    fontFamily: fontFamilies.sans,
    fontSize: 24,
    fontWeight: '700' as const,
  },
  headlineMedium: {
    fontFamily: fontFamilies.sans,
    fontSize: 20,
    fontWeight: '700' as const,
  },
  headlineSmall: {
    fontFamily: fontFamilies.sans,
    fontSize: 16,
    fontWeight: '700' as const,
  },

  // Title — navigation / toolbar, SemiBold (600)
  titleLarge: {
    fontFamily: fontFamilies.sans,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  titleMedium: {
    fontFamily: fontFamilies.sans,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  titleSmall: {
    fontFamily: fontFamilies.sans,
    fontSize: 14,
    fontWeight: '600' as const,
  },

  // Body
  bodyLarge: {
    fontFamily: fontFamilies.sans,
    fontSize: 16,
    fontWeight: '400' as const,
  },
  bodyMedium: {
    fontFamily: fontFamilies.sans,
    fontSize: 14,
    fontWeight: '300' as const,
    // Light weight — used for secondary body text
  },
  bodySmall: {
    fontFamily: fontFamilies.sans,
    fontSize: 12,
    fontWeight: '400' as const,
  },

  // Label
  labelLarge: {
    fontFamily: fontFamilies.sans,
    fontSize: 14,
    fontWeight: '400' as const,
  },
  labelMedium: {
    fontFamily: fontFamilies.sans,
    fontSize: 12,
    fontWeight: '400' as const,
  },
  labelSmall: {
    fontFamily: fontFamilies.sans,
    fontSize: 10,
    fontWeight: '400' as const,
  },

  // Mono — for code, IDs, technical values
  mono: {
    fontFamily: fontFamilies.mono,
    fontSize: 14,
    fontWeight: '500' as const,
    lineHeight: 20,
  },
} as const;

// ---------------------------------------------------------------------------
// Spacing
// ---------------------------------------------------------------------------

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  '3xl': 24,
  '4xl': 32,
  '5xl': 40,
  '6xl': 64,
} as const;

// ---------------------------------------------------------------------------
// Border Radius
// ---------------------------------------------------------------------------

export const borderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  full: 9999,
} as const;

// ---------------------------------------------------------------------------
// Icon sizes (from Compose source — s5a.a icon rendering calls)
// ---------------------------------------------------------------------------

export const iconSize = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 40,
} as const;

// ---------------------------------------------------------------------------
// Shadows / Elevation
// ---------------------------------------------------------------------------

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
} as const;

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

export const animation = {
  fast: 150,
  normal: 250,
  slow: 350,
  splash: 300,   // splash screen animation duration from styles.xml
} as const;

// ---------------------------------------------------------------------------
// Status / Priority palette (constant across light & dark)
// ---------------------------------------------------------------------------

export const statusColors = [
  palette.statusPurple,  // #845AB9
  palette.statusBlue,    // #5987C7
  palette.statusOrange,  // #E19B48
  palette.statusRed,     // #ED7669
  palette.statusYellow,  // #D7C45C
  palette.statusSalmon,  // #E78D71
  palette.statusTeal,    // #3C6E6C
  palette.statusPink,    // #E57BB3
] as const;

// ---------------------------------------------------------------------------
// Convenience: full theme object
// ---------------------------------------------------------------------------

export type ColorScheme = typeof lightColors;

export const theme = {
  light: lightColors,
  dark: darkColors,
  palette,
  typography,
  fontFamilies,
  spacing,
  borderRadius,
  iconSize,
  shadows,
  animation,
  statusColors,
} as const;

export default theme;
