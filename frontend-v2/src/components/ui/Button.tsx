"use client";

import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
};

/**
 * ปุ่มหลักเป็นทองไล่เฉด + ขอบเข้มกว่าพื้น + ไฮไลต์ด้านในบน
 * ทั้งสามชั้นทำงานร่วมกัน ถ้าเหลือแค่สีพื้นเรียบปุ่มจะแบนจนดูเหมือนป้าย
 */
export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex select-none items-center justify-center gap-2 rounded-lg font-semibold transition disabled:pointer-events-none disabled:opacity-50",
          size === "sm" && "h-8 px-3 text-xs",
          size === "md" && "h-10 px-4 text-sm",
          size === "lg" && "h-[46px] px-5 text-[15px]",
          variant === "primary" &&
            "border border-point-edge bg-gradient-to-b from-point-from to-point-to text-point-on shadow-btn hover:from-[#EFB544] hover:to-[#C98914] hover:shadow-btnHover active:shadow-none",
          variant === "secondary" &&
            "border border-lineStrong bg-surface text-ink2 shadow-xs hover:bg-subtle",
          variant === "ghost" && "text-muted hover:bg-surface2 hover:text-ink",
          variant === "danger" &&
            "border border-fail-line bg-surface text-fail-ink shadow-xs hover:bg-fail-soft",
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
