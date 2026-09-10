"use client";

import { Check, Loader2, RotateCw, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import type { SavedAccount } from "@/types";

export type CredStatus = "idle" | "checking" | "valid" | "invalid";

export type Cred = {
  email: string;
  password: string;
  status: CredStatus;
  message?: string;
  // ถ้ามาจากบัญชีที่ save ไว้: ใช้ account_id แทน email/password (email เก็บไว้โชว์)
  account_id?: string;
  label?: string;
};

export function CredentialRow({
  cred,
  index,
  showIndex,
  onChange,
  onVerify,
  savedAccounts = [],
  onPickSaved,
}: {
  cred: Cred;
  index: number;
  showIndex: boolean;
  onChange: (patch: Partial<Cred>) => void;
  onVerify: () => void;
  savedAccounts?: SavedAccount[];
  onPickSaved?: (account: SavedAccount | null) => void;
}) {
  const isSaved = Boolean(cred.account_id);
  const hasSaved = savedAccounts.length > 0 && Boolean(onPickSaved);
  const filled = isSaved || (cred.email.trim().length > 0 && cred.password.length > 0);

  return (
    <div
      className={cn(
        "space-y-2 rounded-md border p-3 transition",
        cred.status === "valid" && "border-live/40 bg-live/[0.04]",
        cred.status === "invalid" && "border-fail/40 bg-fail/[0.04]",
        (cred.status === "idle" || cred.status === "checking") && "border-line"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        {showIndex ? (
          <p className="text-xs text-dim">ไอดี #{index + 1}</p>
        ) : (
          <p className="text-xs text-dim">ไอดี DevPlay</p>
        )}
        <div className="flex items-center gap-2">
          {cred.status === "checking" && (
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> กำลังตรวจ
            </span>
          )}
          {cred.status === "valid" && (
            <span className="flex items-center gap-1.5 text-xs text-live">
              <Check className="h-3.5 w-3.5" /> ล็อกอินผ่าน
            </span>
          )}
          {cred.status === "invalid" && (
            <span className="flex items-center gap-1.5 text-xs text-fail">
              <X className="h-3.5 w-3.5" /> ไม่ผ่าน
            </span>
          )}
        </div>
      </div>

      {hasSaved && (
        <select
          className="w-full rounded-md border border-line bg-ink/70 px-3 py-2 text-sm text-foreground outline-none transition focus:border-heart/60"
          value={cred.account_id || "__manual__"}
          onChange={(e) => {
            const v = e.target.value;
            onPickSaved?.(v === "__manual__" ? null : savedAccounts.find((a) => a.id === v) || null);
          }}
        >
          {savedAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label?.trim() || a.nickname || a.email}
              {a.label?.trim() ? ` · ${a.email}` : ""}
            </option>
          ))}
          <option value="__manual__">＋ กรอกบัญชีใหม่</option>
        </select>
      )}

      {isSaved ? (
        <div className="flex items-center gap-2 rounded-md border border-lineSoft bg-panel2 px-3 py-2">
          <UserRound className="h-4 w-4 shrink-0 text-dim" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-foreground">{cred.label || cred.email}</p>
            <p className="truncate text-xs text-muted">{cred.email}</p>
          </div>
          <span className="text-[11px] text-dim">บัญชีที่บันทึกไว้</span>
        </div>
      ) : (
        <>
          <Input
            required
            type="email"
            autoComplete="off"
            placeholder="DevPlay Email"
            value={cred.email}
            onChange={(e) => onChange({ email: e.target.value, status: "idle", message: undefined })}
          />
          <Input
            required
            type="password"
            autoComplete="new-password"
            placeholder="DevPlay Password"
            value={cred.password}
            onChange={(e) => onChange({ password: e.target.value, status: "idle", message: undefined })}
          />
        </>
      )}

      {cred.status === "invalid" && (
        <p className="text-xs text-fail">
          {cred.message || "ล็อกอินไม่ผ่าน"} — แก้แล้วกดตรวจอีกครั้ง ไอดีนี้ยังไม่ถูกนำไปคิดเงิน
        </p>
      )}

      {cred.status !== "valid" && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!filled || cred.status === "checking"}
          onClick={onVerify}
        >
          <RotateCw className="h-3.5 w-3.5" />
          {cred.status === "invalid" ? "ตรวจอีกครั้ง" : "ตรวจไอดีนี้"}
        </Button>
      )}
    </div>
  );
}
