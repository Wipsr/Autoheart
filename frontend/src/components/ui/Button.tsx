"use client";

import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition disabled:opacity-40 disabled:pointer-events-none",
          size === "sm" && "px-3 py-1.5 text-xs",
          size === "md" && "px-4 py-2.5 text-sm",
          size === "lg" && "px-6 py-3 text-base",
          variant === "primary" && "bg-heart text-[#12060B] hover:brightness-110",
          variant === "secondary" &&
            "border border-line bg-panel2 text-foreground hover:border-muted/60",
          variant === "ghost" && "text-muted hover:bg-white/5 hover:text-foreground",
          variant === "danger" && "border border-fail/40 bg-fail/10 text-fail hover:bg-fail/20",
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
