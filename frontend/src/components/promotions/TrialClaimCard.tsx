"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type Promotion = { id: string; title: string; type: string; hearts_reward: number; requires_devplay: boolean };

export function TrialClaimCard() {
  const { token, refreshProfile } = useAuth();
  const [promo, setPromo] = useState<Promotion | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<Promotion[]>("/api/promotions/active").then((items) => setPromo(items.find((x) => x.type === "new_user_trial") || null)).catch(() => {});
  }, []);
  if (!promo) return null;

  const claim = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setLoading(true);
    setMessage("");
    try {
      const result = await api<{ hearts_credited: number }>(`/api/promotions/${promo.id}/claim`, {
        method: "POST", token, body: JSON.stringify({ devplay_email: email, devplay_password: password }),
      });
      setMessage(`รับสำเร็จ +${result.hearts_credited.toLocaleString()} หัวใจ`);
      setPassword("");
      refreshProfile(token);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "รับสิทธิ์ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card glow className="p-5">
      <h2 className="font-semibold text-rose-200">{promo.title}</h2>
      <p className="mt-1 text-sm text-muted">ยืนยัน DevPlay หนึ่งครั้งต่อไอดี เพื่อรับ {promo.hearts_reward.toLocaleString()} หัวใจ</p>
      <form onSubmit={claim} className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Input required type="email" placeholder="DevPlay Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input required type="password" placeholder="DevPlay Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" disabled={loading}>{loading ? "กำลังตรวจสอบ" : "รับสิทธิ์"}</Button>
      </form>
      {message && <p className="mt-3 text-sm text-muted">{message}</p>}
    </Card>
  );
}
