import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { apiRequest, ApiError } from "./apiClient";

export type MembershipType = "monthly" | "quarterly" | "yearly" | "weekly";

export type Customer = {
  id: string;
  ownerId: string;  // kept for compat — maps to gymId on server
  name: string;
  phone: string;
  email: string;
  photoUri: string | null;
  membershipType: MembershipType;
  startDate: string;
  expiryDate: string;
  lastPaymentDate: string | null;
  isPaid: boolean;
  paymentAmount: number;
  notes: string;
  createdAt: string;
};

type ServerMember = {
  id: string;
  gymId: string;
  name: string;
  phone: string;
  email: string;
  membershipType: string;
  startDate: string;
  expiryDate: string;
  lastPaymentDate: string | null;
  isPaid: boolean;
  paymentAmount: number;  // server normalises numeric → number before sending
  notes: string;
  createdAt: string;
  updatedAt: string;
};

type GymState = {
  customers: Customer[];
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  addCustomer: (data: Omit<Customer, "id" | "ownerId" | "createdAt">) => Promise<void>;
  updateCustomer: (id: string, data: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  recordPayment: (id: string, amount: number) => Promise<void>;
  refresh: () => Promise<void>;
};

const PHOTO_KEY_PREFIX = "gym_photo_";

const GymContext = createContext<GymState | null>(null);

// Convert server member shape → local Customer shape
async function serverToCustomer(m: ServerMember): Promise<Customer> {
  let photoUri: string | null = null;
  try {
    photoUri = await AsyncStorage.getItem(PHOTO_KEY_PREFIX + m.id);
  } catch {}
  return {
    id: m.id,
    ownerId: m.gymId,
    name: m.name,
    phone: m.phone,
    email: m.email,
    photoUri,
    membershipType: m.membershipType as MembershipType,
    startDate: m.startDate,
    expiryDate: m.expiryDate,
    lastPaymentDate: m.lastPaymentDate,
    isPaid: m.isPaid,
    paymentAmount: m.paymentAmount,  // already a number — no parseFloat needed
    notes: m.notes,
    createdAt: m.createdAt,
  };
}

export function GymProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const loadCustomers = useCallback(async () => {
    if (!session) {
      setCustomers([]);
      setIsLoading(false);
      return;
    }
    try {
      const data = await apiRequest<{ members: ServerMember[] }>("/api/members");
      const converted = await Promise.all(data.members.map(serverToCustomer));
      setCustomers(converted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    }
    setIsLoading(false);
  }, [session]);

  // Run cleanup once when the session is established (app open / login).
  // Kept separate from loadCustomers so that a manual refresh doesn't
  // re-trigger deletion — cleanup is an intentional, explicit action.
  const runCleanup = useCallback(async () => {
    if (!session) return;
    try {
      await apiRequest("/api/members/cleanup", { method: "POST" });
    } catch {
      // Cleanup failure is non-fatal — silently ignore so the app still loads.
    }
  }, [session]);

  useEffect(() => {
    setIsLoading(true);
    // Fire cleanup first, then load the (now-pruned) member list.
    runCleanup().then(() => loadCustomers());
  }, [runCleanup, loadCustomers]);

  const addCustomer = useCallback(
    async (data: Omit<Customer, "id" | "ownerId" | "createdAt">) => {
      if (!session) return;
      try {
        const body = {
          name: data.name,
          phone: data.phone,
          email: data.email,
          membershipType: data.membershipType,
          startDate: data.startDate,
          expiryDate: data.expiryDate,
          lastPaymentDate: data.lastPaymentDate,
          isPaid: data.isPaid,
          paymentAmount: data.paymentAmount,
          notes: data.notes,
        };
        const res = await apiRequest<{ member: ServerMember }>("/api/members", {
          method: "POST",
          body: JSON.stringify(body),
        });
        // Store photo locally keyed by server-assigned ID
        if (data.photoUri) {
          await AsyncStorage.setItem(PHOTO_KEY_PREFIX + res.member.id, data.photoUri);
        }
        const newCustomer = await serverToCustomer(res.member);
        setCustomers((prev) => [newCustomer, ...prev]);
      } catch (err) {
        if (err instanceof ApiError) setError(err.message);
        throw err;
      }
    },
    [session]
  );

  const updateCustomer = useCallback(
    async (id: string, data: Partial<Customer>) => {
      if (!session) return;
      try {
        const body: Record<string, unknown> = {};
        if (data.name !== undefined) body.name = data.name;
        if (data.phone !== undefined) body.phone = data.phone;
        if (data.email !== undefined) body.email = data.email;
        if (data.membershipType !== undefined) body.membershipType = data.membershipType;
        if (data.startDate !== undefined) body.startDate = data.startDate;
        if (data.expiryDate !== undefined) body.expiryDate = data.expiryDate;
        if (data.lastPaymentDate !== undefined) body.lastPaymentDate = data.lastPaymentDate;
        if (data.isPaid !== undefined) body.isPaid = data.isPaid;
        if (data.paymentAmount !== undefined) body.paymentAmount = data.paymentAmount;
        if (data.notes !== undefined) body.notes = data.notes;

        // Handle photo locally
        if (data.photoUri !== undefined) {
          if (data.photoUri) {
            await AsyncStorage.setItem(PHOTO_KEY_PREFIX + id, data.photoUri);
          } else {
            await AsyncStorage.removeItem(PHOTO_KEY_PREFIX + id);
          }
        }

        if (Object.keys(body).length > 0) {
          const res = await apiRequest<{ member: ServerMember }>(`/api/members/${id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
          const updated = await serverToCustomer(res.member);
          setCustomers((prev) => prev.map((c) => (c.id === id ? updated : c)));
        } else if (data.photoUri !== undefined) {
          // Photo-only update — refresh local state
          setCustomers((prev) =>
            prev.map((c) => (c.id === id ? { ...c, photoUri: data.photoUri ?? null } : c))
          );
        }
      } catch (err) {
        if (err instanceof ApiError) setError(err.message);
        throw err;
      }
    },
    [session]
  );

  const deleteCustomer = useCallback(
    async (id: string) => {
      if (!session) return;
      try {
        await apiRequest(`/api/members/${id}`, { method: "DELETE" });
        await AsyncStorage.removeItem(PHOTO_KEY_PREFIX + id);
        setCustomers((prev) => prev.filter((c) => c.id !== id));
      } catch (err) {
        if (err instanceof ApiError) setError(err.message);
        throw err;
      }
    },
    [session]
  );

  const recordPayment = useCallback(
    async (id: string, amount: number) => {
      if (!session) return;
      try {
        const res = await apiRequest<{ member: ServerMember }>(`/api/members/${id}/payment`, {
          method: "POST",
          body: JSON.stringify({ amount }),
        });
        const updated = await serverToCustomer(res.member);
        setCustomers((prev) => prev.map((c) => (c.id === id ? updated : c)));
      } catch (err) {
        if (err instanceof ApiError) setError(err.message);
        throw err;
      }
    },
    [session]
  );

  return (
    <GymContext.Provider
      value={{
        customers,
        isLoading,
        error,
        clearError,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        recordPayment,
        refresh: loadCustomers,
      }}
    >
      {children}
    </GymContext.Provider>
  );
}

export function useGym(): GymState {
  const ctx = useContext(GymContext);
  if (!ctx) throw new Error("useGym must be used within GymProvider");
  return ctx;
}
