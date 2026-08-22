"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, UserPlus, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSavedAccounts } from "@/hooks/useSavedAccounts";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card, CardHead } from "@/components/ui/Card";
import {
  AccountPicker,
  credPayload,
  credReady,
  emptyManual,
  type CredValue,
} from "@/components/account/AccountPicker";
import { EmptyState } from "@/components/ui/States";
import { formatHearts } from "@/lib/utils";
import type { FriendAcceptResult, FriendListResult, GameFriendRequest } from "@/types";

type Phase = "form" | "list";

export default function FriendRequestsPage() {
  const { token } = useAuth();
  const { accounts } = useSavedAccounts();
  const [cred, setCred] = useState<CredValue>(emptyManual);
  const [phase, setPhase] = useState<Phase>("form");
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");
  const [account, setAccount] = useState<FriendListResult | null>(null);
  const [requests, setRequests] = useState<GameFriendRequest[]>([]);
  const [friendCount, setFriendCount] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<FriendAcceptResult | null>(null);

  // มีบัญชีที่ save ไว้ → ตั้งต้นเลือกอันแรกให้ (จนกว่าผู้ใช้จะแตะเอง)
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current && cred.mode === "manual" && !cred.email && accounts.length) {
      setCred({ mode: "saved", account_id: accounts[0].id });
    }
  }, [accounts, cred]);

  const onCredChange = (v: CredValue) => {
    touched.current = true;
    setCred(v);
  };

  const friendCap = account?.friend_cap ?? null;
  // เพดาน 300 คนเป็นของเกม — รับเกินช่องว่างที่เหลือไม่ได้ ต้องบอกก่อนกด
  // ไม่ใช่ปล่อยให้เซิร์ฟเวอร์ปฏิเสธทีละคนแล้วค่อยโชว์กอง error
  const slots = friendCap != null ? Math.max(friendCap - friendCount, 0) : null;
  const overCap = slots != null && selected.size > slots;

  const guestCount = useMemo(
    () => requests.filter((r) => r.looks_like_guest).length,
    [requests]
  );
  const allSelected = requests.length > 0 && selected.size === requests.length;

  const selectAll = (on: boolean) =>
    setSelected(on ? new Set(requests.map((r) => r.player_id)) : new Set());

  const toggle = (playerId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });

  const applyRequests = (list: GameFriendRequest[], selectAllByDefault: boolean) => {
    setRequests(list);
    // ครั้งแรกติ๊กให้ทุกคน เพราะปุ่มหลักของหน้านี้คือ "รับทั้งหมด"
    // หลังกดรับรอบหนึ่งแล้วล้างการเลือก ไม่งั้นคนที่ผู้ใช้ตั้งใจติ๊กออกเพื่อ
    // ไม่รับ จะกลับมาถูกเลือกเองเงียบ ๆ
    setSelected(selectAllByDefault ? new Set(list.map((r) => r.player_id)) : new Set());
  };

  const loadRequests = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await api<FriendListResult>("/api/friends/list", {
        method: "POST",
        token,
        body: JSON.stringify(credPayload(cred)),
      });
      setAccount(data);
      setFriendCount(data.friend_count);
      applyRequests(data.requests ?? [], true);
      setPhase("list");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ดึงคำขอเป็นเพื่อนไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const runAccept = async () => {
    if (!token || selected.size === 0) return;
    setAccepting(true);
    setError("");
    try {
      const data = await api<FriendAcceptResult>("/api/friends/accept", {
        method: "POST",
        token,
        body: JSON.stringify({
          ...credPayload(cred),
          player_ids: Array.from(selected),
        }),
      });
      setResult(data);
      setFriendCount(data.friend_count);
      applyRequests(data.requests ?? [], false);
      setAccount((prev) => (prev ? { ...prev, friend_count: data.friend_count } : prev));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "รับเพื่อนไม่สำเร็จ");
    } finally {
      setAccepting(false);
    }
  };

  const reset = () => {
    setPhase("form");
    // กรอกสด → ล้างรหัสหลังใช้; บัญชีที่ save ไว้คงการเลือกไว้ได้
    if (cred.mode === "manual") setCred((c) => ({ ...c, password: "" }) as CredValue);
    setAccount(null);
    setRequests([]);
    setFriendCount(0);
    setSelected(new Set());
    setResult(null);
    setError("");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">รับเพื่อนในเกม</h1>
        <p className="mt-1 text-sm text-muted">
          ล็อกอินไอดี DevPlay เพื่อดูคำขอเป็นเพื่อนที่ค้างอยู่ แล้วกดรับทีเดียวได้เลย — ฟรี
          ไม่ใช้เครดิต และไม่ต้องรอคิว
        </p>
      </div>

      {phase === "form" && (
        <Card className="p-5">
          <form onSubmit={loadRequests} className="space-y-3">
            <AccountPicker
              accounts={accounts}
              value={cred}
              onChange={onCredChange}
              idPrefix="fq"
            />
            {cred.mode === "manual" && (
              <p className="text-xs text-dim">
                รหัสผ่านใช้ล็อกอินตอนกดเท่านั้น ไม่ถูกบันทึกลงฐานข้อมูล
                (บันทึกบัญชีไว้ใช้ซ้ำได้ในหน้า ตั้งค่า)
              </p>
            )}
            {error && <p className="text-sm text-fail">{error}</p>}
            <Button type="submit" disabled={loading || !credReady(cred)}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> กำลังล็อกอิน...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" /> ดึงคำขอเป็นเพื่อน
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
                เพื่อนตอนนี้ {formatHearts(friendCount)}
                {friendCap ? ` / ${formatHearts(friendCap)}` : ""}
                {slots != null && ` · รับเพิ่มได้อีก ${formatHearts(slots)}`}
                {guestCount > 0 && ` · น่าจะเป็นบัญชี guest ${formatHearts(guestCount)}`}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              เปลี่ยนไอดี
            </Button>
          </Card>

          {result && (
            <Card className="border-live/40 bg-live/[0.04] p-4 text-sm">
              <p className="font-medium">
                รับสำเร็จ {formatHearts(result.accepted)} / {formatHearts(result.requested)} คำขอ
              </p>
              {result.skipped_cap > 0 && (
                <p className="mt-1 text-muted">
                  ข้าม {formatHearts(result.skipped_cap)} คำขอเพราะเพื่อนเต็มเพดานแล้ว —
                  ลบเพื่อนออกก่อนแล้วค่อยกดรับใหม่
                </p>
              )}
              {result.skipped_not_pending > 0 && (
                <p className="mt-1 text-muted">
                  ข้าม {formatHearts(result.skipped_not_pending)} รายชื่อที่ไม่มีคำขอค้างอยู่แล้ว
                </p>
              )}
              {result.failed.length > 0 && (
                <p className="mt-1 text-fail">
                  รับไม่สำเร็จ {result.failed.length} คำขอ — กดรับซ้ำได้อีกครั้ง
                </p>
              )}
            </Card>
          )}

          {error && (
            <Card className="border-fail/40 bg-fail/[0.04] p-4 text-sm text-fail">{error}</Card>
          )}

          <Card>
            <CardHead
              title={`คำขอเป็นเพื่อน (${formatHearts(requests.length)})`}
              action={
                requests.length > 0 && (
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
            {requests.length === 0 ? (
              <EmptyState
                icon={Users}
                title="ไม่มีคำขอเป็นเพื่อน"
                description="บัญชีนี้ไม่มีคำขอค้างอยู่"
              />
            ) : (
              <ul className="divide-y divide-lineSoft">
                {requests.map((r) => (
                  <li key={r.player_id}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition hover:bg-white/[0.03]">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 shrink-0 accent-[var(--heart)]"
                        checked={selected.has(r.player_id)}
                        onChange={() => toggle(r.player_id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">
                          {r.nickname || <span className="text-dim">(ไม่มีชื่อเล่น)</span>}
                        </span>
                        <span className="block truncate font-mono text-[11px] text-dim">
                          {r.player_id}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted">Lv.{r.level}</span>
                      {r.looks_like_guest && (
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

          {requests.length > 0 && (
            <Card className="space-y-3 p-4">
              {overCap && (
                <p className="flex items-start gap-2 text-sm text-fail">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  เลือกไว้ {formatHearts(selected.size)} คน แต่รับเพิ่มได้อีกแค่{" "}
                  {formatHearts(slots ?? 0)} — ส่วนที่เกินจะถูกข้าม
                </p>
              )}
              <Button onClick={runAccept} disabled={accepting || selected.size === 0}>
                {accepting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> กำลังรับ...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    {allSelected
                      ? `รับทั้งหมด (${formatHearts(selected.size)})`
                      : `รับที่เลือก (${formatHearts(selected.size)})`}
                  </>
                )}
              </Button>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
