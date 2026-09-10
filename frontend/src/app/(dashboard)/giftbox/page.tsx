"use client";

import { useState } from "react";
import { Gift } from "lucide-react";
import { ToolScanGate } from "@/components/tools/ToolScanGate";
import { ToolRunPanel } from "@/components/tools/ToolRunPanel";
import { useToolRun } from "@/hooks/useToolRun";
import { Button } from "@/components/ui/Button";
import { Card, CardHead } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/States";
import type { GiftBoxScan } from "@/types";

const num = (n: number) => (n || 0).toLocaleString("en-US");

function GiftBoxForm({
  data,
  credentials,
}: {
  data: GiftBoxScan;
  credentials: Record<string, string>;
}) {
  const run = useToolRun("giftbox");
  const boxes = Math.max(0, data.boxes || 0);
  const [openAll, setOpenAll] = useState(true);
  const [want, setWant] = useState(String(boxes));
  const target = openAll ? boxes : Math.min(boxes, Number(want) || 0);

  if (run.running || run.job || run.error) {
    return (
      <ToolRunPanel {...run} unitLabel="กล่อง" onCancel={run.cancel} onReset={run.reset} />
    );
  }

  if (!boxes) {
    return (
      <Card>
        <CardHead title={`${data.nickname || data.mid} · ${data.mid}`} />
        <EmptyState
          icon={Gift}
          title="ไม่มีกล่องของขวัญให้เปิด"
          description="บัญชีนี้ยังไม่มีกล่องของขวัญค้างอยู่ตอนนี้ — กด “เข้าใหม่” ด้านบนเพื่อเช็คบัญชีอื่น"
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHead title={`${data.nickname || data.mid} · ${data.mid}`} />
      <div className="space-y-4 p-4">
        <div className="rounded-md border border-line bg-panel2 px-3 py-2.5">
          <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-dim">
            <Gift className="h-3 w-3" /> กล่องของขวัญ
          </p>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{num(boxes)}</p>
          <p className="text-[11px] text-muted">เปิดได้สูงสุด {num(boxes)} กล่อง</p>
        </div>

        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={openAll}
            onChange={(e) => setOpenAll(e.target.checked)}
            className="h-4 w-4 accent-[var(--heart)]"
          />
          <span>เปิดทั้งหมด ({num(boxes)} กล่อง)</span>
        </label>

        <div className="space-y-1.5">
          <label htmlFor="gb-boxes" className="text-sm text-muted">
            จำนวนกล่องที่ต้องการ
          </label>
          <Input
            id="gb-boxes"
            type="number"
            min={1}
            max={boxes}
            step={1}
            inputMode="numeric"
            value={openAll ? boxes : want}
            disabled={openAll}
            onChange={(e) => setWant(e.target.value)}
          />
          <p className="text-xs text-dim">
            กรอกได้ไม่เกิน {num(boxes)} กล่อง (เท่าที่มี) · รางวัลสุ่มเข้าบัญชีทันที
          </p>
        </div>

        <Button
          className="w-full"
          disabled={target < 1}
          onClick={() =>
            run.start({ ...credentials, params: { open_all: openAll, boxes: target } })
          }
        >
          <Gift className="mr-1.5 h-4 w-4" /> เปิด {num(target)} กล่อง
        </Button>
      </div>
    </Card>
  );
}

export default function GiftBoxPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <ToolScanGate<GiftBoxScan>
        slug="giftbox"
        title="เปิดกล่องของขวัญ"
        description="เปิดกล่องของขวัญที่ค้างอยู่ในบัญชีรวดเดียว — ฟรี ไม่คิดเครดิต"
        hint="รหัสผ่านใช้เข้าบัญชีเกมเพื่อนับกล่องและสั่งเปิด ไม่ถูกเก็บไว้หลังงานจบ"
        submitLabel="ตรวจสอบบัญชี"
      >
        {({ data, credentials }) => <GiftBoxForm data={data} credentials={credentials} />}
      </ToolScanGate>
    </div>
  );
}
