"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Navbar } from "@/components/layout/Navbar";

export default function LoginClient() {
  const router = useRouter();
  const search = useSearchParams();
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api<{
        session: { access_token: string; refresh_token: string };
      }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ nickname, password }),
      });
      const supabase = createClient();
      const { error: sessErr } = await supabase.auth.setSession({
        access_token: res.session.access_token,
        refresh_token: res.session.refresh_token,
      });
      if (sessErr) throw new Error(sessErr.message);
      router.push(search.get("next") || "/queue");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="mx-auto flex max-w-md flex-col px-4 py-16">
        <Card className="p-8">
          <h1 className="text-2xl font-bold">เข้าสู่ระบบ</h1>
          <p className="mt-1 text-sm text-muted">ใช้ชื่อผู้ใช้ (nickname) และรหัสผ่าน</p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs text-muted">ชื่อผู้ใช้</label>
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
              <label className="mb-1.5 block text-xs text-muted">รหัสผ่าน</label>
              <Input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-fail">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted">
            ยังไม่มีบัญชี?{" "}
            <Link href="/register" className="text-heart hover:underline">
              สมัครสมาชิก
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
