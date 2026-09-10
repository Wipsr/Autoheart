"use client";

import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

export function Card({
  className,
  glow,
  ...props
}: HTMLAttributes<HTMLDivElement> & { glow?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-card border border-line bg-surface shadow-card",
        glow && "border-live-line bg-live-soft",
        className
      )}
      {...props}
    />
  );
}

/** หัวแผงมีเส้นคั่น ใช้กับการ์ดที่เป็นตาราง/รายการ */
export function CardHead({
  title,
  action,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-lineSoft px-4 py-3.5",
        className
      )}
    >
      <div className="font-display text-sm font-semibold">{title}</div>
      {action}
    </div>
  );
}

/** หัวคอลัมน์ของตาราง — โมโนตัวเล็ก พื้นจางกว่าการ์ดนิดเดียว */
export function TableHead({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "border-b border-lineSoft bg-subtle px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-dim",
        className
      )}
      {...props}
    />
  );
}
