import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Redirect, Tabs } from "expo-router";
import { useSubscription } from "@/context/SubscriptionContext";
import { useAuth } from "@/context/AuthContext";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

const C = Colors.light;

function NativeTabLayout({ isStaff }: { isStaff: boolean }) {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "person.2", selected: "person.2.fill" }} />
        <Label>Members</Label>
      </NativeTabs.Trigger>
      {!isStaff && (
        <NativeTabs.Trigger name="settings">
          <Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} />
          <Label>Settings</Label>
        </NativeTabs.Trigger>
      )}
    </NativeTabs>
  );
}

function ClassicTabLayout({ isStaff }: { isStaff: boolean }) {
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.tabIconDefault,
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : "#fff",
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: C.border,
          elevation: 0,
          paddingBottom: insets.bottom,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint="light"
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "#fff" }]} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Members",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="person.2" tintColor={color} size={24} />
            ) : (
              <Feather name="users" size={22} color={color} />
            ),
        }}
      />
      {!isStaff && (
        <Tabs.Screen
          name="settings"
          options={{
            title: "Settings",
            tabBarIcon: ({ color }) =>
              isIOS ? (
                <SymbolView name="gearshape" tintColor={color} size={24} />
              ) : (
                <Feather name="settings" size={22} color={color} />
              ),
          }}
        />
      )}
    </Tabs>
  );
}

export default function TabLayout() {
  const { isActive, isLoading } = useSubscription();
  const { session } = useAuth();
  const isStaff = session?.role === "staff";

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.light.background }}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
      </View>
    );
  }
  // Staff bypass subscription gate
  if (!isStaff && !isActive) return <Redirect href="/activate" />;
  if (isLiquidGlassAvailable()) return <NativeTabLayout isStaff={isStaff} />;
  return <ClassicTabLayout isStaff={isStaff} />;
}
