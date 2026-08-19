"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn, formatBahtExact, formatHearts } from "@/lib/utils";
import type { Package } from "@/types";

/** ราคาต่อ 100 หัวใจ — ตัวเลขเดียวที่เทียบแพ็คกันได้จริง (ปัดสองตำแหน่งให้ตรงกับที่แสดง) */
export function unitPrice(pkg: Package) {
  return Math.round((pkg.price_baht / pkg.hearts) * 10000) / 100;
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
        "flex h-full flex-col p-5 transition hover:border-muted/50",
        featured && "border-heart/50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-display text-sm font-semibold">{pkg.name}</p>
        {pkg.badge && (
          <Badge
            className={
              featured ? "border border-heart/40 bg-heart/10 text-heart" : "border border-line text-dim"
            }
          >
            {pkg.badge}
          </Badge>
        )}
      </div>

      <p className="mt-3 flex items-baseline gap-1 font-mono text-3xl font-semibold tabular-nums">
        ฿{formatBahtExact(pkg.price_baht)}
      </p>
      <p className="mt-1 flex items-center gap-1.5 font-mono text-sm tabular-nums text-heart">
        <Heart className="h-3.5 w-3.5 fill-heart" />
        {formatHearts(pkg.hearts)} หัวใจ
      </p>

      <div className="mt-3 space-y-1 border-t border-lineSoft pt-3 font-mono text-[11px] tabular-nums text-dim">
        <p>฿{formatBahtExact(unitPrice(pkg))} ต่อ 100 หัวใจ</p>
        {savingPercent && savingPercent > 0 ? (
          <p className="text-live">ถูกลง {savingPercent}% ต่อหัวใจ</p>
        ) : (
          <p>ราคาอ้างอิง</p>
        )}
      </div>

      {pkg.description && <p className="mt-3 flex-1 text-sm text-muted">{pkg.description}</p>}

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
