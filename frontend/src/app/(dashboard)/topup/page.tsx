"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, Heart, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Card, CardHead } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { formatHearts } from "@/lib/utils";
import { PACKAGES } from "@/lib/constants";
import type { Package } from "@/types";

export default function TopupPage() {
  const { token, profile, refreshProfile } = useAuth();

  const [packages, setPackages] = useState<Package[]>([]);
  useEffect(() => {
    api<Package[]>("/api/packages")
      .then(setPackages)
      .catch(() =>
        setPackages(
          PACKAGES.map((p, i) => ({
            id: i + 1,
            name: p.name,
            slug: p.slug,
            points: p.points,
            price_baht: p.price_baht,
            description: p.description,
            badge: p.badge,
          }))
        )
      );
  }, []);

  const pointBalance = profile?.points ?? 0;
  const heartBalance = profile?.hearts ?? 0;

  // ── เติมพอยท์ด้วยซองอั่งเปา (ไม่ผูกแพ็ก เข้าพอยท์ 1:1) ──────────────────
  const [voucher, setVoucher] = useState("");
  const [topupLoading, setTopupLoading] = useState(false);
  const [topupError, setTopupError] = useState("");
  const [topupResult, setTopupResult] = useState<{ points_credited: number } | null>(null);

  const submitTopup = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !voucher.trim()) return;
    setTopupLoading(true);
    setTopupError("");
    setTopupResult(null);
    try {
      const res = await api<{ points_credited: number }>("/api/topup/redeem", {
        method: "POST",
        token,
        body: JSON.stringify({ voucher: voucher.trim() }),
      });
      setTopupResult(res);
      setVoucher("");
      await refreshProfile(token);
    } catch (err) {
      setTopupError(err instanceof ApiError ? err.message : "เติมพอยท์ไม่สำเร็จ");
    } finally {
      setTopupLoading(false);
    }
  };

  // ── แลกพอยท์ที่มีอยู่เป็นหัวใจ ตามเรตของแพ็กที่เลือก ─────────────────────
  const [selectedPkgId, setSelectedPkgId] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [convertLoading, setConvertLoading] = useState(false);
  const [convertError, setConvertError] = useState("");
  const [convertResult, setConvertResult] = useState<{
    points_spent: number;
    hearts_credited: number;
  } | null>(null);

  const selectedPkg = useMemo(
    () => packages.find((p) => p.id === selectedPkgId) || packages[0],
    [packages, selectedPkgId]
  );
  const pointsCost = selectedPkg ? Math.round(selectedPkg.price_baht * qty) : 0;
  const heartsGain = selectedPkg ? selectedPkg.points * qty : 0;
  const canConvert = Boolean(selectedPkg) && pointBalance >= pointsCost && pointsCost > 0;

  const submitConvert = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !selectedPkg) return;
    setConvertLoading(true);
    setConvertError("");
    setConvertResult(null);
    try {
      const res = await api<{ ok: boolean; points_spent: number; hearts_credited: number }>(
        "/api/topup/points/convert",
        {
          method: "POST",
          token,
          body: JSON.stringify({ package_id: selectedPkg.id, quantity: qty }),
        }
      );
      setConvertResult(res);
      await refreshProfile(token);
    } catch (err) {
      setConvertError(err instanceof ApiError ? err.message : "แลกพอยท์เป็นหัวใจไม่สำเร็จ");
    } finally {
      setConvertLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">เติม / แลกเป็นหัวใจ</h1>
        <p className="text-muted">
          พอยท์คือกระเป๋าเงินที่เติมค้างไว้ ส่วนหัวใจคือยอดที่สั่งงานฟาร์มได้จริง
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-dim">
            พอยท์คงเหลือ
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-info">
            {formatHearts(pointBalance)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-dim">
            หัวใจคงเหลือ
          </p>
          <p className="mt-1 flex items-center gap-1.5 font-mono text-2xl font-semibold tabular-nums text-heart">
            <Heart className="h-4 w-4 fill-heart" />
            {formatHearts(heartBalance)}
          </p>
        </Card>
      </div>

      {/* เติมพอยท์ */}
      <Card className="overflow-hidden">
        <CardHead title="เติมพอยท์" />
        <form onSubmit={submitTopup} className="space-y-3 p-5">
          <p className="text-xs text-muted">
            แลกซองอั่งเปา TrueMoney เข้ากระเป๋าพอยท์โดยตรง 1 บาท = 1 พอยท์ ไม่ผูกกับแพ็กไหน
          </p>
          <div>
            <label className="mb-1.5 block text-xs text-muted">ลิงก์ซองอั่งเปา TrueMoney</label>
            <Input
              required
              placeholder="https://gift.truemoney.com/campaign/?v=..."
              value={voucher}
              onChange={(e) => setVoucher(e.target.value)}
            />
          </div>

          {topupError && <p className="text-sm text-fail">{topupError}</p>}
          {topupResult && (
            <p className="text-sm text-live">
              เติมสำเร็จ +{formatHearts(topupResult.points_credited)} พอยท์ — ยอดพอยท์ล่าสุด{" "}
              {formatHearts(pointBalance)}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={topupLoading || !voucher.trim()}>
            {topupLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> กำลังแลกซอง...
              </>
            ) : (
              "เติมพอยท์"
            )}
          </Button>
        </form>
      </Card>

      {/* แลกพอยท์เป็นหัวใจ */}
      <Card className="overflow-hidden">
        <CardHead title="แลกพอยท์เป็นหัวใจ" />
        <form onSubmit={submitConvert} className="space-y-4 p-5">
          <p className="text-xs text-muted">
            เลือกเรตจากแพ็กเกจแล้วแลกพอยท์ที่มีอยู่เป็นหัวใจได้ทันที ไม่ต้องรอซองใหม่
          </p>

          <div className="space-y-2">
            {packages.map((pkg) => {
              const active = selectedPkg?.id === pkg.id;
              return (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => setSelectedPkgId(pkg.id)}
                  className={`flex w-full items-center justify-between rounded-md border p-3 text-left transition ${
                    active ? "border-heart bg-heart/10" : "border-line bg-white/[0.03]"
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium">{pkg.name}</p>
                    <p className="mt-0.5 font-mono text-xs tabular-nums text-dim">
                      {formatHearts(pkg.price_baht)} พอยท์ → {formatHearts(pkg.points)} หัวใจ
                    </p>
                  </div>
                  {pkg.badge && (
                    <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-dim">
                      {pkg.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {selectedPkg && (
            <>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-muted">จำนวนรอบ</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setQty(Math.max(1, qty - 1))}
                    >
                      −
                    </Button>
                    <span className="w-10 text-center text-lg font-semibold">{qty}</span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setQty(Math.min(50, qty + 1))}
                    >
                      +
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-md border border-heart/40 bg-heart/[0.07] p-4 text-sm">
                <div className="space-y-1">
                  <p className="text-muted">
                    ใช้พอยท์{" "}
                    <span className="font-mono tabular-nums text-foreground">
                      {formatHearts(pointsCost)}
                    </span>
                  </p>
                  <p className="text-muted">
                    ได้หัวใจ{" "}
                    <span className="font-mono tabular-nums text-heart">
                      {formatHearts(heartsGain)}
                    </span>
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-heart" />
              </div>

              {!canConvert && pointsCost > 0 && (
                <p className="text-xs text-fail">
                  พอยท์ไม่พอ — มี {formatHearts(pointBalance)} ต้องการ {formatHearts(pointsCost)}
                </p>
              )}
              {convertError && <p className="text-sm text-fail">{convertError}</p>}
              {convertResult && (
                <p className="text-sm text-live">
                  แลกสำเร็จ −{formatHearts(convertResult.points_spent)} พอยท์ +
                  {formatHearts(convertResult.hearts_credited)} หัวใจ
                </p>
              )}

              <Button type="submit" className="w-full" disabled={!canConvert || convertLoading}>
                {convertLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> กำลังแลก...
                  </>
                ) : (
                  `แลก ${formatHearts(pointsCost)} พอยท์ เป็น ${formatHearts(heartsGain)} หัวใจ`
                )}
              </Button>
            </>
          )}
        </form>
      </Card>
    </div>
  );
}
