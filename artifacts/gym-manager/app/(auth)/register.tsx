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

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [gymName, setGymName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleRegister = async () => {
    if (!name.trim() || !gymName.trim() || !phone.trim() || !email.trim() || !password.trim()) {
      setError("Please fill in all fields.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    setError("");
    const success = await register({ name, gymName, phone, email, password });
    setLoading(false);
    if (success) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError("Email already registered. Please sign in.");
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
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={C.text} />
        </Pressable>

        <View style={styles.header}>
          <View style={styles.iconWrap}>
            <Feather name="user-plus" size={28} color={C.primary} />
          </View>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Set up your gym management account</Text>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Feather name="alert-circle" size={16} color={C.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.form}>
          <Field label="ሙሉ ስም" value={name} onChange={setName} placeholder="አበበ ከበደ" />
          <Field label="የጂም ስም" value={gymName} onChange={setGymName} placeholder="አዲስ ፊትነስ ጂም" />
          <Field label="ስልክ ቁጥር" value={phone} onChange={setPhone} placeholder="+251 912 345 678" keyboard="phone-pad" />
          <Field label="ኢሜይል አድራሻ" value={email} onChange={setEmail} placeholder="abebe@gmail.com" keyboard="email-address" />
          <View>
            <Text style={styles.label}>የይለፍ ቃል</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="ቢያንስ 6 ቁምፊ"
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
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Create Account</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.link}>Sign In</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboard,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  keyboard?: "email-address" | "phone-pad" | "default";
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={C.textTertiary}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboard || "default"}
        autoCapitalize={keyboard === "email-address" || keyboard === "phone-pad" ? "none" : "words"}
        autoCorrect={false}
      />
    </View>
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
  title: {
    fontSize: 26,
    fontWeight: "bold",
    color: C.text,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "normal",
    color: C.textSecondary,
    textAlign: "center",
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
  errorText: { color: C.danger, fontWeight: "500", fontSize: 14, flex: 1 },
  form: { gap: 14, marginBottom: 28 },
  label: {
    fontSize: 12,
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
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  footerText: { color: C.textSecondary, fontWeight: "normal", fontSize: 15 },
  link: { color: C.primary, fontWeight: "600", fontSize: 15 },
});
