"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Coins, Hammer } from "lucide-react";
import { ToolScanGate } from "@/components/tools/ToolScanGate";
import { ToolRunPanel } from "@/components/tools/ToolRunPanel";
import { useToolRun } from "@/hooks/useToolRun";
import { Button } from "@/components/ui/Button";
import { Card, CardHead } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/States";
import { API_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { TreasureItem, TreasureScan } from "@/types";

const num = (n: number) => (n || 0).toLocaleString("en-US");

const imageUrl = (tag: string) =>
  `${API_URL}/api/account/image/treasure/${encodeURIComponent(tag)}`;

/** เหรียญที่ "คาดว่าจะใช้จริง" ถึงเป้า ไม่ใช่ราคาป้ายของแต่ละขั้นรวมกัน
 *
 * ขั้นที่โอกาสสำเร็จ 15% ต้องตีเฉลี่ยเกือบเจ็ดครั้งกว่าจะขึ้น การโชว์แค่ราคาป้าย
 * จึงต่ำกว่าความจริงหลายเท่า — สูตรเดียวกับที่หน้า ngmx ใช้
 */
function expectedCost(item: TreasureItem, target: number, scan: TreasureScan) {
  const ladder = scan.ladders[item.upgrade_group] || [];
  let expected = 0;
  for (const s of ladder) {
    if (s.plus < item.plus || s.plus >= target) continue;
    const pct = s.percent === null || s.percent === undefined ? 100 : s.percent;
    expected += pct > 0 ? Math.round((s.price * 100) / pct) : s.price;
  }
  return expected;
}

function TreasureForm({
  data,
  credentials,
}: {
  data: TreasureScan;
  credentials: Record<string, string>;
}) {
  const run = useToolRun("treasure");
  const maxPlus = data.max_plus || 9;
  const maxPicks = data.max_picks || 60;
  const [target, setTarget] = useState(maxPlus);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [budget, setBudget] = useState("");

  // เลือกได้เฉพาะชิ้นที่ยังตีขึ้นได้ และ + ยังไม่ถึงเป้า
  const eligible = useMemo(
    () => data.treasures.filter((it) => it.upgradeable && it.plus < target),
    [data.treasures, target]
  );
  const chosen = eligible.filter((it) => picked.has(it.uuid));
  const over = chosen.length > maxPicks;
  const totalCost = chosen.reduce((sum, it) => sum + expectedCost(it, target, data), 0);

  const toggle = (uuid: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(uuid)) next.add(uuid);
      return next;
    });

  if (run.running || run.job || run.error) {
    return <ToolRunPanel {...run} unitLabel="ชิ้น" onCancel={run.cancel} onReset={run.reset} />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHead title={`${data.nickname || data.mid} · ${data.mid}`} />
        <div className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-line bg-panel2 px-3 py-2.5">
              <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-dim">
                <Coins className="h-3 w-3" /> เหรียญ
              </p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{num(data.coin)}</p>
            </div>
            <div className="rounded-md border border-line bg-panel2 px-3 py-2.5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-dim">
                คาดว่าใช้เหรียญ
              </p>
              <p
                className={cn(
                  "mt-1 font-mono text-lg font-semibold tabular-nums",
                  totalCost > data.coin && "text-fail"
                )}
              >
                {num(totalCost)}
              </p>
              <p className="text-[11px] text-muted">
                {totalCost > data.coin
                  ? "เหรียญอาจไม่พอ — ระบบจะตีเท่าที่เหรียญถึง"
                  : `ประเมินจากโอกาสสำเร็จของแต่ละขั้น ถึง +${target}`}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="tr-target" className="text-sm text-muted">
              ตีถึง +{target}
            </label>
            <input
              id="tr-target"
              type="range"
              min={1}
              max={maxPlus}
              step={1}
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
              className="w-full accent-[var(--heart)]"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="tr-budget" className="text-sm text-muted">
              จำกัดเหรียญที่ใช้ (ไม่ใส่ = ไม่จำกัด)
            </label>
            <Input
              id="tr-budget"
              type="number"
              min={1}
              step={10000}
              inputMode="numeric"
              placeholder="เช่น 500000"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </div>
        </div>
      </Card>

      <Card>
        <CardHead
          title={`เลือกสมบัติ · ${chosen.length}/${maxPicks}`}
          action={
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setPicked(new Set(eligible.slice(0, maxPicks).map((it) => it.uuid)))
                }
              >
                เลือกสูงสุด
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPicked(new Set())}>
                ล้าง
              </Button>
            </div>
          }
        />
        {eligible.length ? (
          <div className="grid grid-cols-3 gap-3 p-4 sm:grid-cols-4 md:grid-cols-6">
            {eligible.map((it) => {
              const on = picked.has(it.uuid);
              return (
                <button
                  key={it.uuid}
                  type="button"
                  onClick={() => toggle(it.uuid)}
                  aria-pressed={on}
                  title={`${it.name} · เกรด ${it.grade}`}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md border p-2 text-center transition",
                    on
                      ? "border-heart/60 bg-heart/10"
                      : "border-lineSoft bg-panel2 hover:border-muted/60"
                  )}
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-md border border-lineSoft bg-ink/50">
                    {it.has_icon ? (
                      <Image
                        src={imageUrl(it.image_tag)}
                        alt=""
                        width={48}
                        height={48}
                        unoptimized
                        className="h-12 w-12 object-contain"
                      />
                    ) : (
                      <span className="font-mono text-[10px] text-dim">{it.grade}</span>
                    )}
                  </div>
                  <span className="line-clamp-2 text-[11px] leading-tight text-muted">
                    {it.name}
                  </span>
                  <span className="font-mono text-[10px] text-dim">
                    {it.grade} · +{it.plus}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Hammer}
            title="ไม่มีสมบัติที่ตีขึ้นได้"
            description={`สมบัติในบัญชีนี้ตีถึง +${target} หมดแล้ว ลองลดเป้าลง หรือกด “เข้าใหม่” เพื่อเช็คบัญชีอื่น`}
          />
        )}
      </Card>

      <Button
        className="w-full"
        disabled={!chosen.length || over}
        onClick={() =>
          run.start({
            ...credentials,
            params: {
              treasures: chosen.map((it) => ({ uuid: it.uuid, group_seq: it.group_seq })),
              target_plus: target,
              // ไม่ใส่ = ไม่จำกัด — ห้ามส่ง 0 เพราะฝั่งหลังบ้านแปลว่า "ห้ามใช้เหรียญเลย"
              budget: Number(budget) > 0 ? Number(budget) : undefined,
            },
          })
        }
      >
        <Hammer className="mr-1.5 h-4 w-4" />
        {over
          ? `เลือกได้ไม่เกิน ${maxPicks} ชิ้น`
          : chosen.length
            ? `เริ่มตี ${chosen.length} ชิ้น ถึง +${target}`
            : "เลือกสมบัติก่อน"}
      </Button>
    </div>
  );
}

export default function TreasurePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <ToolScanGate<TreasureScan>
        slug="treasure"
        title="ตี + สมบัติ"
        description="อัปเกรด + ให้สมบัติในกระเป๋าด้วยเหรียญในบัญชี — ฟรี ไม่คิดเครดิต"
        hint="รหัสผ่านใช้เข้าบัญชีเกมเพื่ออ่านกระเป๋าสมบัติและสั่งตี ไม่ถูกเก็บไว้หลังงานจบ"
        submitLabel="ถัดไป · โหลดกระเป๋า"
      >
        {({ data, credentials }) => <TreasureForm data={data} credentials={credentials} />}
      </ToolScanGate>
    </div>
  );
}
