"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Check, Copy, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { CredentialRow, type Cred } from "@/components/purchase/CredentialRow";
import { useSavedAccounts } from "@/hooks/useSavedAccounts";
import { formatBaht, formatBahtExact, formatPoints } from "@/lib/utils";
import type { Package, SavedAccount } from "@/types";
import { PACKAGES } from "@/lib/constants";

type Step = 1 | 2 | 3 | 4;
type PayMethod = "heart" | "point" | "angpao";

const STEP_LABEL: Record<Step, string> = {
  1: "เลือกแพ็ค",
  2: "ตรวจไอดี",
  3: "ชำระเงิน",
  4: "เข้าคิวแล้ว",
};

const emptyCred = (): Cred => ({ email: "", password: "", status: "idle" });

// payload สำหรับ verify/create: อ้าง account_id ถ้ามี ไม่งั้นใช้ email+password
const credBody = (c: Cred): Record<string, string> =>
  c.account_id ? { account_id: c.account_id } : { email: c.email.trim(), password: c.password };

export default function PurchasePage() {
  const params = useParams();
  const router = useRouter();
  const { token, profile, refreshProfile } = useAuth();
  const packageId = Number(params.id);

  const [packages, setPackages] = useState<Package[]>([]);
  const [step, setStep] = useState<Step>(1);
  const [qty, setQty] = useState(1);

  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState<{ discount_baht: number; amount_after: number; code: string } | null>(null);
  const [couponError, setCouponError] = useState("");
  const [couponChecking, setCouponChecking] = useState(false);

  const [mode, setMode] = useState<"single" | "batch">("single");
  const [creds, setCreds] = useState<Cred[]>([emptyCred()]);
  const [verifyingAll, setVerifyingAll] = useState(false);
  const { accounts: savedAccounts } = useSavedAccounts();

  const [voucher, setVoucher] = useState("");
  // null = ยังไม่ได้เลือกเอง ให้ระบบเดาให้ตามยอดคงเหลือ
  const [payMethodChoice, setPayMethodChoice] = useState<PayMethod | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  const pkg = useMemo(
    () => packages.find((p) => p.id === packageId) || packages[0],
    [packages, packageId]
  );

  const totalBaht = (pkg?.price_baht || 0) * qty;
  const totalHearts = (pkg?.points || 0) * qty;
  // จ่ายด้วยพอยท์ = แลกพอยท์เป็นหัวใจตามเรตแพ็กนี้แล้วใช้ทันที ไม่มีส่วนลดคูปอง
  const totalPointsCost = Math.round(totalBaht);
  const payableBaht = coupon?.amount_after ?? totalBaht;

  // ทุกวิธีจ่ายหักให้เสร็จในตัว /api/jobs/create เลย ไม่ต้องแลกซอง/เติมเครดิตแยกขั้นตอน
  const heartBalance = profile?.hearts ?? 0;
  const pointBalance = profile?.points ?? 0;
  const canPayWithHeart = heartBalance >= totalHearts;
  const canPayWithPoint = pointBalance >= totalPointsCost;
  const payMethod: PayMethod = useMemo(() => {
    if (payMethodChoice === "heart" && !canPayWithHeart) return "angpao";
    if (payMethodChoice === "point" && !canPayWithPoint) return "angpao";
    if (payMethodChoice) return payMethodChoice;
    if (canPayWithHeart) return "heart";
    if (canPayWithPoint) return "point";
    return "angpao";
  }, [payMethodChoice, canPayWithHeart, canPayWithPoint]);
  const usingBalance = payMethod === "heart" || payMethod === "point";

  // จำนวนช่องไอดีตามโหมด: ไอดีเดียวใช้ซ้ำ × qty หรือกรอกแยกทีละไอดี
  useEffect(() => {
    setCreds((prev) => {
      if (mode === "single") return [prev[0] || emptyCred()];
      const next = [...prev];
      while (next.length < qty) next.push(emptyCred());
      return next.slice(0, qty);
    });
  }, [mode, qty]);

  // ตรวจคูปองอัตโนมัติเมื่อพิมพ์ครบ ไม่ต้องกดปุ่มแยก
  useEffect(() => {
    const code = couponCode.trim();
    if (!token || !pkg) return;
    if (code.length < 3) {
      setCoupon(null);
      setCouponError("");
      return;
    }
    let cancelled = false;
    setCouponChecking(true);
    const timer = setTimeout(async () => {
      try {
        const result = await api<{ discount_baht: number; amount_after: number; code: string }>(
          "/api/coupons/preview",
          {
            method: "POST",
            token,
            body: JSON.stringify({ code, package_id: pkg.id, quantity: qty }),
          }
        );
        if (cancelled) return;
        setCoupon(result);
        setCouponError("");
      } catch (err) {
        if (cancelled) return;
        setCoupon(null);
        setCouponError(err instanceof ApiError ? err.message : "ตรวจสอบคูปองไม่สำเร็จ");
      } finally {
        if (!cancelled) setCouponChecking(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [couponCode, qty, pkg, token]);

  const activeCreds = mode === "single" ? creds.slice(0, 1) : creds;
  const allVerified = activeCreds.length > 0 && activeCreds.every((c) => c.status === "valid");
  const pendingCount = activeCreds.filter((c) => c.status !== "valid").length;

  const patchCred = (index: number, patch: Partial<Cred>) =>
    setCreds((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  // เลือกบัญชีที่บันทึกไว้สำหรับช่องนี้ (null = กลับไปกรอกเอง)
  const pickSaved = (index: number, account: SavedAccount | null) => {
    if (account) {
      patchCred(index, {
        account_id: account.id,
        label: account.label?.trim() || account.nickname || account.email,
        email: account.email,
        password: "",
        status: "valid", // บัญชีที่ save ผ่านการ verify ตอนบันทึกแล้ว
        message: undefined,
      });
    } else {
      patchCred(index, {
        account_id: undefined,
        label: undefined,
        email: "",
        password: "",
        status: "idle",
        message: undefined,
      });
    }
  };

  const verifyOne = async (index: number, source?: Cred[]) => {
    const list = source || creds;
    const cred = list[index];
    if (!token || !cred) return false;
    if (!cred.account_id && (!cred.email.trim() || !cred.password)) return false;
    patchCred(index, { status: "checking", message: undefined });
    try {
      const res = await api<{ valid: boolean; error_message?: string }>(
        "/api/credentials/verify",
        {
          method: "POST",
          token,
          body: JSON.stringify(credBody(cred)),
        }
      );
      patchCred(index, {
        status: res.valid ? "valid" : "invalid",
        message: res.valid ? undefined : res.error_message || "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
      });
      return Boolean(res.valid);
    } catch (err) {
      patchCred(index, {
        status: "invalid",
        message: err instanceof ApiError ? err.message : "ตรวจสอบไอดีไม่สำเร็จ",
      });
      return false;
    }
  };

  const verifyAll = async () => {
    setError("");
    setVerifyingAll(true);
    const snapshot = mode === "single" ? creds.slice(0, 1) : creds;
    try {
      for (let i = 0; i < snapshot.length; i++) {
        if (snapshot[i].status === "valid") continue;
        await verifyOne(i, snapshot);
      }
    } finally {
      setVerifyingAll(false);
    }
  };

  const copyAmount = async () => {
    try {
      await navigator.clipboard.writeText(payableBaht.toFixed(2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("คัดลอกไม่สำเร็จ — พิมพ์ยอดเองได้เลย");
    }
  };

  // ตรวจไอดีก่อนเสมอ ผ่านครบถึงจะหักเงิน/แลกซอง (ไม่มีขั้นตอน "จ่ายแล้วรอสร้างงาน"
  // แยกต่างหากอีกต่อไป — /api/jobs/create หักให้ครบในคำขอเดียว)
  const createJobs = async () => {
    if (!token || !pkg) return;
    const credentials =
      mode === "single"
        ? Array.from({ length: qty }, () => ({
            ...credBody(creds[0]),
            package_id: pkg.id,
          }))
        : activeCreds.map((c) => ({
            ...credBody(c),
            package_id: pkg.id,
          }));

    const res = await api<{
      ok: boolean;
      invalid?: { email: string; error_message?: string }[];
      jobs?: unknown[];
    }>("/api/jobs/create", {
      method: "POST",
      token,
      body: JSON.stringify({
        credentials,
        package_id: pkg.id,
        payment_method: payMethod,
        voucher: payMethod === "angpao" ? voucher : undefined,
        coupon_code: payMethod === "angpao" ? coupon?.code : undefined,
      }),
    });

    if (!res.ok) {
      const invalid = res.invalid || [];
      setCreds((prev) =>
        prev.map((c) => {
          const hit = invalid.find((i) => i.email === c.email.trim());
          return hit ? { ...c, status: "invalid", message: hit.error_message } : c;
        })
      );
      setStep(2);
      setError(
        "ไอดีบางอันใช้ไม่ได้แล้ว (อาจเปลี่ยนรหัสระหว่างทาง) — ยังไม่มีการหักเงิน แก้ไอดีแล้วกดสร้างงานอีกครั้งได้เลย"
      );
      return;
    }

    await refreshProfile(token);
    setStep(4);
    setTimeout(() => router.push("/queue"), 1200);
  };

  const submitPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !pkg) return;
    setLoading(true);
    setError("");
    try {
      await createJobs();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  if (!pkg) return <p className="text-muted">กำลังโหลดแพ็คเกจ...</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">ซื้อ {pkg.name}</h1>
        <p className="mt-0.5 text-sm text-muted">
          ขั้นตอน {step > 3 ? 3 : step}/3 — {STEP_LABEL[step]}
        </p>
      </div>

      <div className="flex gap-2">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-point" : "bg-lineSoft"}`}
          />
        ))}
      </div>

      {/* ขั้น 1 — เลือกจำนวนและคูปอง */}
      {step === 1 && (
        <Card className="space-y-5 p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm text-muted">จำนวนแพ็ค</p>
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
            <div className="text-right">
              <p className="font-mono text-2xl font-semibold tabular-nums text-point-ink">
                {formatBaht(totalBaht)}
              </p>
              {coupon && (
                <p className="text-sm text-live-ink">
                  หลังลด ฿{formatBahtExact(payableBaht)}
                </p>
              )}
              <p className="text-sm text-muted">ได้ {formatPoints(totalHearts)} หัวใจ</p>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-muted">คูปองส่วนลด (ถ้ามี)</label>
            <Input
              placeholder="COUPON CODE"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
            />
            {couponChecking && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                <Loader2 className="h-3 w-3 animate-spin" /> กำลังตรวจคูปอง...
              </p>
            )}
            {!couponChecking && coupon && (
              <p className="mt-1.5 text-xs text-live-ink">
                ใช้ {coupon.code}: ลด ฿{formatBahtExact(coupon.discount_baht)}
              </p>
            )}
            {!couponChecking && couponError && (
              <p className="mt-1.5 text-xs text-fail-ink">{couponError}</p>
            )}
          </div>

          <div className="rounded-card border border-line bg-subtle p-3 text-xs text-muted">
            ขั้นต่อไประบบจะตรวจไอดี DevPlay ให้ฟรีก่อน ยังไม่ต้องจ่ายเงิน
            จะขอให้ชำระก็ต่อเมื่อไอดีผ่านครบทุกอัน
          </div>

          <Button className="w-full" onClick={() => setStep(2)}>
            ถัดไป — ตรวจไอดี
          </Button>
        </Card>
      )}

      {/* ขั้น 2 — กรอกและตรวจไอดี */}
      {step === 2 && (
        <Card className="space-y-4 p-6">
          <div>
            <p className="text-sm font-medium">กรอกไอดี DevPlay ที่จะให้ระบบฟาร์ม</p>
            <p className="mt-1 text-xs text-muted">
              ตรวจให้ฟรี ยังไม่หักเครดิตและยังไม่เรียกเก็บเงิน
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "single" ? "primary" : "secondary"}
              onClick={() => setMode("single")}
            >
              ไอดีเดียว × {qty}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "batch" ? "primary" : "secondary"}
              onClick={() => setMode("batch")}
            >
              หลายไอดี ({qty} ช่อง)
            </Button>
          </div>

          <div className="space-y-3">
            {activeCreds.map((c, i) => (
              <CredentialRow
                key={i}
                cred={c}
                index={i}
                showIndex={mode === "batch"}
                onChange={(patch) => patchCred(i, patch)}
                onVerify={() => verifyOne(i)}
                savedAccounts={savedAccounts}
                onPickSaved={(a) => pickSaved(i, a)}
              />
            ))}
          </div>

          {error && <p className="text-sm text-fail-ink">{error}</p>}

          <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-subtle px-3 py-2 text-xs">
            <span className={allVerified ? "text-live-ink" : "text-muted"}>
              ผ่านแล้ว {activeCreds.length - pendingCount}/{activeCreds.length} ไอดี
            </span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={verifyingAll || allVerified}
              onClick={verifyAll}
            >
              {verifyingAll ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> กำลังตรวจ...
                </>
              ) : (
                "ตรวจไอดีทั้งหมด"
              )}
            </Button>
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setStep(1)}>
              ย้อนกลับ
            </Button>
            <Button
              className="flex-1"
              disabled={!allVerified || loading}
              onClick={() => {
                setError("");
                setStep(3);
              }}
            >
              ไปหน้าชำระเงิน
            </Button>
          </div>
          {!allVerified && (
            <p className="text-center text-xs text-dim">
              ต้องผ่านครบทุกไอดีก่อนถึงจะไปขั้นชำระเงินได้
            </p>
          )}
        </Card>
      )}

      {/* ขั้น 3 — เลือกวิธีจ่าย: หัวใจ / พอยท์ / ซองอั่งเปา */}
      {step === 3 && (
        <Card className="space-y-5 p-6">
          <div className="rounded-card border border-live-line bg-live-soft px-3 py-2 text-sm text-live-ink">
            ไอดีผ่านครบ {activeCreds.length}/{activeCreds.length} แล้ว —{" "}
            {usingBalance ? "กดยืนยันแล้วงานเข้าคิวทันที" : "งานจะเข้าคิวทันทีหลังชำระเงิน"}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setPayMethodChoice("heart")}
              disabled={!canPayWithHeart}
              className={`rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                payMethod === "heart"
                  ? "border-point-line bg-point-soft"
                  : "border-line bg-subtle"
              }`}
            >
              <span className="block text-sm font-medium">ใช้หัวใจ</span>
              <span className="mt-0.5 block text-xs text-muted">
                {canPayWithHeart
                  ? `คงเหลือ ${formatPoints(heartBalance)}`
                  : `มี ${formatPoints(heartBalance)} ไม่พอ`}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setPayMethodChoice("point")}
              disabled={!canPayWithPoint}
              className={`rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                payMethod === "point"
                  ? "border-info-line bg-info-soft"
                  : "border-line bg-subtle"
              }`}
            >
              <span className="block text-sm font-medium">ใช้พอยท์</span>
              <span className="mt-0.5 block text-xs text-muted">
                {canPayWithPoint
                  ? `คงเหลือ ${formatPoints(pointBalance)}`
                  : `มี ${formatPoints(pointBalance)} ไม่พอ`}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setPayMethodChoice("angpao")}
              className={`rounded-lg border p-3 text-left transition ${
                payMethod === "angpao" ? "border-wait-line bg-wait-soft" : "border-line bg-subtle"
              }`}
            >
              <span className="block text-sm font-medium">ซองอั่งเปา</span>
              <span className="mt-0.5 block text-xs text-muted">
                จ่าย ฿{formatBahtExact(totalBaht)}
              </span>
            </button>
          </div>

          {payMethod === "heart" && (
            <div className="rounded-card border border-point-line bg-point-soft p-4">
              <p className="text-xs uppercase tracking-wider text-point-dim">
                หักจากหัวใจในบัญชี ไม่ต้องชำระเงิน
              </p>
              <div className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between text-point-dim">
                  <span>มีอยู่</span>
                  <span className="tabular-nums">{formatPoints(heartBalance)} หัวใจ</span>
                </div>
                <div className="flex justify-between text-point-dim">
                  <span>
                    ใช้ไป ({formatPoints(pkg.points)} × {qty})
                  </span>
                  <span className="tabular-nums">−{formatPoints(totalHearts)} หัวใจ</span>
                </div>
                <div className="flex justify-between border-t border-point-line pt-1 font-medium">
                  <span>คงเหลือหลังทำรายการ</span>
                  <span className="tabular-nums text-point-ink">
                    {formatPoints(heartBalance - totalHearts)} หัวใจ
                  </span>
                </div>
              </div>
            </div>
          )}

          {payMethod === "point" && (
            <div className="rounded-card border border-info-line bg-info-soft p-4">
              <p className="text-xs uppercase tracking-wider text-info-ink">
                แลกพอยท์เป็นหัวใจตามเรตแพ็กนี้ แล้วใช้สั่งงานทันที
              </p>
              <div className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between text-muted">
                  <span>พอยท์คงเหลือ</span>
                  <span className="tabular-nums">{formatPoints(pointBalance)} พอยท์</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>ใช้พอยท์ (฿{formatBahtExact(totalBaht)} × 1)</span>
                  <span className="tabular-nums">−{formatPoints(totalPointsCost)} พอยท์</span>
                </div>
                <div className="flex justify-between border-t border-info-line pt-1 font-medium">
                  <span>ได้หัวใจใช้งาน</span>
                  <span className="tabular-nums text-info-ink">{formatPoints(totalHearts)} หัวใจ</span>
                </div>
              </div>
            </div>
          )}

          {payMethod === "angpao" && (
            <div className="rounded-card border border-wait-line bg-wait-soft p-4">
              <p className="text-xs uppercase tracking-wider text-wait-ink">
                สร้างซองอั่งเปายอดนี้เป๊ะ ๆ
              </p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="font-mono text-4xl font-bold tabular-nums text-wait-ink">
                  ฿{formatBahtExact(payableBaht)}
                </span>
                <Button type="button" variant="secondary" size="sm" onClick={copyAmount}>
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> คัดลอกแล้ว
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> คัดลอกยอด
                    </>
                  )}
                </Button>
              </div>
              <ul className="mt-3 space-y-1 text-xs text-wait-ink/70">
                <li>• ยอดต้องตรงถึงทศนิยม ไม่งั้นระบบจะไม่เข้าหัวใจอัตโนมัติ</li>
                <li>• สร้างซองจากเบอร์อื่น ไม่ใช่เบอร์ร้าน</li>
                <li>• เงินไม่เข้ากระเป๋าพอยท์ — เข้าเป็นหัวใจให้ใช้งานนี้ตรง ๆ เลย</li>
              </ul>
            </div>
          )}

          <form onSubmit={submitPayment} className="space-y-4">
            {payMethod === "angpao" && (
              <div>
                <label className="mb-1.5 block text-xs text-muted">
                  ลิงก์ซองอั่งเปา TrueMoney
                </label>
                <Input
                  required
                  placeholder="https://gift.truemoney.com/campaign/?v=..."
                  value={voucher}
                  onChange={(e) => setVoucher(e.target.value)}
                />
              </div>
            )}

            {payMethod === "angpao" && (
              <div className="space-y-1 rounded-card border border-line bg-subtle p-3 text-sm">
                <div className="flex justify-between text-muted">
                  <span>
                    {formatPoints(pkg.points)} หัวใจ × {qty}
                  </span>
                  <span className="tabular-nums">฿{formatBahtExact(totalBaht)}</span>
                </div>
                {coupon && (
                  <div className="flex justify-between text-live-ink">
                    <span>คูปอง {coupon.code}</span>
                    <span className="tabular-nums">−฿{formatBahtExact(coupon.discount_baht)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-line pt-1 font-medium">
                  <span>ได้รับ</span>
                  <span className="text-point-ink">{formatPoints(totalHearts)} หัวใจ</span>
                </div>
              </div>
            )}

            {error && <p className="text-sm text-fail-ink">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? "กำลังสร้างงาน..."
                : payMethod === "heart"
                  ? `ใช้ ${formatPoints(totalHearts)} หัวใจ และเข้าคิว`
                  : payMethod === "point"
                    ? `ใช้ ${formatPoints(totalPointsCost)} พอยท์ และเข้าคิว`
                    : "ยืนยันชำระเงินและเข้าคิว"}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setStep(2)}>
              ย้อนกลับไปแก้ไอดี
            </Button>
          </form>
        </Card>
      )}

      {step === 4 && (
        <Card className="p-8 text-center">
          <p className="text-2xl font-bold text-live-ink">เข้าคิวแล้ว!</p>
          <p className="mt-2 text-muted">กำลังพาไปหน้าคิวงาน...</p>
        </Card>
      )}
    </div>
  );
}
