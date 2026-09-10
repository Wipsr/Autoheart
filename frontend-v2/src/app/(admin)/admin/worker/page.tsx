"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Activity } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Card, CardHead } from "@/components/ui/Card";
import { EmptyState, Skeleton } from "@/components/ui/States";
import { Field, PageHeader, StatCard } from "@/components/admin/AdminUI";
import { cn } from "@/lib/utils";

type Health = {
  watchdog_running: boolean;
  watchdog_heartbeat_at?: string | null;
  current_job_id?: string | null;
  delayed_retries: number;
  failed_jobs: number;
  latest_event?: { status: string; message: string; created_at: string } | null;
};
type Alert = {
  id: string;
  severity: string;
  title: string;
  message: string;
  delivery_status: string;
  created_at: string;
};
type WorkerEvent = { id: string; status: string; message: string; created_at: string };

const SETTING_FIELDS: [keyof Settings, string, string][] = [
  ["stuck_timeout_seconds", "งานค้างเกิน (วินาที)", "ไม่มี heartbeat นานกว่านี้ถือว่าค้าง"],
  ["watchdog_interval_seconds", "รอบสแกน (วินาที)", "ความถี่ที่ watchdog ตรวจงาน"],
  ["retry_base_delay_seconds", "หน่วงก่อน retry (วินาที)", "ฐานของ exponential backoff"],
  ["retry_max_attempts", "retry สูงสุด (ครั้ง)", "เกินนี้ถือว่างานล้มถาวร"],
  ["telegram_alert_cooldown_seconds", "เว้นแจ้งเตือน (วินาที)", "กันสแปม Telegram"],
];

type Settings = {
  stuck_timeout_seconds: number;
  watchdog_interval_seconds: number;
  retry_base_delay_seconds: number;
  retry_max_attempts: number;
  telegram_alert_cooldown_seconds: number;
};

export default function WorkerPage() {
  const { token } = useAuth();
  const [health, setHealth] = useState<Health | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [events, setEvents] = useState<WorkerEvent[]>([]);
  const [message, setMessage] = useState("");
  const [settings, setSettings] = useState<Settings>({
    stuck_timeout_seconds: 180,
    watchdog_interval_seconds: 15,
    retry_base_delay_seconds: 30,
    retry_max_attempts: 3,
    telegram_alert_cooldown_seconds: 300,
  });

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [h, a, e] = await Promise.all([
        api<Health>("/api/admin/worker/health", { token }),
        api<Alert[]>("/api/admin/worker/alerts", { token }),
        api<WorkerEvent[]>("/api/admin/worker/events", { token }),
      ]);
      setHealth(h);
      setAlerts(a);
      setEvents(e);
    } catch {
      setMessage("โหลดสถานะ worker ไม่สำเร็จ");
    }
  }, [token]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const action = async (path: string) => {
    if (!token) return;
    try {
      await api(path, { method: "POST", token });
      setMessage(
        path.endsWith("test-alert") ? "ส่ง Telegram test alert แล้ว" : "สแกนและกู้คืนงานแล้ว"
      );
      load();
    } catch {
      setMessage("คำสั่งไม่สำเร็จ โปรดตรวจสอบการตั้งค่า");
    }
  };

  const saveSettings = async () => {
    if (!token) return;
    try {
      await api("/api/admin/worker/settings", {
        method: "PUT",
        token,
        body: JSON.stringify(settings),
      });
      setMessage("บันทึกค่า worker แล้ว");
    } catch {
      setMessage("บันทึกค่าไม่สำเร็จ");
    }
  };

  const fmt = (value?: string | null) => (value ? new Date(value).toLocaleString("th-TH") : "—");

  if (!health) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-56" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Worker & การแจ้งเตือน"
        description="heartbeat, การ retry และ alert ที่ส่งเข้า Telegram"
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => action("/api/admin/worker/scan")}>
              สแกนเดี๋ยวนี้
            </Button>
            <Button variant="ghost" size="sm" onClick={() => action("/api/admin/worker/test-alert")}>
              ทดสอบ Telegram
            </Button>
          </>
        }
      />

      {message && (
        <p className="rounded-md border border-line bg-panel2 px-3 py-2 text-sm text-muted">
          {message}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Watchdog"
          value={health.watchdog_running ? "ทำงานอยู่" : "หยุด"}
          tone={health.watchdog_running ? "text-live" : "text-fail"}
          hint={`heartbeat ${fmt(health.watchdog_heartbeat_at)}`}
        />
        <StatCard
          label="งานที่รันอยู่"
          value={health.current_job_id ? health.current_job_id.slice(0, 8) : "—"}
        />
        <StatCard
          label="รอ retry"
          value={health.delayed_retries}
          tone={health.delayed_retries > 0 ? "text-wait" : undefined}
        />
        <StatCard
          label="งานล้มเหลว"
          value={health.failed_jobs}
          tone={health.failed_jobs > 0 ? "text-fail" : undefined}
        />
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-info" />
          <h2 className="font-display text-sm font-semibold">เหตุการณ์ล่าสุด</h2>
        </div>
        <p className="mt-2 text-sm text-muted">{health.latest_event?.message || "ยังไม่มี event"}</p>
        <p className="mt-1 font-mono text-[11px] text-dim">
          {fmt(health.latest_event?.created_at)}
        </p>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold">ค่าความทนทาน</h2>
            <p className="text-xs text-dim">มีผลกับ worker ทันทีโดยไม่ต้อง restart</p>
          </div>
          <Button size="sm" onClick={saveSettings}>
            บันทึกค่า
          </Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SETTING_FIELDS.map(([key, label, hint]) => (
            <Field key={key} label={label} hint={hint}>
              <input
                className="w-full rounded-md border border-line bg-ink/70 px-3 py-2 font-mono text-sm tabular-nums text-foreground outline-none transition focus:border-heart/60"
                type="number"
                min="0"
                value={settings[key]}
                onChange={(e) => setSettings({ ...settings, [key]: Number(e.target.value) })}
              />
            </Field>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHead title="Alerts" />
          {alerts.length === 0 && (
            <EmptyState icon={AlertTriangle} title="ยังไม่มีการแจ้งเตือน" />
          )}
          <div className="space-y-3 p-4">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={cn(
                  "rounded-md border p-3",
                  alert.severity === "critical" || alert.severity === "error"
                    ? "border-fail/40 bg-fail/[0.06]"
                    : "border-line bg-panel2"
                )}
              >
                <p className="text-sm font-medium">{alert.title}</p>
                <p className="mt-1 text-sm text-muted">{alert.message}</p>
                <p className="mt-1.5 font-mono text-[11px] text-dim">
                  {alert.severity} · ส่ง {alert.delivery_status} · {fmt(alert.created_at)}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHead title="ไทม์ไลน์ worker" />
          {events.length === 0 && <EmptyState icon={Activity} title="ยังไม่มี event" />}
          <div className="space-y-3 p-4">
            {events.map((event) => (
              <div key={event.id} className="border-l border-line pl-3">
                <p className="text-sm text-muted">{event.message}</p>
                <p className="font-mono text-[11px] text-dim">
                  {event.status} · {fmt(event.created_at)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
