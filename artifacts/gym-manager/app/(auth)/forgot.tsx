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

type Stage = "identity" | "newpass";

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { verifyIdentity, resetPassword } = useAuth();

  const [stage, setStage] = useState<Stage>("identity");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleVerifyIdentity = async () => {
    if (!email.trim() || !phone.trim()) {
      setError("Please enter both email and phone.");
      return;
    }
    setLoading(true);
    setError("");
    const result = await verifyIdentity(email.trim(), phone.trim());
    setLoading(false);
    if (!result.verified || !result.resetToken) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError("No account found with this email and phone combination.");
      return;
    }
    setResetToken(result.resetToken);
    setError("");
    setStage("newpass");
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleResetPassword = async () => {
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError("");
    const ok = await resetPassword(resetToken, newPassword);
    setLoading(false);
    if (!ok) {
      setError("Could not reset password. Please try again.");
      return;
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace("/(auth)/login");
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
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title}>
            {stage === "identity" ? "Forgot Password" : "New Password"}
          </Text>
          <Text style={styles.subtitle}>
            {stage === "identity"
              ? "Enter your email and phone to verify your identity"
              : "Choose a new password for your account"}
          </Text>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠ {error}</Text>
          </View>
        ) : null}

        {stage === "identity" && (
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
              <Text style={styles.label}>Phone</Text>
              <TextInput
                style={styles.input}
                placeholder="+251 9XX XXX XXX"
                placeholderTextColor={C.textTertiary}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>

            <Pressable
              style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}
              onPress={handleVerifyIdentity}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Verify Identity</Text>
              )}
            </Pressable>
          </View>
        )}

        {stage === "newpass" && (
          <View style={styles.form}>
            <View>
              <Text style={styles.label}>New Password</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  placeholder="At least 6 characters"
                  placeholderTextColor={C.textTertiary}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showNewPwd}
                  autoCapitalize="none"
                />
                <Pressable style={styles.eyeBtn} onPress={() => setShowNewPwd((v) => !v)}>
                  <Text style={styles.eyeText}>{showNewPwd ? "🔒" : "👁"}</Text>
                </Pressable>
              </View>
            </View>

            <View>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  placeholder="Re-enter your password"
                  placeholderTextColor={C.textTertiary}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPwd}
                  autoCapitalize="none"
                />
                <Pressable style={styles.eyeBtn} onPress={() => setShowConfirmPwd((v) => !v)}>
                  <Text style={styles.eyeText}>{showConfirmPwd ? "🔒" : "👁"}</Text>
                </Pressable>
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}
              onPress={handleResetPassword}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Reset Password</Text>
              )}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  container: { padding: 24 },
  backBtn: { paddingVertical: 8, marginBottom: 8 },
  backText: { color: C.primary, fontSize: 16, fontWeight: "600" },
  header: { marginBottom: 28 },
  title: { fontSize: 26, fontWeight: "bold", color: C.text, marginBottom: 8 },
  subtitle: { fontSize: 15, color: C.textSecondary },
  errorBox: {
    backgroundColor: `${C.danger}15`,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { color: C.danger, fontWeight: "500", fontSize: 14 },
  form: { gap: 16 },
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
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
