"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { PackageGrid } from "@/components/packages/PackageCard";
import { api } from "@/lib/api";
import { PACKAGES } from "@/lib/constants";
import type { Package } from "@/types";

export default function PackagesPage() {
  const [packages, setPackages] = useState<Package[]>(
    PACKAGES.map((p, i) => ({
      id: i + 1,
      name: p.name,
      slug: p.slug,
      points: p.points,
      price_baht: p.price_baht,
      description: p.description,
      badge: p.badge,
    }))
  );

  useEffect(() => {
    api<Package[]>("/api/packages")
      .then(setPackages)
      .catch(() => {
        /* keep fallback */
      });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">เติมพอยท์</h1>
        <p className="mt-0.5 text-sm text-muted">
          1 พอยท์ = 1 หัวใจ · หักพอยท์ตอนสั่งงานเท่านั้น งานล้มคืนพอยท์เต็มจำนวนอัตโนมัติ
        </p>
      </div>
      <PackageGrid packages={packages} />

      <div className="flex gap-2.5 rounded-card border border-info-line bg-info-soft px-4 py-3">
        <Info className="mt-0.5 h-[15px] w-[15px] shrink-0 text-info" />
        <p className="text-[12.5px] text-info-ink">
          พอยท์ไม่มีวันหมดอายุ และใช้กับงานฟาร์มได้ทุกไอดี ไม่ผูกกับไอดีใดไอดีหนึ่ง
        </p>
      </div>
    </div>
  );
}
