"use client";

import { useEffect, useState } from "react";
import { History, Receipt } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardHead } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/Badge";
import { EmptyState, ListSkeleton } from "@/components/ui/States";
import { maskEmail } from "@/components/queue/JobRow";
import type { Job, Topup } from "@/types";
import { formatBahtExact, formatHearts } from "@/lib/utils";

const TOPUP_STATUS_LABEL: Record<string, string> = {
  pending: "รอดำเนินการ",
  processing: "กำลังตรวจซอง",
  credited: "เติมเครดิตแล้ว",
  failed: "ไม่สำเร็จ",
  needs_manual: "รอแอดมินตรวจ",
  refunded: "คืนเงินแล้ว",
};

export default function HistoryPage() {
  const { token } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [topups, setTopups] = useState<Topup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      api<Job[]>("/api/jobs/mine", { token })
        .then(setJobs)
        .catch(() => {}),
      api<Topup[]>("/api/topup/history", { token })
        .then(setTopups)
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">ประวัติการใช้งาน</h1>
        <p className="text-sm text-muted">งานฟาร์มทั้งหมดและรายการเติมเครดิตของคุณ</p>
      </div>

      <Card className="overflow-hidden">
        <CardHead title="งานฟาร์ม" />
        {loading && <ListSkeleton rows={3} />}
        {!loading && jobs.length === 0 && (
          <EmptyState
            icon={History}
            title="ยังไม่มีประวัติงาน"
            description="งานที่สั่งรันแล้วจะมาอยู่ที่นี่ พร้อมผลว่าเก็บหัวใจได้เท่าไร"
            actionLabel="ซื้อแพ็คเกจ"
            actionHref="/packages"
          />
        )}
        {!loading &&
          jobs.map((j) => (
            <div
              key={j.id}
              className="flex items-center justify-between gap-3 border-b border-lineSoft px-4 py-3 text-sm last:border-b-0"
            >
              <div className="min-w-0">
                <p className="truncate">{maskEmail(j.devplay_email)}</p>
                <p className="mt-0.5 font-mono text-[11px] text-dim">
                  {j.created_at ? new Date(j.created_at).toLocaleString("th-TH") : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <StatusPill status={j.status} />
                <span className="font-mono text-xs tabular-nums text-muted">
                  {formatHearts(j.hearts_collected)} / {formatHearts(j.target_hearts)}
                </span>
              </div>
            </div>
          ))}
      </Card>

      <Card className="overflow-hidden">
        <CardHead title="การเติมเครดิต" />
        {loading && <ListSkeleton rows={2} />}
        {!loading && topups.length === 0 && (
          <EmptyState
            icon={Receipt}
            title="ยังไม่มีประวัติเติมเงิน"
            description="ทุกครั้งที่แลกซองอั่งเปาสำเร็จจะมีรายการอยู่ที่นี่"
          />
        )}
        {!loading &&
          topups.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 border-b border-lineSoft px-4 py-3 text-sm last:border-b-0"
            >
              <div>
                <p className="font-mono tabular-nums">
                  ฿{formatBahtExact(Number(t.amount_baht || 0))}
                  <span className="text-dim"> × {t.quantity}</span>
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-dim">
                  {TOPUP_STATUS_LABEL[t.status] || t.status}
                  {t.created_at ? ` · ${new Date(t.created_at).toLocaleString("th-TH")}` : ""}
                </p>
              </div>
              <span className="font-mono text-sm tabular-nums text-heart">
                +{formatHearts(t.hearts_credited)}
              </span>
            </div>
          ))}
      </Card>
    </div>
  );
}
