import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: "minimal" }}>
      <Stack.Screen name="login" options={{ title: "Sign In", headerShown: false }} />
      <Stack.Screen name="register" options={{ title: "Create Account", headerShown: false }} />
      <Stack.Screen name="forgot" options={{ title: "Forgot Password", headerShown: false }} />
      <Stack.Screen name="staff-login" options={{ title: "Staff Login", headerShown: false }} />
    </Stack>
  );
}
