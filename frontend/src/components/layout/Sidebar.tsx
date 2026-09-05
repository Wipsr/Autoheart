"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Heart,
  History,
  LayoutDashboard,
  ListOrdered,
  Package,
  ScanEye,
  Settings,
  Shield,
  Sparkles,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { cn, formatHearts } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

const links = [
  { href: "/queue", label: "คิวงาน", icon: ListOrdered },
  { href: "/dashboard", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/packages", label: "ซื้อแพ็คเกจ", icon: Package },
  { href: "/history", label: "ประวัติ", icon: History },
  { href: "/account", label: "เช็คข้อมูลไอดี", icon: ScanEye },
  { href: "/powder", label: "ปั๊มผงเวทมนตร์", icon: Sparkles },
  { href: "/friend-requests", label: "รับเพื่อน", icon: UserPlus },
  { href: "/friends", label: "ลบเพื่อน", icon: UserMinus },
  { href: "/settings", label: "ตั้งค่า", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { profile, isAdmin } = useAuth();

  return (
    <aside className="hidden w-56 shrink-0 border-r border-lineSoft p-3 md:block">
      <nav className="space-y-0.5">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted transition hover:bg-white/5 hover:text-foreground",
                active && "bg-white/[0.07] text-foreground shadow-[inset_2px_0_0_var(--heart)]"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
        {isAdmin && (
          <Link
            href="/admin"
            className={cn(
              "mt-3 flex items-center gap-3 rounded-md px-3 py-2 text-sm text-heart transition hover:bg-heart/10",
              pathname.startsWith("/admin") && "bg-heart/10"
            )}
          >
            <Shield className="h-4 w-4" />
            Admin Panel
          </Link>
        )}
      </nav>

      <div className="mt-6 rounded-md border border-line bg-panel2 p-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-dim">เครดิตหัวใจ</p>
        <p className="mt-1 flex items-center gap-1.5 font-mono text-xl font-semibold tabular-nums text-heart">
          <Heart className="h-3.5 w-3.5 fill-heart" />
          {formatHearts(profile?.credits ?? 0)}
        </p>
      </div>
    </aside>
  );
}
