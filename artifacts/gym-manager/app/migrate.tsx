import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/context/apiClient";

const C = Colors.light;
const OLD_CUSTOMERS_KEY = "gym_customers";
const OLD_SESSION_KEY = "gym_session";
const OLD_OWNER_KEY = "gym_owner";

type OldCustomer = {
  id: string; ownerId: string; name: string; phone: string; email: string;
  membershipType: string; startDate: string; expiryDate: string;
  lastPaymentDate: string | null; isPaid: boolean; paymentAmount: number; notes: string; createdAt: string;
};

export default function MigrateScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [oldCustomers, setOldCustomers] = useState<OldCustomer[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(OLD_CUSTOMERS_KEY).then((raw) => {
      if (!raw) { finish(); return; }
      const all: OldCustomer[] = JSON.parse(raw);
      const mine = all.filter((c) => c.ownerId === session?.userId);
      if (mine.length === 0) { finish(); return; }
      setOldCustomers(mine);
    });
  }, []);

  const finish = async () => {
    await AsyncStorage.multiRemove([OLD_CUSTOMERS_KEY, OLD_SESSION_KEY, OLD_OWNER_KEY]);
    router.replace("/(tabs)");
  };

  const handleImport = async () => {
    setImporting(true);
    let count = 0;
    for (const c of oldCustomers) {
      try {
        await apiRequest("/api/members", {
          method: "POST",
          body: JSON.stringify({
            name: c.name, phone: c.phone, email: c.email,
            membershipType: c.membershipType, startDate: c.startDate,
            expiryDate: c.expiryDate, lastPaymentDate: c.lastPaymentDate,
            isPaid: c.isPaid, paymentAmount: c.paymentAmount, notes: c.notes,
          }),
        });
        count++;
        setProgress(count);
      } catch { /* skip duplicates or errors */ }
    }
    setDone(true);
    setImporting(false);
  };

  if (oldCustomers.length === 0) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
      <View style={styles.iconCircle}><Text style={{ fontSize: 36 }}>📦</Text></View>
      <Text style={styles.title}>{done ? "Import Complete" : "Import Your Data"}</Text>
      <Text style={styles.subtitle}>
        {done
          ? `${progress} of ${oldCustomers.length} members imported successfully.`
          : `We found ${oldCustomers.length} members stored on this device. Would you like to import them to your account?`}
      </Text>
      <Text style={styles.warning}>⚠ Note: member photos are stored locally and cannot be transferred.</Text>

      {importing && (
        <View style={styles.progressBox}>
          <ActivityIndicator color={C.primary} />
          <Text style={styles.progressText}>Importing {progress} of {oldCustomers.length}...</Text>
        </View>
      )}

      {!importing && !done && (
        <View style={styles.actions}>
          <Pressable style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.8 }]} onPress={finish}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.importBtn, pressed && { opacity: 0.85 }]} onPress={handleImport}>
            <Text style={styles.importText}>Import</Text>
          </Pressable>
        </View>
      )}

      {done && (
        <Pressable style={({ pressed }) => [styles.importBtn, pressed && { opacity: 0.85 }]} onPress={finish}>
          <Text style={styles.importText}>Continue</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background, padding: 24, alignItems: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.background },
  iconCircle: { width: 88, height: 88, borderRadius: 24, backgroundColor: `${C.primary}18`, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  title: { fontSize: 24, fontWeight: "bold", color: C.text, marginBottom: 10, textAlign: "center" },
  subtitle: { fontSize: 15, color: C.textSecondary, textAlign: "center", lineHeight: 22, marginBottom: 16 },
  warning: { fontSize: 13, color: C.warning, textAlign: "center", marginBottom: 24 },
  progressBox: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  progressText: { fontSize: 14, color: C.textSecondary },
  actions: { flexDirection: "row", gap: 12, width: "100%" },
  skipBtn: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, alignItems: "center" },
  skipText: { color: C.textSecondary, fontWeight: "600", fontSize: 15 },
  importBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: C.primary, alignItems: "center" },
  importText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
