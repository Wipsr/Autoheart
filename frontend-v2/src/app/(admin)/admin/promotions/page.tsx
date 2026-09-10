"use client";

import { useCallback, useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { EmptyState, Skeleton } from "@/components/ui/States";
import { Field, PageHeader, Toggle } from "@/components/admin/AdminUI";

type Promo = {
  id: string;
  title: string;
  hearts_reward: number;
  is_active: boolean;
  slug: string;
};

export default function PromotionsPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedId, setSavedId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    api<Promo[]>("/api/admin/promotions", { token })
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = (id: string, changes: Partial<Promo>) =>
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, ...changes } : p)));

  const save = async (p: Promo) => {
    if (!token) return;
    await api(`/api/admin/promotions/${p.id}`, {
      method: "PUT",
      token,
      body: JSON.stringify({
        title: p.title,
        hearts_reward: p.hearts_reward,
        is_active: p.is_active,
      }),
    });
    setSavedId(p.id);
    setTimeout(() => setSavedId(null), 2000);
    load();
  };

  return (
    <div className="space-y-4">
      <PageHeader title="โปรโมชัน" description="หัวใจแถมสำหรับผู้ใช้ใหม่และแคมเปญอื่น ๆ" />

      {loading && <Skeleton className="h-28 w-full" />}
      {!loading && items.length === 0 && (
        <Card>
          <EmptyState icon={Gift} title="ยังไม่มีโปรโมชัน" />
        </Card>
      )}

      <div className="space-y-3">
        {items.map((p) => (
          <Card key={p.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-sm text-heart">{p.slug}</p>
              <Toggle
                checked={p.is_active}
                onChange={(is_active) => patch(p.id, { is_active })}
                label="เปิดใช้งาน"
              />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_160px]">
              <Field label="ชื่อที่ผู้ใช้เห็น">
                <Input value={p.title} onChange={(e) => patch(p.id, { title: e.target.value })} />
              </Field>
              <Field label="หัวใจที่แถม">
                <Input
                  className="font-mono tabular-nums"
                  type="number"
                  min="0"
                  value={p.hearts_reward}
                  onChange={(e) => patch(p.id, { hearts_reward: Number(e.target.value) })}
                />
              </Field>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <Button size="sm" onClick={() => save(p)}>
                บันทึก
              </Button>
              {savedId === p.id && <span className="text-sm text-live">บันทึกแล้ว</span>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
