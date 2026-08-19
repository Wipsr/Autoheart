"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/States";
import { StatCard } from "@/components/admin/AdminUI";
import { formatHearts } from "@/lib/utils";

type Detail = {
  user: {
    id: string;
    nickname?: string;
    email?: string;
    role?: string;
    credits: number;
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
      <div>
        <Link href="/admin/users" className="font-mono text-xs text-dim hover:text-muted">
          ← กลับรายชื่อผู้ใช้
        </Link>
        <h1 className="mt-1 flex flex-wrap items-center gap-2 font-display text-xl font-bold">
          {data.user.nickname || data.user.email}
          {data.user.is_banned && (
            <Badge className="border border-fail/50 bg-fail/10 text-fail">banned</Badge>
          )}
        </h1>
        <p className="mt-0.5 font-mono text-[11px] text-dim">{data.user.id}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="เครดิตคงเหลือ" value={formatHearts(data.user.credits)} tone="text-heart" />
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
