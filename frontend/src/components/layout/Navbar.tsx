"use client";

import Link from "next/link";
import { Heart, Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { formatHearts } from "@/lib/utils";

const MEMBER_LINKS: [string, string][] = [
  ["/queue", "คิวงาน"],
  ["/dashboard", "ภาพรวม"],
  ["/packages", "ซื้อแพ็คเกจ"],
  ["/history", "ประวัติ"],
  ["/settings", "ตั้งค่า"],
];

export function Navbar() {
  const { user, profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-lineSoft bg-ink/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-heart">
            <Heart className="h-4 w-4 fill-[#12060B] text-[#12060B]" />
          </span>
          <span className="font-display text-base font-bold tracking-tight">
            AUTO<span className="text-heart">HEART</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-5 text-sm text-muted md:flex">
          {user ? (
            <>
              <Link href="/queue" className="hover:text-foreground">
                คิว
              </Link>
              <Link href="/packages" className="hover:text-foreground">
                ซื้อแพ็ค
              </Link>
              <Link href="/history" className="hover:text-foreground">
                ประวัติ
              </Link>
            </>
          ) : (
            <Link href="/#packages" className="hover:text-foreground">
              ราคา
            </Link>
          )}
          {profile?.role === "admin" && (
            <Link href="/admin" className="text-heart hover:brightness-110">
              Admin
            </Link>
          )}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <>
              <span className="rounded border border-heart/30 bg-heart/10 px-2.5 py-1 font-mono text-xs tabular-nums text-heart">
                ♥ {profile ? formatHearts(profile.credits) : "…"}
              </span>
              <Button variant="ghost" size="sm" onClick={() => signOut()}>
                ออกจากระบบ
              </Button>
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">
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
        <div className="space-y-3 border-t border-lineSoft px-4 py-4 md:hidden">
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
                  className="block text-sm text-heart"
                  onClick={() => setOpen(false)}
                >
                  Admin Panel
                </Link>
              )}
              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="rounded border border-heart/30 bg-heart/10 px-2.5 py-1 font-mono text-xs tabular-nums text-heart">
                  ♥ {profile ? formatHearts(profile.credits) : "…"}
                </span>
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
    <footer className="border-t border-lineSoft py-8 text-center font-mono text-xs text-dim">
      <p>© {new Date().getFullYear()} Autoheart — Cookie Run Heart Farm Service</p>
    </footer>
  );
}
