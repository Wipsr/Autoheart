"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ListSkeleton } from "@/components/ui/States";
import { PageHeader } from "@/components/admin/AdminUI";

type Setting = { key: string; value: string; description?: string };

export default function AdminSettingsPage() {
  const { token } = useAuth();
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    api<Setting[]>("/api/admin/settings", { token })
      .then(setSettings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (s: Setting) => {
    if (!token) return;
    await api(`/api/admin/settings/${s.key}`, {
      method: "PUT",
      token,
      body: JSON.stringify({ value: s.value }),
    });
    setSavedKey(s.key);
    setTimeout(() => setSavedKey(null), 2000);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="ค่าระบบ"
        description="queue_strategy (fair | fifo) · truemoney_phone_override · maintenance_mode · hearts_per_minute"
      />

      {loading ? (
        <Card className="overflow-hidden">
          <ListSkeleton rows={4} />
        </Card>
      ) : (
        <div className="space-y-3">
          {settings.map((s) => (
            <Card key={s.key} className="p-4">
              <p className="font-mono text-sm text-heart">{s.key}</p>
              {s.description && <p className="mt-0.5 text-xs text-dim">{s.description}</p>}
              <div className="mt-3 flex gap-2">
                <Input
                  className="font-mono"
                  value={s.value}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev.map((x) => (x.key === s.key ? { ...x, value: e.target.value } : x))
                    )
                  }
                />
                <Button size="sm" variant="secondary" onClick={() => save(s)}>
                  {savedKey === s.key ? "บันทึกแล้ว" : "บันทึก"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
