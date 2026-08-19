"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

export default function SettingsPage() {
  const { profile } = useAuth();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) setError(err.message);
    else {
      setMessage("เปลี่ยนรหัสผ่านสำเร็จ");
      setPassword("");
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">ตั้งค่าบัญชี</h1>
      <Card className="space-y-2 p-5 text-sm">
        <p>
          <span className="text-dim">ชื่อผู้ใช้:</span> {profile?.nickname || profile?.display_name}
        </p>
        <p>
          <span className="text-dim">บทบาท:</span> {profile?.role}
        </p>
        <p>
          <span className="text-dim">เครดิต:</span>{" "}
          {(profile?.credits ?? 0).toLocaleString()} หัวใจ
        </p>
      </Card>
      <Card className="p-5">
        <h2 className="font-medium">เปลี่ยนรหัสผ่าน</h2>
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <Input
            type="password"
            required
            minLength={6}
            placeholder="รหัสผ่านใหม่"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-fail">{error}</p>}
          {message && <p className="text-sm text-live">{message}</p>}
          <Button type="submit" disabled={loading}>
            บันทึก
          </Button>
        </form>
      </Card>
    </div>
  );
}
