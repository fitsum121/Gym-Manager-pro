import { Redirect } from "expo-router";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/context/SubscriptionContext";
import Colors from "@/constants/colors";

const C = Colors.light;

export default function IndexScreen() {
  const { owner, isLoading: authLoading } = useAuth();
  const { isLoading: subLoading, isActive } = useSubscription();

  // Wait for both auth and subscription to finish loading before making any routing decision.
  // Without this, there's a window where owner is set but isActive is still false (initial value),
  // which incorrectly redirects active users to /activate.
  if (authLoading || subLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  if (!owner) {
    return <Redirect href="/(auth)/login" />;
  }

  // Staff don't go through subscription gate — only owners do
  if (owner.role === "owner" && !isActive) {
    return <Redirect href="/activate" />;
  }

  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.light.background,
  },
});
