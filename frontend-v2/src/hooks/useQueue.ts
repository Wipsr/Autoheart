"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { WS_URL } from "@/lib/constants";
import type { Job } from "@/types";
import { useAuth } from "./useAuth";

export type JobLog = {
  level: string;
  message: string;
  created_at?: string;
};

export function useQueue() {
  const { token } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [queuedCount, setQueuedCount] = useState(0);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [strategy, setStrategy] = useState("fair");
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = async () => {
    if (!token) return;
    try {
      const data = await api<{
        your_jobs: Job[];
        queued_count: number;
        active_job: Job | null;
        strategy: string;
      }>("/api/queue/status", { token });
      setJobs(data.your_jobs || []);
      setQueuedCount(data.queued_count);
      setActiveJob(data.active_job);
      setStrategy(data.strategy);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 8000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const ws = new WebSocket(`${WS_URL}/ws/queue?token=${token}`);
    ws.onmessage = () => refresh();
    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return { jobs, queuedCount, activeJob, strategy, loading, lastUpdated, refresh };
}

export function useJobStatus(jobId: string | null) {
  const { token } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    if (!token || !jobId) return;
    setLogs([]);
    setLoadingLogs(true);

    const load = async () => {
      const j = await api<Job>(`/api/jobs/${jobId}`, { token });
      setJob(j);
      const l = await api<JobLog[]>(`/api/jobs/${jobId}/logs`, { token });
      setLogs(l);
    };
    load().finally(() => setLoadingLogs(false));

    const ws = new WebSocket(`${WS_URL}/ws/jobs/${jobId}?token=${token}`);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "log") {
          // log ที่มาสด ๆ ไม่มีเวลาติดมา — ประทับเวลาที่ฝั่ง client เพื่อให้ทุกบรรทัดมีเวลา
          setLogs((prev) => [
            ...prev,
            {
              level: msg.level,
              message: msg.message,
              created_at: msg.created_at || new Date().toISOString(),
            },
          ]);
        }
        if (msg.type === "progress" || msg.type === "status") {
          setJob((prev) => (prev ? { ...prev, ...msg } : prev));
          if (msg.type === "status") load();
        }
      } catch {
        /* ignore */
      }
    };
    return () => ws.close();
  }, [token, jobId]);

  return { job, logs, loadingLogs };
}
