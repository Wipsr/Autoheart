export const PACKAGES = [
  {
    slug: "1000-hearts",
    name: "แพ็คเกจ 1,000 หัวใจ",
    hearts: 1000,
    price_baht: 49,
    description: "เหมาะสำหรับเริ่มต้น",
    badge: null as string | null,
  },
  {
    slug: "2000-hearts",
    name: "แพ็คเกจ 2,000 หัวใจ",
    hearts: 2000,
    price_baht: 69,
    description: "คุ้มค่าที่สุด ประหยัดกว่า 30%",
    badge: "ยอดนิยม",
  },
  {
    slug: "3000-hearts",
    name: "แพ็คเกจ 3,000 หัวใจ",
    hearts: 3000,
    price_baht: 99,
    description: "สำหรับสายฟาร์มจริงจัง ประหยัดกว่า 33%",
    badge: "คุ้มสุด",
  },
] as const;

export const JOB_STATUS_LABEL: Record<string, string> = {
  queued: "อยู่ในคิว",
  validating: "กำลังตรวจสอบ",
  validation_failed: "รหัสผิด",
  processing: "กำลังฟาร์ม",
  completed: "เสร็จสิ้น",
  failed: "ล้มเหลว",
  cancelled: "ยกเลิก",
  refunded: "คืนเครดิตแล้ว",
};

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ||
  (API_URL.replace(/^http/, "ws"));
