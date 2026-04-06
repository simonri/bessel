import { TextInput, type TextInputProps } from "react-native";
import { useTheme } from "@/design-system";

export function Input({ style, ...props }: TextInputProps) {
  const theme = useTheme();

  return (
    <TextInput
      placeholderTextColor={theme.colors.inputPlaceholder}
      {...props}
      style={[
        {
          color: theme.colors.text,
          fontFamily: "Inter-Regular",
          fontSize: 14,
          paddingVertical: 0,
        },
        style,
      ]}
    />
  );
}
