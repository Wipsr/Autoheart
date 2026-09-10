"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { User, Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import type { Profile } from "@/types";

type AuthValue = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  token: string | null;
  isAdmin: boolean;
  refreshProfile: (token?: string) => Promise<void>;
  signOut: () => Promise<void>;
  supabase: ReturnType<typeof createClient>;
};

const AuthContext = createContext<AuthValue | null>(null);

/**
 * แหล่งเดียวของสถานะล็อกอินทั้งแอป
 * ก่อนหน้านี้ทุกคอมโพเนนต์ที่เรียก useAuth จะสมัคร onAuthStateChange และยิง /api/me ของตัวเอง
 * หน้าเดียวมี hook นี้ราว 7 ตัว พอ Supabase ปล่อย event ทีก็ยิงโปรไฟล์พร้อมกันทั้งชุดไม่หยุด
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const loadedForUser = useRef<string | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  const refreshProfile = useCallback(
    async (token?: string) => {
      const t = token || (await supabase.auth.getSession()).data.session?.access_token;
      if (!t) {
        setProfile(null);
        return;
      }
      // ยุบคำขอที่ซ้อนกันให้เหลือครั้งเดียว
      if (inFlight.current) return inFlight.current;
      const task = (async () => {
        try {
          setProfile(await api<Profile>("/api/me", { token: t }));
        } catch {
          setProfile(null);
        } finally {
          inFlight.current = null;
        }
      })();
      inFlight.current = task;
      return task;
    },
    [supabase]
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      const token = data.session?.access_token;
      if (token) {
        loadedForUser.current = data.session?.user.id ?? null;
        refreshProfile(token).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (!s?.access_token) {
        loadedForUser.current = null;
        setProfile(null);
        return;
      }
      // ดึงโปรไฟล์เฉพาะตอนเปลี่ยนผู้ใช้จริง ๆ ไม่ใช่ทุก event ที่ Supabase ปล่อยออกมา
      if (loadedForUser.current !== s.user.id) {
        loadedForUser.current = s.user.id;
        refreshProfile(s.access_token);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [supabase, refreshProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    loadedForUser.current = null;
    setProfile(null);
  }, [supabase]);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      session,
      profile,
      loading,
      token: session?.access_token ?? null,
      isAdmin: profile?.role === "admin",
      refreshProfile,
      signOut,
      supabase,
    }),
    [user, session, profile, loading, refreshProfile, signOut, supabase]
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth ต้องถูกใช้ภายใต้ <AuthProvider>");
  return ctx;
}
