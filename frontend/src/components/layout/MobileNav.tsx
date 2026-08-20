"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  History,
  LayoutDashboard,
  ListOrdered,
  Package,
  Settings,
  Shield,
  UserMinus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

const tabs = [
  { href: "/queue", label: "คิว", icon: ListOrdered },
  { href: "/dashboard", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/packages", label: "ซื้อ", icon: Package },
  { href: "/history", label: "ประวัติ", icon: History },
  { href: "/friends", label: "เพื่อน", icon: UserMinus },
  { href: "/settings", label: "ตั้งค่า", icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();
  const { isAdmin } = useAuth();

  const items = isAdmin
    ? [...tabs.slice(0, tabs.length - 1), { href: "/admin", label: "Admin", icon: Shield }]
    : tabs;

  return (
    <nav
      aria-label="เมนูหลัก"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-ink/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul
        className={cn(
          "mx-auto grid max-w-lg",
          items.length === 6 ? "grid-cols-6" : "grid-cols-5"
        )}
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
                    ? "text-heart shadow-[inset_0_2px_0_var(--heart)]"
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
