import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiRequest, ApiError } from "./apiClient";

const SESSION_KEY = "gym_session_v2";

export type Role = "owner" | "staff";

export type SessionUser = {
  userId: string;
  gymId: string;
  role: Role;
  name: string;
  gymName?: string;   // only for owners
  email?: string;     // only for owners
  phone?: string;     // only for owners
  token: string;
};

// Backward-compat alias — existing screens that read owner?.X continue to work
export type GymOwner = SessionUser & {
  id: string;
  gymId: string;
  gymName: string;
  email: string;
  phone: string;
  password: string; // not used in API mode, kept for type compat
};

type AuthState = {
  session: SessionUser | null;
  // Backward-compat shim — same object as session, typed loosely
  owner: SessionUser | null;
  isLoading: boolean;
  loginOwner: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  loginStaff: (gymId: string, username: string, pin: string) => Promise<{ ok: boolean; error?: string }>;
  login: (email: string, password: string) => Promise<boolean>; // compat alias
  register: (data: { name: string; gymName: string; phone: string; email: string; password: string }) => Promise<boolean>;
  logout: () => Promise<void>;
  updateOwner: (data: Partial<SessionUser>) => Promise<void>;
  updateProfile: (data: { name?: string; gymName?: string; phone?: string }) => Promise<{ ok: boolean; error?: string }>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  verifyIdentity: (email: string, phone: string) => Promise<{ verified: boolean; resetToken?: string }>;
  resetPassword: (resetToken: string, newPassword: string) => Promise<boolean>;
};

const AuthContext = createContext<AuthState | null>(null);

function decodeTokenExpiry(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]!));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const exp = decodeTokenExpiry(token);
  if (exp === null) return true;
  return Date.now() >= exp;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on startup
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SESSION_KEY);
        if (raw) {
          const stored: SessionUser = JSON.parse(raw);
          if (stored.token && !isTokenExpired(stored.token)) {
            setSession(stored);
          } else {
            // Token expired — clear it
            await AsyncStorage.removeItem(SESSION_KEY);
          }
        }
      } catch {
        await AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
      }
      setIsLoading(false);
    })();
  }, []);

  const persistSession = useCallback(async (s: SessionUser) => {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s));
    setSession(s);
  }, []);

  const loginOwner = useCallback(async (email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const data = await apiRequest<{ token: string; owner: { id: string; gymId: string; name: string; gymName: string; phone: string; email: string } }>(
        "/api/auth/owner/login",
        { method: "POST", body: JSON.stringify({ email, password }) }
      );
      const s: SessionUser = {
        userId: data.owner.id,
        gymId: data.owner.gymId,
        role: "owner",
        name: data.owner.name,
        gymName: data.owner.gymName,
        email: data.owner.email,
        phone: data.owner.phone,
        token: data.token,
      };
      await persistSession(s);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof ApiError ? err.message : "Login failed." };
    }
  }, [persistSession]);

  // Backward-compat alias
  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    const result = await loginOwner(email, password);
    return result.ok;
  }, [loginOwner]);

  const loginStaff = useCallback(async (gymId: string, username: string, pin: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const data = await apiRequest<{ token: string; staff: { id: string; gymId: string; name: string; role: "staff" } }>(
        "/api/staff/login",
        { method: "POST", body: JSON.stringify({ gymId: gymId.toUpperCase(), username: username.toLowerCase(), pin }) }
      );
      const s: SessionUser = {
        userId: data.staff.id,
        gymId: data.staff.gymId,
        role: "staff",
        name: data.staff.name,
        token: data.token,
      };
      await persistSession(s);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof ApiError ? err.message : "Login failed." };
    }
  }, [persistSession]);

  const register = useCallback(async (data: { name: string; gymName: string; phone: string; email: string; password: string }): Promise<boolean> => {
    try {
      const res = await apiRequest<{ token: string; owner: { id: string; gymId: string; name: string; gymName: string; phone: string; email: string } }>(
        "/api/auth/owner/register",
        { method: "POST", body: JSON.stringify(data) }
      );
      const s: SessionUser = {
        userId: res.owner.id,
        gymId: res.owner.gymId,
        role: "owner",
        name: res.owner.name,
        gymName: res.owner.gymName,
        email: res.owner.email,
        phone: res.owner.phone,
        token: res.token,
      };
      await persistSession(s);
      return true;
    } catch {
      return false;
    }
  }, [persistSession]);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    setSession(null);
  }, []);

  const updateProfile = useCallback(async (data: { name?: string; gymName?: string; phone?: string }): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await apiRequest<{ id: string; gymId: string; name: string; gymName: string; phone: string; email: string }>(
        "/api/auth/owner/profile",
        { method: "PATCH", body: JSON.stringify(data) }
      );
      if (session) {
        const updated: SessionUser = {
          ...session,
          name: res.name,
          gymName: res.gymName,
          phone: res.phone,
        };
        await persistSession(updated);
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof ApiError ? err.message : "Update failed." };
    }
  }, [session, persistSession]);

  // Backward-compat alias
  const updateOwner = useCallback(async (data: Partial<SessionUser>) => {
    await updateProfile({ name: data.name, gymName: data.gymName, phone: data.phone });
  }, [updateProfile]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string): Promise<boolean> => {
    try {
      await apiRequest("/api/auth/owner/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  const verifyIdentity = useCallback(async (email: string, phone: string): Promise<{ verified: boolean; resetToken?: string }> => {
    try {
      const res = await apiRequest<{ verified: boolean; resetToken?: string }>("/api/auth/owner/verify-identity", {
        method: "POST",
        body: JSON.stringify({ email, phone }),
      });
      return res;
    } catch {
      return { verified: false };
    }
  }, []);

  const resetPassword = useCallback(async (resetToken: string, newPassword: string): Promise<boolean> => {
    try {
      await apiRequest("/api/auth/owner/reset-password", {
        method: "POST",
        body: JSON.stringify({ resetToken, newPassword }),
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      session,
      owner: session, // backward-compat shim
      isLoading,
      loginOwner,
      loginStaff,
      login,
      register,
      logout,
      updateOwner,
      updateProfile,
      changePassword,
      verifyIdentity,
      resetPassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
