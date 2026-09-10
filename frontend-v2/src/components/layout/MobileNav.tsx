"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
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
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

const tabs = [
  { href: "/queue", label: "คิว", icon: ListOrdered },
  { href: "/dashboard", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/packages", label: "พอยท์", icon: Package },
  { href: "/history", label: "ประวัติ", icon: History },
  { href: "/account", label: "ไอดี", icon: ScanEye },
  { href: "/tools", label: "เครื่องมือ", icon: Sparkles },
  { href: "/friend-requests", label: "คำขอ", icon: UserPlus },
  { href: "/friends", label: "เพื่อน", icon: UserMinus },
  { href: "/settings", label: "ตั้งค่า", icon: Settings },
];

// แถบล่างมือถือขยายตามจำนวนแท็บ (ปกติ 9, แอดมินสลับ "ตั้งค่า" เป็น "Admin" คงที่ 9)
const GRID_COLS: Record<number, string> = {
  5: "grid-cols-5",
  6: "grid-cols-6",
  7: "grid-cols-7",
  8: "grid-cols-8",
  9: "grid-cols-9",
};

export function MobileNav() {
  const pathname = usePathname();
  const { isAdmin } = useAuth();

  const items = isAdmin
    ? [...tabs.slice(0, tabs.length - 1), { href: "/admin", label: "Admin", icon: Shield }]
    : tabs;

  return (
    <nav
      aria-label="เมนูหลัก"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul
        className={cn("mx-auto grid max-w-lg", GRID_COLS[items.length] ?? "grid-cols-6")}
      >
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] transition",
                  active
                    ? "font-medium text-point-ink shadow-[inset_0_2px_0_var(--point)]"
                    : "text-dim hover:text-muted"
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
