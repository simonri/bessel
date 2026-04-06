import { TextInput, type TextInputProps } from "react-native";
import { useTheme } from "@/design-system";

export function Input({ style, ...props }: TextInputProps) {
  const theme = useTheme();

  return (
    <TextInput
      placeholderTextColor={theme.colors.zinc500}
      {...props}
      style={[
        {
          color: theme.colors.foreground,
          fontSize: 14,
          paddingVertical: 0,
        },
        style,
      ]}
    />
  );
}
