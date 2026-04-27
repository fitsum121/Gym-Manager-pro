import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/context/AuthContext";
import { GymProvider } from "@/context/GymContext";
import { SubscriptionProvider } from "@/context/SubscriptionContext";

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootLayoutNav() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="activate" options={{ headerShown: false }} />
      <Stack.Screen name="migrate" options={{ headerShown: false }} />      <Stack.Screen name="customer/add" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="customer/[id]" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AuthProvider>
          <SubscriptionProvider>
            <GymProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <RootLayoutNav />
              </GestureHandlerRootView>
            </GymProvider>
          </SubscriptionProvider>
        </AuthProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
