"use client";

import Link from "next/link";
import { ChevronRight, Gift, Hammer, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";

// หน้ารวมทางเข้าเครื่องมือฟรี — มีไว้เพื่อมือถือเป็นหลัก เพราะแถบล่างใส่ครบสามอันไม่ไหว
// (เดสก์ท็อปเข้าตรงจากแถบข้างได้เลย)
const tools = [
  {
    href: "/powder",
    label: "ปั๊มผงเวทมนตร์",
    description: "เปิดกล่องสุ่มด้วยเหรียญในบัญชีเพื่อแลกผงเวทมนตร์",
    icon: Sparkles,
  },
  {
    href: "/giftbox",
    label: "เปิดกล่องของขวัญ",
    description: "เปิดกล่องของขวัญที่ค้างอยู่ในบัญชีรวดเดียว",
    icon: Gift,
  },
  {
    href: "/treasure",
    label: "ตี + สมบัติ",
    description: "อัปเกรด + ให้สมบัติในกระเป๋าด้วยเหรียญในบัญชี",
    icon: Hammer,
  },
];

export default function ToolsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="font-display text-xl font-semibold">เครื่องมือ</h1>
        <p className="mt-1 text-sm text-muted">
          ใช้ได้ฟรี ไม่คิดเครดิต ไม่ต้องเข้าคิว — แต่ต้องเปิดหน้าค้างไว้จนงานจบ
        </p>
      </div>
      <div className="space-y-2">
        {tools.map(({ href, label, description, icon: Icon }) => (
          <Link key={href} href={href}>
            <Card className="flex items-center gap-3 p-4 transition hover:border-muted/60">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line bg-panel2 text-heart">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-sm font-semibold">{label}</span>
                <span className="block text-xs text-muted">{description}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-dim" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
