"use client";

import Link from "next/link";
import { ListOrdered, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQueue } from "@/hooks/useQueue";
import { Card, CardHead } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PointIcon } from "@/components/ui/PointChip";
import { EmptyState, ListSkeleton, Skeleton } from "@/components/ui/States";
import { SystemStatusBar } from "@/components/queue/SystemStatusBar";
import { JobRow } from "@/components/queue/JobRow";
import { TrialClaimCard } from "@/components/promotions/TrialClaimCard";
import { cn, formatHearts, formatPoints } from "@/lib/utils";

function StatCard({
  label,
  children,
  hint,
  gold,
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
  gold?: boolean;
}) {
  return (
    <Card
      className={cn(
        "p-4",
        gold && "border-point-line bg-gradient-to-b from-[#FEFAF0] to-[#FDF6E4]"
      )}
    >
      <p
        className={cn(
          "font-mono text-[10px] uppercase tracking-[0.14em]",
          gold ? "text-point-dim" : "text-dim"
        )}
      >
        {label}
      </p>
      <div className="mt-2">{children}</div>
      {hint && (
        <p className={cn("mt-2 text-xs", gold ? "text-point-dim" : "text-dim")}>{hint}</p>
      )}
    </Card>
  );
}

export default function DashboardPage() {
  const { profile, loading } = useAuth();
  const { jobs, queuedCount, strategy, loading: queueLoading, lastUpdated, refresh } = useQueue();

  const running = jobs.filter((j) => j.status === "processing");
  const waiting = jobs.filter((j) => j.status === "queued");
  const nextPosition = waiting
    .map((j) => j.queue_position)
    .filter((p): p is number => p != null)
    .sort((a, b) => a - b)[0];

  // หัวใจที่เก็บได้จากงานที่สำเร็จ — คนละตัวเลขกับพอยท์ที่ใช้ไป
  const heartsCollected = jobs
    .filter((j) => j.status === "completed")
    .reduce((sum, j) => sum + (j.hearts_collected || 0), 0);
  const completedCount = jobs.filter((j) => j.status === "completed").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">
            สวัสดี
            {profile?.nickname || profile?.display_name
              ? `, ${profile.nickname || profile.display_name}`
              : ""}
          </h1>
          <p className="mt-0.5 text-sm text-muted">จัดการพอยท์และงานฟาร์มของคุณ</p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link href="/queue">
            <Button variant="secondary">
              <ListOrdered className="h-[15px] w-[15px]" />
              ดูคิวแบบละเอียด
            </Button>
          </Link>
          <Link href="/packages">
            <Button>
              <Plus className="h-[15px] w-[15px]" />
              สั่งงานใหม่
            </Button>
          </Link>
        </div>
      </div>

      <SystemStatusBar
        queuedCount={queuedCount}
        strategy={strategy}
        yourPosition={nextPosition ?? null}
        lastUpdated={lastUpdated}
        onRefresh={refresh}
      />

      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="พอยท์คงเหลือ" gold hint="1 พอยท์ = 1 หัวใจ · หักเมื่อสั่งงาน">
          {loading ? (
            <Skeleton className="h-8 w-28" />
          ) : (
            <p className="flex items-center gap-2">
              <PointIcon className="h-[18px] w-[18px] text-point" />
              <span className="font-mono text-3xl font-semibold leading-none tabular-nums text-point-ink">
                {formatPoints(profile?.points ?? 0)}
              </span>
            </p>
          )}
        </StatCard>

        <StatCard
          label="กำลังรัน"
          hint={running[0] ? running[0].devplay_email.replace(/(.{3}).*@/, "$1***@") : "ยังไม่มีงานที่รันอยู่"}
        >
          <p className="flex items-center gap-2.5">
            <span className={cn("h-[7px] w-[7px] rounded-full", running.length ? "bg-live" : "bg-dim")} />
            <span className="font-mono text-3xl font-semibold leading-none tabular-nums">
              {running.length}
            </span>
          </p>
        </StatCard>

        <StatCard
          label="รอคิว"
          hint={nextPosition != null ? `ตำแหน่งใกล้สุด #${nextPosition}` : "ไม่มีงานรออยู่"}
        >
          <p className="font-mono text-3xl font-semibold leading-none tabular-nums text-wait-ink">
            {waiting.length}
          </p>
        </StatCard>

        <StatCard label="หัวใจที่เก็บได้" hint={`จาก ${completedCount} งานที่สำเร็จ`}>
          <p className="flex items-baseline gap-1.5">
            <span className="font-mono text-3xl font-semibold leading-none tabular-nums">
              {formatHearts(heartsCollected)}
            </span>
            <span className="text-xs text-dim">ดวง</span>
          </p>
        </StatCard>
      </div>

      <TrialClaimCard />

      <Card className="overflow-hidden">
        <CardHead
          title="งานล่าสุดของคุณ"
          action={
            <Link href="/queue">
              <Button variant="secondary" size="sm">
                ดูทั้งหมด
              </Button>
            </Link>
          }
        />
        {queueLoading && <ListSkeleton rows={3} />}
        {!queueLoading && jobs.length === 0 && (
          <EmptyState
            icon={ListOrdered}
            title="ยังไม่มีงานในคิว"
            description="เติมพอยท์แล้วสั่งรันได้เลย — ระบบตรวจไอดีให้ฟรีก่อนหักพอยท์"
            actionLabel="เติมพอยท์"
            actionHref="/packages"
          />
        )}
        {!queueLoading && jobs.slice(0, 5).map((j) => <JobRow key={j.id} job={j} />)}
      </Card>
    </div>
  );
}
