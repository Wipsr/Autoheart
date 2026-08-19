"use client";

import { useMemo, useState } from "react";
import { ListOrdered } from "lucide-react";
import { useQueue, useJobStatus } from "@/hooks/useQueue";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { Card, CardHead } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/Badge";
import { EmptyState, ListSkeleton } from "@/components/ui/States";
import { SystemStatusBar } from "@/components/queue/SystemStatusBar";
import { JobRow, maskEmail } from "@/components/queue/JobRow";
import { JobConsole } from "@/components/queue/JobConsole";
import { formatHearts } from "@/lib/utils";

export default function QueuePage() {
  const { token } = useAuth();
  const { jobs, queuedCount, activeJob, strategy, loading, lastUpdated, refresh } = useQueue();
  const [selected, setSelected] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const focusId =
    selected || jobs.find((j) => j.status === "processing")?.id || jobs[0]?.id || null;
  const { job, logs, loadingLogs } = useJobStatus(focusId);

  // งานของคุณที่ยังไม่จบ ใช้บอกตำแหน่งคิวบนแถบสถานะ
  const nextOwn = useMemo(
    () =>
      jobs.find((j) => j.status === "processing") ||
      jobs.filter((j) => j.status === "queued").sort(
        (a, b) => (a.queue_position ?? 0) - (b.queue_position ?? 0)
      )[0],
    [jobs]
  );

  const cancel = async (id: string) => {
    if (!token) return;
    setCancelling(id);
    try {
      await api(`/api/jobs/${id}/cancel`, { method: "POST", token });
      await refresh();
    } finally {
      setCancelling(null);
    }
  };

  const runningOther = activeJob && !jobs.some((j) => j.id === activeJob.id) ? activeJob : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">คิวงาน</h1>
        <p className="text-sm text-muted">
          ตำแหน่งคิว ความคืบหน้า และ log สดของทุกงานที่คุณสั่งไว้
        </p>
      </div>

      <SystemStatusBar
        queuedCount={queuedCount}
        strategy={strategy}
        yourPosition={nextOwn?.status === "queued" ? nextOwn.queue_position : null}
        yourWaitMinutes={nextOwn?.estimated_wait_minutes}
        lastUpdated={lastUpdated}
        onRefresh={refresh}
      />

      {runningOther && (
        <Card className="px-4 py-3">
          <p className="font-mono text-[11px] uppercase tracking-widest text-dim">
            งานที่เครื่องกำลังรันอยู่ตอนนี้
          </p>
          <div className="mt-1.5 flex items-center justify-between gap-4 text-sm">
            <span className="text-muted">{maskEmail(runningOther.devplay_email)}</span>
            <span className="font-mono text-xs tabular-nums text-muted">
              {formatHearts(runningOther.hearts_collected)} /{" "}
              {formatHearts(runningOther.target_hearts)}
            </span>
          </div>
          <ProgressBar className="mt-2" value={Number(runningOther.progress_percent || 0)} />
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHead
            title="งานของคุณ"
            action={
              <span className="font-mono text-[11px] uppercase tracking-widest text-dim">
                คลิกแถวเพื่อดู log
              </span>
            }
          />
          {loading && <ListSkeleton rows={3} />}
          {!loading && jobs.length === 0 && (
            <EmptyState
              icon={ListOrdered}
              title="ยังไม่มีงานในคิว"
              description="ซื้อแพ็คเกจแล้วสั่งรันได้เลย ระบบจะตรวจไอดีให้ก่อนโดยไม่หักเครดิต"
              actionLabel="ซื้อแพ็คเกจ"
              actionHref="/packages"
            />
          )}
          {!loading &&
            jobs.map((j) => (
              <JobRow
                key={j.id}
                job={j}
                selected={focusId === j.id}
                cancelling={cancelling === j.id}
                onSelect={() => setSelected(j.id)}
                onCancel={() => cancel(j.id)}
              />
            ))}
        </Card>

        <div className="space-y-3">
          {job && (
            <Card className="px-4 py-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>{maskEmail(job.devplay_email)}</span>
                <span className="font-mono text-xs tabular-nums text-muted">
                  {formatHearts(job.hearts_collected)} / {formatHearts(job.target_hearts)}
                </span>
              </div>
              <ProgressBar className="mt-2" value={Number(job.progress_percent || 0)} />
              <p className="mt-2 text-xs text-dim">{job.progress_message}</p>
            </Card>
          )}
          <JobConsole
            logs={logs}
            loading={loadingLogs}
            title={job ? maskEmail(job.devplay_email) : undefined}
          />
        </div>
      </div>
    </div>
  );
}
