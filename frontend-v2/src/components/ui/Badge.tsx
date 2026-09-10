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
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium",
        className
      )}
    >
      {children}
    </span>
  );
}

/** สีสถานะมีความหมายเดียว: เขียว = กำลังรัน/เสร็จ, คราม = รอคิว, แดง = พัง, เทา = จบแล้ว */
const STATUS_TONE: Record<string, string> = {
  processing: "border-live-line bg-live-soft text-live-ink",
  completed: "border-line bg-surface2 text-muted",
  queued: "border-wait-line bg-wait-soft text-wait-ink",
  validating: "border-info-line bg-info-soft text-info-ink",
  failed: "border-fail-line bg-fail-soft text-fail-ink",
  validation_failed: "border-fail-line bg-fail-soft text-fail-ink",
  cancelled: "border-line bg-surface2 text-muted",
  refunded: "border-line bg-surface2 text-muted",
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium",
        STATUS_TONE[status] || "border-line bg-surface2 text-muted",
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
  tone?: "live" | "point" | "muted";
}) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-[#E4E2DC]", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500", {
          "bg-live": tone === "live",
          "bg-point": tone === "point",
          "bg-[#C5C3BC]": tone === "muted",
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
