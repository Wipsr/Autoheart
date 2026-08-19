"use client";

import Link from "next/link";
import { Heart, ListOrdered } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQueue } from "@/hooks/useQueue";
import { Card, CardHead } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState, ListSkeleton, Skeleton } from "@/components/ui/States";
import { SystemStatusBar } from "@/components/queue/SystemStatusBar";
import { JobRow } from "@/components/queue/JobRow";
import { TrialClaimCard } from "@/components/promotions/TrialClaimCard";
import { formatHearts } from "@/lib/utils";

export default function DashboardPage() {
  const { profile, loading } = useAuth();
  const { jobs, queuedCount, strategy, loading: queueLoading, lastUpdated, refresh } = useQueue();

  const running = jobs.filter((j) => j.status === "processing").length;
  const waiting = jobs.filter((j) => j.status === "queued").length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">
          สวัสดี
          {profile?.nickname || profile?.display_name
            ? `, ${profile.nickname || profile.display_name}`
            : ""}
        </h1>
        <p className="text-sm text-muted">จัดการเครดิตหัวใจและงานฟาร์มของคุณ</p>
      </div>

      <SystemStatusBar
        queuedCount={queuedCount}
        strategy={strategy}
        lastUpdated={lastUpdated}
        onRefresh={refresh}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-dim">เครดิตหัวใจ</p>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-24" />
          ) : (
            <p className="mt-1 flex items-baseline gap-1.5 font-mono text-3xl font-semibold tabular-nums text-heart">
              <Heart className="h-4 w-4 fill-heart" />
              {formatHearts(profile?.credits ?? 0)}
            </p>
          )}
        </Card>
        <Card className="p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-dim">กำลังรัน</p>
          <p className="mt-1 font-mono text-3xl font-semibold tabular-nums">{running}</p>
        </Card>
        <Card className="p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-dim">
            งานของคุณที่รอคิว
          </p>
          <p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-wait">{waiting}</p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/packages">
          <Button>ซื้อแพ็คเกจ / เติมเครดิต</Button>
        </Link>
        <Link href="/queue">
          <Button variant="secondary">ดูคิวแบบละเอียด</Button>
        </Link>
      </div>

      <TrialClaimCard />

      <Card className="overflow-hidden">
        <CardHead
          title="งานล่าสุดของคุณ"
          action={
            <Link href="/queue" className="font-mono text-[11px] text-info hover:underline">
              ดูทั้งหมด
            </Link>
          }
        />
        {queueLoading && <ListSkeleton rows={3} />}
        {!queueLoading && jobs.length === 0 && (
          <EmptyState
            icon={ListOrdered}
            title="ยังไม่มีงานในคิว"
            description="ซื้อแพ็คเกจแล้วสั่งรันได้เลย — ระบบตรวจไอดีให้ฟรีก่อนเก็บเงิน"
            actionLabel="ซื้อแพ็คเกจ"
            actionHref="/packages"
          />
        )}
        {!queueLoading && jobs.slice(0, 5).map((j) => <JobRow key={j.id} job={j} />)}
      </Card>
    </div>
  );
}
