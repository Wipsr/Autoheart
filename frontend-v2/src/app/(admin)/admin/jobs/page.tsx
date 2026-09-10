"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ListOrdered } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProgressBar, StatusPill } from "@/components/ui/Badge";
import { EmptyState, ListSkeleton } from "@/components/ui/States";
import { FilterTabs, PageHeader } from "@/components/admin/AdminUI";
import { formatHearts } from "@/lib/utils";
import type { Job } from "@/types";

const FILTERS = [
  { value: "", label: "ทั้งหมด" },
  { value: "queued", label: "รอคิว" },
  { value: "processing", label: "กำลังรัน" },
  { value: "completed", label: "เสร็จแล้ว" },
  { value: "failed", label: "ล้มเหลว" },
];

export default function AdminJobsPage() {
  const { token } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    const qs = status ? `?status=${status}` : "";
    setLoading(true);
    api<Job[]>(`/api/admin/jobs${qs}`, { token })
      .then(setJobs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, status]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: string, action: "retry" | "cancel") => {
    if (!token) return;
    setBusyId(id);
    try {
      await api(`/api/admin/jobs/${id}/${action}`, { method: "POST", token });
      load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="งานฟาร์ม" description="สั่งรันซ้ำหรือยกเลิกงานของผู้ใช้" />
      <FilterTabs options={FILTERS} value={status} onChange={setStatus} />

      <Card className="overflow-hidden">
        {loading && <ListSkeleton rows={4} />}
        {!loading && jobs.length === 0 && (
          <EmptyState icon={ListOrdered} title="ไม่มีงานในตัวกรองนี้" />
        )}
        {!loading &&
          jobs.map((j) => (
            <div
              key={j.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-lineSoft px-4 py-3 text-sm last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/jobs/${j.id}`}
                  className="block truncate hover:text-info hover:underline"
                >
                  {j.devplay_email}
                </Link>
                <p className="mt-0.5 font-mono text-[11px] text-dim">
                  {j.id.slice(0, 8)}
                  {j.queue_position != null ? ` · คิว #${j.queue_position}` : ""}
                  {j.created_at ? ` · ${new Date(j.created_at).toLocaleString("th-TH")}` : ""}
                </p>
                {j.status === "processing" && (
                  <ProgressBar className="mt-2 max-w-xs" value={Number(j.progress_percent || 0)} />
                )}
              </div>

              <StatusPill status={j.status} />

              <span className="w-28 shrink-0 text-right font-mono text-xs tabular-nums text-muted">
                {formatHearts(j.hearts_collected)} / {formatHearts(j.target_hearts)}
              </span>

              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busyId === j.id}
                  onClick={() => act(j.id, "retry")}
                >
                  รันซ้ำ
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busyId === j.id}
                  onClick={() => act(j.id, "cancel")}
                >
                  ยกเลิก
                </Button>
              </div>
            </div>
          ))}
      </Card>
    </div>
  );
}
