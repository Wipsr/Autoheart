"use client";

import { Input } from "@/components/ui/Input";
import type { SavedAccount } from "@/types";

// แหล่งที่มาของ credential: เลือกบัญชีที่ save ไว้ หรือกรอกสด
export type CredValue =
  | { mode: "saved"; account_id: string }
  | { mode: "manual"; email: string; password: string };

export const emptyManual: CredValue = { mode: "manual", email: "", password: "" };

/** แปลง CredValue เป็น payload ที่ backend รับ (account_id หรือ email+password) */
export function credPayload(v: CredValue): Record<string, string> {
  return v.mode === "saved"
    ? { account_id: v.account_id }
    : { email: v.email.trim(), password: v.password };
}

/** ใช้ได้ไหม — บัญชีที่ save เลือกแล้วถือว่าพร้อม, กรอกสดต้องครบทั้งคู่ */
export function credReady(v: CredValue): boolean {
  return v.mode === "saved"
    ? Boolean(v.account_id)
    : v.email.trim().length > 0 && v.password.length > 0;
}

const accountLabel = (a: SavedAccount) => a.label?.trim() || a.nickname || a.email;

export function AccountPicker({
  accounts,
  value,
  onChange,
  idPrefix = "cred",
}: {
  accounts: SavedAccount[];
  value: CredValue;
  onChange: (v: CredValue) => void;
  idPrefix?: string;
}) {
  const hasSaved = accounts.length > 0;

  return (
    <div className="space-y-3">
      {hasSaved && (
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-select`} className="text-sm text-muted">
            บัญชีเกม
          </label>
          <select
            id={`${idPrefix}-select`}
            className="w-full rounded-md border border-line bg-ink/70 px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-heart/60"
            value={value.mode === "saved" ? value.account_id : "__manual__"}
            onChange={(e) => {
              const v = e.target.value;
              onChange(v === "__manual__" ? emptyManual : { mode: "saved", account_id: v });
            }}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {accountLabel(a)}
                {a.label?.trim() ? ` · ${a.email}` : ""}
              </option>
            ))}
            <option value="__manual__">＋ กรอกบัญชีใหม่</option>
          </select>
        </div>
      )}

      {value.mode === "manual" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor={`${idPrefix}-email`} className="text-sm text-muted">
              อีเมล
            </label>
            <Input
              id={`${idPrefix}-email`}
              type="text"
              value={value.email}
              onChange={(e) => onChange({ ...value, email: e.target.value })}
              placeholder="you@example.com"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${idPrefix}-password`} className="text-sm text-muted">
              รหัสผ่าน
            </label>
            <Input
              id={`${idPrefix}-password`}
              type="password"
              value={value.password}
              onChange={(e) => onChange({ ...value, password: e.target.value })}
              placeholder="••••••••"
              autoComplete="off"
            />
          </div>
        </div>
      )}
    </div>
  );
}
