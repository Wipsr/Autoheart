"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Boxes } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Card, CardHead } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, ListSkeleton } from "@/components/ui/States";
import { Field, PageHeader, Toggle } from "@/components/admin/AdminUI";

type Package = {
  id: number;
  name: string;
  slug: string;
  hearts: number;
  price_baht: number;
  description?: string | null;
  badge?: string | null;
  is_active: boolean;
  sort_order: number;
};

/** ฟอร์มเก็บเป็นสตริงหมด เพราะ input type=number คืนค่าว่างระหว่างพิมพ์ */
type Form = {
  name: string;
  slug: string;
  hearts: string;
  price_baht: string;
  description: string;
  badge: string;
  is_active: boolean;
  sort_order: string;
};

const EMPTY: Form = {
  name: "",
  slug: "",
  hearts: "",
  price_baht: "",
  description: "",
  badge: "",
  is_active: true,
  sort_order: "0",
};

const toForm = (p: Package): Form => ({
  name: p.name,
  slug: p.slug,
  hearts: String(p.hearts),
  price_baht: String(p.price_baht),
  description: p.description ?? "",
  badge: p.badge ?? "",
  is_active: p.is_active,
  sort_order: String(p.sort_order ?? 0),
});

const toPayload = (f: Form) => ({
  name: f.name.trim(),
  slug: f.slug.trim(),
  hearts: Number(f.hearts),
  price_baht: Number(f.price_baht),
  description: f.description.trim() || null,
  badge: f.badge.trim() || null,
  is_active: f.is_active,
  sort_order: Number(f.sort_order || 0),
});

/** ตั้ง slug อัตโนมัติจากจำนวนหัวใจ ให้ล้อรูปแบบเดิม (1000-hearts) */
const slugFromHearts = (hearts: string) => (hearts ? `${Number(hearts)}-hearts` : "");

