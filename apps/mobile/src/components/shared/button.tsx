import { View, ActivityIndicator, Pressable } from "react-native";
import { Text } from "./text";
import { useTheme } from "@/design-system";
import type { ButtonVariantKey } from "@/design-system/button-variants";
import { buttonVariants } from "@/design-system/button-variants";
import type { ColorToken } from "@/design-system/theme";

export type ButtonSize = "small" | "medium" | "large";

type SizeConfig = {
  paddingHorizontal: number;
  paddingVertical: number;
  borderRadius: number;
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
};

const SIZES: Record<ButtonSize, SizeConfig> = {
  small: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    fontSize: 14,
    fontFamily: "Inter-Medium",
    lineHeight: 20,
  },
  medium: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    fontSize: 16,
    fontFamily: "Inter-Medium",
    lineHeight: 20,
  },
  large: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    fontSize: 16,
    fontFamily: "Inter-Medium",
    lineHeight: 20,
  },
};

export type ButtonProps = {
  onPress?: () => void;
  children: React.ReactNode;
  variant?: ButtonVariantKey;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  flex?: boolean;
  icon?: React.ReactNode;
  color?: ColorToken;
};

export const Button = ({
  onPress,
  children,
  variant = "filled",
  size = "medium",
  disabled = false,
  loading = false,
  fullWidth = false,
  flex = false,
  icon,
  color,
}: ButtonProps) => {
  const theme = useTheme();
  const variantStyle = buttonVariants[variant];
  const sizeStyle = SIZES[size];

  const bgToken = disabled ? variantStyle.disabledBackgroundColor : variantStyle.backgroundColor;
  const textToken = disabled ? variantStyle.disabledTextColor : variantStyle.textColor;

  const backgroundColor = bgToken === "transparent"
    ? "transparent"
    : color && !disabled
      ? theme.colors[color]
      : theme.colors[bgToken as ColorToken];

  const textColor = theme.colors[textToken];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingHorizontal: sizeStyle.paddingHorizontal,
        paddingVertical: sizeStyle.paddingVertical,
        borderRadius: sizeStyle.borderRadius,
        backgroundColor,
        opacity: pressed ? 0.7 : disabled ? 0.5 : 1,
        width: fullWidth ? "100%" : undefined,
        flex: flex ? 1 : undefined,
      })}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : icon ? (
        <View style={{ marginRight: 2 }}>{icon}</View>
      ) : null}
      <Text
        style={{
          color: textColor,
          fontSize: sizeStyle.fontSize,
          fontFamily: sizeStyle.fontFamily,
          lineHeight: sizeStyle.lineHeight,
        }}
      >
        {children}
      </Text>
    </Pressable>
  );
};

export type { ButtonVariantKey };
