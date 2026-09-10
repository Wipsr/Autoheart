"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  Shield,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  ADMIN_NAV,
  ADMIN_NAV_ITEMS,
  isAdminPathActive,
  type AdminBadgeKey,
  type AdminNavItem,
} from "./adminNav";

type Pulse = {
  queue_paused: boolean;
  active_jobs: number;
  needs_manual_topups: number;
  current_job_id?: string | null;
  strategy?: string;
};

type PulseValue = {
  pulse: Pulse | null;
  badges: Partial<Record<AdminBadgeKey, number>>;
  refresh: () => void;
};

const PulseContext = createContext<PulseValue>({ pulse: null, badges: {}, refresh: () => {} });

/** ให้หน้าอื่นดึงตัวเลขค้างชุดเดียวกับที่ sidebar ใช้ ไม่ต้องยิง overview ซ้ำ */
export function useAdminPulse() {
  return useContext(PulseContext);
}

const POLL_MS = 30_000;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { token, profile, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [alerts, setAlerts] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);

  const refresh = useCallback(() => {
    if (!token) return;
    api<Pulse>("/api/admin/overview", { token })
      .then(setPulse)
      .catch(() => {});
    api<{ severity: string; created_at: string }[]>("/api/admin/worker/alerts?limit=100", { token })
      .then((rows) => {
        const since = Date.now() - 24 * 60 * 60 * 1000;
        setAlerts(
          rows.filter(
            (r) => r.severity === "critical" && new Date(r.created_at).getTime() >= since
          ).length
        );
      })
      .catch(() => {});
  }, [token]);

  // ตัวเลขค้างต้องสดพอจะเชื่อได้ แต่ 30 วิก็ถี่พอแล้วสำหรับงานที่คนนั่งเฝ้า
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("admin:sidebar") === "collapsed");
    } catch {
      /* โหมดส่วนตัวของเบราว์เซอร์ปิด localStorage ไว้ — ใช้ค่าเริ่มต้นไป */
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      try {
        localStorage.setItem("admin:sidebar", v ? "expanded" : "collapsed");
      } catch {
        /* เช่นเดียวกับด้านบน */
      }
      return !v;
    });
  };

  // เปลี่ยนหน้าแล้วปิดของที่ลอยอยู่ ไม่งั้นลิ้นชักค้างทับหน้าใหม่
  useEffect(() => {
    setDrawer(false);
    setPalette(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
      if (e.key === "Escape") {
        setPalette(false);
        setDrawer(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const badges = useMemo(
    () => ({
      topups: pulse?.needs_manual_topups ?? 0,
      jobs: pulse?.active_jobs ?? 0,
      alerts,
    }),
    [pulse, alerts]
  );

  const value = useMemo<PulseValue>(() => ({ pulse, badges, refresh }), [pulse, badges, refresh]);

  return (
    <PulseContext.Provider value={value}>
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-40 border-b border-line bg-panel/90 backdrop-blur-xl">
          <div className="flex h-14 items-center gap-2 px-3 md:px-4">
            <button
              type="button"
              onClick={() => setDrawer(true)}
              aria-label="เปิดเมนูแอดมิน"
              className="rounded-md p-2 text-muted transition hover:bg-heart/10 hover:text-heart md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            <Link href="/admin" className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-heart/15 text-heart">
                <Shield className="h-4 w-4" />
              </span>
              <span className="font-display text-sm font-bold tracking-tight">
                AUTOHEART <span className="text-heart">ADMIN</span>
              </span>
            </Link>

            <QueuePill pulse={pulse} className="hidden lg:flex" />

            <div className="flex-1" />

            <button
              type="button"
              onClick={() => setPalette(true)}
              className="flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-xs text-dim transition hover:border-heart/40 hover:text-muted"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">ค้นหาเมนู</span>
              <kbd className="hidden rounded border border-line px-1 font-mono text-[10px] sm:inline">
                ⌘K
              </kbd>
            </button>

            <button
              type="button"
              onClick={refresh}
              aria-label="โหลดตัวเลขใหม่"
              className="rounded-md p-2 text-dim transition hover:bg-heart/10 hover:text-heart"
            >
              <RefreshCw className="h-4 w-4" />
            </button>

            <Link
              href="/queue"
              className="hidden items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-muted transition hover:border-heart/40 hover:text-heart sm:flex"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              หน้าผู้ใช้
            </Link>

            <button
              type="button"
              onClick={() => signOut().then(() => router.replace("/"))}
              aria-label="ออกจากระบบ"
              title={profile?.nickname || profile?.email || "ออกจากระบบ"}
              className="rounded-md p-2 text-dim transition hover:bg-fail/10 hover:text-fail"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>

          <QueuePill pulse={pulse} className="flex border-t border-lineSoft px-4 py-1.5 lg:hidden" />
        </header>

        <div className="mx-auto flex w-full max-w-[1600px]">
          <aside
            className={cn(
              "sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 flex-col overflow-y-auto border-r border-lineSoft px-2 py-3 transition-[width] md:flex",
              collapsed ? "w-[60px]" : "w-60"
            )}
          >
            <nav className="flex-1 space-y-4">
              {ADMIN_NAV.map((group) => (
                <div key={group.title}>
                  {!collapsed && (
                    <p className="px-3 pb-1 font-mono text-[10px] uppercase tracking-widest text-dim">
                      {group.title}
                    </p>
                  )}
                  {collapsed && <div className="mx-3 mb-2 border-t border-lineSoft" />}
                  <div className="space-y-0.5">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.href}
                        item={item}
                        active={isAdminPathActive(item.href, pathname)}
                        count={item.badge ? badges[item.badge] : undefined}
                        collapsed={collapsed}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </nav>

            <button
              type="button"
              onClick={toggleCollapsed}
              className="mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-xs text-dim transition hover:bg-heart/10 hover:text-heart"
            >
              {collapsed ? (
                <ChevronsRight className="h-4 w-4" />
              ) : (
                <>
                  <ChevronsLeft className="h-4 w-4" />
                  ย่อเมนู
                </>
              )}
            </button>
          </aside>

          <main className="min-w-0 flex-1 px-4 py-5 pb-16 md:px-7 md:py-6">{children}</main>
        </div>

        {drawer && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setDrawer(false)}
              aria-hidden
            />
            <div className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col overflow-y-auto border-r border-line bg-panel p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-display text-sm font-bold">
                  AUTOHEART <span className="text-heart">ADMIN</span>
                </span>
                <button
                  type="button"
                  onClick={() => setDrawer(false)}
                  aria-label="ปิดเมนู"
                  className="rounded-md p-1.5 text-dim hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <nav className="flex-1 space-y-4">
                {ADMIN_NAV.map((group) => (
                  <div key={group.title}>
                    <p className="px-3 pb-1 font-mono text-[10px] uppercase tracking-widest text-dim">
                      {group.title}
                    </p>
                    <div className="space-y-0.5">
                      {group.items.map((item) => (
                        <NavLink
                          key={item.href}
                          item={item}
                          active={isAdminPathActive(item.href, pathname)}
                          count={item.badge ? badges[item.badge] : undefined}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </nav>

              <Link
                href="/queue"
                className="mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-dim transition hover:text-heart"
              >
                <ArrowLeft className="h-4 w-4" />
                กลับหน้าผู้ใช้
              </Link>
            </div>
          </div>
        )}

        {palette && <CommandPalette badges={badges} onClose={() => setPalette(false)} />}
      </div>
    </PulseContext.Provider>
  );
}

function NavLink({
  item,
  active,
  count,
  collapsed,
}: {
  item: AdminNavItem;
  active: boolean;
  count?: number;
  collapsed?: boolean;
}) {
  const Icon = item.icon;
  const alerting = item.badge === "topups" || item.badge === "alerts";
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition",
        collapsed && "justify-center px-0",
        active
          ? "bg-heart/10 font-medium text-heart shadow-[inset_2px_0_0_currentColor]"
          : "text-muted hover:bg-heart/5 hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {!!count &&
        (collapsed ? (
          // ย่อแล้วไม่มีที่ให้ตัวเลข เหลือแค่จุดบอกว่าเมนูนี้มีของค้าง
          <span
            aria-label={`${count} รายการค้าง`}
            className={cn(
              "absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full",
              alerting ? "bg-fail" : "bg-live"
            )}
          />
        ) : (
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums",
              alerting ? "bg-fail/15 text-fail" : "bg-live/15 text-live"
            )}
          >
            {count > 99 ? "99+" : count}
          </span>
        ))}
    </Link>
  );
}

function QueuePill({ pulse, className }: { pulse: Pulse | null; className?: string }) {
  if (!pulse) return null;
  return (
    <div className={cn("flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px]", className)}>
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            "inline-block h-1.5 w-1.5 rounded-full",
            pulse.queue_paused ? "bg-wait" : "pulse-dot bg-live"
          )}
        />
        <span className={pulse.queue_paused ? "text-wait" : "text-live"}>
          {pulse.queue_paused ? "คิวถูกหยุดไว้" : "คิวทำงานปกติ"}
        </span>
      </span>
      <span className="text-dim">
        รันอยู่ <span className="text-muted">{pulse.active_jobs}</span>
      </span>
      {pulse.needs_manual_topups > 0 && (
        <Link href="/admin/topups" className="text-fail hover:underline">
          เติมเงินค้าง {pulse.needs_manual_topups}
        </Link>
      )}
    </div>
  );
}

function CommandPalette({
  badges,
  onClose,
}: {
  badges: Partial<Record<AdminBadgeKey, number>>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return ADMIN_NAV_ITEMS;
    return ADMIN_NAV_ITEMS.filter((item) =>
      [item.label, item.hint, item.href, ...(item.keywords || [])]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [q]);

  // ผลลัพธ์หดลงแล้ว cursor อาจชี้เลยรายการสุดท้าย กด Enter จะไม่ไปไหน
  useEffect(() => {
    setCursor(0);
  }, [q]);

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="ค้นหาเมนูแอดมิน"
        className="relative w-full max-w-lg overflow-hidden rounded-lg border border-line bg-panel shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-lineSoft px-3">
          <Search className="h-4 w-4 shrink-0 text-dim" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === "Enter" && results[cursor]) {
                go(results[cursor].href);
              }
            }}
            placeholder="พิมพ์ชื่อเมนู เช่น อั่งเปา / worker / คูปอง"
            className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-dim"
          />
        </div>

        <ul className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-dim">ไม่มีเมนูที่ตรงกับคำนี้</li>
          )}
          {results.map((item, i) => {
            const Icon = item.icon;
            const count = item.badge ? badges[item.badge] : undefined;
            return (
              <li key={item.href}>
                <button
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(item.href)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition",
                    i === cursor ? "bg-heart/10 text-heart" : "text-muted"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{item.label}</span>
                    <span className="block truncate text-xs text-dim">{item.hint}</span>
                  </span>
                  {!!count && (
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-dim">
                      {count}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
