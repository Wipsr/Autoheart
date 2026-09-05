"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Coins, Loader2, Sparkles, StopCircle } from "lucide-react";
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
import { EmptyState } from "@/components/ui/States";
import { cn } from "@/lib/utils";
import type { PowderJob, PowderScanResult } from "@/types";

const num = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-US");

// ค่าเฉลี่ยหยาบ ๆ ของกล่องสุ่ม ใช้บอกผู้ใช้คร่าว ๆ ว่าเหรียญที่มีทำได้ราวเท่าไร
// ไม่ใช่ตัวเลขผูกมัด — ผงเป็นค่าสุ่ม งานจริงหยุดเมื่อถึงเป้าหรือเหรียญหมด
const POWDER_PER_BOX = 9;
const DEFAULT_BOX_PRICE = 5000;

const ACTIVE: PowderJob["status"][] = ["queued", "running"];
const isActive = (j: PowderJob) => ACTIVE.includes(j.status);

const STATUS_LABEL: Record<PowderJob["status"], string> = {
  queued: "อยู่ในคิว",
  running: "กำลังทำงาน",
  success: "สำเร็จ",
  error: "ล้มเหลว",
  cancelled: "ยกเลิกแล้ว",
};

function JobRow({ job, onCancel }: { job: PowderJob; onCancel: (id: string) => void }) {
  const active = isActive(job);
  return (
    <div className="space-y-2 border-b border-lineSoft px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <p className="font-medium">{job.email}</p>
          <p className="text-xs text-muted">
            ขอ {num(job.requested_powder)} ผง
            {job.delivered > 0 && ` · ได้แล้ว ${num(job.delivered)} ผง`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-md border px-2 py-1 text-xs",
              job.status === "success" && "border-live/40 bg-live/10 text-live",
              job.status === "error" && "border-fail/40 bg-fail/10 text-fail",
              active && "border-line bg-panel2 text-muted",
              job.status === "cancelled" && "border-line bg-panel2 text-dim"
            )}
          >
            {STATUS_LABEL[job.status]}
          </span>
          {active && (
            <Button variant="danger" size="sm" onClick={() => onCancel(job.id)}>
              <StopCircle className="h-3.5 w-3.5" /> หยุด
            </Button>
          )}
        </div>
      </div>
      {(active || job.progress > 0) && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink">
          <div
            className={cn("h-full rounded-full", job.status === "error" ? "bg-fail" : "bg-heart")}
            style={{ width: `${job.status === "success" ? 100 : job.progress}%` }}
          />
        </div>
      )}
      {(job.status_line || job.error_message) && (
        <p className={cn("text-xs", job.error_message ? "text-fail" : "text-dim")}>
          {job.error_message || job.status_line}
        </p>
      )}
    </div>
  );
}

