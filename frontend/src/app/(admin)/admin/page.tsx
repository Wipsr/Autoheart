"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/States";
import { PageHeader, StatCard } from "@/components/admin/AdminUI";
import { formatBahtExact, formatHearts } from "@/lib/utils";

type Overview = {
  users: number;
  active_jobs: number;
  total_jobs: number;
  needs_manual_topups: number;
  revenue_baht: number;
  hearts_credited: number;
  queue_paused: boolean;
  current_job_id?: string | null;
  strategy: string;
};

export default function AdminPage() {
  const { token } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    api<Overview>("/api/admin/overview", { token })
      .then(setData)
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (path: string) => {
    if (!token) return;
    setBusy(true);
    try {
      await api(path, { method: "POST", token });
      load();
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-48" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="ภาพรวมระบบ"
        description="สถานะคิว รายได้ และงานที่ต้องเข้าไปจัดการ"
        actions={
          <>
            <Button
              size="sm"
              variant={data.queue_paused ? "primary" : "secondary"}
              disabled={busy}
              onClick={() =>
                run(data.queue_paused ? "/api/admin/queue/resume" : "/api/admin/queue/pause")
              }
            >
              {data.queue_paused ? "เปิดคิวต่อ" : "หยุดคิวชั่วคราว"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => run("/api/admin/queue/resequence")}
            >
              จัดลำดับคิวใหม่
            </Button>
          </>
        }
      />

      <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 font-mono text-xs">
        <span className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              data.queue_paused ? "bg-wait" : "pulse-dot bg-live"
            }`}
          />
          <span className={data.queue_paused ? "text-wait" : "text-live"}>
            {data.queue_paused ? "คิวถูกหยุดไว้" : "คิวทำงานปกติ"}
          </span>
        </span>
        <span className="text-dim">
          กลยุทธ์: <span className="text-muted">{data.strategy}</span>
        </span>
        <span className="text-dim">
          งานที่รันอยู่:{" "}
          {data.current_job_id ? (
            <Link href={`/admin/jobs/${data.current_job_id}`} className="text-info hover:underline">
              {data.current_job_id.slice(0, 8)}
            </Link>
          ) : (
            <span className="text-muted">—</span>
          )}
        </span>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="ผู้ใช้ทั้งหมด" value={data.users.toLocaleString("th-TH")} />
        <StatCard label="งานที่ยัง active" value={data.active_jobs} tone="text-live" />
        <StatCard label="งานทั้งหมด" value={data.total_jobs.toLocaleString("th-TH")} />
        <StatCard
          label="เติมเงินรอตรวจมือ"
          value={data.needs_manual_topups}
          tone={data.needs_manual_topups > 0 ? "text-fail" : undefined}
          hint={data.needs_manual_topups > 0 ? "ต้องเข้าไปเคลียร์ที่หน้าการเติมเงิน" : "ไม่มีค้าง"}
        />
        <StatCard label="รายได้ (บาท)" value={formatBahtExact(data.revenue_baht)} />
        <StatCard
          label="หัวใจที่เครดิตไปแล้ว"
          value={formatHearts(data.hearts_credited)}
          tone="text-heart"
        />
      </div>

      {data.needs_manual_topups > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-fail/40 bg-fail/[0.06] px-4 py-3">
          <p className="text-sm text-fail">
            มีการเติมเงิน {data.needs_manual_topups} รายการที่ระบบเติมอัตโนมัติไม่ได้
          </p>
          <Link href="/admin/topups">
            <Button size="sm" variant="secondary">
              ไปเคลียร์
            </Button>
          </Link>
        </Card>
      )}
    </div>
  );
}
