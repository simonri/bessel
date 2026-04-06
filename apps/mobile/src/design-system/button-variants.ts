import { ColorToken } from "@/design-system/theme";

export type ButtonVariant = "filled" | "tinted" | "ghost" | "destructive";

export type ButtonVariantStyle = {
  backgroundColor: ColorToken | "transparent"
  textColor: ColorToken
  disabledBackgroundColor: ColorToken | "transparent"
  disabledTextColor: ColorToken
}

export const buttonVariants: Record<ButtonVariant, ButtonVariantStyle> = {
  filled: {
    backgroundColor: "monochromeInverted",
    textColor: "monochrome",
    disabledBackgroundColor: "disabled",
    disabledTextColor: "textMuted",
  },
  tinted: {
    backgroundColor: "accent",
    textColor: "monochromeInverted",
    disabledBackgroundColor: "disabled",
    disabledTextColor: "textMuted",
  },
  ghost: {
    backgroundColor: "transparent",
    textColor: "textMuted",
    disabledBackgroundColor: "transparent",
    disabledTextColor: "textFaint",
  },
  destructive: {
    backgroundColor: "errorSubtle",
    textColor: "error",
    disabledBackgroundColor: "disabled",
    disabledTextColor: "textMuted",
  },
} as const

export type ButtonVariantKey = keyof typeof buttonVariants;
