"use client";

import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-lg border border-lineStrong bg-surface px-3 text-sm text-ink shadow-inset outline-none transition placeholder:text-dim",
        "focus:border-point-to focus:shadow-[0_0_0_3px_rgba(210,148,28,0.16)]",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("text-[12.5px] font-medium text-ink2", className)}>{children}</span>
  );
}