export default function PowderPage() {
  const { token } = useAuth();
  const { accounts } = useSavedAccounts();
  const [cred, setCred] = useState<CredValue>(emptyManual);
  const [scan, setScan] = useState<PowderScanResult | null>(null);
  const [want, setWant] = useState(10000);
  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [jobs, setJobs] = useState<PowderJob[]>([]);

  // มีบัญชีที่ save ไว้ → ตั้งต้นเลือกอันแรกให้ (จนกว่าผู้ใช้จะแตะเอง)
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current && cred.mode === "manual" && !cred.email && accounts.length) {
      setCred({ mode: "saved", account_id: accounts[0].id });
    }
  }, [accounts, cred]);

  const loadJobs = useCallback(async () => {
    if (!token) return;
    try {
      setJobs(await api<PowderJob[]>("/api/powder/jobs", { token }));
    } catch {
      // งานยังรันอยู่ฝั่ง ngmx ต่อให้ดึงสถานะรอบนี้ไม่ได้ — เงียบไว้ รอบหน้าค่อยว่ากัน
    }
  }, [token]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // งานรันฝั่ง ngmx เราไม่มี stream ของตัวเอง จึง poll ระหว่างที่ยังมีงานค้าง
  // และหยุด poll เมื่องานจบหมด เพื่อไม่ยิงถี่ ๆ ทิ้งไว้เปล่า ๆ
  const hasActive = jobs.some(isActive);
  useEffect(() => {
    if (!hasActive) return;
    const timer = setInterval(loadJobs, 5000);
    return () => clearInterval(timer);
  }, [hasActive, loadJobs]);

  const boxPrice = Number(scan?.box_price) || DEFAULT_BOX_PRICE;
  const maxByCoin = Math.floor((scan?.coin ?? 0) / boxPrice) * POWDER_PER_BOX;

  const doScan = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || scanning || !credReady(cred)) return;
    setScanning(true);
    setError("");
    try {
      const res = await api<PowderScanResult>("/api/powder/scan", {
        method: "POST",
        token,
        body: JSON.stringify(credPayload(cred)),
      });
      setScan(res);
      const price = Number(res.box_price) || DEFAULT_BOX_PRICE;
      const est = Math.floor((res.coin || 0) / price) * POWDER_PER_BOX;
      setWant(Math.min(10000, Math.max(1, est || 10000)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setScanning(false);
    }
  };

  const start = async () => {
    if (!token || starting || want <= 0) return;
    setStarting(true);
    setError("");
    try {
      await api<{ job: PowderJob }>("/api/powder/start", {
        method: "POST",
        token,
        body: JSON.stringify({ ...credPayload(cred), powder: want }),
      });
      // กรอกสด → ทิ้งรหัสทันทีหลังส่งงาน ไม่เก็บค้างในหน้า
      if (cred.mode === "manual") setCred((c) => ({ ...c, password: "" }) as CredValue);
      setScan(null);
      await loadJobs();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "สั่งงานไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setStarting(false);
    }
  };

  const cancel = async (id: string) => {
    if (!token) return;
    try {
      await api(`/api/powder/jobs/${id}/cancel`, { method: "POST", token });
      await loadJobs();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "สั่งหยุดไม่สำเร็จ");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold">ปั๊มผงเวทมนตร์</h1>
        <p className="mt-1 text-sm text-muted">
          ระบบซื้อกล่องสมบัติด้วย<strong className="font-medium text-foreground">เหรียญในเกมของคุณ</strong>
          แล้วย่อยเป็นผงจนถึงเป้าที่ตั้ง — ไม่คิดเครดิตหัวใจ และไม่ต้องรอคิวฟาร์มหัวใจ
        </p>
      </div>

      <Card className="border-heart/30 bg-heart/[0.04] p-4 text-xs text-muted">
        ผงที่ได้ต่อกล่องเป็นค่าสุ่ม จำนวนรอบจึงไม่แน่นอน — ระบบทำจนถึงเป้าหรือจนเหรียญในเกมหมด
        แล้วหยุดเอง เหรียญที่ใช้ไปคืนไม่ได้
      </Card>

      {!scan ? (
        <Card>
          <form onSubmit={doScan} className="space-y-4 p-4">
            <AccountPicker accounts={accounts} value={cred} onChange={(v) => { touched.current = true; setCred(v); }} idPrefix="pf" />
            {cred.mode === "manual" && (
              <p className="text-xs text-dim">
                รหัสผ่านใช้เข้าบัญชีเพื่อดูเหรียญและปั๊มผงเท่านั้น ไม่ถูกเก็บไว้หลังงานจบ
                (บันทึกบัญชีไว้ใช้ซ้ำได้ในหน้า ตั้งค่า)
              </p>
            )}
            {error && (
              <p className="rounded-md border border-heart/40 bg-heart/10 px-3 py-2 text-sm text-heart">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={scanning || !credReady(cred)}>
              {scanning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> กำลังเข้าสู่ระบบ …
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> ตรวจสอบบัญชี
                </>
              )}
            </Button>
          </form>
        </Card>
      ) : (
        <Card>
          <CardHead
            title={scan.nickname || scan.mid}
            action={
              <Button variant="ghost" size="sm" onClick={() => setScan(null)}>
                เปลี่ยนไอดี
              </Button>
            }
          />
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border border-line bg-panel2 px-3 py-2.5">
                <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-dim">
                  <Coins className="h-3 w-3" /> เหรียญ
                </p>
                <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{num(scan.coin)}</p>
              </div>
              <div className="rounded-md border border-line bg-panel2 px-3 py-2.5">
                <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-dim">
                  <Sparkles className="h-3 w-3" /> ผงตอนนี้
                </p>
                <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{num(scan.powder)}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="pf-want" className="text-sm text-muted">
                จำนวนผงที่ต้องการ
              </label>
              <Input
                id="pf-want"
                type="number"
                min={1}
                max={1000000}
                step={100}
                inputMode="numeric"
                value={want}
                onChange={(e) => setWant(Number(e.target.value) || 0)}
              />
              <p className="text-xs text-dim">
                กล่องละ {num(boxPrice)} เหรียญ · เหรียญเท่านี้ทำได้ราว {num(maxByCoin)} ผง
              </p>
            </div>

            {want > maxByCoin && maxByCoin > 0 && (
              <p className="rounded-md border border-heart/40 bg-heart/10 px-3 py-2 text-xs text-heart">
                เหรียญอาจไม่พอถึง {num(want)} ผง — ระบบจะทำเท่าที่เหรียญถึงแล้วหยุดเอง
              </p>
            )}
            {error && (
              <p className="rounded-md border border-fail/40 bg-fail/10 px-3 py-2 text-sm text-fail">
                {error}
              </p>
            )}

            <Button className="w-full" onClick={start} disabled={starting || want <= 0}>
              {starting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> กำลังส่งงาน …
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> เริ่มปั๊มผง
                </>
              )}
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <CardHead title="งานปั๊มผงของคุณ" />
        {jobs.length ? (
          jobs.map((j) => <JobRow key={j.id} job={j} onCancel={cancel} />)
        ) : (
          <EmptyState
            icon={Sparkles}
            title="ยังไม่มีงานปั๊มผง"
            description="ล็อกอินไอดีด้านบนแล้วตั้งเป้าจำนวนผง ความคืบหน้าจะขึ้นที่นี่"
          />
        )}
      </Card>
    </div>
  );
}
