"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { Eye, Loader2, RotateCcw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api";
import { API_URL } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { Card, CardHead } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/States";
import type { AccountInspectResult, AccountItem } from "@/types";

const num = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-US");

// รูป asset เสิร์ฟผ่าน backend เรา (proxy ไป ngmx) — item.image เป็น tag
const imageUrl = (kind: "cookie" | "pet" | "treasure", tag: string) =>
  `${API_URL}/api/account/image/${kind}/${encodeURIComponent(tag)}`;

const EPISODE_LABEL = (seq: number) => (seq === 602 ? "หอคอยน้ำแข็ง" : `ด่าน ${seq}`);

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-line bg-panel2 px-3 py-2.5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-dim">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

function ThumbGrid({
  title,
  items,
  kind,
  empty,
}: {
  title: string;
  items: AccountItem[];
  kind: "cookie" | "pet" | "treasure";
  empty: string;
}) {
  return (
    <Card>
      <CardHead title={`${title} · ${items.length} ชนิด`} />
      {items.length ? (
        <div className="grid grid-cols-3 gap-3 p-4 sm:grid-cols-4 md:grid-cols-6">
          {items.map((it, i) => (
            <div key={`${it.image}-${i}`} className="flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-md border border-lineSoft bg-ink/50">
                {it.image ? (
                  // asset จาก proxy อาจไม่มี (map ไม่เจอ) — ให้ซ่อนเงียบ ๆ ถ้า error
                  <Image
                    src={imageUrl(kind, it.image)}
                    alt={it.name}
                    width={56}
                    height={56}
                    unoptimized
                    className="h-14 w-14 object-contain"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                    }}
                  />
                ) : null}
              </div>
              <p className="mt-1.5 line-clamp-2 text-[11px] leading-tight text-foreground">{it.name}</p>
              <p className="text-[10px] text-muted">
                {[it.level ? `เลเวล ${num(it.level)}` : "", it.count > 1 ? `×${num(it.count)}` : ""]
                  .filter(Boolean)
                  .join(" · ") || " "}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-4 py-6 text-sm text-muted">{empty}</p>
      )}
    </Card>
  );
}

function TextItems({ title, items }: { title: string; items: AccountItem[] }) {
  if (!items.length) return null;
  return (
    <Card>
      <CardHead title={`${title} · ${items.length} ชนิด`} />
      <div className="flex flex-wrap gap-2 p-4">
        {items.map((it, i) => (
          <span
            key={`${it.name}-${i}`}
            className="rounded-md border border-lineSoft bg-panel2 px-2.5 py-1 text-xs text-muted"
          >
            {it.name}
            {it.count > 1 ? <span className="ml-1 text-dim">×{num(it.count)}</span> : null}
          </span>
        ))}
      </div>
    </Card>
  );
}

export default function AccountPage() {
  const { token } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<AccountInspectResult | null>(null);

  const inspect = async (e: FormEvent) => {
    e.preventDefault();
    if (loading || !email.trim() || !password) return;
    setLoading(true);
    setError("");
    try {
      const res = await api<AccountInspectResult>("/api/account/inspect", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
        token,
      });
      setData(res);
      // ทิ้งรหัสทันทีหลังใช้ — ไม่เก็บค้างในหน้า
      setPassword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  };

  if (!data) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <div>
          <h1 className="font-display text-xl font-semibold">เช็คข้อมูลไอดี</h1>
          <p className="mt-1 text-sm text-muted">
            ดูของในบัญชี — อ่านอย่างเดียว ไม่แตะอะไรในเกม และไม่คิดเครดิต
          </p>
        </div>
        <Card>
          <form onSubmit={inspect} className="space-y-4 p-4">
            <div className="space-y-1.5">
              <label htmlFor="ac-email" className="text-sm text-muted">
                อีเมล
              </label>
              <Input
                id="ac-email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ac-password" className="text-sm text-muted">
                รหัสผ่าน
              </label>
              <Input
                id="ac-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="off"
              />
            </div>
            <p className="text-xs text-dim">
              รหัสผ่านใช้เข้าสู่ระบบครั้งเดียวเพื่อดึงข้อมูล แล้วทิ้งทันที ไม่ถูกเก็บไว้ในเบราว์เซอร์
            </p>
            {error && (
              <p className="rounded-md border border-heart/40 bg-heart/10 px-3 py-2 text-sm text-heart">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> กำลังเข้าสู่ระบบ …
                </>
              ) : (
                <>
                  <Eye className="mr-1.5 h-4 w-4" /> ดูข้อมูลบัญชี
                </>
              )}
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  const w = data.wallet;
  const own = data.owned;
  const pts = data.points;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold">{data.nickname || data.mid}</h1>
          <p className="font-mono text-xs text-muted">
            {data.mid} · เลเวล {num(data.level)}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setData(null);
            setEmail("");
          }}
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> เช็คไอดีอื่น
        </Button>
      </div>

      {/* กระเป๋าเงิน */}
      <Card>
        <CardHead title="กระเป๋า" />
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          <Stat label="เหรียญ" value={num(w.coin)} />
          <Stat label="เพชร" value={num(w.gem)} />
          <Stat label="หัวใจ" value={num(w.life)} />
          <Stat label="กุญแจหอคอย" value={num(w.key)} />
          <Stat label="ผงวิเศษ" value={num(w.powder)} />
          <Stat label="เหรียญรางวัล" value={num(w.medal)} />
          <Stat label="ตั๋ว PartyRun" value={num(w.party_ticket)} />
          <Stat label="EXP" value={num(data.exp)} />
        </div>
      </Card>

      {/* สรุปบัญชี */}
      <Card>
        <CardHead title="สรุปบัญชี" />
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          <Stat label="PartyRun" value={`ทีเออร์ ${num(data.party_tier)}`} hint={`ถ้วย ${num(data.trophies)}`} />
          <Stat label="เชิญเพื่อน" value={`${num(data.friend_invites)} คน`} />
          <Stat label="แต้มของขวัญ" value={`${num(pts?.gift_count)} ครั้ง`} />
          <Stat label="จดหมาย" value={`${num(data.mails)} ฉบับ`} />
        </div>
        <div className="border-t border-lineSoft px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-dim">ด่านที่ปลดแล้ว</p>
          <p className="mt-1 text-sm text-foreground">
            {data.episodes.length ? data.episodes.map(EPISODE_LABEL).join(" · ") : "ไม่มีข้อมูล"}
          </p>
        </div>
      </Card>

      {/* ของในคลัง */}
      <ThumbGrid title="คุกกี้ในคลัง" items={own.cookies} kind="cookie" empty="ยังไม่มีคุกกี้ในคลัง" />
      <ThumbGrid title="สัตว์เลี้ยงในคลัง" items={own.pets} kind="pet" empty="ยังไม่มีสัตว์เลี้ยง" />
      <ThumbGrid title="สมบัติในคลัง" items={own.treasures} kind="treasure" empty="ยังไม่มีสมบัติ" />
      <TextItems title="วัตถุดิบและชิ้นส่วน" items={own.materials} />
      <TextItems title="ตั๋วและกล่องสุ่ม" items={own.tickets} />
      <TextItems title="ของอื่น ๆ ในคลัง" items={own.others} />

      {own.unknown > 0 && (
        <p className="text-xs text-dim">
          อีก {num(own.unknown)} ชิ้นเป็นรูปโปรไฟล์ ฉายา และของที่ระบบยังไม่มีชื่อในตาราง — ไม่ได้แสดงไว้
        </p>
      )}

      {!own.cookies.length && !own.pets.length && !own.treasures.length && (
        <EmptyState title="ยังไม่มีของในคลัง" description="บัญชีนี้ยังไม่มีคุกกี้ สัตว์เลี้ยง หรือสมบัติ" />
      )}
    </div>
  );
}
