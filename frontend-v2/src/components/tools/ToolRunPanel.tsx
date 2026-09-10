"use client";

import { useEffect, useRef } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Card, CardHead } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { ToolJob } from "@/types";

/** จังหวะที่ 3: ถ่ายทอดสดระหว่างทำงาน + สรุปผลตอนจบ
 *
 * งานอยู่ฝั่ง ngmx และผูกกับการเชื่อมต่อเส้นนี้ ถ้าปิดหน้าไปงานจะถูกยกเลิก
 * จึงต้องบอกผู้ใช้ให้ชัดว่าอย่าเพิ่งปิด
 */
export function ToolRunPanel({
  job,
  lines,
  progress,
  step,
  running,
  error,
  unitLabel,
  onCancel,
  onReset,
}: {
  job: ToolJob | null;
  lines: string[];
  progress: number;
  step: string;
  running: boolean;
  error: string | null;
  unitLabel: string;
  onCancel: () => void;
  onReset: () => void;
}) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const result = job?.status === "success" ? job.result : null;
  const failed = Boolean(error) || job?.status === "error";

  return (
    <div className="space-y-4">
      <Card glow={running}>
        <CardHead
          title={
            running ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-heart" /> กำลังทำงาน
              </span>
            ) : failed ? (
              <span className="flex items-center gap-2 text-fail">
                <XCircle className="h-4 w-4" /> ไม่สำเร็จ
              </span>
            ) : (
              <span className="flex items-center gap-2 text-live">
                <CheckCircle2 className="h-4 w-4" /> เสร็จสิ้น
              </span>
            )
          }
          action={
            running ? (
              <Button variant="danger" size="sm" onClick={onCancel}>
                หยุดงาน
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={onReset}>
                สั่งงานใหม่
              </Button>
            )
          }
        />
        <div className="space-y-3 p-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel2">
            <div
              className="h-full rounded-full bg-heart transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-muted">{step || "กำลังเตรียม …"}</span>
            <span className="font-mono tabular-nums text-dim">
              {job ? `${job.delivered.toLocaleString("en-US")} / ${job.units.toLocaleString("en-US")} ${unitLabel}` : ""}
            </span>
          </div>
          {running && (
            <p className="text-xs text-dim">อย่าปิดหน้านี้จนกว่างานจะจบ — ปิดแล้วงานจะถูกยกเลิก</p>
          )}
          {error && (
            <p className="rounded-md border border-fail/40 bg-fail/10 px-3 py-2 text-sm text-fail">
              {error}
            </p>
          )}
        </div>
      </Card>

      {lines.length > 0 && (
        <Card>
          <CardHead title="บันทึกการทำงาน" />
          <div
            ref={logRef}
            className="max-h-56 overflow-y-auto p-4 font-mono text-xs leading-relaxed text-muted"
          >
            {lines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </Card>
      )}

      {result && (
        <Card>
          <CardHead title={result.title || "ผลลัพธ์"} />
          <div className="space-y-3 p-4">
            {result.summary?.length ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {result.summary.map((row, i) => (
                  <div key={i} className="rounded-md border border-line bg-panel2 px-3 py-2.5">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-dim">
                      {row.label}
                    </p>
                    <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{row.value}</p>
                    {row.sub && <p className="text-[11px] text-muted">{row.sub}</p>}
                  </div>
                ))}
              </div>
            ) : null}
            {result.next_step && <p className="text-sm text-muted">{result.next_step}</p>}
          </div>
        </Card>
      )}
    </div>
  );
}
