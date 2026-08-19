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
        "rounded-md border border-line bg-panel",
        glow && "border-live/40 bg-live/[0.04]",
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
        "flex items-center justify-between gap-3 border-b border-lineSoft px-4 py-3",
        className
      )}
    >
      <div className="font-display text-sm font-semibold">{title}</div>
      {action}
    </div>
  );
}
