"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
        <h1 className="font-display text-2xl font-semibold">เลือกแพ็คเกจหัวใจ</h1>
        <p className="mt-0.5 text-sm text-muted">
          แพ็คเกจคือ &ldquo;หัวใจ&rdquo; ที่เอาไปสั่งงานฟาร์มได้เลย ·
          ตอนสั่งงานเลือกจ่ายได้ 3 ทาง: หักหัวใจที่มีอยู่ / แลกจากพอยท์ / จ่ายซองอั่งเปา
        </p>
      </div>
      <PackageGrid packages={packages} />

      <div className="flex gap-2.5 rounded-card border border-info-line bg-info-soft px-4 py-3">
        <Info className="mt-0.5 h-[15px] w-[15px] shrink-0 text-info" />
        <p className="text-[12.5px] text-info-ink">
          หัวใจกับพอยท์เป็นคนละกระเป๋า — หัวใจใช้สั่งงานได้ทันที ส่วนพอยท์เป็นเงินที่เติมค้างไว้
          แล้วค่อยแลกเป็นหัวใจทีหลัง เติมพอยท์หรือแลกล่วงหน้าได้ที่หน้า{" "}
          <Link href="/topup" className="font-medium underline underline-offset-2">
            เติม/แลกพอยท์
          </Link>{" "}
          · ทั้งคู่ไม่มีวันหมดอายุ และใช้กับไอดีไหนก็ได้
        </p>
      </div>
    </div>
  );
}
