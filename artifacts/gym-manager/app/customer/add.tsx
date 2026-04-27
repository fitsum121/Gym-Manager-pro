import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
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
import { useGym, MembershipType } from "@/context/GymContext";

const C = Colors.light;

const MEMBERSHIPS: { key: MembershipType; label: string; duration: string; months: number }[] = [
  { key: "weekly", label: "Weekly", duration: "1 week", months: 0 },
  { key: "monthly", label: "Monthly", duration: "1 month", months: 1 },
  { key: "quarterly", label: "Quarterly", duration: "3 months", months: 3 },
  { key: "yearly", label: "Yearly", duration: "1 year", months: 12 },
];

function getExpiryDate(type: MembershipType): Date {
  const now = new Date();
  if (type === "weekly") {
    return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  const months = type === "monthly" ? 1 : type === "quarterly" ? 3 : 12;
  const d = new Date(now);
  d.setMonth(d.getMonth() + months);
  return d;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function AddCustomerScreen() {
  const insets = useSafeAreaInsets();
  const { addCustomer } = useGym();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [membershipType, setMembershipType] = useState<MembershipType>("monthly");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handlePhoto = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handlePickGallery = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !phone.trim()) {
      setError("Name and phone number are required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const startDate = new Date().toISOString();
      const expiryDate = getExpiryDate(membershipType).toISOString();
      await addCustomer({
        name: name.trim(),
        phone: phone.trim(),
        email: "",
        photoUri,
        membershipType,
        startDate,
        expiryDate,
        lastPaymentDate: isPaid ? new Date().toISOString() : null,
        isPaid,
        paymentAmount: parseFloat(paymentAmount) || 0,
        notes: "",
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      setError("Failed to add member. Try again.");
      setLoading(false);
    }  };

  const expiryDate = getExpiryDate(membershipType);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.modalHandle, { marginTop: insets.top + 12 }]}>
        <View style={styles.handle} />
      </View>

      <View style={styles.navBar}>
        <Pressable style={styles.navBtn} onPress={() => router.back()}>
          <Text style={{ fontSize: 22, color: C.text, lineHeight: 26 }}>✕</Text>
        </Pressable>
        <Text style={styles.navTitle}>Add Member</Text>
        <Pressable
          style={({ pressed }) => [styles.saveNavBtn, pressed && { opacity: 0.85 }]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveNavText}>Save</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        {error ? (
          <View style={styles.errorBox}>
            <Feather name="alert-circle" size={15} color={C.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.photoSection}>
          {photoUri ? (
            <Pressable onPress={handlePhoto}>
              <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" />
              <View style={styles.photoEdit}>
                <Feather name="edit-2" size={14} color="#fff" />
              </View>
            </Pressable>
          ) : (
            <View style={styles.photoButtons}>
              <Pressable style={({ pressed }) => [styles.photoBtn, pressed && { opacity: 0.8 }]} onPress={handlePhoto}>
                <Feather name="camera" size={20} color={C.primary} />
                <Text style={styles.photoBtnText}>Camera</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.photoBtn, pressed && { opacity: 0.8 }]} onPress={handlePickGallery}>
                <Feather name="image" size={20} color={C.primary} />
                <Text style={styles.photoBtnText}>Gallery</Text>
              </Pressable>
            </View>
          )}
          <Text style={styles.photoHint}>Member photo (optional)</Text>
        </View>

        <SectionTitle title="Personal Info" />
        <View style={styles.card}>
          <FormField label="ሙሉ ስም *" value={name} onChange={setName} placeholder="አበበ ከበደ" />
          <Separator />
          <FormField label="ስልክ ቁጥር *" value={phone} onChange={setPhone} placeholder="+251 912 345 678" keyboard="phone-pad" />
        </View>

        <SectionTitle title="Membership" />
        <View style={styles.membershipGrid}>
          {MEMBERSHIPS.map((m) => (
            <Pressable
              key={m.key}
              style={[
                styles.membershipCard,
                membershipType === m.key && styles.membershipCardActive,
              ]}
              onPress={() => {
                setMembershipType(m.key);
                Haptics.selectionAsync();
              }}
            >
              <Text style={[styles.membershipLabel, membershipType === m.key && styles.membershipLabelActive]}>
                {m.label}
              </Text>
              <Text style={[styles.membershipDuration, membershipType === m.key && styles.membershipDurationActive]}>
                {m.duration}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.expiryInfo}>
          <Feather name="calendar" size={14} color={C.primary} />
          <Text style={styles.expiryText}>
            Expires: <Text style={styles.expiryDate}>{formatDate(expiryDate)}</Text>
          </Text>
        </View>

        <SectionTitle title="Payment" />
        <View style={styles.card}>
          <View style={styles.paidToggle}>
            <View>
              <Text style={styles.fieldLabel}>Payment Status</Text>
              <Text style={styles.fieldHint}>Mark as paid if payment received today</Text>
            </View>
            <Pressable
              style={[styles.toggle, isPaid && styles.toggleActive]}
              onPress={() => {
                setIsPaid((v) => !v);
                Haptics.selectionAsync();
              }}
            >
              <View style={[styles.toggleThumb, isPaid && styles.toggleThumbActive]} />
            </Pressable>
          </View>
          {isPaid && (
            <>
              <Separator />
              <View style={styles.amountRow}>
                <Text style={[styles.fieldLabel, { marginBottom: 0 }]}>Amount (ETB)</Text>
                <TextInput
                  style={styles.amountInput}
                  value={paymentAmount}
                  onChangeText={setPaymentAmount}
                  keyboardType="numeric"
                  placeholder="0.00"
                  placeholderTextColor={C.textTertiary}
                />
              </View>
            </>
          )}
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function Separator() {
  return <View style={styles.separator} />;
}

function FormField({
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
  keyboard?: "email-address" | "phone-pad";
}) {
  return (
    <View style={styles.formField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.textTertiary}
        keyboardType={keyboard || "default"}
        autoCapitalize={keyboard ? "none" : "words"}
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  modalHandle: { alignItems: "center", marginBottom: 8 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  navBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  navTitle: { fontSize: 17, fontWeight: "600", color: C.text },
  saveNavBtn: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 60,
    alignItems: "center",
  },
  saveNavText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  content: { padding: 20, gap: 8 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: `${C.danger}15`,
    borderRadius: 10,
    padding: 12,
    marginBottom: 4,
  },
  errorText: { color: C.danger, fontWeight: "500", fontSize: 14, flex: 1 },
  photoSection: { alignItems: "center", marginBottom: 8 },
  photo: { width: 88, height: 88, borderRadius: 22 },
  photoEdit: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: C.primary,
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: C.background,
  },
  photoButtons: { flexDirection: "row", gap: 12 },
  photoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: `${C.primary}12`,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: `${C.primary}30`,
  },
  photoBtnText: { fontSize: 14, fontWeight: "500", color: C.primary },
  photoHint: { fontSize: 12, fontWeight: "normal", color: C.textTertiary, marginTop: 8 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: C.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 4,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  formField: { padding: 14 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: C.textSecondary,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  fieldHint: { fontSize: 12, fontWeight: "normal", color: C.textTertiary },
  fieldInput: {
    fontSize: 16,
    fontWeight: "normal",
    color: C.text,
  },
  separator: { height: 1, backgroundColor: C.border, marginHorizontal: 14 },
  membershipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  membershipCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: "center",
    gap: 4,
  },
  membershipCardActive: {
    borderColor: C.primary,
    backgroundColor: `${C.primary}10`,
  },
  membershipLabel: { fontSize: 15, fontWeight: "600", color: C.textSecondary },
  membershipLabelActive: { color: C.primary },
  membershipDuration: { fontSize: 12, fontWeight: "normal", color: C.textTertiary },
  membershipDurationActive: { color: C.primary },
  expiryInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: `${C.primary}10`,
    borderRadius: 10,
    padding: 10,
  },
  expiryText: { fontSize: 13, fontWeight: "normal", color: C.textSecondary },
  expiryDate: { fontWeight: "600", color: C.primary },
  paidToggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.border,
    padding: 2,
    justifyContent: "center",
  },
  toggleActive: { backgroundColor: C.accent },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleThumbActive: { transform: [{ translateX: 22 }] },
  amountRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 },
  amountInput: {
    fontSize: 22,
    fontWeight: "bold",
    color: C.accent,
    textAlign: "right",
    minWidth: 100,
  },
});
