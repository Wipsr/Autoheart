"use client";

import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/Card";
import { EmptyState, ListSkeleton } from "@/components/ui/States";
import { PageHeader } from "@/components/admin/AdminUI";

type Log = {
  id: number;
  action: string;
  entity_type: string;
  entity_id?: string;
  created_at: string;
};

export default function AuditPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api<Log[]>("/api/admin/audit-logs", { token })
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="space-y-4">
      <PageHeader title="Audit log" description="ทุกการกระทำของแอดมินที่ระบบบันทึกไว้" />

      <Card className="overflow-hidden">
        {loading && <ListSkeleton rows={5} />}
        {!loading && items.length === 0 && (
          <EmptyState icon={ScrollText} title="ยังไม่มีบันทึก" />
        )}
        {!loading &&
          items.map((x) => (
            <div
              key={x.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-lineSoft px-4 py-3 text-sm last:border-b-0"
            >
              <span>
                <span className="font-mono text-heart">{x.action}</span>
                <span className="text-dim"> · {x.entity_type}</span>
                {x.entity_id && (
                  <span className="font-mono text-dim"> {x.entity_id.slice(0, 8)}</span>
                )}
              </span>
              <span className="font-mono text-[11px] text-dim">
                {new Date(x.created_at).toLocaleString("th-TH")}
              </span>
            </div>
          ))}
      </Card>
    </div>
  );
}
