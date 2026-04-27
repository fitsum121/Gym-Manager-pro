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

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { loginOwner } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please fill in all fields.");
      return;
    }
    setLoading(true);
    setError("");
    const result = await loginOwner(email.trim(), password);
    setLoading(false);
    if (result.ok) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(result.error ?? "Invalid email or password.");
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
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.iconWrap}>
            <Feather name="activity" size={32} color={C.primary} />
          </View>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to manage your gym</Text>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Feather name="alert-circle" size={16} color={C.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.form}>
          <View>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="abebe@gmail.com"
              placeholderTextColor={C.textTertiary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="Enter your password"
                placeholderTextColor={C.textTertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <Pressable
                style={styles.eyeBtn}
                onPress={() => setShowPassword((v) => !v)}
              >
                <Text style={styles.eyeText}>{showPassword ? "🔒" : "👁"}</Text>
              </Pressable>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Sign In</Text>
            )}
          </Pressable>

          <Pressable onPress={() => router.push("/(auth)/forgot")} style={styles.forgotBtn}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <Pressable onPress={() => router.push("/(auth)/register")}>
            <Text style={styles.link}>Register</Text>
          </Pressable>
        </View>

        <Pressable onPress={() => router.push("/(auth)/staff-login" as never)} style={styles.staffLoginBtn}>
          <Text style={styles.staffLoginText}>Staff Login →</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  container: { padding: 24 },
  header: { alignItems: "center", marginBottom: 40 },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: `${C.primary}18`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: C.text,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: "normal",
    color: C.textSecondary,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: `${C.danger}15`,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: C.danger,
    fontWeight: "500",
    fontSize: 14,
    flex: 1,
  },
  form: { gap: 16, marginBottom: 32 },
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
    fontWeight: "normal",
    color: C.text,
  },
  passwordWrap: { position: "relative" },
  passwordInput: { paddingRight: 50 },
  eyeBtn: {
    position: "absolute",
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  eyeText: { fontSize: 18 },
  btn: {
    backgroundColor: C.primary,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  btnPressed: { opacity: 0.85 },
  btnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  footerText: {
    color: C.textSecondary,
    fontWeight: "normal",
    fontSize: 15,
  },
  link: {
    color: C.primary,
    fontWeight: "600",
    fontSize: 15,
  },
  forgotBtn: { alignItems: "center", marginTop: 12, paddingVertical: 4 },
  forgotText: { color: C.primary, fontSize: 14, fontWeight: "600" },
  staffLoginBtn: { alignItems: "center", marginTop: 20, paddingVertical: 8 },
  staffLoginText: { color: C.textSecondary, fontSize: 14, fontWeight: "500" },
});
