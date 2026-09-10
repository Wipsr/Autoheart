import {
  Cpu,
  LayoutDashboard,
  ListOrdered,
  Megaphone,
  MessageSquare,
  Network,
  Package,
  ScrollText,
  Settings2,
  Ticket,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/** ตัวเลขค้างที่เอามาแปะบนเมนู — ดึงครั้งเดียวที่ shell แล้วส่งต่อให้ทุกที่ */
export type AdminBadgeKey = "topups" | "jobs" | "alerts";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** บรรทัดอธิบายใน command palette — ช่วยตอนจำชื่อเมนูไม่ได้ */
  hint: string;
  badge?: AdminBadgeKey;
  /** คำที่คนพิมพ์หาเมนูนี้จริง ๆ (ไทย/อังกฤษ/ชื่อเดิม) */
  keywords?: string[];
};

export type AdminNavGroup = { title: string; items: AdminNavItem[] };

/**
 * เรียงตามความถี่ที่ต้องเข้าจริงในหนึ่งวัน ไม่ได้เรียงตามโครงสร้างฐานข้อมูล
 * กลุ่มบนสุดคือของที่เปิดทุกวัน กลุ่มล่างคือของที่เปิดเดือนละครั้ง
 */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    title: "หน้างาน",
    items: [
      {
        href: "/admin",
        label: "ภาพรวม",
        icon: LayoutDashboard,
        hint: "สถานะคิว รายได้ และงานค้าง",
        keywords: ["dashboard", "overview", "home"],
      },
      {
        href: "/admin/jobs",
        label: "งานฟาร์ม",
        icon: ListOrdered,
        hint: "คิวงาน ยกเลิก และสั่งรันใหม่",
        badge: "jobs",
        keywords: ["job", "queue", "คิว", "งาน"],
      },
      {
        href: "/admin/topups",
        label: "การเติมเงิน",
        icon: Wallet,
        hint: "อั่งเปาที่ระบบเติมอัตโนมัติไม่ได้",
        badge: "topups",
        keywords: ["topup", "angpao", "อั่งเปา", "เติมเงิน", "เงิน"],
      },
      {
        href: "/admin/users",
        label: "ผู้ใช้",
        icon: Users,
        hint: "ค้นหา แบน และรีเซ็ตรหัสผ่าน",
        keywords: ["user", "member", "สมาชิก", "แบน"],
      },
    ],
  },
  {
    title: "รายรับ & การตลาด",
    items: [
      {
        href: "/admin/packages",
        label: "แพ็กหัวใจ",
        icon: Package,
        hint: "ราคาและจำนวนหัวใจของแต่ละแพ็ก",
        keywords: ["package", "ราคา", "แพ็ก", "price"],
      },
      {
        href: "/admin/promotions",
        label: "โปรโมชัน",
        icon: Megaphone,
        hint: "แคมเปญแจกและสิทธิ์ที่ถูกกดไปแล้ว",
        keywords: ["promotion", "โปร", "แจก"],
      },
      {
        href: "/admin/coupons",
        label: "คูปอง",
        icon: Ticket,
        hint: "โค้ดส่วนลดและจำนวนครั้งที่ใช้ได้",
        keywords: ["coupon", "code", "โค้ด", "ส่วนลด"],
      },
      {
        href: "/admin/popups",
        label: "ป็อปอัป",
        icon: MessageSquare,
        hint: "ประกาศที่เด้งขึ้นหน้าผู้ใช้",
        keywords: ["popup", "ประกาศ", "announce"],
      },
    ],
  },
  {
    title: "ระบบ",
    items: [
      {
        href: "/admin/worker",
        label: "Worker",
        icon: Cpu,
        hint: "heartbeat, retry และ alert เข้า Telegram",
        badge: "alerts",
        keywords: ["worker", "health", "alert", "telegram", "แจ้งเตือน"],
      },
      {
        href: "/admin/settings",
        label: "ค่าระบบ",
        icon: Settings2,
        hint: "queue_strategy, hearts_per_minute และคีย์อื่น",
        keywords: ["setting", "config", "ตั้งค่า"],
      },
      {
        href: "/admin/proxy",
        label: "Proxy",
        icon: Network,
        hint: "proxy ที่ worker ใช้ยิงออก",
        keywords: ["proxy", "ip", "network"],
      },
      {
        href: "/admin/maintenance",
        label: "ปิดปรับปรุง",
        icon: Wrench,
        hint: "ปิดเว็บชั่วคราว หรือขึ้นแบนเนอร์",
        keywords: ["maintenance", "ปิดเว็บ", "banner", "แบนเนอร์"],
      },
    ],
  },
  {
    title: "ตรวจสอบ",
    items: [
      {
        href: "/admin/audit",
        label: "Audit log",
        icon: ScrollText,
        hint: "ใครกดอะไรไปบ้าง",
        keywords: ["audit", "log", "history", "ประวัติ"],
      },
    ],
  },
];

export const ADMIN_NAV_ITEMS: AdminNavItem[] = ADMIN_NAV.flatMap((g) => g.items);

/**
 * ค่าระบบ / Proxy / ปิดปรับปรุง เป็นฟอร์มสั้น ๆ อย่างละหน้า
 * เลยผูกเป็นแท็บเดียวกันไว้ จะได้สลับได้โดยไม่ต้องวิ่งกลับ sidebar
 */
export const SYSTEM_TABS: [string, string][] = [
  ["/admin/settings", "ค่าระบบ"],
  ["/admin/proxy", "Proxy"],
  ["/admin/maintenance", "ปิดปรับปรุง"],
];

export function isAdminPathActive(href: string, pathname: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

/** ป้ายบนหัวหน้า: หา label ของเมนูที่ตรงกับ path ปัจจุบันแบบยาวสุดก่อน */
export function findAdminNavItem(pathname: string): AdminNavItem | undefined {
  return [...ADMIN_NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => isAdminPathActive(item.href, pathname));
}
