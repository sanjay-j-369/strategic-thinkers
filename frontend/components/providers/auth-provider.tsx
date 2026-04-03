"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { apiFetch } from "@/lib/api";

const STORAGE_KEY = "founder-os-session";
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export interface AuthUser {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  google_connected: boolean;
  slack_connected: boolean;
  google_last_synced_at: string | null;
  slack_last_synced_at: string | null;
}

interface StoredSession {
  token: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  setSession: (token: string, user: AuthUser) => void;
  refreshSession: () => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function writeStoredSession(session: StoredSession | null) {
  if (typeof window === "undefined") return;
  if (!session) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const setSession = useCallback((nextToken: string, nextUser: AuthUser) => {
    setToken(nextToken);
    setUser(nextUser);
    writeStoredSession({ token: nextToken, user: nextUser });
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
    writeStoredSession(null);
  }, []);

  const refreshSession = useCallback(async () => {
    async function attemptDemoSession() {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const data = await apiFetch<{ token: string; user: AuthUser }>(
            "/api/auth/demo-session",
            { method: "POST" }
          );
          setSession(data.token, data.user);
          return true;
        } catch {
          if (attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 1200));
          }
        }
      }
      return false;
    }

    const stored = readStoredSession();
    if (!stored?.token) {
      if (DEMO_MODE) {
        setLoading(true);
        const ok = await attemptDemoSession();
        if (!ok) {
          signOut();
        }
        setLoading(false);
        return;
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await apiFetch<{ user: AuthUser }>("/api/auth/me", {
        token: stored.token,
      });
      setSession(stored.token, data.user);
    } catch {
      if (DEMO_MODE) {
        const ok = await attemptDemoSession();
        if (!ok) {
          signOut();
        }
      } else {
        signOut();
      }
    } finally {
      setLoading(false);
    }
  }, [setSession, signOut]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: Boolean(user && token),
      setSession,
      refreshSession,
      signOut,
    }),
    [loading, refreshSession, setSession, signOut, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
