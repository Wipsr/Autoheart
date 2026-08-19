"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { API_URL } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";

type Config = {
  maintenance: { enabled: boolean; message: string; eta: string };
  banner: { enabled: boolean; text: string };
  popup: { id: string; title: string; body: string; dismiss_hours: number } | null;
};

export function SiteNotices({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading: authLoading } = useAuth();
  const [config, setConfig] = useState<Config | null>(null);
  const [ready, setReady] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/public/site-config`)
      .then((r) => r.json())
      .then((data: Config) => {
        setConfig(data);
        if (data.popup) {
          const until = Number(localStorage.getItem(`autoheart-popup-${data.popup.id}`) || "0");
          setPopupOpen(until < Date.now());
        }
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  const dismiss = (forHours: boolean) => {
    if (forHours && config?.popup) {
      localStorage.setItem(
        `autoheart-popup-${config.popup.id}`,
        String(Date.now() + config.popup.dismiss_hours * 60 * 60 * 1000)
      );
    }
    setPopupOpen(false);
  };

  if (ready && !authLoading && config?.maintenance.enabled && !isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <Card glow className="max-w-lg p-8 text-center">
          <h1 className="text-2xl font-bold text-rose-200">กำลังปิดปรับปรุง</h1>
          <p className="mt-3 text-muted">{config.maintenance.message || "ระบบกำลังปรับปรุงชั่วคราว"}</p>
          {config.maintenance.eta && (
            <p className="mt-2 text-sm text-dim">คาดว่าจะกลับมา: {config.maintenance.eta}</p>
          )}
        </Card>
      </main>
    );
  }

  return (
    <>
      {config?.banner.enabled && config.banner.text && (
        <div className="relative z-[60] bg-heart/15 px-10 py-2 text-center text-sm text-rose-100 border-b border-rose-400/20">
          {config.banner.text}
        </div>
      )}
      {children}
      {popupOpen && config?.popup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <Card glow className="relative w-full max-w-md p-6">
            <button aria-label="ปิด" onClick={() => dismiss(false)} className="absolute right-4 top-4 text-muted hover:text-white">
              <X className="h-5 w-5" />
            </button>
            <h2 className="pr-8 text-xl font-semibold">{config.popup.title}</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">{config.popup.body}</p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => dismiss(true)}>
                ไม่แสดง {config.popup.dismiss_hours} ชม.
              </Button>
              <Button onClick={() => dismiss(false)}>รับทราบ</Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
