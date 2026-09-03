"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Sparkles, Wand2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSavedAccounts } from "@/hooks/useSavedAccounts";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card, CardHead } from "@/components/ui/Card";
import {
  AccountPicker,
  credPayload,
  credReady,
  emptyManual,
  type CredValue,
} from "@/components/account/AccountPicker";
import type { PowderPumpResult, PowderStatusResult } from "@/types";

// ชื่อไทยของประเภทรางวัล — ขั้นชวนเพื่อนจ่ายหลายอย่างปนกัน ไม่ใช่ผงอย่างเดียว
const REWARD_LABELS: Record<string, string> = {
  REWARD_TYPE_POWDER: "ผงเวทมนตร์",
  REWARD_TYPE_COIN: "เหรียญ",
  REWARD_TYPE_GEM: "เพชร",
  REWARD_TYPE_LIFE: "หัวใจ",
  REWARD_TYPE_KEY: "กุญแจ",
  REWARD_TYPE_SHARD: "เศษ",
  REWARD_TYPE_EXP: "ค่าประสบการณ์",
  REWARD_TYPE_STUFF: "ไอเทม",
};

const rewardLabel = (t: string) => REWARD_LABELS[t] ?? t;

const COUNT_CHOICES = [10, 50, 100, 200, 300];

const num = (n: number | null | undefined) =>
  typeof n === "number" ? n.toLocaleString("th-TH") : "—";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-panel2 p-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-dim">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default function PowderPage() {
  const { token } = useAuth();
  const { accounts } = useSavedAccounts();
  const [cred, setCred] = useState<CredValue>(emptyManual);
  const [count, setCount] = useState(50);
  const [checking, setChecking] = useState(false);
  const [pumping, setPumping] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<PowderStatusResult | null>(null);
  const [result, setResult] = useState<PowderPumpResult | null>(null);

  // มีบัญชีที่ save ไว้ → ตั้งต้นเลือกอันแรกให้ (จนกว่าผู้ใช้จะแตะเอง)
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current && cred.mode === "manual" && !cred.email && accounts.length) {
      setCred({ mode: "saved", account_id: accounts[0].id });
    }
  }, [accounts, cred]);

  const onCredChange = (v: CredValue) => {
    touched.current = true;
    setCred(v);
  };

  const busy = checking || pumping;
  const ready = credReady(cred) && Boolean(token);

  const checkStatus = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setChecking(true);
    setError("");
    setResult(null);
    try {
      const data = await api<PowderStatusResult>("/api/powder/status", {
        method: "POST",
        token,
        body: JSON.stringify(credPayload(cred)),
      });
      setStatus(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ดูสถานะไม่สำเร็จ");
    } finally {
      setChecking(false);
    }
  };

  const pump = async () => {
    if (!ready) return;
    setPumping(true);
    setError("");
    try {
      const data = await api<PowderPumpResult>("/api/powder/pump", {
        method: "POST",
        token,
        body: JSON.stringify({ ...credPayload(cred), count }),
      });
      setResult(data);
      // สถิติหลังปั๊มมาพร้อมผลอยู่แล้ว เอามาอัปเดตการ์ดสถานะให้ตรงกัน
      if (data.after && status) setStatus({ ...status, ...data.after, powder: data.powder });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ปั๊มผงไม่สำเร็จ");
    } finally {
      setPumping(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 font-display text-xl font-semibold">
          <Wand2 className="h-5 w-5 text-heart" />
          ปั๊มผงเวทมนตร์
        </h1>
        <p className="text-sm text-muted">
          ใช้ระบบ &ldquo;ชวนเพื่อน&rdquo; ในเกม — สร้างบัญชีใหม่ให้ตั้งไอดีคุณเป็นผู้ชวน
          แล้วกดรับรางวัลตามขั้นให้อัตโนมัติ ฟรี ไม่ตัดเครดิต
        </p>
      </header>

      <Card>
        <CardHead title="เลือกบัญชี" />
        <form onSubmit={checkStatus} className="space-y-4 p-4">
          <AccountPicker
            accounts={accounts}
            value={cred}
            onChange={onCredChange}
            idPrefix="powder"
          />

          <div className="space-y-1.5">
            <span className="text-sm text-muted">จำนวนบัญชีที่จะชวน</span>
            <div className="flex flex-wrap gap-2">
              {COUNT_CHOICES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  aria-pressed={count === n}
                  className={
                    count === n
                      ? "rounded-md border border-heart bg-heart/10 px-3 py-1.5 font-mono text-sm text-heart"
                      : "rounded-md border border-line px-3 py-1.5 font-mono text-sm text-muted transition hover:text-foreground"
                  }
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary" disabled={!ready || busy}>
              {checking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              ดูสถานะ
            </Button>
            <Button type="button" onClick={pump} disabled={!ready || busy}>
              {pumping && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              เริ่มปั๊ม {count} บัญชี
            </Button>
          </div>

          {pumping && (
            <p className="text-sm text-muted">
              กำลังสร้างบัญชีและตั้งผู้ชวน อาจใช้เวลาหลายนาทีถ้าจำนวนเยอะ — อย่าปิดหน้านี้
            </p>
          )}
        </form>
      </Card>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-fail/40 bg-fail/10 p-3 text-sm text-fail">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {status && (
        <Card>
          <CardHead title={`สถานะของ ${status.email}`} />
          <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="ผงเวทมนตร์" value={num(status.powder)} />
            <Stat label="ชวนโดยตรง" value={num(status.direct_invited_count)} />
            <Stat label="ชวนทั้งหมด" value={num(status.total_invited_count)} />
            <Stat label="แต้มเชิญ" value={num(status.invitation_point)} />
          </div>
        </Card>
      )}

      {result && (
        <Card glow>
          <CardHead
            title={
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-heart" />
                ผลการปั๊ม
              </span>
            }
          />
          <div className="space-y-4 p-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <Stat
                label="ผงที่ได้รอบนี้"
                value={<span className="text-heart">+{num(result.powder_gained)}</span>}
              />
              <Stat label="ชวนสำเร็จ" value={`${num(result.invited)} / ${num(result.requested)}`} />
              <Stat label="ขั้นที่รับได้" value={num(result.milestones_claimed)} />
            </div>

            {result.rewards.length > 0 && (
              <div className="space-y-1.5">
                <p className="font-mono text-[10px] uppercase tracking-widest text-dim">
                  รางวัลทั้งหมดที่ได้
                </p>
                <ul className="divide-y divide-lineSoft rounded-md border border-line">
                  {result.rewards.map((r) => (
                    <li
                      key={r.type}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <span className="text-muted">{rewardLabel(r.type)}</span>
                      <span className="font-mono tabular-nums">+{num(r.qty)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.failures.length > 0 && (
              <div className="space-y-1.5">
                <p className="font-mono text-[10px] uppercase tracking-widest text-dim">
                  ที่ไม่สำเร็จ
                </p>
                <ul className="space-y-1">
                  {result.failures.map((f) => (
                    <li key={f.reason} className="text-sm text-muted">
                      <span className="font-mono tabular-nums text-fail">{f.count}×</span>{" "}
                      {f.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.note && <p className="text-sm text-dim">{result.note}</p>}
          </div>
        </Card>
      )}
    </div>
  );
}
