import { cn, formatPoints } from "@/lib/utils";

/** เหรียญพอยท์ — ใช้ที่เดียวกันทุกที่ที่มีการพูดถึงยอดพอยท์ */
export function PointIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-4 w-4", className)}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 16V8h3.2a2.4 2.4 0 0 1 0 4.8H9.5" />
    </svg>
  );
}

/** ยอดพอยท์แบบเม็ดยา ใช้บนแถบบนและ sidebar */
export function PointChip({
  points,
  className,
  suffix = "พอยท์",
}: {
  points: number;
  className?: string;
  suffix?: string | null;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[34px] items-center gap-2 rounded-full border border-point-line bg-point-soft px-3",
        className
      )}
    >
      <PointIcon className="h-3.5 w-3.5 text-point" />
      <span className="font-mono text-sm font-semibold tabular-nums text-point-ink">
        {formatPoints(points)}
      </span>
      {suffix && <span className="text-xs text-point-dim">{suffix}</span>}
    </span>
  );
}

/** ยอดพอยท์ล้วน ๆ ใช้ในตารางและแถวงาน */
export function PointAmount({
  points,
  className,
  signed,
}: {
  points: number;
  className?: string;
  signed?: boolean;
}) {
  return (
    <span className={cn("font-mono text-[12.5px] tabular-nums", className)}>
      {signed && points > 0 ? "+" : ""}
      {formatPoints(points)} P
    </span>
  );
}
