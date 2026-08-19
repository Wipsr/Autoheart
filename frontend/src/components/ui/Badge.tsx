import { cn } from "@/lib/utils";
import { JOB_STATUS_LABEL } from "@/lib/constants";

export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide",
        className
      )}
    >
      {children}
    </span>
  );
}

/** สีสถานะมีความหมายเดียว: เขียว = กำลังรัน/เสร็จ, เหลือง = รอ, แดง = พัง, เทา = จบแล้ว/ยกเลิก */
const STATUS_TONE: Record<string, string> = {
  processing: "border-live/50 bg-live/10 text-live",
  completed: "border-live/40 bg-live/[0.06] text-live",
  queued: "border-wait/50 bg-wait/10 text-wait",
  validating: "border-info/50 bg-info/10 text-info",
  failed: "border-fail/50 bg-fail/10 text-fail",
  validation_failed: "border-fail/50 bg-fail/10 text-fail",
  cancelled: "border-line bg-white/[0.03] text-dim",
  refunded: "border-line bg-white/[0.03] text-dim",
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide",
        STATUS_TONE[status] || "border-line bg-white/[0.03] text-dim",
        className
      )}
    >
      {status === "processing" && (
        <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-live" />
      )}
      {JOB_STATUS_LABEL[status] || status}
    </span>
  );
}

export function ProgressBar({
  value,
  className,
  tone = "live",
}: {
  value: number;
  className?: string;
  tone?: "live" | "heart";
}) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-lineSoft", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500", {
          "bg-live": tone === "live",
          "bg-heart": tone === "heart",
        })}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

export function StatusDot({ status }: { status: string }) {
  const color =
    status === "processing" || status === "completed"
      ? "bg-live"
      : status === "failed" || status === "validation_failed"
        ? "bg-fail"
        : status === "queued"
          ? "bg-wait"
          : "bg-dim";
  return <span className={cn("inline-block h-2 w-2 rounded-full", color)} />;
}
