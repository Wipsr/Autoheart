"use client";

import { Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ProgressBar, StatusPill } from "@/components/ui/Badge";
import { cn, formatHearts, formatWait } from "@/lib/utils";
import type { Job } from "@/types";

/** ปิดอีเมลบางส่วน เผื่อผู้ใช้แชร์จอหรือสตรีม */
export function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const head = name.slice(0, 3);
  return `${head}${name.length > 3 ? "***" : ""}@${domain}`;
}

/** งานหนึ่งชิ้น = หนึ่งแถว เทียบกันในแนวตั้งได้ ไม่ใช่การ์ดลอย ๆ */
export function JobRow({
  job,
  selected,
  onSelect,
  onCancel,
  cancelling,
}: {
  job: Job;
  selected?: boolean;
  onSelect?: () => void;
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  const running = job.status === "processing";
  const percent = Number(job.progress_percent || 0);

  return (
    <div
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (onSelect && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "grid grid-cols-[28px_1fr_auto] items-start gap-x-3 gap-y-2 border-b border-lineSoft px-4 py-3 text-sm transition last:border-b-0 sm:grid-cols-[32px_1fr_130px_128px_96px] sm:items-center",
        onSelect && "cursor-pointer hover:bg-white/[0.03]",
        selected && "bg-white/[0.05]",
        running && "bg-live/[0.05] shadow-[inset_2px_0_0_var(--live)]"
      )}
    >
      <div className="pt-0.5 font-mono text-xs tabular-nums text-dim">
        {running ? (
          <Play className="h-3.5 w-3.5 fill-live text-live" />
        ) : job.queue_position != null ? (
          `#${job.queue_position}`
        ) : (
          "—"
        )}
      </div>

      <div className="min-w-0">
        <p className="truncate">{maskEmail(job.devplay_email)}</p>
        <p className="mt-0.5 font-mono text-[11px] text-dim">
          {job.status === "queued" && job.estimated_wait_minutes != null
            ? `รอประมาณ ${formatWait(job.estimated_wait_minutes)}`
            : running
              ? job.progress_message || "กำลังฟาร์ม"
              : job.created_at
                ? new Date(job.created_at).toLocaleString("th-TH", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : ""}
        </p>
        {running && <ProgressBar className="mt-2 sm:hidden" value={percent} />}
      </div>

      <div className="row-start-1 justify-self-end sm:row-auto sm:justify-self-start">
        <StatusPill status={job.status} />
      </div>

      <div className="col-span-2 font-mono text-xs tabular-nums text-muted sm:col-span-1 sm:text-right">
        {formatHearts(job.hearts_collected)} / {formatHearts(job.target_hearts)}
        {running && <ProgressBar className="mt-1.5 hidden sm:block" value={percent} />}
      </div>

      <div className="justify-self-end">
        {job.status === "queued" && onCancel ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={cancelling}
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
          >
            {cancelling ? "กำลังยกเลิก" : "ยกเลิก"}
          </Button>
        ) : (
          <span className="font-mono text-xs tabular-nums text-dim">
            {running ? `${Math.round(percent)}%` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
