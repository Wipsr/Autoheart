"use client";

import { FormEvent, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Trash2, UserMinus, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card, CardHead } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/States";
import { cn, formatHearts } from "@/lib/utils";
import type { FriendDeleteResult, FriendListResult, GameFriend } from "@/types";

type Phase = "form" | "list";

export default function FriendsPage() {
  const { token } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [account, setAccount] = useState<FriendListResult | null>(null);
  const [friends, setFriends] = useState<GameFriend[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<FriendDeleteResult | null>(null);

  const guestCount = useMemo(
    () => friends.filter((f) => f.looks_like_guest).length,
    [friends]
  );
  const allSelected = friends.length > 0 && selected.size === friends.length;

  const selectAll = (on: boolean) =>
    setSelected(on ? new Set(friends.map((f) => f.player_id)) : new Set());

  const toggle = (playerId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });

  const applyFriends = (list: GameFriend[], selectAllByDefault: boolean) => {
    setFriends(list);
    // ตอนดึงรายชื่อมาครั้งแรกติ๊กไว้ทุกคน เพราะปุ่มหลักของหน้านี้คือ "ลบทั้งหมด"
    // แต่หลังลบรอบหนึ่งแล้วต้องล้างการเลือก ไม่งั้นเพื่อนที่ผู้ใช้ตั้งใจติ๊กออก
    // เพื่อเก็บไว้ จะกลับมาถูกเลือกเองเงียบ ๆ
    setSelected(selectAllByDefault ? new Set(list.map((f) => f.player_id)) : new Set());
  };

  const loadFriends = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await api<FriendListResult>("/api/friends/list", {
        method: "POST",
        token,
        body: JSON.stringify({ email: email.trim(), password }),
      });
      setAccount(data);
      applyFriends(data.friends, true);
      setPhase("list");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ดึงรายชื่อเพื่อนไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const runDelete = async () => {
    if (!token || selected.size === 0) return;
    setDeleting(true);
    setError("");
    try {
      const data = await api<FriendDeleteResult>("/api/friends/delete", {
        method: "POST",
        token,
        body: JSON.stringify({
          email: email.trim(),
          password,
          player_ids: Array.from(selected),
        }),
      });
      setResult(data);
      applyFriends(data.friends, false);
      setAccount((prev) => (prev ? { ...prev, friend_count: data.friend_count } : prev));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ลบเพื่อนไม่สำเร็จ");
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  const reset = () => {
    setPhase("form");
    setPassword("");
    setAccount(null);
    setFriends([]);
    setSelected(new Set());
    setResult(null);
    setError("");
    setConfirming(false);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">ลบเพื่อนในเกม</h1>
        <p className="mt-1 text-sm text-muted">
          ล็อกอินไอดี DevPlay เพื่อดูรายชื่อเพื่อนทั้งหมด แล้วเลือกลบได้เลย — ฟรี ไม่ใช้เครดิต
          และไม่ต้องรอคิว
        </p>
      </div>

      {phase === "form" && (
        <Card className="p-5">
          <form onSubmit={loadFriends} className="space-y-3">
            <Input
              required
              type="email"
              autoComplete="off"
              placeholder="DevPlay Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              required
              type="password"
              autoComplete="new-password"
              placeholder="DevPlay Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-dim">
              รหัสผ่านใช้ล็อกอินตอนกดเท่านั้น ไม่ถูกบันทึกลงฐานข้อมูล
            </p>
            {error && <p className="text-sm text-fail">{error}</p>}
            <Button type="submit" disabled={loading || !email.trim() || !password}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> กำลังล็อกอิน...
                </>
              ) : (
                <>
                  <Users className="h-4 w-4" /> ดึงรายชื่อเพื่อน
                </>
              )}
            </Button>
          </form>
        </Card>
      )}

      {phase === "list" && (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="text-sm">
              <p className="font-medium">{account?.email}</p>
              <p className="text-dim">
                เพื่อนทั้งหมด {formatHearts(friends.length)}
                {account?.friend_cap ? ` / ${formatHearts(account.friend_cap)}` : ""}
                {guestCount > 0 && ` · น่าจะเป็นบัญชี guest ${formatHearts(guestCount)}`}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              เปลี่ยนไอดี
            </Button>
          </Card>

          {result && (
            <Card
              className={cn("p-4 text-sm", result.ok ? "border-live/40 bg-live/[0.04]" : "border-fail/40 bg-fail/[0.04]")}
            >
              <p className="font-medium">
                ลบสำเร็จ {formatHearts(result.removed)} / {formatHearts(result.requested)} รายชื่อ
              </p>
              {result.skipped_not_friend > 0 && (
                <p className="mt-1 text-muted">
                  ข้าม {result.skipped_not_friend} รายชื่อที่ไม่ได้เป็นเพื่อนอยู่แล้ว
                </p>
              )}
              {result.failed.length > 0 && (
                <p className="mt-1 text-fail">
                  ลบไม่สำเร็จ {result.failed.length} รายชื่อ — กดลบซ้ำได้อีกครั้ง
                </p>
              )}
            </Card>
          )}

          {error && (
            <Card className="border-fail/40 bg-fail/[0.04] p-4 text-sm text-fail">{error}</Card>
          )}

          <Card>
            <CardHead
              title={`รายชื่อเพื่อน (${formatHearts(friends.length)})`}
              action={
                friends.length > 0 && (
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-[var(--heart)]"
                      checked={allSelected}
                      onChange={(e) => selectAll(e.target.checked)}
                    />
                    เลือกทั้งหมด
                  </label>
                )
              }
            />
            {friends.length === 0 ? (
              <EmptyState
                icon={Users}
                title="ไม่มีเพื่อนในรายชื่อ"
                description="บัญชีนี้ไม่มีเพื่อนเหลือแล้ว"
              />
            ) : (
              <ul className="divide-y divide-lineSoft">
                {friends.map((f) => (
                  <li key={f.player_id}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition hover:bg-white/[0.03]">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 shrink-0 accent-[var(--heart)]"
                        checked={selected.has(f.player_id)}
                        onChange={() => toggle(f.player_id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">
                          {f.nickname || <span className="text-dim">(ไม่มีชื่อเล่น)</span>}
                        </span>
                        <span className="block truncate font-mono text-[11px] text-dim">
                          {f.player_id}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted">Lv.{f.level}</span>
                      {f.looks_like_guest && (
                        <span className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] text-dim">
                          guest?
                        </span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {friends.length > 0 && (
            <Card className="space-y-3 p-4">
              {confirming ? (
                <>
                  <p className="flex items-start gap-2 text-sm text-fail">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    ยืนยันลบเพื่อน {formatHearts(selected.size)} คน? การลบกู้คืนไม่ได้
                    ต้องส่งคำขอเป็นเพื่อนใหม่เท่านั้น
                  </p>
                  <div className="flex gap-2">
                    <Button variant="danger" onClick={runDelete} disabled={deleting}>
                      {deleting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> กำลังลบ...
                        </>
                      ) : (
                        <>
                          <Trash2 className="h-4 w-4" /> ยืนยันลบ
                        </>
                      )}
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirming(false)} disabled={deleting}>
                      ยกเลิก
                    </Button>
                  </div>
                </>
              ) : (
                <Button
                  variant="danger"
                  onClick={() => setConfirming(true)}
                  disabled={selected.size === 0}
                >
                  <UserMinus className="h-4 w-4" />
                  {allSelected
                    ? `ลบเพื่อนทั้งหมด (${formatHearts(selected.size)})`
                    : `ลบเพื่อนที่เลือก (${formatHearts(selected.size)})`}
                </Button>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
