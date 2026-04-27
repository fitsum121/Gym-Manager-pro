import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";
import type { Customer } from "@/context/GymContext";

const C = Colors.light;

type Props = {
  customer: Customer;
};

const MEMBERSHIP_COLORS: Record<string, string> = {
  weekly: "#8B5CF6",
  monthly: C.primary,
  quarterly: C.accent,
  yearly: "#F59E0B",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Computed once per JS tick — not inside the render loop
const now = new Date();

function isAfterNow(iso: string): boolean {
  return new Date(iso) > now;
}

export default function CustomerCard({ customer }: Props) {
  const isActive = isAfterNow(customer.expiryDate);
  const expiryLabel = formatDate(customer.expiryDate);
  const membershipColor = MEMBERSHIP_COLORS[customer.membershipType] || C.primary;

  const handlePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: "/customer/[id]", params: { id: customer.id } });
  };

  const initials = customer.name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={handlePress}
    >
      <View style={styles.avatarContainer}>
        {customer.photoUri ? (
          <Image source={{ uri: customer.photoUri }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: `${membershipColor}22` }]}>
            <Text style={[styles.initials, { color: membershipColor }]}>{initials}</Text>
          </View>
        )}
        <View style={[styles.statusDot, { backgroundColor: isActive ? C.accent : C.danger }]} />
      </View>

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{customer.name}</Text>
          <View style={[styles.badge, { backgroundColor: `${membershipColor}18` }]}>
            <Text style={[styles.badgeText, { color: membershipColor }]}>
              {customer.membershipType}
            </Text>
          </View>
        </View>
        <Text style={styles.phone} numberOfLines={1}>{customer.phone}</Text>
        <View style={styles.expiryRow}>
          <Feather
            name="calendar"
            size={11}
            color={isActive ? C.textTertiary : C.danger}
          />
          <Text style={[styles.expiry, !isActive && styles.expired]}>
            {isActive ? "Until " : "Expired "}{expiryLabel}
          </Text>
        </View>
      </View>

      <View style={styles.right}>
        {customer.isPaid ? (
          <View style={styles.paidBadge}>
            <Feather name="check" size={12} color={C.accent} />
            <Text style={styles.paidText}>Paid</Text>
          </View>
        ) : (
          <View style={styles.unpaidBadge}>
            <Text style={styles.unpaidText}>Unpaid</Text>
          </View>
        )}
        <Feather name="chevron-right" size={16} color={C.textTertiary} style={styles.arrow} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  avatarContainer: { position: "relative" },
  avatar: { width: 48, height: 48, borderRadius: 14 },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: { fontSize: 17, fontWeight: "bold" },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    position: "absolute",
    bottom: -1,
    right: -1,
    borderWidth: 2,
    borderColor: C.surface,
  },
  info: { flex: 1, gap: 3 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontSize: 15, fontWeight: "600", color: C.text, flex: 1 },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 10, fontWeight: "600", textTransform: "capitalize" },
  phone: { fontSize: 13, fontWeight: "normal", color: C.textSecondary },
  expiryRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  expiry: { fontSize: 11, fontWeight: "normal", color: C.textTertiary },
  expired: { color: C.danger },
  right: { alignItems: "flex-end", gap: 4 },
  paidBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: `${C.accent}18`,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  paidText: { fontSize: 11, fontWeight: "600", color: C.accent },
  unpaidBadge: {
    backgroundColor: `${C.danger}15`,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  unpaidText: { fontSize: 11, fontWeight: "600", color: C.danger },
  arrow: { marginTop: 2 },
});
