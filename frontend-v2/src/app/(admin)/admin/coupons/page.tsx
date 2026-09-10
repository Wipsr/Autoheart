"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Ticket } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Card, CardHead } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, ListSkeleton } from "@/components/ui/States";
import { Field, PageHeader } from "@/components/admin/AdminUI";

type Coupon = {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  used_count: number;
  max_uses?: number;
  is_active: boolean;
};

export default function CouponsPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [type, setType] = useState("percent");
  const [value, setValue] = useState("10");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    api<Coupon[]>("/api/admin/coupons", { token })
      .then(setRows)
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
      await api("/api/admin/coupons", {
        method: "POST",
        token,
        body: JSON.stringify({
          code,
          discount_type: type,
          discount_value: Number(value),
        }),
      });
      setCode("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "สร้างคูปองไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="คูปอง" description="ส่วนลดที่ผู้ใช้กรอกตอนสั่งซื้อ" />

      <Card className="p-4">
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-[1fr_140px_140px_auto]">
          <Field label="รหัสคูปอง">
            <Input
              required
              className="font-mono"
              placeholder="SAVE10"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </Field>
          <Field label="ประเภท">
            <select
              className="w-full rounded-md border border-line bg-ink/70 px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-heart/60"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="percent">เปอร์เซ็นต์</option>
              <option value="fixed">บาท</option>
            </select>
          </Field>
          <Field label="ส่วนลด">
            <Input
              required
              className="font-mono tabular-nums"
              type="number"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>
          <div className="flex items-end">
            <Button disabled={busy} className="w-full sm:w-auto">
              สร้างคูปอง
            </Button>
          </div>
        </form>
        {error && <p className="mt-3 text-sm text-fail">{error}</p>}
      </Card>

      <Card className="overflow-hidden">
        <CardHead title="คูปองทั้งหมด" />
        {loading && <ListSkeleton rows={3} />}
        {!loading && rows.length === 0 && (
          <EmptyState icon={Ticket} title="ยังไม่มีคูปอง" description="สร้างจากฟอร์มด้านบนได้เลย" />
        )}
        {!loading &&
          rows.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-lineSoft px-4 py-3 text-sm last:border-b-0"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono">{r.code}</span>
                <Badge
                  className={
                    r.is_active
                      ? "border border-live/40 bg-live/10 text-live"
                      : "border border-line text-dim"
                  }
                >
                  {r.is_active ? "active" : "off"}
                </Badge>
              </div>
              <div className="flex items-center gap-4 font-mono text-xs tabular-nums text-muted">
                <span>
                  ลด {r.discount_value}
                  {r.discount_type === "percent" ? "%" : " ฿"}
                </span>
                <span className="text-dim">
                  ใช้ไป {r.used_count}/{r.max_uses ?? "∞"}
                </span>
              </div>
            </div>
          ))}
      </Card>
    </div>
  );
}
