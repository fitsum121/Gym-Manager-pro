import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { parseAndVerifyCode } from "@/lib/license";
import { useAuth } from "@/context/AuthContext";
import { apiRequest, ApiError } from "@/context/apiClient";

const SUB_KEY_PREFIX = "gym_subscription_";

type Subscription = {
  code: string;
  expiryDate: string;
};

type SubState = {
  isLoading: boolean;
  subscription: Subscription | null;
  isActive: boolean;
  daysLeft: number;
  activate: (code: string) => Promise<{ ok: boolean; reason?: string }>;
  refresh: () => Promise<void>;
};

const SubscriptionContext = createContext<SubState | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { owner, logout } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSubscription = useCallback(async () => {
    if (!owner?.gymId) {
      setSubscription(null);
      setIsLoading(false);
      return;
    }

    // Step 1 — read local cache
    let localSub: Subscription | null = null;
    try {
      const raw = await AsyncStorage.getItem(SUB_KEY_PREFIX + owner.gymId);
      if (raw) localSub = JSON.parse(raw);
    } catch {
      localSub = null;
    }

    // Step 2 — always verify with server while isLoading is still true.
    // Even if there's no local sub, the server may tell us the account was deleted.
    // If there IS a local sub, the server may tell us it was revoked.
    try {
      const result = await apiRequest<{ active: boolean; tracked: boolean; reason?: string }>(
        "/api/auth/license-status"
      );
      if (!result.active) {
        // License revoked or expired server-side — wipe local copy → router sends to /activate
        await AsyncStorage.removeItem(SUB_KEY_PREFIX + owner.gymId);
        localSub = null;
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // 401 means the account was deleted by admin.
        // apiClient already cleared the session token — call logout() to clear
        // React state, then return early. The re-render from logout() will set
        // owner = null and index.tsx will redirect to login.
        // Do NOT call setIsLoading(false) here — logout() triggers a re-render
        // that re-runs loadSubscription with owner=null, which sets isLoading=false.
        await AsyncStorage.removeItem(SUB_KEY_PREFIX + owner.gymId);
        await logout();
        return; // ← critical: don't fall through to setSubscription/setIsLoading
      }
      // Any other error (network, 5xx) — fail open, keep local subscription
    }

    setSubscription(localSub);
    setIsLoading(false);
  }, [owner?.gymId, logout]);

  useEffect(() => {
    setSubscription(null);
    setIsLoading(true);
    loadSubscription();
  }, [loadSubscription]);

  // Re-verify when the app comes back to foreground
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === "active") {
        loadSubscription();
      }
    };
    const sub = AppState.addEventListener("change", handleAppState);
    return () => sub.remove();
  }, [loadSubscription]);

  const activate = useCallback(
    async (code: string): Promise<{ ok: boolean; reason?: string }> => {
      if (!owner?.gymId) return { ok: false, reason: "Not logged in." };

      // Validate the code locally first (works offline, instant feedback)
      const result = parseAndVerifyCode(code, owner.gymId);
      if (!result.valid || !result.expiryDate) {
        return { ok: false, reason: result.reason || "Invalid code." };
      }
      if (result.expiryDate.getTime() < Date.now()) {
        return { ok: false, reason: "This code has already expired." };
      }

      // Persist locally so the app works offline after activation
      const sub: Subscription = {
        code: code.trim().toUpperCase(),
        expiryDate: result.expiryDate.toISOString(),
      };
      await AsyncStorage.setItem(SUB_KEY_PREFIX + owner.gymId, JSON.stringify(sub));
      setSubscription(sub);

      // Notify the server so the admin panel reflects the activation.
      // Non-blocking — if the server is unreachable the local activation still works.
      apiRequest("/api/auth/activate", {
        method: "POST",
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      }).catch(() => {});

      return { ok: true };
    },
    [owner?.gymId]
  );

  const expiry = subscription ? new Date(subscription.expiryDate) : null;
  const isActive = !!expiry && expiry.getTime() > Date.now();
  const daysLeft = expiry
    ? Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <SubscriptionContext.Provider
      value={{ isLoading, subscription, isActive, daysLeft, activate, refresh: loadSubscription }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubState {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useSubscription must be used within SubscriptionProvider");
  return ctx;
}
