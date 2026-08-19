"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Navbar } from "@/components/layout/Navbar";

export default function RegisterPage() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    if (password !== confirmPassword) {
      setError("รหัสผ่านกับยืนยันรหัสผ่านไม่ตรงกัน");
      setLoading(false);
      return;
    }
    try {
      const res = await api<{
        session?: { access_token: string; refresh_token: string } | null;
        message?: string;
      }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ nickname, password }),
      });
      if (res.session?.access_token) {
        const supabase = createClient();
        await supabase.auth.setSession({
          access_token: res.session.access_token,
          refresh_token: res.session.refresh_token,
        });
        router.push("/queue");
        router.refresh();
      } else {
        router.push("/login");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "สมัครไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="mx-auto flex max-w-md flex-col px-4 py-16">
        <Card className="p-8">
          <h1 className="text-2xl font-bold">สมัครสมาชิก</h1>
          <p className="mt-1 text-sm text-muted">สร้างบัญชีด้วยชื่อผู้ใช้ (ไม่ใช่อีเมล)</p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs text-muted">
                ชื่อผู้ใช้ (A-Z, 0-9, _ · 3–24 ตัว)
              </label>
              <Input
                required
                autoComplete="username"
                minLength={3}
                maxLength={24}
                pattern="[A-Za-z0-9_]{3,24}"
                placeholder="เช่น Evasi0m"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted">รหัสผ่าน (อย่างน้อย 6 ตัว)</label>
              <Input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted">ยืนยันรหัสผ่าน</label>
              <Input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-fail">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "กำลังสมัคร..." : "สมัครสมาชิก"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted">
            มีบัญชีแล้ว?{" "}
            <Link href="/login" className="text-heart hover:underline">
              เข้าสู่ระบบ
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