function PackageForm({
  value,
  onChange,
  onSubmit,
  submitLabel,
  busy,
  error,
  extra,
}: {
  value: Form;
  onChange: (form: Form) => void;
  onSubmit: (e: FormEvent) => void;
  submitLabel: string;
  busy: boolean;
  error?: string;
  extra?: React.ReactNode;
}) {
  const set = <K extends keyof Form>(key: K, v: Form[K]) => onChange({ ...value, [key]: v });

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="ชื่อแพ็ก">
          <Input
            required
            placeholder="เช่น 1,000 หัวใจ"
            value={value.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>
        <Field label="slug" hint="ตัวพิมพ์เล็ก ตัวเลข และ - เท่านั้น ห้ามซ้ำกับแพ็กอื่น">
          <Input
            required
            className="font-mono"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            placeholder="1000-hearts"
            value={value.slug}
            onChange={(e) => set("slug", e.target.value.toLowerCase())}
          />
        </Field>
        <Field label="จำนวนหัวใจ">
          <Input
            required
            type="number"
            min="1"
            className="font-mono tabular-nums"
            placeholder="1000"
            value={value.hearts}
            onChange={(e) => {
              const hearts = e.target.value;
              // เดา slug ให้เฉพาะตอนยังไม่ได้แก้เอง จะได้ไม่ทับของที่แอดมินตั้งไว้
              const auto = value.slug === "" || value.slug === slugFromHearts(value.hearts);
              onChange({
                ...value,
                hearts,
                slug: auto ? slugFromHearts(hearts) : value.slug,
              });
            }}
          />
        </Field>
        <Field label="ราคา (บาท)">
          <Input
            required
            type="number"
            min="0"
            step="0.01"
            className="font-mono tabular-nums"
            placeholder="49"
            value={value.price_baht}
            onChange={(e) => set("price_baht", e.target.value)}
          />
        </Field>
        <Field label="คำโปรย" hint="ข้อความใต้ชื่อแพ็กบนหน้าซื้อ">
          <Input
            placeholder="คุ้มค่าที่สุด ประหยัดกว่า 30%"
            value={value.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>
        <Field label="ป้าย" hint="เว้นว่างได้ถ้าไม่ต้องการป้าย">
          <Input
            placeholder="ยอดนิยม"
            value={value.badge}
            onChange={(e) => set("badge", e.target.value)}
          />
        </Field>
        <Field label="ลำดับการแสดง" hint="เลขน้อยขึ้นก่อน">
          <Input
            type="number"
            className="font-mono tabular-nums"
            value={value.sort_order}
            onChange={(e) => set("sort_order", e.target.value)}
          />
        </Field>
        <div className="flex items-end pb-1">
          <Toggle
            checked={value.is_active}
            onChange={(v) => set("is_active", v)}
            label="เปิดขายอยู่"
          />
        </div>
      </div>

      {error && <p className="text-sm text-fail">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Button disabled={busy}>{submitLabel}</Button>
        {extra}
      </div>
    </form>
  );
}

export default function AdminPackagesPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [createForm, setCreateForm] = useState<Form>(EMPTY);
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Form>(EMPTY);
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    api<Package[]>("/api/admin/packages", { token })
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setCreating(true);
    setCreateError("");
    try {
      await api("/api/admin/packages", {
        method: "POST",
        token,
        body: JSON.stringify(toPayload(createForm)),
      });
      setCreateForm(EMPTY);
      load();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "เพิ่มแพ็กเกจไม่สำเร็จ");
    } finally {
      setCreating(false);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || editingId == null) return;
    setSaving(true);
    setEditError("");
    try {
      await api(`/api/admin/packages/${editingId}`, {
        method: "PUT",
        token,
        body: JSON.stringify(toPayload(editForm)),
      });
      setEditingId(null);
      load();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "บันทึกแพ็กเกจไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (p: Package) => {
    setEditingId(p.id);
    setEditForm(toForm(p));
    setEditError("");
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="แพ็กเกจ"
        description="แพ็กหัวใจที่ขายบนหน้าเติมเงิน — ปิดขายได้ แต่ลบไม่ได้เพราะมีประวัติการซื้อผูกอยู่"
      />

      <Card className="p-4">
        <p className="mb-3 font-display text-sm font-semibold">เพิ่มแพ็กเกจใหม่</p>
        <PackageForm
          value={createForm}
          onChange={setCreateForm}
          onSubmit={create}
          submitLabel="เพิ่มแพ็กเกจ"
          busy={creating}
          error={createError}
        />
      </Card>

      <Card className="overflow-hidden">
        <CardHead title="แพ็กเกจทั้งหมด" />
        {loading && <ListSkeleton rows={3} />}
        {!loading && rows.length === 0 && (
          <EmptyState
            icon={Boxes}
            title="ยังไม่มีแพ็กเกจ"
            description="เพิ่มจากฟอร์มด้านบนได้เลย"
          />
        )}
        {!loading &&
          rows.map((p) =>
            editingId === p.id ? (
              <div key={p.id} className="border-b border-lineSoft bg-white/[0.02] p-4 last:border-b-0">
                <p className="mb-3 font-mono text-xs text-dim">แก้ไข #{p.id}</p>
                <PackageForm
                  value={editForm}
                  onChange={setEditForm}
                  onSubmit={save}
                  submitLabel="บันทึก"
                  busy={saving}
                  error={editError}
                  extra={
                    <Button type="button" variant="ghost" onClick={() => setEditingId(null)}>
                      ยกเลิก
                    </Button>
                  }
                />
              </div>
            ) : (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-lineSoft px-4 py-3 text-sm last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display font-semibold">{p.name}</span>
                    {p.badge && (
                      <Badge className="border border-heart/40 bg-heart/10 text-heart">
                        {p.badge}
                      </Badge>
                    )}
                    <Badge
                      className={
                        p.is_active
                          ? "border border-live/40 bg-live/10 text-live"
                          : "border border-line text-dim"
                      }
                    >
                      {p.is_active ? "active" : "off"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 font-mono text-[11px] text-dim">
                    {p.slug} · ลำดับ {p.sort_order}
                  </p>
                  {p.description && <p className="mt-1 text-xs text-muted">{p.description}</p>}
                </div>
                <div className="flex items-center gap-4 font-mono text-xs tabular-nums text-muted">
                  <span>
                    {p.hearts.toLocaleString()} หัวใจ · {p.price_baht.toLocaleString()} ฿
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => startEdit(p)}>
                    แก้ไข
                  </Button>
                </div>
              </div>
            )
          )}
      </Card>
    </div>
  );
}
