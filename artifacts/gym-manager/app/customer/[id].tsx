import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useGym, MembershipType } from "@/context/GymContext";
import { useAuth } from "@/context/AuthContext";

const C = Colors.light;

const MEMBERSHIP_COLORS: Record<string, string> = {
  weekly: "#8B5CF6",
  monthly: C.primary,
  quarterly: C.accent,
  yearly: "#F59E0B",
};

const MEMBERSHIPS: { key: MembershipType; label: string }[] = [
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
  { key: "yearly", label: "Yearly" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function membershipStatus(startDate: string, expiryDate: string, type: MembershipType): string {
  const now = new Date();
  const start = new Date(startDate);
  const expiry = new Date(expiryDate);
  const daysSinceStart = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const msLeft = expiry.getTime() - now.getTime();
  if (msLeft < 0) {
    const days = Math.floor(Math.abs(msLeft) / (1000 * 60 * 60 * 24));
    if (days === 0) return "Expired today";
    if (days === 1) return "Expired yesterday";
    return `Expired ${days} days ago`;
  }
  if (daysSinceStart === 0) {
    if (type === "weekly") return "Expires in 1 week";
    if (type === "monthly") return "Expires in 1 month";
    if (type === "quarterly") return "Expires in 3 months";
    if (type === "yearly") return "Expires in 1 year";
  }
  const daysLeft = Math.floor(msLeft / (1000 * 60 * 60 * 24));
  if (daysLeft === 0) return "Expires today";
  if (daysLeft === 1) return "1 day left";
  if (daysLeft < 30) return `${daysLeft} days left`;
  const months = Math.floor(daysLeft / 30);
  const remainingDays = daysLeft % 30;
  if (remainingDays === 0) return `${months} month${months > 1 ? "s" : ""} left`;
  return `${daysLeft} days left`;
}

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { customers, deleteCustomer, recordPayment, updateCustomer } = useGym();
  const { owner } = useAuth();
  const customer = customers.find((c) => c.id === id);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editMembership, setEditMembership] = useState<MembershipType>("monthly");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);

  if (!customer) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 20, alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ fontSize: 40 }}>👤</Text>
        <Text style={styles.notFoundText}>Member not found</Text>
        <Pressable style={styles.backHomeBtn} onPress={() => router.back()}>
          <Text style={styles.backHomeBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const isActive = new Date(customer.expiryDate) > new Date();
  const membershipColor = MEMBERSHIP_COLORS[customer.membershipType] || C.primary;

  const initials = customer.name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const startEditing = () => {
    setEditName(customer.name);
    setEditPhone(customer.phone);
    setEditMembership(customer.membershipType);
    setEditNotes(customer.notes ?? "");
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!editName.trim() || !editPhone.trim()) {
      Alert.alert("Required", "Name and phone number are required.");
      return;
    }
    setSaving(true);
    await updateCustomer(customer.id, {
      name: editName.trim(),
      phone: editPhone.trim(),
      membershipType: editMembership,
      notes: editNotes.trim(),
    });
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaving(false);
    setEditing(false);
  };

  const handleDelete = async () => {
    const doDelete = async () => {
      setDeleting(true);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      try {
        await deleteCustomer(customer.id);
        router.back();
      } finally {
        setDeleting(false);
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm(`Remove ${customer.name}? This cannot be undone.`)) {
        await doDelete();
      }
    } else {
      Alert.alert(
        "Remove Member",
        `Are you sure you want to remove ${customer.name}?\n\nThis cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Remove", style: "destructive", onPress: doDelete },
        ]
      );
    }
  };

  const handlePayment = async () => {
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      if (Platform.OS === "web") {
        window.alert("Please enter a valid payment amount.");
      } else {
        Alert.alert("Invalid Amount", "Please enter a valid payment amount.");
      }
      return;
    }
    setProcessingPayment(true);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await recordPayment(customer.id, amount);
    setProcessingPayment(false);
    setShowPayment(false);
    setPaymentAmount("");
  };

  const handleChangePhoto = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      await updateCustomer(customer.id, { photoUri: result.assets[0].uri });
    }
  };

  const handleSendReminder = () => {
    if (!customer.phone) {
      Alert.alert("No Phone", "This member has no phone number saved.");
      return;
    }
    const expiryStr = new Date(customer.expiryDate).toLocaleDateString();
    const gymName = owner?.gymName ?? "Gym";
    const ownerPhone = owner?.phone ?? "";
    const message = isActive
      ? encodeURIComponent(
          `ሰላም ${customer.name}፣\n\nእርስዎ የ${gymName} አባል ናቸው። የአባልነት ጊዜዎ ${expiryStr} ያበቃል።\n\nለማናቸውም ጥያቄ ይደውሉ፡ ${ownerPhone}\n\n${gymName}`
        )
      : encodeURIComponent(
          `ሰላም ${customer.name}፣\n\nበ${gymName} ያለዎት የአባልነት ጊዜ አልቋል (${expiryStr})።\n\nእባክዎን ያድሱ። ለበለጠ መረጃ ይደውሉ፡ ${ownerPhone}\n\n${gymName}`
        );
    Linking.openURL(`sms:${customer.phone}?body=${message}`);
  };

  const editMembershipColor = MEMBERSHIP_COLORS[editMembership] || C.primary;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.heroSection, { paddingTop: insets.top + 16 }]}>
        <View style={styles.topBar}>
          <Pressable
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
            onPress={() => (editing ? setEditing(false) : router.back())}
          >
            <Text style={styles.backArrow}>{editing ? "✕" : "←"}</Text>
          </Pressable>
          <View style={styles.topBarRight}>
            {editing ? (
              <Pressable
                style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]}
                onPress={handleSaveEdit}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </Pressable>
            ) : (
              <>
                <Pressable
                  style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.7 }]}
                  onPress={startEditing}
                >
                  <Text style={styles.editBtnText}>✏ Edit</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>

        <View style={styles.avatarSection}>
          <Pressable onPress={handleChangePhoto}>
            {customer.photoUri ? (
              <Image source={{ uri: customer.photoUri }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: `${membershipColor}22` }]}>
                <Text style={[styles.avatarInitials, { color: membershipColor }]}>{initials}</Text>
              </View>
            )}
            <View style={styles.cameraOverlay}>
              <Text style={{ fontSize: 12, color: "#fff" }}>📷</Text>
            </View>
          </Pressable>

          {editing ? (
            <TextInput
              style={styles.nameInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Full name"
              placeholderTextColor={C.textTertiary}
              autoCapitalize="words"
              autoCorrect={false}
            />
          ) : (
            <Text style={styles.name}>{customer.name}</Text>
          )}

          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: `${editing ? editMembershipColor : membershipColor}18` }]}>
              <Text style={[styles.badgeText, { color: editing ? editMembershipColor : membershipColor }]}>
                {editing ? editMembership : customer.membershipType}
              </Text>
            </View>
            {!editing && (
              <View style={[styles.badge, { backgroundColor: isActive ? `${C.accent}15` : `${C.danger}15` }]}>
                <View style={[styles.statusDot, { backgroundColor: isActive ? C.accent : C.danger }]} />
                <Text style={[styles.badgeText, { color: isActive ? C.accent : C.danger }]}>
                  {isActive ? "Active" : "Expired"}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      <View style={styles.body}>
        {editing ? (
          <>
            <SectionHeader title="Personal Info" />
            <View style={styles.card}>
              <View style={styles.editField}>
                <Text style={styles.editLabel}>PHONE</Text>
                <TextInput
                  style={styles.editInput}
                  value={editPhone}
                  onChangeText={setEditPhone}
                  keyboardType="phone-pad"
                  placeholder="+251 912 345 678"
                  placeholderTextColor={C.textTertiary}
                  autoCapitalize="none"
                />
              </View>
            </View>

            <SectionHeader title="Membership Type" />
            <View style={styles.membershipGrid}>
              {MEMBERSHIPS.map((m) => {
                const mColor = MEMBERSHIP_COLORS[m.key];
                const isSelected = editMembership === m.key;
                return (
                  <Pressable
                    key={m.key}
                    style={[
                      styles.membershipCard,
                      isSelected && { borderColor: mColor, backgroundColor: `${mColor}10` },
                    ]}
                    onPress={() => {
                      setEditMembership(m.key);
                      Haptics.selectionAsync();
                    }}
                  >
                    <Text style={[styles.membershipLabel, isSelected && { color: mColor }]}>
                      {m.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <SectionHeader title="Notes" />
            <View style={styles.card}>
              <TextInput
                style={styles.notesInput}
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Add notes about this member..."
                placeholderTextColor={C.textTertiary}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </>
        ) : (
          <>
            <Pressable
              style={({ pressed }) => [styles.smsBtn, pressed && { opacity: 0.85 }]}
              onPress={handleSendReminder}
            >
              <Text style={styles.smsBtnText}>
                {isActive ? "📩 Send Payment Reminder (SMS)" : "📩 Send Renewal Reminder (SMS)"}
              </Text>
            </Pressable>

            {!customer.isPaid && (
              <View style={styles.unpaidWarning}>
                <Text style={{ fontSize: 16 }}>⚠️</Text>
                <Text style={styles.unpaidWarningText}>
                  Payment overdue — members whose membership expires are auto-deleted after 7 days
                </Text>
              </View>
            )}

            {showPayment ? (
              <View style={styles.paymentCard}>
                <Text style={styles.paymentTitle}>{isActive ? "Record Payment" : "Renew Membership"}</Text>
                <View style={styles.amountWrap}>
                  <Text style={styles.currencySign}>ETB</Text>
                  <TextInput
                    style={styles.amountInput}
                    value={paymentAmount}
                    onChangeText={setPaymentAmount}
                    keyboardType="numeric"
                    placeholder="0.00"
                    placeholderTextColor={C.textTertiary}
                    autoFocus
                  />
                </View>
                <View style={styles.paymentActions}>
                  <Pressable
                    style={styles.cancelPayBtn}
                    onPress={() => {
                      setShowPayment(false);
                      setPaymentAmount("");
                    }}
                  >
                    <Text style={styles.cancelPayText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.confirmPayBtn, pressed && { opacity: 0.85 }]}
                    onPress={handlePayment}
                    disabled={processingPayment}
                  >
                    {processingPayment ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.confirmPayText}>✓ Confirm</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.payBtn, pressed && { opacity: 0.85 }]}
                onPress={() => {
                  setShowPayment(true);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }}
              >
                <Text style={styles.payBtnText}>{isActive ? "Record Payment" : "🔄 Renew Membership"}</Text>
              </Pressable>
            )}

            <SectionHeader title="Membership Details" />
            <View style={styles.card}>
              <InfoRow label="Start Date" value={formatDate(customer.startDate)} />
              <View style={styles.divider} />
              <InfoRow
                label="Expiry Date"
                value={formatDate(customer.expiryDate)}
                valueColor={isActive ? undefined : C.danger}
              />
              <View style={styles.divider} />
              <InfoRow
                label="Status"
                value={membershipStatus(customer.startDate, customer.expiryDate, customer.membershipType)}
                valueColor={isActive ? C.accent : C.danger}
              />
            </View>

            <SectionHeader title="Contact Info" />
            <View style={styles.card}>
              <InfoRow label="Phone" value={customer.phone} />
            </View>

            <SectionHeader title="Payment Info" />
            <View style={styles.card}>
              <InfoRow
                label="Status"
                value={customer.isPaid ? "Paid" : "Unpaid"}
                valueColor={customer.isPaid ? C.accent : C.danger}
              />
              <View style={styles.divider} />
              <InfoRow
                label="Last Payment"
                value={customer.isPaid ? `ETB ${customer.paymentAmount}` : "—"}
              />
              <View style={styles.divider} />
              <InfoRow
                label="Payment Date"
                value={customer.lastPaymentDate ? formatDateShort(customer.lastPaymentDate) : "—"}
              />
            </View>

            {customer.notes ? (
              <>
                <SectionHeader title="Notes" />
                <View style={[styles.card, { padding: 14 }]}>
                  <Text style={styles.notes}>{customer.notes}</Text>
                </View>
              </>
            ) : null}

            <Text style={styles.memberSince}>
              Member since {formatDate(customer.createdAt)}
            </Text>

            {/* Danger zone — kept at the bottom so it's intentional to reach */}
            <View style={styles.dangerZone}>
              <Text style={styles.dangerZoneLabel}>Danger Zone</Text>
              <Pressable
                style={({ pressed }) => [
                  styles.deleteBtn,
                  pressed && { opacity: 0.85 },
                  deleting && { opacity: 0.6 },
                ]}
                onPress={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator color={C.danger} size="small" />
                ) : (
                  <>
                    <Text style={styles.deleteBtnIcon}>🗑</Text>
                    <Text style={styles.deleteBtnText}>Remove Member</Text>
                  </>
                )}
              </Pressable>
              <Text style={styles.dangerZoneHint}>
                Permanently removes this member and all their data.
              </Text>
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, valueColor ? { color: valueColor } : undefined]}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  heroSection: { backgroundColor: C.surface, paddingBottom: 28, borderBottomWidth: 1, borderBottomColor: C.border },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  topBarRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
  },
  backArrow: { fontSize: 20, color: C.text, lineHeight: 24 },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: `${C.primary}15`,
    borderWidth: 1.5,
    borderColor: C.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  editBtnText: { color: C.primary, fontWeight: "600", fontSize: 14 },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: `${C.danger}10`,
    borderWidth: 1.5,
    borderColor: `${C.danger}50`,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  deleteBtnIcon: { fontSize: 16 },
  deleteBtnText: { color: C.danger, fontWeight: "700", fontSize: 15 },
  dangerZone: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: `${C.danger}30`,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    backgroundColor: `${C.danger}05`,
  },
  dangerZoneLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: C.danger,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  dangerZoneHint: {
    fontSize: 12,
    color: C.textTertiary,
    textAlign: "center",
  },
  saveBtn: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 8,
    minWidth: 64,
    alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  avatarSection: { alignItems: "center", gap: 10 },
  avatar: { width: 88, height: 88, borderRadius: 24 },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: { fontSize: 32, fontWeight: "bold" },
  cameraOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: C.primary,
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: C.surface,
  },
  name: { fontSize: 24, fontWeight: "bold", color: C.text },
  nameInput: {
    fontSize: 22,
    fontWeight: "bold",
    color: C.text,
    borderBottomWidth: 2,
    borderBottomColor: C.primary,
    paddingVertical: 4,
    paddingHorizontal: 8,
    minWidth: 180,
    textAlign: "center",
  },
  badges: { flexDirection: "row", gap: 8 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  body: { padding: 20, gap: 10 },
  smsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: `${C.primary}15`,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: C.primary,
  },
  smsBtnText: { color: C.primary, fontSize: 15, fontWeight: "600" },
  unpaidWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: `${C.warning}15`,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: `${C.warning}30`,
  },
  unpaidWarningText: { flex: 1, fontSize: 13, fontWeight: "500", color: C.warning },
  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.accent,
    borderRadius: 14,
    padding: 15,
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  payBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  paymentCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1.5,
    borderColor: C.accent,
    gap: 16,
  },
  paymentTitle: { fontSize: 16, fontWeight: "bold", color: C.text },
  amountWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  currencySign: { fontSize: 16, fontWeight: "bold", color: C.textSecondary },
  amountInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: "bold",
    color: C.accent,
    paddingVertical: 12,
    minWidth: 0,
  },
  paymentActions: { flexDirection: "row", gap: 10 },
  cancelPayBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: "center",
  },
  cancelPayText: { color: C.textSecondary, fontWeight: "600", fontSize: 14 },
  confirmPayBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 12,
    borderRadius: 10,
    backgroundColor: C.accent,
  },
  confirmPayText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "600",
    color: C.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 6,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  editField: { padding: 14 },
  editLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: C.textSecondary,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  editInput: {
    fontSize: 16,
    color: C.text,
    borderBottomWidth: 1.5,
    borderBottomColor: C.border,
    paddingVertical: 6,
  },
  membershipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  membershipCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: "center",
  },
  membershipLabel: { fontSize: 14, fontWeight: "600", color: C.textSecondary },
  notesInput: {
    fontSize: 14,
    color: C.text,
    padding: 14,
    minHeight: 80,
    lineHeight: 20,
  },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14 },
  infoContent: { flex: 1 },
  infoLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: C.textTertiary,
    marginBottom: 3,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  infoValue: { fontSize: 15, fontWeight: "500", color: C.text },
  divider: { height: 1, backgroundColor: C.border, marginHorizontal: 14 },
  notes: { fontSize: 14, color: C.text, lineHeight: 20 },
  memberSince: {
    textAlign: "center",
    fontSize: 12,
    color: C.textTertiary,
    marginTop: 10,
  },
  notFoundText: { fontSize: 18, fontWeight: "600", color: C.textSecondary, marginTop: 12 },
  backHomeBtn: {
    marginTop: 16,
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backHomeBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
