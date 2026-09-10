"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/Card";
import { Badge, ProgressBar, StatusPill } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/States";
import { JobConsole } from "@/components/queue/JobConsole";
import { PageHeader } from "@/components/admin/AdminUI";
import type { JobLog } from "@/hooks/useQueue";
import { formatHearts } from "@/lib/utils";
import type { Job } from "@/types";

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  heart: "หัวใจ",
  point: "พอยท์",
  angpao: "อั่งเปา",
};

export default function AdminJobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api<{ job: Job; logs: JobLog[] }>(`/api/admin/jobs/${id}`, { token })
      .then((d) => {
        setJob(d.job);
        setLogs(d.logs || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, id]);

  if (loading || !job) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Job ${job.id.slice(0, 8)}`}
        description={job.devplay_email}
        crumb={job.id.slice(0, 8)}
      />

      <Card className="space-y-3 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>{job.devplay_email}</span>
          <div className="flex items-center gap-2">
            {job.payment_method && (
              <Badge className="border border-lineStrong text-dim">
                {PAYMENT_METHOD_LABEL[job.payment_method] || job.payment_method}
              </Badge>
            )}
            <StatusPill status={job.status} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 font-mono text-xs tabular-nums text-muted">
          <span>
            {formatHearts(job.hearts_collected)} / {formatHearts(job.target_hearts)}
          </span>
          <span>{Math.round(Number(job.progress_percent || 0))}%</span>
        </div>
        <ProgressBar value={Number(job.progress_percent || 0)} />
        {job.progress_message && <p className="text-xs text-dim">{job.progress_message}</p>}
        {job.error_message && (
          <p className="rounded border border-fail/40 bg-fail/10 px-3 py-2 text-xs text-fail">
            {job.error_message}
          </p>
        )}
      </Card>

      <JobConsole logs={logs} title={job.devplay_email} />
    </div>
  );
}
