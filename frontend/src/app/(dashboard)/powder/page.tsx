"use client";

import { useState } from "react";
import { Coins, Sparkles } from "lucide-react";
import { ToolScanGate } from "@/components/tools/ToolScanGate";
import { ToolRunPanel } from "@/components/tools/ToolRunPanel";
import { useToolRun } from "@/hooks/useToolRun";
import { Button } from "@/components/ui/Button";
import { Card, CardHead } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import type { PowderScan } from "@/types";

const num = (n: number) => (n || 0).toLocaleString("en-US");

// กล่องสุ่มหนึ่งกล่องได้ผงราว ๆ เท่านี้ ใช้ประเมินคร่าว ๆ ว่าเหรียญที่มีพอถึงเป้าไหม
// ไม่ใช่ตัวเลขผูกมัด — ระบบทำเท่าที่เหรียญถึงแล้วหยุดเอง
const POWDER_PER_BOX = 9;

function PowderForm({ data, credentials }: { data: PowderScan; credentials: Record<string, string> }) {
  const run = useToolRun("powder");
  const maxByCoin = Math.floor((data.coin || 0) / (data.box_price || 5000)) * POWDER_PER_BOX;
  const [want, setWant] = useState(String(Math.min(10000, Math.max(1, maxByCoin || 10000))));
  const target = Number(want) || 0;
  const notEnough = target > maxByCoin && maxByCoin > 0;

  if (run.running || run.job || run.error) {
    return (
      <ToolRunPanel
        {...run}
        unitLabel="ผง"
        onCancel={run.cancel}
        onReset={run.reset}
      />
    );
  }

  return (
    <Card>
      <CardHead title={`${data.nickname || data.mid} · ${data.mid}`} />
      <div className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-line bg-panel2 px-3 py-2.5">
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-dim">
              <Coins className="h-3 w-3" /> เหรียญ
            </p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{num(data.coin)}</p>
            <p className="text-[11px] text-muted">กล่องละ {num(data.box_price)} เหรียญ</p>
          </div>
          <div className="rounded-md border border-line bg-panel2 px-3 py-2.5">
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-dim">
              <Sparkles className="h-3 w-3" /> ผงตอนนี้
            </p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{num(data.powder)}</p>
            <p className="text-[11px] text-muted">เหรียญที่มีทำได้อีกราว {num(maxByCoin)} ผง</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="pf-powder" className="text-sm text-muted">
            จำนวนผงที่ต้องการ
          </label>
          <Input
            id="pf-powder"
            type="number"
            min={1}
            step={100}
            inputMode="numeric"
            value={want}
            onChange={(e) => setWant(e.target.value)}
          />
          <p className="text-xs text-dim">
            {notEnough
              ? `เหรียญอาจไม่พอถึง ${num(target)} ผง — ประเมินจากเหรียญที่มีทำได้ราว ${num(maxByCoin)} ผง ระบบจะทำเท่าที่เหรียญถึงแล้วหยุดเอง`
              : "ระบบเปิดกล่องสุ่มจนได้ผงถึงจำนวนนี้ หรือจนเหรียญในเกมหมด"}
          </p>
        </div>

        <Button
          className="w-full"
          disabled={target < 1}
          onClick={() => run.start({ ...credentials, params: { powder: target } })}
        >
          <Sparkles className="mr-1.5 h-4 w-4" /> เริ่มปั๊มผง
        </Button>
      </div>
    </Card>
  );
}

export default function PowderPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <ToolScanGate<PowderScan>
        slug="powder"
        title="ปั๊มผงเวทมนตร์"
        description="เปิดกล่องสุ่มด้วยเหรียญในบัญชีเพื่อแลกผงเวทมนตร์ — ฟรี ไม่คิดเครดิต"
        hint="รหัสผ่านใช้เข้าบัญชีเกมเพื่อดูเหรียญ/ผงและสั่งงาน ไม่ถูกเก็บไว้หลังงานจบ"
        submitLabel="ตรวจสอบบัญชี"
      >
        {({ data, credentials }) => <PowderForm data={data} credentials={credentials} />}
      </ToolScanGate>
    </div>
  );
}
