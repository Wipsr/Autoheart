"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Field, PageHeader, Toggle } from "@/components/admin/AdminUI";

export default function AdminProxyPage() {
  const { token } = useAuth();
  const [proxyUrl, setProxyUrl] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<{ proxy_url?: string; is_enabled?: boolean }>("/api/admin/proxy", { token })
      .then((d) => {
        setProxyUrl(d.proxy_url || "");
        setEnabled(!!d.is_enabled);
      })
      .catch(() => {});
  }, [token]);

  const save = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await api("/api/admin/proxy", {
        method: "PUT",
        token,
        body: JSON.stringify({ proxy_url: proxyUrl, is_enabled: enabled }),
      });
      setResult({ ok: true, text: "บันทึกแล้ว" });
    } catch {
      setResult({ ok: false, text: "บันทึกไม่สำเร็จ" });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const r = await api<{ ok: boolean; message: string }>("/api/admin/proxy/test", {
        method: "POST",
        token,
      });
      setResult({ ok: r.ok, text: r.message });
    } catch {
      setResult({ ok: false, text: "ทดสอบไม่สำเร็จ" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl space-y-4">
      <PageHeader title="Proxy" description="ใช้กับ worker ที่รัน heart farm เท่านั้น" />

      <Card className="space-y-4 p-5">
        <Field label="Proxy URL" hint="รูปแบบ http://user:pass@host:port/">
          <Input
            className="font-mono"
            placeholder="http://user:pass@host:port/"
            value={proxyUrl}
            onChange={(e) => setProxyUrl(e.target.value)}
          />
        </Field>

        <Toggle checked={enabled} onChange={setEnabled} label="เปิดใช้ proxy กับ worker" />

        <div className="flex gap-2">
          <Button disabled={busy} onClick={save}>
            บันทึก
          </Button>
          <Button variant="secondary" disabled={busy} onClick={test}>
            ทดสอบการเชื่อมต่อ
          </Button>
        </div>

        {result && (
          <p className={`text-sm ${result.ok ? "text-live" : "text-fail"}`}>{result.text}</p>
        )}
      </Card>
    </div>
  );
}
