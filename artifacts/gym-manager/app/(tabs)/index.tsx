import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import CustomerCard from "@/components/CustomerCard";
import { useGym } from "@/context/GymContext";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/context/SubscriptionContext";

const C = Colors.light;

type FilterType = "all" | "active" | "expired" | "unpaid";

export default function MembersScreen() {
  const insets = useSafeAreaInsets();
  const { owner, logout } = useAuth();
  const { daysLeft } = useSubscription();
  const { customers, isLoading, refresh, error, clearError } = useGym();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [refreshing, setRefreshing] = useState(false);

  const stats = useMemo(() => {
    const total = customers.length;
    const active = customers.filter((c) => new Date(c.expiryDate) > new Date()).length;
    const unpaid = customers.filter((c) => !c.isPaid).length;
    return { total, active, expired: total - active, unpaid };
  }, [customers]);

  const filtered = useMemo(() => {
    let list = customers;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          c.email.toLowerCase().includes(q)
      );
    }
    if (filter === "active") list = list.filter((c) => new Date(c.expiryDate) > new Date());
    if (filter === "expired") list = list.filter((c) => new Date(c.expiryDate) <= new Date());
    if (filter === "unpaid") list = list.filter((c) => !c.isPaid);
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [customers, search, filter]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const handleAdd = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/customer/add");
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {owner?.name?.split(" ")[0]} 👋</Text>
          <Text style={styles.gymName}>{owner?.gymName ?? owner?.name}</Text>
        </View>
        {owner?.role === "staff" ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
              onPress={handleAdd}
            >
              <Text style={styles.addBtnText}>+ Add</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.addBtn, { backgroundColor: C.danger }, pressed && { opacity: 0.85 }]}
              onPress={async () => {
                await logout();
                router.replace("/(auth)/login");
              }}
            >
              <Text style={styles.addBtnText}>Sign Out</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
            onPress={handleAdd}
          >
            <Text style={styles.addBtnText}>+ Add</Text>
          </Pressable>
        )}
      </View>

      {error ? (
        <Pressable style={styles.errorBanner} onPress={clearError}>
          <Text style={styles.errorBannerText}>⚠ {error}</Text>
          <Text style={styles.errorBannerDismiss}>✕</Text>
        </Pressable>
      ) : null}

      {daysLeft <= 7 && daysLeft > 0 ? (
        <Pressable
          style={[styles.subBanner, daysLeft <= 3 && styles.subBannerUrgent]}
          onPress={() => router.push("/activate")}
        >
          <Text style={styles.subBannerIcon}>⚠</Text>
          <Text style={styles.subBannerText}>
            Subscription expires in {daysLeft} day{daysLeft > 1 ? "s" : ""} — tap to renew
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.statsRow}>
        <StatPill label="Total" value={stats.total} color={C.primary} />
        <StatPill label="Active" value={stats.active} color={C.accent} />
        <StatPill label="Expired" value={stats.expired} color={C.warning} />
        <StatPill label="Unpaid" value={stats.unpaid} color={C.danger} />
      </View>

      <View style={styles.searchBar}>
        <Feather name="search" size={16} color={C.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="አባላትን ፈልግ..."
          placeholderTextColor={C.textTertiary}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <Pressable onPress={() => setSearch("")}>
            <Feather name="x" size={16} color={C.textTertiary} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.filters}>
        {(["all", "active", "expired", "unpaid"] as FilterType[]).map((f) => (
          <Pressable
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => {
              setFilter(f);
              Haptics.selectionAsync();
            }}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <CustomerCard customer={item} />}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 100 },
          ]}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Feather name="users" size={32} color={C.textTertiary} />
              </View>
              <Text style={styles.emptyTitle}>No members found</Text>
              <Text style={styles.emptySubtitle}>
                {search ? "Try a different search term" : "Tap the + button to add your first member"}
              </Text>
              {!search && (
                <Pressable
                  style={({ pressed }) => [styles.emptyBtn, pressed && { opacity: 0.85 }]}
                  onPress={handleAdd}
                >
                  <Feather name="user-plus" size={16} color="#fff" />
                  <Text style={styles.emptyBtnText}>Add Member</Text>
                </Pressable>
              )}
            </View>
          }
        />
      )}
    </View>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: `${color}12` }]}>
      <Text style={[styles.pillValue, { color }]}>{value}</Text>
      <Text style={[styles.pillLabel, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  greeting: { fontSize: 14, fontWeight: "normal", color: C.textSecondary, marginBottom: 2 },
  gymName: { fontSize: 22, fontWeight: "bold", color: C.text },
  addBtn: {
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  addBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  pill: {
    flex: 1,
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
    gap: 2,
  },
  pillValue: { fontSize: 18, fontWeight: "bold" },
  pillLabel: { fontSize: 10, fontWeight: "500", textTransform: "uppercase", letterSpacing: 0.3 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "normal",
    color: C.text,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: `${C.danger}15`,
    borderWidth: 1,
    borderColor: C.danger,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  errorBannerText: { flex: 1, fontSize: 13, fontWeight: "500", color: C.danger },
  errorBannerDismiss: { fontSize: 14, color: C.danger, marginLeft: 8 },
  subBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: `${C.warning}15`,
    borderWidth: 1.5,
    borderColor: C.warning,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  subBannerUrgent: {
    backgroundColor: `${C.danger}15`,
    borderColor: C.danger,
  },
  subBannerIcon: { fontSize: 18 },
  subBannerText: { flex: 1, fontSize: 13, fontWeight: "600", color: C.text },
  filters: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  filterChipActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  filterText: { fontSize: 12, fontWeight: "500", color: C.textSecondary },
  filterTextActive: { color: "#fff" },
  list: { paddingHorizontal: 20 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", marginTop: 80 },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: C.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: C.text },
  emptySubtitle: { fontSize: 14, fontWeight: "normal", color: C.textSecondary, textAlign: "center", paddingHorizontal: 40 },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 8,
  },
  emptyBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
