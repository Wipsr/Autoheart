"use client";

import { useEffect, useState } from "react";
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
      hearts: p.hearts,
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
        <h1 className="text-2xl font-bold">ซื้อแพ็คเกจ</h1>
        <p className="text-muted">เลือกแพ็คเกจแล้วชำระด้วยซองอั่งเปา TrueMoney</p>
      </div>
      <PackageGrid packages={packages} />
    </div>
  );
}
