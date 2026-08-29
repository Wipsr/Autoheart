"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Gift, Loader2, ScanEye, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSavedAccounts } from "@/hooks/useSavedAccounts";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card, CardHead } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import {
  AccountPicker,
  credPayload,
  credReady,
  emptyManual,
  type CredValue,
} from "@/components/account/AccountPicker";
import { cn, formatHearts } from "@/lib/utils";
import type { InviteRunResult, InviteStatus } from "@/types";

// เพดานเดียวกับ MAX_INVITES ใน backend/heart_farm/invite_tool.py — 1 คน =
// สร้าง guest 1 ตัว จำนวนจึงคุมไว้ ไม่ใช่ปล่อยให้กรอกเท่าไรก็ได้
const MAX_INVITES = 29;

// ล็อกอินด้วยบัญชีเกม = ยืนยันยอดก่อน/หลังได้; ใส่ MID = เชิญให้ไอดีคนอื่นโดย
// ไม่ต้องขอรหัสผ่านเขา (แลกกับการที่เราตรวจผลให้ไม่ได้)
type Mode = "account" | "mid";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-line bg-panel2 px-3 py-2.5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-dim">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export default function InvitePage() {
  const { token } = useAuth();
  const { accounts } = useSavedAccounts();
  const [mode, setMode] = useState<Mode>("account");
  const [cred, setCred] = useState<CredValue>(emptyManual);
  const [mid, setMid] = useState("");
  // เก็บเป็นสตริง ไม่ใช่ตัวเลข — ถ้า clamp ทุกครั้งที่พิมพ์ ช่องจะลบให้ว่างไม่ได้
  // (ลบหมด -> กลายเป็น 1 -> พิมพ์ 5 ต่อท้ายได้ 15) clamp ตอนออกจากช่องกับตอนกดพอ
  const [countText, setCountText] = useState(String(MAX_INVITES));
  const [checking, setChecking] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<InviteStatus | null>(null);
  const [result, setResult] = useState<InviteRunResult | null>(null);

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

  const clampCount = (raw: string) => {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.min(MAX_INVITES, n);
  };
  const count = clampCount(countText);

  const ready = mode === "account" ? credReady(cred) : mid.trim().length > 0;

  const loadStatus = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !credReady(cred)) return;
    setChecking(true);
    setError("");
    setResult(null);
    try {
      const data = await api<InviteStatus>("/api/invite/status", {
        method: "POST",
        token,
        body: JSON.stringify(credPayload(cred)),
      });
      setStatus(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ดึงสถานะเชิญเพื่อนไม่สำเร็จ");
    } finally {
      setChecking(false);
    }
  };

  const runInvite = async () => {
    if (!token || !ready) return;
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const body =
        mode === "account"
          ? { ...credPayload(cred), count }
          : { target_mid: mid.trim(), count };
      const data = await api<InviteRunResult>("/api/invite/run", {
        method: "POST",
        token,
        body: JSON.stringify(body),
      });
      setResult(data);
      if (data.status) setStatus(data.status);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "เชิญเพื่อนไม่สำเร็จ");
    } finally {
      setRunning(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setStatus(null);
    setResult(null);
    setError("");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">เชิญเพื่อน</h1>
        <p className="mt-1 text-sm text-muted">
          ระบบสร้างไอดี guest ใหม่ให้ตามจำนวนที่เลือก แล้วให้แต่ละตัวตั้ง &quot;ผู้เชิญ&quot;
          เป็นไอดีของคุณ — ยอดเชิญเพื่อนในเกมขึ้นทันที เอาไปกดรับรางวัลในเกมได้เลย
          ฟรี ไม่ใช้เครดิต และไม่ต้องรอคิว
        </p>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "account" ? "primary" : "secondary"}
            onClick={() => switchMode("account")}
          >
            ใช้บัญชีเกมของฉัน
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "mid" ? "primary" : "secondary"}
            onClick={() => switchMode("mid")}
          >
            ใส่ MID (ไม่ต้องใช้รหัส)
          </Button>
        </div>

        {mode === "account" ? (
          <form onSubmit={loadStatus} className="space-y-3">
            <AccountPicker
              accounts={accounts}
              value={cred}
              onChange={onCredChange}
              idPrefix="inv"
            />
            {cred.mode === "manual" && (
              <p className="text-xs text-dim">
                รหัสผ่านใช้ล็อกอินตอนกดเท่านั้น ไม่ถูกบันทึกลงฐานข้อมูล
                (บันทึกบัญชีไว้ใช้ซ้ำได้ในหน้า ตั้งค่า)
              </p>
            )}
            <Button type="submit" variant="secondary" disabled={checking || !credReady(cred)}>
              {checking ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> กำลังล็อกอิน...
                </>
              ) : (
                <>
                  <ScanEye className="h-4 w-4" /> ดูยอดเชิญเพื่อนตอนนี้
                </>
              )}
            </Button>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="inv-mid" className="text-sm text-muted">
                MID ของไอดีที่จะให้ยอดเชิญขึ้น
              </label>
              <Input
                id="inv-mid"
                value={mid}
                onChange={(e) => setMid(e.target.value)}
                placeholder="เช่น 1234567890"
                spellCheck={false}
              />
            </div>
            <p className="text-xs text-dim">
              โหมดนี้ไม่ต้องใช้รหัสผ่าน แต่เราตรวจยอดก่อน/หลังให้ไม่ได้ —
              ดูผลจริงในเกมของไอดีปลายทางอีกที (MID ดูได้จากหน้า เช็คข้อมูลไอดี)
            </p>
          </div>
        )}
      </Card>

      {status && (
        <Card>
          <CardHead
            title={status.nickname || status.mid}
            action={<span className="font-mono text-[11px] text-dim">{status.mid}</span>}
          />
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            <Stat label="เชิญโดยตรง" value={`${formatHearts(status.direct_invited)} คน`} />
            <Stat label="ทั้งสาย" value={`${formatHearts(status.total_invited)} คน`} />
            <Stat label="แต้มเชิญเพื่อน" value={formatHearts(status.invitation_point)} />
            <Stat
              label="ผู้เชิญของไอดีนี้"
              value={status.referrer ? status.referrer.nickname || status.referrer.player_id : "—"}
              hint={status.can_set_referrer ? "ยังตั้งผู้เชิญของตัวเองได้" : undefined}
            />
          </div>
        </Card>
      )}

      {error && <Card className="border-fail/40 bg-fail/[0.04] p-4 text-sm text-fail">{error}</Card>}

      {result && (
        <Card
          className={cn(
            "space-y-1 p-4 text-sm",
            result.ok ? "border-live/40 bg-live/[0.04]" : "border-fail/40 bg-fail/[0.04]"
          )}
        >
          <p className="font-medium">
            {/* ยอดจริงจาก GetInvitationTree มาก่อนเสมอ — 'ยิงสำเร็จ' ของเซิร์ฟเวอร์
                กับ 'ยอดขึ้นจริง' ไม่ใช่ตัวเลขเดียวกัน */}
            {result.gained != null
              ? `ยอดเชิญเพิ่มขึ้น ${formatHearts(result.gained)} / ${formatHearts(result.requested)} คน`
              : `ตั้งผู้เชิญสำเร็จ ${formatHearts(result.success)} / ${formatHearts(result.requested)} คน`}
          </p>
          {result.invited_after != null && (
            <p className="text-muted">ยอดเชิญโดยตรงตอนนี้ {formatHearts(result.invited_after)} คน</p>
          )}
          {result.create_fail > 0 && (
            <p className="text-fail">
              สร้างไอดี guest ไม่สำเร็จ {formatHearts(result.create_fail)} ตัว — ปกติเป็นเพราะ
              proxy หรือโดนเซิร์ฟเวอร์ DevPlay จำกัดจำนวน กดซ้ำอีกครั้งได้
            </p>
          )}
          {result.failed > 0 && (
            <p className="text-fail">ตั้งผู้เชิญไม่สำเร็จ {formatHearts(result.failed)} ตัว</p>
          )}
          {result.already > 0 && (
            <p className="text-muted">ข้าม {formatHearts(result.already)} ตัวที่มีผู้เชิญอยู่แล้ว</p>
          )}
          {result.errors.length > 0 && (
            <p className="font-mono text-[11px] text-dim">{result.errors[0]}</p>
          )}
        </Card>
      )}

      <Card className="space-y-3 p-4">
        <div className="space-y-1.5">
          <label htmlFor="inv-count" className="text-sm text-muted">
            จำนวนที่จะเชิญ (สูงสุด {MAX_INVITES} คนต่อครั้ง)
          </label>
          <Input
            id="inv-count"
            type="number"
            min={1}
            max={MAX_INVITES}
            value={countText}
            onChange={(e) => setCountText(e.target.value)}
            onBlur={() => setCountText(String(count))}
          />
        </div>
        <p className="text-xs text-dim">
          ยิ่งจำนวนมากยิ่งใช้เวลานาน (สร้างไอดีใหม่ทีละตัว) ปกติ {MAX_INVITES} คนใช้เวลาราว 1–3 นาที
          — เปิดหน้านี้ค้างไว้จนกว่าจะขึ้นผลลัพธ์
        </p>
        <Button onClick={runInvite} disabled={running || !ready}>
          {running ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> กำลังเชิญ {formatHearts(count)} คน...
            </>
          ) : (
            <>
              <UserPlus className="h-4 w-4" /> เริ่มเชิญเพื่อน {formatHearts(count)} คน
            </>
          )}
        </Button>
        <p className="flex items-start gap-2 text-xs text-dim">
          <Gift className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          รางวัลเชิญเพื่อนต้องเข้าไปกดรับในเกมเอง — ระบบเพิ่มให้แค่ยอดจำนวนคน
        </p>
      </Card>
    </div>
  );
}
