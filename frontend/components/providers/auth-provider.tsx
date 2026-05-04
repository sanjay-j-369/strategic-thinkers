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

export interface AuthUser {
  id: string;
  email: string;
  full_name: string | null;
  security_mode: "vault";
  created_at: string;
  google_connected: boolean;
  slack_connected: boolean;
  google_last_synced_at: string | null;
  slack_last_synced_at: string | null;
  public_key?: string | null;
}

interface StoredSession {
  token: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  privateKey: CryptoKey | null;
  loading: boolean;
  isAuthenticated: boolean;
  setSession: (token: string, user: AuthUser) => void;
  setPrivateKey: (privateKey: CryptoKey | null) => void;
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
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [loading, setLoading] = useState(true);

  const setSession = useCallback((nextToken: string, nextUser: AuthUser) => {
    setToken(nextToken);
    setUser(nextUser);
    writeStoredSession({ token: nextToken, user: nextUser });
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
    setPrivateKey(null);
    writeStoredSession(null);
  }, []);

  const refreshSession = useCallback(async () => {
    const stored = readStoredSession();
    if (!stored?.token) {
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
      signOut();
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
      privateKey,
      loading,
      isAuthenticated: Boolean(user && token),
      setSession,
      setPrivateKey,
      refreshSession,
      signOut,
    }),
    [loading, privateKey, refreshSession, setSession, signOut, token, user]
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
