"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cn, formatWait } from "@/lib/utils";

type Stats = {
  running_count: number;
  queued_count: number;
  estimated_wait_minutes: number;
  completed_jobs: number;
  strategy: string;
  paused: boolean;
};

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={cn("font-mono text-xl font-semibold tabular-nums", tone)}>{value}</span>
      <span className="font-mono text-[10px] uppercase tracking-widest text-dim">{label}</span>
    </div>
  );
}

/** สถานะคิวจริงบนหน้าแรก — ถ้าดึงไม่ได้ก็ไม่แสดงอะไรเลย ดีกว่าโชว์ตัวเลขปลอม */
export function LiveStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<Stats>("/api/public/queue-stats")
        .then((s) => alive && setStats(s))
        .catch(() => alive && setStats(null));
    load();
    const id = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!stats) return null;

  return (
    <div className="flex w-full flex-wrap items-center gap-x-8 gap-y-4 rounded-md border border-line bg-panel px-5 py-4">
      <div className="flex items-center gap-2 font-mono text-xs">
        <span
          className={cn(
            "inline-block h-2 w-2 rounded-full",
            stats.paused ? "bg-wait" : "pulse-dot bg-live"
          )}
        />
        <span className={stats.paused ? "text-wait" : "text-live"}>
          {stats.paused ? "คิวหยุดชั่วคราว" : "ระบบทำงานปกติ"}
        </span>
      </div>
      <Stat label="กำลังรัน" value={String(stats.running_count)} tone="text-live" />
      <Stat label="รอในคิว" value={String(stats.queued_count)} tone="text-wait" />
      <Stat
        label="รอโดยประมาณ"
        value={formatWait(stats.estimated_wait_minutes).replace("~", "")}
      />
      <Stat label="งานที่ฟาร์มเสร็จแล้ว" value={stats.completed_jobs.toLocaleString("th-TH")} />
    </div>
  );
}
