"use client";

import { useCallback, useEffect, useState } from "react";
import { Receipt } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, ListSkeleton } from "@/components/ui/States";
import { FilterTabs, PageHeader } from "@/components/admin/AdminUI";
import { formatBahtExact, formatHearts } from "@/lib/utils";
import type { Topup } from "@/types";

const FILTERS = [
  { value: "needs_manual", label: "รอตรวจมือ" },
  { value: "processing", label: "กำลังตรวจ" },
  { value: "credited", label: "เติมแล้ว" },
  { value: "failed", label: "ไม่สำเร็จ" },
];

const TONE: Record<string, string> = {
  needs_manual: "border-fail/50 bg-fail/10 text-fail",
  processing: "border-info/50 bg-info/10 text-info",
  credited: "border-live/50 bg-live/10 text-live",
  failed: "border-fail/50 bg-fail/10 text-fail",
};

export default function AdminTopupsPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Topup[]>([]);
  const [status, setStatus] = useState("needs_manual");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    api<Topup[]>(`/api/admin/topups?status=${status}`, { token })
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, status]);

  useEffect(() => {
    load();
  }, [load]);

  const credit = async (id: string) => {
    if (!token) return;
    setBusyId(id);
    try {
      await api(`/api/admin/topups/${id}/credit`, {
        method: "POST",
        token,
        body: JSON.stringify({ note: "manual credit" }),
      });
      load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="การเติมเงิน"
        description="รายการซองอั่งเปาที่ระบบเติมเครดิตอัตโนมัติไม่ได้ ต้องเข้ามาเติมให้เอง"
      />
      <FilterTabs options={FILTERS} value={status} onChange={setStatus} />

      <Card className="overflow-hidden">
        {loading && <ListSkeleton rows={3} />}
        {!loading && rows.length === 0 && (
          <EmptyState
            icon={Receipt}
            title="ไม่มีรายการในสถานะนี้"
            description={
              status === "needs_manual" ? "ดีแล้ว ไม่มีเคสค้างให้ตามเก็บ" : undefined
            }
          />
        )}
        {!loading &&
          rows.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-lineSoft px-4 py-3 text-sm last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-mono tabular-nums">
                  ฿{formatBahtExact(Number(t.amount_baht || 0))}
                  <span className="text-dim">× {t.quantity}</span>
                  <Badge className={`border ${TONE[t.status] || "border-line text-dim"}`}>
                    {t.status}
                  </Badge>
                </p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-dim">
                  {t.error_message || t.id}
                  {t.created_at ? ` · ${new Date(t.created_at).toLocaleString("th-TH")}` : ""}
                </p>
              </div>

              <span className="shrink-0 font-mono text-xs tabular-nums text-heart">
                +{formatHearts(t.hearts_credited)}
              </span>

              {t.credit_status !== "credited" && (
                <Button size="sm" disabled={busyId === t.id} onClick={() => credit(t.id)}>
                  {busyId === t.id ? "กำลังเติม..." : "เติมเครดิตให้"}
                </Button>
              )}
            </div>
          ))}
      </Card>
    </div>
  );
}
