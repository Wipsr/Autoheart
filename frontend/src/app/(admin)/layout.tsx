"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/States";
import { AdminShell } from "@/components/admin/AdminShell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAdmin) router.replace("/queue");
  }, [loading, isAdmin, router]);

  if (loading || !isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-3xl space-y-3 p-8">
          <p className="font-mono text-xs uppercase tracking-widest text-dim">
            {loading ? "กำลังตรวจสอบสิทธิ์แอดมิน" : "ไม่มีสิทธิ์เข้าถึง กำลังพากลับ"}
          </p>
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}
