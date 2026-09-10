"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Gift,
  Hammer,
  History,
  LayoutDashboard,
  ListOrdered,
  Plus,
  ScanEye,
  Settings,
  Shield,
  Sparkles,
  UserMinus,
  UserPlus,
  Wallet,
} from "lucide-react";
import { cn, formatPoints } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useQueue } from "@/hooks/useQueue";
import { Button } from "@/components/ui/Button";

const MAIN = [
  { href: "/dashboard", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/queue", label: "คิวงาน", icon: ListOrdered },
  { href: "/packages", label: "เติมพอยท์", icon: Wallet },
  { href: "/history", label: "ประวัติ", icon: History },
];

const TOOLS = [
  { href: "/account", label: "เช็คข้อมูลไอดี", icon: ScanEye },
  { href: "/powder", label: "ปั๊มผงเวทมนตร์", icon: Sparkles },
  { href: "/giftbox", label: "เปิดกล่องของขวัญ", icon: Gift },
  { href: "/treasure", label: "ตี + สมบัติ", icon: Hammer },
  { href: "/friend-requests", label: "รับเพื่อน", icon: UserPlus },
  { href: "/friends", label: "ลบเพื่อน", icon: UserMinus },
];

function NavLink({
  href,
  label,
  icon: Icon,
  badge,
}: {
  href: string;
  label: string;
  icon: typeof Wallet;
  badge?: number;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition",
        active ? "bg-surface2 font-medium text-ink" : "text-muted hover:bg-subtle hover:text-ink"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
      {badge ? (
        <span className="ml-auto rounded-md bg-wait-soft px-1.5 font-mono text-[11px] font-medium text-wait-ink">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { profile, isAdmin } = useAuth();
  const { jobs } = useQueue();

  const openJobs = jobs.filter((j) => j.status === "queued" || j.status === "processing").length;

  return (
    <aside className="hidden w-56 shrink-0 flex-col gap-5 border-r border-line bg-surface p-3 md:flex">
      <nav className="flex flex-col gap-0.5">
        {MAIN.map((item) => (
          <NavLink
            key={item.href}
            {...item}
            badge={item.href === "/queue" ? openJobs : undefined}
          />
        ))}
      </nav>

      <nav className="flex flex-col gap-0.5">
        <p className="px-3 pb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
          เครื่องมือฟรี
        </p>
        {TOOLS.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}
      </nav>

      <nav className="flex flex-col gap-0.5">
        <NavLink href="/settings" label="ตั้งค่า" icon={Settings} />
        {isAdmin && (
          <Link
            href="/admin"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] text-point-ink transition hover:bg-point-soft",
              pathname.startsWith("/admin") && "bg-point-soft font-medium"
            )}
          >
            <Shield className="h-4 w-4" />
            Admin Panel
          </Link>
        )}
      </nav>

      <div className="mt-auto rounded-card border border-point-line bg-point-soft p-3.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-point-dim">
          พอยท์คงเหลือ
        </p>
        <p className="mt-1.5 flex items-baseline gap-1.5">
          <span className="font-mono text-2xl font-semibold tabular-nums text-point-ink">
            {formatPoints(profile?.points ?? 0)}
          </span>
          <span className="text-xs text-point-dim">P</span>
        </p>
        <Link href="/packages" className="mt-3 block">
          <Button className="w-full">
            <Plus className="h-[15px] w-[15px]" />
            เติมพอยท์
          </Button>
        </Link>
      </div>
    </aside>
  );
}
