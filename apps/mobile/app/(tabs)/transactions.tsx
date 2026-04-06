import { View } from "react-native";
import { Text } from "@/components/shared/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/design-system";

export default function TransactionsScreen() {
  const theme = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ flex: 1, padding: 16 }}>
        <Text variant="heading" color="text">Transactions</Text>
      </View>
    </SafeAreaView>
  );
}
