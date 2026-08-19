"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart, KeyRound, Lock, ShieldCheck, Waves } from "lucide-react";
import { Navbar, Footer } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LiveStats } from "@/components/home/LiveStats";
import { PackageGrid } from "@/components/packages/PackageCard";
import { api } from "@/lib/api";
import { PACKAGES } from "@/lib/constants";
import type { Package } from "@/types";

const fallbackPackages: Package[] = PACKAGES.map((p, i) => ({
  id: i + 1,
  name: p.name,
  slug: p.slug,
  hearts: p.hearts,
  price_baht: p.price_baht,
  description: p.description,
  badge: p.badge,
}));

const SECURITY = [
  {
    icon: Lock,
    title: "รหัสถูกเข้ารหัส AES-GCM",
    desc: "เก็บแบบเข้ารหัสในฐานข้อมูล ไม่แสดงซ้ำที่หน้าเว็บ และไม่ถูกส่งกลับมาที่เบราว์เซอร์อีกเลย",
  },
  {
    icon: ShieldCheck,
    title: "ตรวจไอดีก่อนเก็บเงิน",
    desc: "ระบบลองล็อกอิน DevPlay ให้ก่อนโดยไม่คิดเงิน ไอดีที่ไม่ผ่านจะไม่เข้าคิวและไม่เสียเครดิต",
  },
  {
    icon: KeyRound,
    title: "แจ้งลบรหัสได้เมื่อจบงาน",
    desc: "รหัสถูกเก็บไว้เพื่อให้แอดมินรันงานซ้ำได้กรณีงานล้ม ถ้าไม่ต้องการแล้วแจ้งแอดมินให้ลบได้",
  },
];

const HOW_TO_PAY = [
  "กดเลือกแพ็คแล้วกรอกไอดี DevPlay ให้ระบบตรวจก่อน (ยังไม่เสียเงิน)",
  "เปิดแอป TrueMoney สร้างซองอั่งเปาด้วยยอดที่หน้าเว็บบอก ให้ตรงถึงทศนิยม",
  "สร้างซองจากเบอร์อื่น ไม่ใช่เบอร์ร้าน แล้ววางลิงก์ซองในหน้าชำระเงิน",
  "เครดิตเข้าอัตโนมัติและงานเข้าคิวทันที ดูความคืบหน้าได้ที่หน้าคิว",
];

export default function HomePage() {
  const [packages, setPackages] = useState<Package[]>(fallbackPackages);

  useEffect(() => {
    api<Package[]>("/api/packages")
      .then((data) => data.length && setPackages(data))
      .catch(() => {
        /* ใช้ราคาสำรองที่ฝังไว้ */
      });
  }, []);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main>
        {/* ฮีโร่: เปิดด้วยของจริง คือสถานะคิวตอนนี้ ไม่ใช่สโลแกน */}
        <section className="mx-auto max-w-5xl px-4 pb-14 pt-16 md:pt-20">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-dim">
            Cookie Run · Heart Farm Service
          </p>
          <h1 className="mt-4 max-w-[18ch] font-display text-4xl font-bold leading-[1.08] md:text-6xl">
            ฟาร์มหัวใจ Cookie Run
            <br />
            ให้เสร็จตอนคุณหลับ
          </h1>
          <p className="mt-5 max-w-xl text-muted">
            ตรวจไอดีให้ฟรีก่อน จ่ายเมื่อผ่านแล้ว เข้าคิวแบบสลับรอบเพื่อไม่ให้ใครยึดคิวทั้งแถว
            แล้วดู log สดได้ตลอดเวลาที่งานกำลังรัน
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register">
              <Button size="lg">
                <Heart className="h-4 w-4 fill-[#12060B]" />
                เริ่มจากตรวจไอดีฟรี
              </Button>
            </Link>
            <Link href="#packages">
              <Button size="lg" variant="secondary">
                ดูราคา
              </Button>
            </Link>
          </div>

          <div className="mt-10">
            <LiveStats />
          </div>
        </section>

        {/* ราคา: เทียบต่อ 100 หัวใจ ให้เลือกได้ด้วยตัวเลขจริง */}
        <section id="packages" className="mx-auto max-w-5xl px-4 py-14">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold">ราคา</h2>
              <p className="mt-1 text-sm text-muted">
                ชำระด้วยซองอั่งเปา TrueMoney · เทียบราคาต่อ 100 หัวใจได้ในทุกแพ็ค
              </p>
            </div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-dim">
              หักเครดิตเมื่อสั่งงานเท่านั้น
            </p>
          </div>
          <PackageGrid packages={packages} />
        </section>

        {/* ความปลอดภัย: กำแพงใหญ่สุดของบริการนี้ ต้องตอบตรง ๆ บนหน้าแรก */}
        <section className="mx-auto max-w-5xl px-4 py-14">
          <h2 className="font-display text-2xl font-bold">รหัส DevPlay ของคุณถูกเก็บยังไง</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            บริการนี้ต้องใช้ไอดีเกมของคุณจริง ๆ เราจึงบอกให้ชัดว่าเกิดอะไรขึ้นกับรหัสหลังกดส่ง
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {SECURITY.map((s) => (
              <Card key={s.title} className="p-5">
                <s.icon className="h-4 w-4 text-info" />
                <h3 className="mt-3 font-display text-sm font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{s.desc}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* วิธีจ่าย: จุดที่พลาดบ่อยที่สุดคือยอดซองไม่ตรง */}
        <section className="mx-auto max-w-5xl px-4 py-14">
          <div className="grid gap-8 md:grid-cols-[1fr_320px]">
            <div>
              <h2 className="font-display text-2xl font-bold">จ่ายด้วยซองอั่งเปายังไง</h2>
              <ol className="mt-5 space-y-4">
                {HOW_TO_PAY.map((step, i) => (
                  <li key={i} className="flex gap-4">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border border-line bg-panel2 font-mono text-[11px] tabular-nums text-dim">
                      {i + 1}
                    </span>
                    <p className="text-sm text-muted">{step}</p>
                  </li>
                ))}
              </ol>
            </div>

            <Card className="h-fit p-5">
              <div className="flex items-center gap-2">
                <Waves className="h-4 w-4 text-wait" />
                <p className="font-display text-sm font-semibold">คิวเป็นธรรมยังไง</p>
              </div>
              <p className="mt-2 text-sm text-muted">
                ถ้าสั่งหลายไอดีพร้อมกัน งานของคุณจะถูกสลับแทรกกับของคนอื่นแทนที่จะต่อกันเป็นพรืด
                คนที่สั่งทีละงานจึงไม่ต้องรอจนกว่าคิวยาว ๆ ของอีกคนจะหมด
              </p>
              <p className="mt-3 font-mono text-[11px] uppercase tracking-widest text-dim">
                เวลารอคำนวณจากหัวใจที่เหลือจริงในคิว
              </p>
            </Card>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
