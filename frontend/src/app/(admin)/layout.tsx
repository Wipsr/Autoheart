"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Navbar } from "@/components/layout/Navbar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Skeleton } from "@/components/ui/States";
import { cn } from "@/lib/utils";

const GROUPS: { title: string; links: [string, string][] }[] = [
  {
    title: "ปฏิบัติการ",
    links: [
      ["/admin", "ภาพรวม"],
      ["/admin/jobs", "งานฟาร์ม"],
      ["/admin/topups", "การเติมเงิน"],
      ["/admin/users", "ผู้ใช้"],
    ],
  },
  {
    title: "ระบบ",
    links: [
      ["/admin/worker", "Worker"],
      ["/admin/maintenance", "ปิดปรับปรุง"],
      ["/admin/proxy", "Proxy"],
      ["/admin/settings", "ค่าระบบ"],
    ],
  },
  {
    title: "แพ็กเกจ",
    links: [["/admin/packages", "แพ็กหัวใจ"]],
  },
  {
    title: "การตลาด",
    links: [
      ["/admin/promotions", "โปรโมชัน"],
      ["/admin/coupons", "คูปอง"],
      ["/admin/popups", "ป็อปอัป"],
    ],
  },
  {
    title: "ตรวจสอบ",
    links: [["/admin/audit", "Audit log"]],
  },
];

const ALL_LINKS = GROUPS.flatMap((g) => g.links);

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !isAdmin) router.replace("/queue");
  }, [loading, isAdmin, router]);

  if (loading || !isAdmin) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="mx-auto max-w-7xl space-y-3 p-8">
          <p className="font-mono text-xs uppercase tracking-widest text-dim">
            {loading ? "กำลังตรวจสอบสิทธิ์แอดมิน" : "ไม่มีสิทธิ์เข้าถึง กำลังพากลับ"}
          </p>
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  return (
    <div className="min-h-screen">
      <Navbar />

      {/* มือถือ: แถบเลื่อนแนวนอน เพราะ sidebar ซ่อนอยู่ ไม่งั้นเข้าเมนูแอดมินไม่ได้เลย */}
      <div className="border-b border-lineSoft bg-panel/60 md:hidden">
        <div className="-mx-0 flex gap-1.5 overflow-x-auto px-4 py-2">
          {ALL_LINKS.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn(
                "shrink-0 rounded border px-3 py-1.5 text-xs transition",
                isActive(href)
                  ? "border-heart/50 bg-heart/10 text-heart"
                  : "border-line text-dim"
              )}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl">
        <aside className="hidden w-56 shrink-0 border-r border-lineSoft p-3 md:block">
          {GROUPS.map((group) => (
            <div key={group.title} className="mb-5">
              <p className="px-3 pb-1.5 font-mono text-[10px] uppercase tracking-widest text-dim">
                {group.title}
              </p>
              <nav className="space-y-0.5">
                {group.links.map(([href, label]) => (
                  <Link
                    key={href}
                    href={href}
                    aria-current={isActive(href) ? "page" : undefined}
                    className={cn(
                      "block rounded-md px-3 py-1.5 text-sm text-muted transition hover:bg-white/5 hover:text-foreground",
                      isActive(href) &&
                        "bg-white/[0.07] text-foreground shadow-[inset_2px_0_0_var(--heart)]"
                    )}
                  >
                    {label}
                  </Link>
                ))}
              </nav>
            </div>
          ))}
          <Link
            href="/queue"
            className="block rounded-md px-3 py-1.5 text-sm text-dim transition hover:text-foreground"
          >
            ← กลับหน้าผู้ใช้
          </Link>
        </aside>

        <main className="min-w-0 flex-1 p-4 pb-28 md:p-8">{children}</main>
      </div>

      <MobileNav />
    </div>
  );
}
