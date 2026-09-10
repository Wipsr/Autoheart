"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { PointChip, PointIcon } from "@/components/ui/PointChip";
import { useAuth } from "@/hooks/useAuth";

const MEMBER_LINKS: [string, string][] = [
  ["/queue", "คิวงาน"],
  ["/dashboard", "ภาพรวม"],
  ["/packages", "เติมพอยท์"],
  ["/history", "ประวัติ"],
  ["/settings", "ตั้งค่า"],
];

export function Navbar() {
  const { user, profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <PointIcon className="h-5 w-5 text-point" />
          <span className="font-display text-[15px] font-bold tracking-tight">Autoheart</span>
          <span className="rounded border border-line px-1.5 font-mono text-[10px] text-dim">
            v2
          </span>
        </Link>

        <nav className="hidden items-center gap-1 text-sm md:flex">
          {user ? (
            <>
              <Link href="/queue" className="rounded-lg px-3 py-1.5 text-muted hover:bg-surface2 hover:text-ink">
                คิวงาน
              </Link>
              <Link href="/packages" className="rounded-lg px-3 py-1.5 text-muted hover:bg-surface2 hover:text-ink">
                เติมพอยท์
              </Link>
              <Link href="/history" className="rounded-lg px-3 py-1.5 text-muted hover:bg-surface2 hover:text-ink">
                ประวัติ
              </Link>
            </>
          ) : (
            <Link href="/#packages" className="rounded-lg px-3 py-1.5 text-muted hover:bg-surface2 hover:text-ink">
              ราคา
            </Link>
          )}
          {profile?.role === "admin" && (
            <Link href="/admin" className="rounded-lg px-3 py-1.5 font-medium text-point-ink hover:bg-point-soft">
              Admin
            </Link>
          )}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <>
              <PointChip points={profile?.points ?? 0} />
              <Button variant="ghost" size="sm" onClick={() => signOut()}>
                ออกจากระบบ
              </Button>
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="secondary" size="sm">
                  เข้าสู่ระบบ
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm">สมัครสมาชิก</Button>
              </Link>
            </>
          )}
        </div>

        <button
          className="text-muted md:hidden"
          aria-label={open ? "ปิดเมนู" : "เปิดเมนู"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-lineSoft bg-surface px-4 py-4 md:hidden">
          {user ? (
            <>
              {MEMBER_LINKS.map(([href, label]) => (
                <Link
                  key={href}
                  href={href}
                  className="block text-sm text-muted"
                  onClick={() => setOpen(false)}
                >
                  {label}
                </Link>
              ))}
              {profile?.role === "admin" && (
                <Link
                  href="/admin"
                  className="block text-sm font-medium text-point-ink"
                  onClick={() => setOpen(false)}
                >
                  Admin Panel
                </Link>
              )}
              <div className="flex items-center justify-between gap-3 pt-1">
                <PointChip points={profile?.points ?? 0} />
                <Button variant="ghost" size="sm" onClick={() => signOut()}>
                  ออกจากระบบ
                </Button>
              </div>
            </>
          ) : (
            <>
              <Link
                href="/#packages"
                className="block text-sm text-muted"
                onClick={() => setOpen(false)}
              >
                ราคา
              </Link>
              <div className="flex gap-2">
                <Link href="/login" className="flex-1">
                  <Button variant="secondary" size="sm" className="w-full">
                    เข้าสู่ระบบ
                  </Button>
                </Link>
                <Link href="/register" className="flex-1">
                  <Button size="sm" className="w-full">
                    สมัคร
                  </Button>
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line py-8 text-center font-mono text-xs text-dim">
      <p>© {new Date().getFullYear()} Autoheart — ฟาร์มหัวใจ Cookie Run</p>
    </footer>
  );
}
