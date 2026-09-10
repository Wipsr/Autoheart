"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { findAdminNavItem, isAdminPathActive } from "./adminNav";

/**
 * หัวหน้าแอดมินทุกหน้าใช้ตัวนี้ตัวเดียว
 * breadcrumb ตั้งให้เองจาก path — หน้ารายละเอียด (jobs/xxx) จะได้มีทางกลับเสมอ
 */
export function PageHeader({
  title,
  description,
  actions,
  crumb,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** ป้ายท้าย breadcrumb ของหน้ารายละเอียด เช่น "งาน a1b2c3d4" */
  crumb?: string;
}) {
  const pathname = usePathname();
  const parent = findAdminNavItem(pathname);
  const showCrumb = !!crumb && !!parent;

  return (
    <div className="mb-1">
      {showCrumb && (
        <nav aria-label="breadcrumb" className="mb-2 flex items-center gap-1 text-xs text-dim">
          <Link href={parent.href} className="transition hover:text-point-ink">
            {parent.label}
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="truncate text-muted">{crumb}</span>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** แท็บย่อยของหน้าที่จับกลุ่มกันอยู่ (ค่าระบบ / Proxy / ปิดปรับปรุง) */
export function SubTabs({ tabs }: { tabs: [string, string][] }) {
  const pathname = usePathname();
  return (
    <div className="-mt-1 flex gap-1 overflow-x-auto border-b border-lineSoft">
      {tabs.map(([href, label]) => {
        const active = isAdminPathActive(href, pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-sm transition",
              active
                ? "border-point font-medium text-point-ink"
                : "border-transparent text-dim hover:text-muted"
            )}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}

/** ตัวกรองแบบแท็บ ใช้ร่วมกันในหน้า Jobs / Topups */
export function FilterTabs({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string; count?: number }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {options.map((o) => (
        <button
          key={o.value || "all"}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "shrink-0 rounded-md border px-3 py-1.5 font-mono text-xs transition",
            value === o.value
              ? "border-point-line bg-point-soft text-point-ink"
              : "border-line text-dim hover:text-muted"
          )}
        >
          {o.label}
          {o.count != null && <span className="ml-1.5 tabular-nums opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** ตัวเลขสรุปบนหัวหน้า — ให้ตัวเลขเด่นกว่าป้ายเสมอ */
export function StatCard({
  label,
  value,
  tone,
  hint,
  icon: Icon,
  href,
}: {
  label: string;
  value: string | number;
  tone?: string;
  hint?: string;
  icon?: LucideIcon;
  /** ทำให้การ์ดกดเข้าหน้าที่เกี่ยวข้องได้ — ตัวเลขที่กดไม่ได้ทำให้ต้องวนหาเมนูเอง */
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate font-mono text-[10px] uppercase tracking-widest text-dim">{label}</p>
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-dim" />}
      </div>
      <p className={cn("mt-1.5 truncate font-mono text-2xl font-semibold tabular-nums", tone)}>
        {value}
      </p>
      {hint && <p className="mt-1 truncate text-xs text-dim">{hint}</p>}
    </>
  );

  const className = cn(
    "block rounded-card border border-line bg-surface p-4 shadow-card transition",
    href && "hover:border-point/40"
  );

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-widest text-dim">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-dim">{hint}</p>}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[#C98C15]"
      />
      {label}
    </label>
  );
}
