import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBaht(n: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(n);
}

/** ยอดที่ต้องตรงกับซองอั่งเปา — ต้องเห็นทศนิยมเสมอ ห้ามปัด */
export function formatBahtExact(n: number) {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatHearts(n: number) {
  return new Intl.NumberFormat("th-TH").format(n);
}

/** เวลาแบบ HH:MM:SS สำหรับ log — ทุกบรรทัดต้องรู้ว่าเกิดตอนไหน */
export function formatClock(iso?: string | null) {
  if (!iso) return "--:--:--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  return d.toLocaleTimeString("th-TH", { hour12: false });
}

export function formatAgo(date?: Date | null) {
  if (!date) return "—";
  const secs = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (secs < 5) return "เมื่อกี้";
  if (secs < 60) return `${secs} วิที่แล้ว`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  return `${Math.floor(mins / 60)} ชม.ที่แล้ว`;
}

export function formatWait(minutes?: number | null) {
  if (minutes == null) return "—";
  if (minutes < 1) return "< 1 นาที";
  if (minutes < 60) return `~${minutes} นาที`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `~${h} ชม. ${m} นาที`;
}
