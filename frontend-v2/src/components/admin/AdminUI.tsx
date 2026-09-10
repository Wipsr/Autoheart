"use client";

import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-display text-xl font-bold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
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
            "shrink-0 rounded border px-3 py-1.5 font-mono text-xs transition",
            value === o.value
              ? "border-heart/50 bg-heart/10 text-heart"
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
}: {
  label: string;
  value: string | number;
  tone?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-line bg-panel p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-dim">{label}</p>
      <p className={cn("mt-1 truncate font-mono text-2xl font-semibold tabular-nums", tone)}>
        {value}
      </p>
      {hint && <p className="mt-1 truncate text-xs text-dim">{hint}</p>}
    </div>
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
        className="h-4 w-4 accent-[#FF4D7E]"
      />
      {label}
    </label>
  );
}
