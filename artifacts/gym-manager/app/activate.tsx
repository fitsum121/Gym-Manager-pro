import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
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
import { useSubscription } from "@/context/SubscriptionContext";
import { ADMIN_TELEGRAM, ADMIN_PHONE } from "@/lib/license";

const C = Colors.light;

export default function ActivateScreen() {
  const insets = useSafeAreaInsets();
  const { owner, logout } = useAuth();
  const { activate, subscription, isActive } = useSubscription();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const wasActiveButExpired =
    subscription && new Date(subscription.expiryDate).getTime() < Date.now();

  // Active subscribers have no business here — redirect after render
  useEffect(() => {
    if (isActive) {
      router.replace("/(tabs)");
    }
  }, [isActive]);

  // No owner means logged out (account deleted) — go to login
  useEffect(() => {
    if (!owner) {
      router.replace("/(auth)/login");
    }
  }, [owner]);

  if (isActive || !owner) return null;

  const contactMessage = `Hello, I want to activate my gym subscription.\n\nGym Name: ${owner?.gymName ?? ""}\nGym ID: ${owner?.gymId ?? ""}\nOwner: ${owner?.name ?? ""}`;

  const handleActivate = async () => {
    setError("");
    if (!code.trim()) {
      setError("Please enter your activation code.");
      return;
    }
    setLoading(true);
    const result = await activate(code);
    setLoading(false);
    if (!result.ok) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(result.reason || "Invalid code.");
      return;
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCode("");
    router.replace("/(tabs)");
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/");
  };

  const openTelegram = () => {
    const handle = ADMIN_TELEGRAM.replace("@", "");
    const msg = encodeURIComponent(contactMessage);
    const tgUrl = `tg://resolve?domain=${handle}&text=${msg}`;
    const webUrl = `https://t.me/${handle}?text=${msg}`;
    Linking.openURL(tgUrl).catch(() => Linking.openURL(webUrl).catch(() => {}));
  };

  const openSMS = () => {
    const msg = encodeURIComponent(contactMessage);
    const separator = Platform.OS === "ios" ? "&" : "?";
    Linking.openURL(`sms:${ADMIN_PHONE}${separator}body=${msg}`).catch(() => {});
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
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Text style={{ fontSize: 36 }}>🔑</Text>
          </View>
          <Text style={styles.title}>
            {wasActiveButExpired ? "Subscription Expired" : "Activate Your Gym"}
          </Text>
          <Text style={styles.subtitle}>
            {wasActiveButExpired
              ? "Renew your subscription to continue using the app. Your member data is safe."
              : "Enter the activation code you received from the admin to start using the app."}
          </Text>
        </View>

        <View style={styles.gymIdCard}>
          <Text style={styles.gymIdLabel}>YOUR GYM ID</Text>
          <Text style={styles.gymIdValue}>{owner?.gymId ?? "—"}</Text>
          <Text style={styles.gymIdHint}>
            Send this ID to the admin when paying for your subscription
          </Text>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠ {error}</Text>
          </View>
        ) : null}

        <View style={styles.form}>
          <Text style={styles.label}>Activation Code</Text>
          <TextInput
            style={styles.input}
            placeholder="GYM-XXXXXX-XXXXXX-XXXXXXXX"
            placeholderTextColor={C.textTertiary}
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
          />

          <Pressable
            style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}
            onPress={handleActivate}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Activate</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>Contact Admin to Get a Code</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.contactRow}>
          <Pressable
            style={({ pressed }) => [styles.contactBtn, styles.tgBtn, pressed && { opacity: 0.85 }]}
            onPress={openTelegram}
          >
            <Text style={styles.contactBtnIcon}>💬</Text>
            <Text style={styles.contactBtnText}>Telegram</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.contactBtn, styles.smsBtn, pressed && { opacity: 0.85 }]}
            onPress={openSMS}
          >
            <Text style={styles.contactBtnIcon}>📱</Text>
            <Text style={styles.contactBtnText}>SMS</Text>
          </Pressable>
        </View>

        <Text style={styles.contactHint}>
          Your Gym ID and details will be pre-filled in the message
        </Text>

        <Pressable onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  container: { padding: 24 },
  header: { alignItems: "center", marginBottom: 24 },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: `${C.primary}18`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  title: { fontSize: 24, fontWeight: "bold", color: C.text, marginBottom: 8, textAlign: "center" },
  subtitle: { fontSize: 14, color: C.textSecondary, textAlign: "center", lineHeight: 20 },
  gymIdCard: {
    backgroundColor: `${C.primary}10`,
    borderWidth: 1.5,
    borderColor: C.primary,
    borderRadius: 16,
    padding: 18,
    alignItems: "center",
    marginBottom: 20,
    gap: 6,
  },
  gymIdLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: C.textSecondary,
    letterSpacing: 1,
  },
  gymIdValue: {
    fontSize: 32,
    fontWeight: "bold",
    color: C.primary,
    letterSpacing: 6,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  gymIdHint: { fontSize: 12, color: C.textSecondary, textAlign: "center", marginTop: 4 },
  errorBox: {
    backgroundColor: `${C.danger}15`,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  errorText: { color: C.danger, fontWeight: "500", fontSize: 14 },
  form: { gap: 12 },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: C.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: C.text,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  btn: {
    backgroundColor: C.primary,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    marginTop: 6,
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 24,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { fontSize: 12, fontWeight: "600", color: C.textTertiary, textAlign: "center" },
  contactRow: {
    flexDirection: "row",
    gap: 12,
  },
  contactBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    padding: 15,
  },
  tgBtn: {
    backgroundColor: "#0088cc",
  },
  smsBtn: {
    backgroundColor: C.accent,
  },
  contactBtnIcon: { fontSize: 18 },
  contactBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  contactHint: {
    fontSize: 12,
    color: C.textTertiary,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 17,
  },
  logoutBtn: { alignItems: "center", marginTop: 24, paddingVertical: 8 },
  logoutText: { color: C.textSecondary, fontSize: 14, fontWeight: "500" },
});
