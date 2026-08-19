"use client";

import { Check, Loader2, RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

export type CredStatus = "idle" | "checking" | "valid" | "invalid";

export type Cred = {
  email: string;
  password: string;
  status: CredStatus;
  message?: string;
};

export function CredentialRow({
  cred,
  index,
  showIndex,
  onChange,
  onVerify,
}: {
  cred: Cred;
  index: number;
  showIndex: boolean;
  onChange: (patch: Partial<Cred>) => void;
  onVerify: () => void;
}) {
  const filled = cred.email.trim().length > 0 && cred.password.length > 0;

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
