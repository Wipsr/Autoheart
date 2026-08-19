"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Field, PageHeader, Toggle } from "@/components/admin/AdminUI";

type Maintenance = {
  enabled: boolean;
  message: string;
  eta: string;
  banner_enabled: boolean;
  banner_text: string;
};

export default function MaintenancePage() {
  const { token } = useAuth();
  const [data, setData] = useState<Maintenance>({
    enabled: false,
    message: "",
    eta: "",
    banner_enabled: false,
    banner_text: "",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<Maintenance>("/api/admin/maintenance", { token })
      .then(setData)
      .catch(() => {});
  }, [token]);

  const save = async () => {
    if (!token) return;
    await api("/api/admin/maintenance", { method: "PUT", token, body: JSON.stringify(data) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-xl space-y-4">
      <PageHeader
        title="ปิดปรับปรุง & แบนเนอร์"
        description="ปิดเว็บชั่วคราว หรือขึ้นแถบประกาศบนหัวเว็บ"
      />

      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <Toggle
            checked={data.enabled}
            onChange={(enabled) => setData({ ...data, enabled })}
            label="ปิดเว็บเพื่อปรับปรุง"
          />
          <span
            className={`rounded border px-2 py-0.5 font-mono text-[11px] ${
              data.enabled ? "border-fail/50 bg-fail/10 text-fail" : "border-line text-dim"
            }`}
          >
            {data.enabled ? "ผู้ใช้เข้าไม่ได้" : "เปิดปกติ"}
          </span>
        </div>

        <Field label="ข้อความตอนปิดปรับปรุง">
          <Input
            placeholder="ระบบปิดปรับปรุงชั่วคราว"
            value={data.message}
            onChange={(e) => setData({ ...data, message: e.target.value })}
          />
        </Field>

        <Field label="กลับมาเมื่อไร" hint="เช่น 22:00 — ผู้ใช้จะเห็นข้อความนี้">
          <Input
            placeholder="22:00"
            value={data.eta}
            onChange={(e) => setData({ ...data, eta: e.target.value })}
          />
        </Field>
      </Card>

      <Card className="space-y-4 p-5">
        <Toggle
          checked={data.banner_enabled}
          onChange={(banner_enabled) => setData({ ...data, banner_enabled })}
          label="แสดงแบนเนอร์ประกาศ"
        />
        <Field label="ข้อความแบนเนอร์">
          <Input
            placeholder="เช่น คิวยาวกว่าปกติช่วงเย็นนี้"
            value={data.banner_text}
            onChange={(e) => setData({ ...data, banner_text: e.target.value })}
          />
        </Field>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={save}>บันทึก</Button>
        {saved && <span className="text-sm text-live">บันทึกแล้ว</span>}
      </div>
    </div>
  );
}
