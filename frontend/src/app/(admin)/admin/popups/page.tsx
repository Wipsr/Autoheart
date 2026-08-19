"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Card, CardHead } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, ListSkeleton } from "@/components/ui/States";
import { Field, PageHeader } from "@/components/admin/AdminUI";

type Popup = {
  id: string;
  title: string;
  body: string;
  is_active: boolean;
  dismiss_hours: number;
};

export default function PopupsPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<Popup[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    api<Popup[]>("/api/admin/popups", { token })
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/popups", {
        method: "POST",
        token,
        body: JSON.stringify({ title, body }),
      });
      setTitle("");
      setBody("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "สร้างป็อปอัปไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="ป็อปอัป" description="ข้อความที่เด้งให้ผู้ใช้เห็นตอนเข้าเว็บ" />

      <Card className="p-4">
        <form onSubmit={create} className="space-y-3">
          <Field label="หัวข้อ">
            <Input
              required
              placeholder="เช่น ปิดปรับปรุงคืนนี้ 23:00"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="ข้อความ">
            <textarea
              required
              rows={4}
              className="w-full rounded-md border border-line bg-ink/70 px-3 py-2.5 text-sm text-foreground placeholder:text-dim outline-none transition focus:border-heart/60"
              placeholder="รายละเอียดที่อยากให้ผู้ใช้รู้"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>
          {error && <p className="text-sm text-fail">{error}</p>}
          <Button disabled={busy}>สร้างป็อปอัป</Button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <CardHead title="ป็อปอัปทั้งหมด" />
        {loading && <ListSkeleton rows={2} />}
        {!loading && items.length === 0 && (
          <EmptyState icon={MessageSquare} title="ยังไม่มีป็อปอัป" />
        )}
        {!loading &&
          items.map((x) => (
            <div key={x.id} className="border-b border-lineSoft p-4 last:border-b-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-display text-sm font-semibold">{x.title}</p>
                <Badge
                  className={
                    x.is_active
                      ? "border border-live/40 bg-live/10 text-live"
                      : "border border-line text-dim"
                  }
                >
                  {x.is_active ? "active" : "off"}
                </Badge>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted">{x.body}</p>
              <p className="mt-2 font-mono text-[11px] text-dim">
                ปิดแล้วเงียบ {x.dismiss_hours} ชม.
              </p>
            </div>
          ))}
      </Card>
    </div>
  );
}
