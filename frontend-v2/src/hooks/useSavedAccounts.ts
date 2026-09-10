"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import type { SavedAccount } from "@/types";

/** โหลด/รีเฟรชรายการบัญชีเกมที่ผู้ใช้ save ไว้ ใช้ร่วมกันหลายหน้า */
export function useSavedAccounts() {
  const { token } = useAuth();
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api<{ accounts: SavedAccount[] }>("/api/accounts", { token });
      setAccounts(res.accounts || []);
    } catch {
      // เงียบไว้ — หน้าที่ใช้ตัดสินใจเองว่าจะโชว์ error ไหม (ตัวเลือกเสริมเท่านั้น)
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { accounts, loading, refresh };
}
