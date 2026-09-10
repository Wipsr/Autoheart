"use client";

import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { Loader2, LogIn, RotateCcw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSavedAccounts } from "@/hooks/useSavedAccounts";
import type { ToolSlug } from "@/hooks/useToolRun";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  AccountPicker,
  credPayload,
  credReady,
  emptyManual,
  type CredValue,
} from "@/components/account/AccountPicker";

/** จังหวะที่ 1 ของทุกเครื่องมือ: ล็อกอินสแกนบัญชีก่อน แล้วค่อยให้ตั้งเป้า
 *
 * ต่างจากหน้า "เช็คข้อมูลไอดี" ตรงที่ยังทิ้งรหัสผ่านหลังสแกนไม่ได้ — ตอนกดสั่งงาน
 * ต้องล็อกอินอีกครั้งด้วยชุดเดิม จึงถือไว้ในหน่วยความจำของหน้าจนกว่าจะออกจากหน้า
 */
export function ToolScanGate<T>({
  slug,
  title,
  description,
  hint,
  submitLabel,
  children,
}: {
  slug: ToolSlug;
  title: string;
  description: string;
  hint: string;
  submitLabel: string;
  children: (args: {
    data: T;
    credentials: Record<string, string>;
    rescan: () => void;
  }) => ReactNode;
}) {
  const { token } = useAuth();
  const { accounts } = useSavedAccounts();
  const [cred, setCred] = useState<CredValue>(emptyManual);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<T | null>(null);

  // มีบัญชีที่ save ไว้ → ตั้งต้นเลือกอันแรกให้เลย (ยังไม่เคยเลือกเอง)
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current && cred.mode === "manual" && !cred.email && accounts.length) {
      setCred({ mode: "saved", account_id: accounts[0].id });
    }
  }, [accounts, cred]);

  const scan = async (e: FormEvent) => {
    e.preventDefault();
    if (loading || !credReady(cred)) return;
    setLoading(true);
    setError("");
    try {
      setData(
        await api<T>(`/api/tools/${slug}/scan`, {
          method: "POST",
          body: JSON.stringify(credPayload(cred)),
          token,
        })
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  };

  if (data) {
    return (
      <>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-semibold">{title}</h1>
            <p className="mt-1 text-sm text-muted">{description}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setData(null)}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> เข้าใหม่
          </Button>
        </div>
        {children({
          data,
          credentials: credPayload(cred),
          rescan: () => setData(null),
        })}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <h1 className="font-display text-xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      <Card>
        <form onSubmit={scan} className="space-y-4 p-4">
          <AccountPicker
            accounts={accounts}
            value={cred}
            onChange={(v) => {
              touched.current = true;
              setCred(v);
            }}
            idPrefix={slug}
          />
          <p className="text-xs text-dim">{hint}</p>
          {error && (
            <p className="rounded-md border border-heart/40 bg-heart/10 px-3 py-2 text-sm text-heart">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={loading || !credReady(cred)}>
            {loading ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> กำลังเข้าสู่ระบบ …
              </>
            ) : (
              <>
                <LogIn className="mr-1.5 h-4 w-4" /> {submitLabel}
              </>
            )}
          </Button>
        </form>
      </Card>
    </div>
  );
}
