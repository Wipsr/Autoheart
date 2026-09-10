"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/States";
import { PageHeader, StatCard } from "@/components/admin/AdminUI";
import { formatPoints } from "@/lib/utils";

type Detail = {
  user: {
    id: string;
    nickname?: string;
    email?: string;
    role?: string;
    points: number;
    hearts: number;
    is_banned?: boolean;
  };
  jobs: unknown[];
  topups: unknown[];
};

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [data, setData] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    api<Detail>(`/api/admin/users/${id}`, { token })
      .then(setData)
      .catch(() => {});
  }, [token, id]);

  useEffect(() => {
    load();
  }, [load]);

  const setBan = async (banned: boolean) => {
    if (!token) return;
    setBusy(true);
    try {
      await api(`/api/admin/users/${id}/${banned ? "ban" : "unban"}`, { method: "POST", token });
      load();
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={data.user.nickname || data.user.email || "ผู้ใช้"}
        description={data.user.id}
        crumb={data.user.nickname || data.user.email || data.user.id.slice(0, 8)}
        actions={
          data.user.is_banned ? (
            <Badge className="border border-fail-line bg-fail-soft text-fail-ink">banned</Badge>
          ) : undefined
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="หัวใจคงเหลือ" value={formatPoints(data.user.hearts)} tone="text-point-ink" />
        <StatCard label="พอยท์เติมเงิน" value={formatPoints(data.user.points)} />
        <StatCard label="งานทั้งหมด" value={data.jobs.length} />
        <StatCard label="รายการเติมเงิน" value={data.topups.length} />
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-muted">
          {data.user.is_banned
            ? "บัญชีนี้ถูกแบนอยู่ ผู้ใช้จะสั่งงานใหม่ไม่ได้"
            : "บัญชีนี้ใช้งานได้ตามปกติ"}
        </p>
        {data.user.is_banned ? (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setBan(false)}>
            ปลดแบน
          </Button>
        ) : (
          <Button size="sm" variant="danger" disabled={busy} onClick={() => setBan(true)}>
            แบนผู้ใช้
          </Button>
        )}
      </Card>
    </div>
  );
}
