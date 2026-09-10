"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/States";
import { cn, formatClock } from "@/lib/utils";
import type { JobLog } from "@/hooks/useQueue";

type Filter = "all" | "warning" | "error";

// console เป็นพื้นเข้มบนหน้าสว่าง สีระดับ log จึงเป็นชุดสว่างของตัวเอง
// ใช้ token ของหน้าสว่างตรง ๆ จะจมหายไปกับพื้นดำ
const LEVEL_TONE: Record<string, string> = {
  error: "text-[#FF7B6B]",
  warning: "text-[#F5A524]",
  success: "text-[#3DDC97]",
  info: "text-[#7FB4F5]",
};

export function JobConsole({
  logs,
  loading,
  title,
  className,
}: {
  logs: JobLog[];
  loading?: boolean;
  title?: string;
  className?: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const shown = useMemo(() => {
    if (filter === "all") return logs;
    if (filter === "warning") return logs.filter((l) => l.level === "warning" || l.level === "error");
    return logs.filter((l) => l.level === "error");
  }, [logs, filter]);

  // เลื่อนตาม log ใหม่ให้อัตโนมัติ เว้นแต่ผู้ใช้เลื่อนขึ้นไปอ่านย้อนหลังอยู่
  useEffect(() => {
    const box = boxRef.current;
    if (box && stickToBottom.current) box.scrollTop = box.scrollHeight;
  }, [shown]);

  const onScroll = () => {
    const box = boxRef.current;
    if (!box) return;
    stickToBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  };

  const copyLogs = async () => {
    try {
      await navigator.clipboard.writeText(
        shown.map((l) => `[${formatClock(l.created_at)}] ${l.level}: ${l.message}`).join("\n")
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* คลิปบอร์ดไม่ผ่าน — ผู้ใช้ยังเลือกข้อความเองได้ */
    }
  };

  const counts = useMemo(
    () => ({
      warning: logs.filter((l) => l.level === "warning").length,
      error: logs.filter((l) => l.level === "error").length,
    }),
    [logs]
  );

  return (
    <div className={cn("flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-lineSoft px-4 py-2.5">
        <div className="font-display text-sm font-semibold">
          Console
          {title && <span className="ml-2 font-mono text-xs font-normal text-dim">{title}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {(
            [
              ["all", `ทั้งหมด ${logs.length}`],
              ["warning", `เตือน ${counts.warning}`],
              ["error", `ผิดพลาด ${counts.error}`],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                "rounded border px-2 py-0.5 font-mono text-[11px] transition",
                filter === key
                  ? key === "error"
                    ? "border-fail-line bg-fail-soft text-fail-ink"
                    : key === "warning"
                      ? "border-point-line bg-point-soft text-point-ink"
                      : "border-lineStrong bg-surface2 text-ink"
                  : "border-line text-dim hover:text-muted"
              )}
            >
              {label}
            </button>
          ))}
          <Button variant="ghost" size="sm" onClick={copyLogs} aria-label="คัดลอก log">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "ย่อ console" : "ขยาย console"}
          >
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      <div
        ref={boxRef}
        onScroll={onScroll}
        className={cn(
          // ล็อกด้วย min+max height: ถ้าใช้ height เฉย ๆ กริด/เฟล็กซ์จะบีบความสูงกลับตอนกดขยาย
          "console-scroll console-surface shrink-0 overflow-y-auto border-x-0 border-b-0 px-3 py-2.5 font-mono text-[11.5px] leading-relaxed",
          expanded
            ? "min-h-[70vh] max-h-[70vh]"
            : "min-h-[20rem] max-h-[20rem] lg:min-h-[26rem] lg:max-h-[26rem]"
        )}
      >
        {loading && (
          <div className="space-y-2 py-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-3" />
            ))}
          </div>
        )}
        {!loading && shown.length === 0 && (
          <p className="text-[#6B7280]">
            {logs.length === 0
              ? "ยังไม่มี log — จะขึ้นทันทีที่ worker เริ่มรันงานนี้"
              : "ไม่มีบรรทัดที่ตรงกับตัวกรองนี้"}
          </p>
        )}
        {shown.map((l, i) => (
          <div key={i} className="grid grid-cols-[62px_52px_1fr] gap-2.5">
            <span className="tabular-nums text-[#5A6270]">{formatClock(l.created_at)}</span>
            <span className={cn("uppercase", LEVEL_TONE[l.level] || "text-[#5A6270]")}>{l.level}</span>
            <span className="whitespace-pre-wrap break-words text-[#A9B0BC]">{l.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
