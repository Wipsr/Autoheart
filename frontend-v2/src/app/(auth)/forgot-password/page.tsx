"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Navbar } from "@/components/layout/Navbar";

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-md px-4 py-16">
        <Card className="space-y-4 p-8">
          <h1 className="text-2xl font-bold">ลืมรหัสผ่าน</h1>
          <p className="text-sm text-muted">
            ระบบ Autoheart ใช้ชื่อผู้ใช้ (nickname) ไม่ใช้อีเมล
            หากลืมรหัสผ่าน กรุณาติดต่อแอดมินเพื่อรีเซ็ตให้
          </p>
          <Link href="/login" className="text-sm text-heart hover:underline">
            กลับไปเข้าสู่ระบบ
          </Link>
        </Card>
      </div>
    </div>
  );
}
