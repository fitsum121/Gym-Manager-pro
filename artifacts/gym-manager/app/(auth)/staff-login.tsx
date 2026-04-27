import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";

const C = Colors.light;

export default function StaffLoginScreen() {
  const insets = useSafeAreaInsets();
  const { loginStaff } = useAuth();
  const [gymId, setGymId] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!gymId.trim() || !username.trim() || !pin.trim()) {
      setError("Please enter your Gym ID, username, and PIN.");
      return;
    }
    setLoading(true);
    setError("");
    const result = await loginStaff(gymId.trim(), username.trim(), pin.trim());
    setLoading(false);
    if (result.ok) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(result.error ?? "Invalid Gym ID, username, or PIN.");
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.flex}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={C.text} />
        </Pressable>

        <View style={styles.header}>
          <View style={styles.iconWrap}>
            <Feather name="users" size={28} color={C.primary} />
          </View>
          <Text style={styles.title}>Staff Login</Text>
          <Text style={styles.subtitle}>Enter your Gym ID, username, and PIN to access the app</Text>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Feather name="alert-circle" size={16} color={C.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.form}>
          <View>
            <Text style={styles.label}>Gym ID</Text>
            <TextInput
              style={[styles.input, styles.monoInput]}
              placeholder="W8ASYS"
              placeholderTextColor={C.textTertiary}
              value={gymId}
              onChangeText={(t) => setGymId(t.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
            />
          </View>

          <View>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              placeholder="your_username"
              placeholderTextColor={C.textTertiary}
              value={username}
              onChangeText={(t) => setUsername(t.toLowerCase())}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={30}
            />
          </View>

          <View>
            <Text style={styles.label}>PIN</Text>
            <TextInput
              style={[styles.input, styles.pinInput]}
              placeholder="••••"
              placeholderTextColor={C.textTertiary}
              value={pin}
              onChangeText={setPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
            />
          </View>

          <Pressable
            style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Sign In as Staff</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Are you the gym owner? </Text>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.link}>Owner Login</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  container: { padding: 24 },
  backBtn: { marginBottom: 20 },
  header: { alignItems: "center", marginBottom: 32 },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: `${C.primary}18`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: { fontSize: 26, fontWeight: "bold", color: C.text, marginBottom: 6 },
  subtitle: { fontSize: 14, color: C.textSecondary, textAlign: "center" },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: `${C.danger}15`,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { color: C.danger, fontWeight: "500", fontSize: 14, flex: 1 },
  form: { gap: 16, marginBottom: 28 },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: C.textSecondary,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: C.text,
  },
  monoInput: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 20,
    letterSpacing: 4,
    textAlign: "center",
  },
  pinInput: {
    fontSize: 24,
    letterSpacing: 8,
    textAlign: "center",
  },
  btn: {
    backgroundColor: C.primary,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  footer: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  footerText: { color: C.textSecondary, fontSize: 15 },
  link: { color: C.primary, fontWeight: "600", fontSize: 15 },
});
