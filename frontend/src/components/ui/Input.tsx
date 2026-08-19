"use client";

import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-md border border-line bg-ink/70 px-3 py-2.5 text-sm text-foreground placeholder:text-dim outline-none transition focus:border-heart/60",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
