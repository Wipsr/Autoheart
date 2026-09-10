"use client";

import { FormEvent, useState } from "react";
import { Loader2, Plus, Trash2, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSavedAccounts } from "@/hooks/useSavedAccounts";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card, CardHead } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type AddResult = { ok: boolean; error_message?: string };

export function SavedAccountsCard() {
  const { token } = useAuth();
  const { accounts, loading, refresh } = useSavedAccounts();
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (saving || !email.trim() || !password) return;
    setSaving(true);
    setError("");
    try {
      const res = await api<AddResult>("/api/accounts", {
        method: "POST",
        body: JSON.stringify({ label: label.trim(), email: email.trim(), password }),
        token,
      });
      if (!res.ok) {
        setError(res.error_message || "บันทึกไม่สำเร็จ — ตรวจอีเมล/รหัสผ่านอีกครั้ง");
        return;
      }
      setLabel("");
      setEmail("");
      setPassword("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      await api("/api/accounts/" + id, { method: "DELETE", token });
      await refresh();
    } catch {
      // เงียบไว้ ถ้าลบไม่สำเร็จผู้ใช้กดใหม่ได้
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHead title="บัญชีเกมที่บันทึกไว้" />
      <div className="p-4">
        <p className="mb-3 text-sm text-muted">
          บันทึกอีเมล/รหัสผ่านบัญชีเกมไว้ แล้วเลือกใช้ได้เลยเวลาเช็คไอดี ลบเพื่อน หรือสั่งฟาร์ม
          โดยไม่ต้องกรอกซ้ำ — รหัสผ่านถูกเข้ารหัสเก็บไว้ที่เซิร์ฟเวอร์ ไม่ส่งกลับมาแสดง
        </p>

        {loading ? (
          <p className="text-sm text-dim">กำลังโหลด …</p>
        ) : accounts.length ? (
          <ul className="mb-4 space-y-2">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-md border border-lineSoft bg-panel2 px-3 py-2"
              >
                <UserRound className="h-4 w-4 shrink-0 text-dim" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">
                    {a.label?.trim() || a.nickname || a.email}
                  </p>
                  <p className="truncate text-xs text-muted">{a.email}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyId === a.id}
                  onClick={() => remove(a.id)}
                  aria-label="ลบบัญชีนี้"
                >
                  {busyId === a.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 text-fail" />
                  )}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-dim">ยังไม่มีบัญชีที่บันทึกไว้</p>
        )}

        <form onSubmit={add} className="space-y-3 border-t border-lineSoft pt-4">
          <Input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="ชื่อเรียก (ไม่บังคับ) เช่น ไอดีหลัก"
            autoComplete="off"
          />
          <Input
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="อีเมลบัญชีเกม"
            autoComplete="off"
          />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="รหัสผ่าน"
            autoComplete="off"
          />
          {error && (
            <p className="rounded-md border border-fail/40 bg-fail/[0.06] px-3 py-2 text-sm text-fail">
              {error}
            </p>
          )}
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> กำลังตรวจและบันทึก …
              </>
            ) : (
              <>
                <Plus className="mr-1.5 h-4 w-4" /> บันทึกบัญชี
              </>
            )}
          </Button>
          <p className="text-xs text-dim">
            ระบบจะลองเข้าสู่ระบบเพื่อยืนยันว่ารหัสถูกต้องก่อนบันทึก
          </p>
        </form>
      </div>
    </Card>
  );
}
