"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, ListSkeleton } from "@/components/ui/States";
import { PageHeader } from "@/components/admin/AdminUI";
import { formatHearts } from "@/lib/utils";
import type { Profile } from "@/types";

export default function AdminUsersPage() {
  const { token } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!token) return;
    const qs = query ? `?q=${encodeURIComponent(query)}` : "";
    setLoading(true);
    api<Profile[]>(`/api/admin/users${qs}`, { token })
      .then(setUsers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, query]);

  useEffect(() => {
    load();
  }, [load]);

  const search = (e: FormEvent) => {
    e.preventDefault();
    setQuery(q.trim());
  };

  return (
    <div className="space-y-4">
      <PageHeader title="ผู้ใช้" description="ค้นหาผู้ใช้เพื่อดูเครดิต งาน และสั่งแบน" />

      <form onSubmit={search} className="flex gap-2">
        <Input placeholder="ค้นหาชื่อผู้ใช้" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" variant="secondary">
          ค้นหา
        </Button>
      </form>

      <Card className="overflow-hidden">
        {loading && <ListSkeleton rows={4} />}
        {!loading && users.length === 0 && (
          <EmptyState
            icon={Users}
            title={query ? `ไม่พบผู้ใช้ที่ตรงกับ "${query}"` : "ยังไม่มีผู้ใช้"}
            description={query ? "ลองพิมพ์ชื่อผู้ใช้แบบไม่เต็มคำดู" : undefined}
          />
        )}
        {!loading &&
          users.map((u) => (
            <Link
              key={u.id}
              href={`/admin/users/${u.id}`}
              className="flex items-center justify-between gap-3 border-b border-lineSoft px-4 py-3 text-sm transition last:border-b-0 hover:bg-white/[0.03]"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate">
                  {u.nickname || u.display_name || u.email}
                  {u.role === "admin" && (
                    <Badge className="border border-line text-dim">admin</Badge>
                  )}
                  {u.is_banned && (
                    <Badge className="border border-fail/50 bg-fail/10 text-fail">banned</Badge>
                  )}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-dim">{u.id.slice(0, 8)}</p>
              </div>
              <span className="shrink-0 font-mono text-xs tabular-nums text-heart">
                ♥ {formatHearts(u.credits)}
              </span>
            </Link>
          ))}
      </Card>
    </div>
  );
}
