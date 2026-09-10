"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PointIcon } from "@/components/ui/PointChip";
import { cn, formatBahtExact, formatPoints } from "@/lib/utils";
import type { Package } from "@/types";

/** ราคาต่อ 100 พอยท์ — ตัวเลขเดียวที่เทียบแพ็คกันได้จริง (ปัดสองตำแหน่งให้ตรงกับที่แสดง) */
export function unitPrice(pkg: Package) {
  return Math.round((pkg.price_baht / pkg.points) * 10000) / 100;
}

export function PackageCard({
  pkg,
  href,
  savingPercent,
  featured,
}: {
  pkg: Package;
  href?: string;
  savingPercent?: number;
  featured?: boolean;
}) {
  return (
    <Card
      className={cn(
        "relative flex h-full flex-col p-5 transition hover:shadow-pop",
        featured && "border-[1.5px] border-[#E0B84F] bg-gradient-to-b from-[#FEFAF0] to-[#FDF6E4]"
      )}
    >
      {pkg.badge && (
        <Badge
          className={cn(
            "absolute -top-2.5 left-5",
            featured
              ? "border-point-edge bg-gradient-to-b from-point-from to-point-to text-point-on"
              : "border-lineStrong bg-surface text-ink2 shadow-xs"
          )}
        >
          {pkg.badge}
        </Badge>
      )}

      <p className={cn("font-display text-sm font-semibold", featured && "text-point-ink")}>
        {pkg.name}
      </p>

      <p
        className={cn(
          "mt-3 flex items-center gap-2 font-mono text-[26px] font-semibold tabular-nums",
          featured && "text-point-ink"
        )}
      >
        <PointIcon className={cn("h-[18px] w-[18px]", featured ? "text-point" : "text-dim")} />
        {formatPoints(pkg.points)}
      </p>

      <p className="mt-2 flex items-baseline gap-1.5">
        <span className={cn("text-[13px]", featured ? "text-point-dim" : "text-dim")}>฿</span>
        <span
          className={cn(
            "font-mono text-xl font-semibold tabular-nums",
            featured && "text-point-ink"
          )}
        >
          {formatBahtExact(pkg.price_baht)}
        </span>
        {savingPercent && savingPercent > 0 ? (
          <Badge className="ml-1.5 border-live-line bg-live-soft text-live-ink">
            ประหยัด {savingPercent}%
          </Badge>
        ) : null}
      </p>

      <div
        className={cn(
          "mt-4 space-y-1.5 border-t pt-3.5 text-[12.5px]",
          featured ? "border-point-line text-point-dim" : "border-lineSoft text-muted"
        )}
      >
        <p className="flex justify-between">
          <span>ต่อ 100 พอยท์</span>
          <span className={cn("font-mono tabular-nums", featured ? "text-[#7A5408]" : "text-ink2")}>
            ฿{formatBahtExact(unitPrice(pkg))}
          </span>
        </p>
        <p className="flex justify-between">
          <span>ได้หัวใจ</span>
          <span className={cn("font-mono tabular-nums", featured ? "text-[#7A5408]" : "text-ink2")}>
            {formatPoints(pkg.points)} ดวง
          </span>
        </p>
      </div>

      {pkg.description && (
        <p className={cn("mt-3 flex-1 text-sm", featured ? "text-point-dim" : "text-muted")}>
          {pkg.description}
        </p>
      )}

      <Link href={href || `/purchase/${pkg.id}`} className="mt-5">
        <Button className="w-full" variant={featured ? "primary" : "secondary"}>
          เลือกแพ็คนี้
        </Button>
      </Link>
    </Card>
  );
}

export function PackageGrid({ packages }: { packages: Package[] }) {
  const base = Math.max(...packages.map(unitPrice), 0);
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {packages.map((pkg) => {
        const saving = base > 0 ? Math.round((1 - unitPrice(pkg) / base) * 100) : 0;
        return (
          <PackageCard
            key={pkg.id || pkg.slug}
            pkg={pkg}
            savingPercent={saving}
            featured={pkg.badge === "ยอดนิยม"}
          />
        );
      })}
    </div>
  );
}
