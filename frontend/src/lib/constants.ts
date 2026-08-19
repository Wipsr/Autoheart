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

// โดเมนที่ copy จาก Railway มักติด "/" ท้ายมาด้วย ถ้าปล่อยไว้ทุก path จะกลาย
// เป็น https://host//api/... ซึ่ง FastAPI ตอบ 404 — ตัดทิ้งตั้งแต่ตรงนี้ทีเดียว
const trimSlash = (url: string) => url.replace(/\/+$/, "");

export const API_URL = trimSlash(
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
);

// ไม่ตั้ง NEXT_PUBLIC_WS_URL ก็ได้ — https:// → wss:// , http:// → ws://
export const WS_URL = trimSlash(
  process.env.NEXT_PUBLIC_WS_URL || API_URL.replace(/^http/, "ws")
);
