"use client";

import { Play } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn, formatAgo, formatWait } from "@/lib/utils";
import { maskEmail } from "./JobRow";
import type { Job } from "@/types";

const MAX_SLOTS = 12;

/**
 * คิวรวมทั้งระบบวาดเป็นแถบเดียว
 *
 * ของเดิมบอกแค่ว่า "คุณอยู่ #3" ซึ่งไม่ได้ตอบคำถามที่คนถามจริง ๆ ว่าทำไมต้องรอนานขนาดนั้น
 * พอเห็นทั้งแถวแล้วเห็นช่องของตัวเองกระจายอยู่ คนถึงเข้าใจว่าคิวสลับรอบทำงานยังไง
 */
export function QueueStrip({
  queuedCount,
  activeJob,
  yourPositions,
  yourWaitMinutes,
  lastUpdated,
  className,
}: {
  queuedCount: number;
  activeJob?: Job | null;
  yourPositions: number[];
  yourWaitMinutes?: number | null;
  lastUpdated?: Date | null;
  className?: string;
}) {
  const own = new Set(yourPositions);
  const shown = Math.min(queuedCount, MAX_SLOTS);
  const overflow = queuedCount - shown;
  const nextOwn = yourPositions.length ? Math.min(...yourPositions) : null;

  return (
    <Card className={cn("p-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="h-[7px] w-[7px] rounded-full bg-live shadow-[0_0_0_3px_rgba(23,145,79,0.13)]" />
          <span className="font-display text-sm font-semibold">คิวรวมทั้งระบบ</span>
          <span className="rounded-md border border-line bg-surface2 px-2 py-0.5 font-mono text-[11px] text-muted">
            สลับรอบระหว่างผู้ใช้
          </span>
        </div>
        <span className="font-mono text-[11px] text-dim">อัปเดต {formatAgo(lastUpdated)}</span>
      </div>

      <div className="mt-3.5 flex items-stretch gap-1.5">
        <div
          className={cn(
            "flex h-9 flex-[3] items-center justify-center gap-2 rounded-lg border px-2",
            activeJob ? "border-live-line bg-live-soft" : "border-line bg-surface2"
          )}
        >
          {activeJob ? (
            <>
              <Play className="h-3 w-3 shrink-0 fill-live text-live" />
              <span className="truncate font-mono text-[11.5px] text-live-ink">
                {maskEmail(activeJob.devplay_email).split("@")[0]}
              </span>
            </>
          ) : (
            <span className="font-mono text-[11px] text-dim">ว่าง</span>
          )}
        </div>

        {Array.from({ length: shown }).map((_, i) => {
          const pos = i + 1;
          const mine = own.has(pos);
          return (
            <div
              key={pos}
              className={cn(
                "flex h-9 flex-1 items-center justify-center rounded-lg border",
                mine ? "border-wait-line bg-wait-soft" : "border-line bg-surface2"
              )}
            >
              <span
                className={cn(
                  "font-mono text-[11px]",
                  mine ? "font-medium text-wait-ink" : "text-dim"
                )}
              >
                #{pos}
                {mine && <span className="ml-1">คุณ</span>}
              </span>
            </div>
          );
        })}

        {overflow > 0 && (
          <div className="flex h-9 items-center justify-center rounded-lg border border-line bg-surface2 px-2.5">
            <span className="font-mono text-[11px] text-dim">+{overflow}</span>
          </div>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
        <span>งานของคุณถูกสลับแทรกกับคนอื่น ไม่ต่อกันเป็นพรืด</span>
        {nextOwn != null && (
          <span>
            คิวใกล้สุดของคุณ{" "}
            <span className="font-mono font-semibold text-wait-ink">#{nextOwn}</span>
            {yourWaitMinutes != null && (
              <>
                {" · รออีก "}
                <span className="font-mono font-semibold text-ink2">
                  {formatWait(yourWaitMinutes).replace("~", "")}
                </span>
              </>
            )}
          </span>
        )}
      </div>
    </Card>
  );
}
