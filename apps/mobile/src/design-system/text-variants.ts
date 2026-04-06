import { ColorToken } from "@/design-system/theme"

type TextVariant = {
  color?: ColorToken
  fontSize?: number
  lineHeight?: number
  fontFamily?: string
  textTransform?: "none" | "capitalize" | "uppercase" | "lowercase"
}

const FONT_LIGHT = "Inter-Light"
const FONT_REGULAR = "Inter-Regular"
const FONT_MEDIUM = "Inter-Medium"
const FONT_SEMIBOLD = "Inter-SemiBold"
const FONT_BOLD = "Inter-Bold"

export const textVariants = {
  defaults: {
    color: "text",
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONT_REGULAR,
  },

  // Display — large hero text (Linear: displayLarge/Medium/Small, SemiBold)
  display: {
    fontSize: 48,
    lineHeight: 56,
    fontFamily: FONT_SEMIBOLD,
  },
  headingXL: {
    fontSize: 40,
    lineHeight: 48,
    fontFamily: FONT_SEMIBOLD,
  },
  heading: {
    fontSize: 32,
    lineHeight: 40,
    fontFamily: FONT_SEMIBOLD,
  },

  // Headline — section headings (Linear: headlineLarge/Medium/Small, Bold)
  headingSmall: {
    fontSize: 24,
    lineHeight: 32,
    fontFamily: FONT_BOLD,
  },
  title: {
    fontSize: 20,
    lineHeight: 28,
    fontFamily: FONT_BOLD,
  },
  titleSmall: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: FONT_BOLD,
  },

  // Title — navigation / toolbar (Linear: titleLarge/Medium/Small, SemiBold)
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: FONT_SEMIBOLD,
    color: "textMuted",
  },
  bodyEmphasis: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: FONT_SEMIBOLD,
  },

  // Body (Linear: bodyLarge=Regular, bodyMedium=Light, bodySmall=Regular)
  bodyLarge: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: FONT_REGULAR,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONT_REGULAR,
  },
  bodyMedium: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONT_MEDIUM,
  },
  bodyLight: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONT_LIGHT,
  },
  bodySmall: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FONT_REGULAR,
  },

  // Label (Linear: labelLarge/Medium/Small, Regular)
  label: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONT_REGULAR,
  },
  labelSmall: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FONT_REGULAR,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FONT_REGULAR,
  },
  micro: {
    fontSize: 10,
    lineHeight: 14,
    fontFamily: FONT_REGULAR,
  },

  // Button
  button: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONT_SEMIBOLD,
  },
  buttonSmall: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FONT_SEMIBOLD,
  },

  // Pill / chip
  pill: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FONT_REGULAR,
    textTransform: "capitalize",
  },
} satisfies Record<string, TextVariant>

export type TextVariantKey = Exclude<keyof typeof textVariants, "defaults">
