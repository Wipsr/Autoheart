"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn, formatAgo, formatWait } from "@/lib/utils";

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={cn("font-mono text-lg font-semibold tabular-nums", tone)}>{value}</span>
      <span className="font-mono text-[10px] uppercase tracking-widest text-dim">{label}</span>
    </div>
  );
}

/** แถบสถานะระบบด้านบนทุกหน้า — บอกด้วยว่าข้อมูลสดแค่ไหน คนจะได้ไม่ต้องกดรีเฟรชเอง */
export function SystemStatusBar({
  queuedCount,
  strategy,
  yourPosition,
  yourWaitMinutes,
  lastUpdated,
  onRefresh,
  className,
}: {
  queuedCount: number;
  strategy?: string;
  yourPosition?: number | null;
  yourWaitMinutes?: number | null;
  lastUpdated?: Date | null;
  onRefresh?: () => void;
  className?: string;
}) {
  const [, tick] = useState(0);

  // เดินนาฬิกาเองทุกวินาที ให้ข้อความ "อัปเดตเมื่อ …" ขยับจริง
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const fresh = lastUpdated ? Date.now() - lastUpdated.getTime() < 20000 : false;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-7 gap-y-4 rounded-md border border-line bg-panel2 px-4 py-3",
        className
      )}
    >
      <div className="flex items-center gap-2 font-mono text-xs">
        <span
          className={cn(
            "inline-block h-2 w-2 rounded-full",
            fresh ? "pulse-dot bg-live" : "bg-dim"
          )}
        />
        <span className={fresh ? "text-live" : "text-dim"}>
          {fresh ? "เชื่อมต่อสด" : "ข้อมูลอาจไม่สด"}
        </span>
        <span className="text-dim">· อัปเดต {formatAgo(lastUpdated)}</span>
      </div>

      {yourPosition != null && (
        <Stat label="คิวของคุณ" value={`#${yourPosition}`} tone="text-wait" />
      )}
      {yourWaitMinutes != null && (
        <Stat label="เริ่มในอีก" value={formatWait(yourWaitMinutes).replace("~", "")} />
      )}
      <Stat label="คิวทั้งระบบ" value={String(queuedCount)} />
      {strategy && (
        <Stat label="กลยุทธ์คิว" value={strategy === "fair" ? "สลับรอบ" : strategy} />
      )}

      {onRefresh && (
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onRefresh}>
          <RefreshCw className="h-3.5 w-3.5" />
          รีเฟรช
        </Button>
      )}
    </div>
  );
}
