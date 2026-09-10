import type { Config } from "tailwindcss";

/**
 * Autoheart v2 — โทนสว่าง
 *
 * กติกาสีมีข้อเดียวที่ต้องจำ: **ทองคือพอยท์**
 * ใช้กับยอดพอยท์ ราคา และปุ่มหลักเท่านั้น สถานะงานมีชุดสีของตัวเองแยกออกไป
 * (เขียว = กำลังรัน, คราม = รอคิว, แดง = ล้ม, เทา = จบแล้ว)
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",

        // พื้นและเส้น — ขาวอมอุ่นเล็กน้อย ไม่ใช่ขาวจอ
        canvas: "#FAFAF8",
        surface: "#FFFFFF",
        surface2: "#F6F5F2",
        subtle: "#FBFAF7",
        line: "#E7E5DF",
        lineSoft: "#EFEDE7",
        lineStrong: "#E2E0DA",

        ink: "#1A1B1E",
        ink2: "#33353A",
        muted: "#6E7076",
        dim: "#9B9CA2",

        // พอยท์
        point: {
          DEFAULT: "#C98C15",
          ink: "#96690B",
          dim: "#A98C4A",
          soft: "#FDF7E8",
          line: "#F0E0B4",
          from: "#E7AB35",
          to: "#D2941C",
          edge: "#B57F10",
          on: "#231A05",
        },

        // สถานะงาน
        live: { DEFAULT: "#17914F", ink: "#14603A", soft: "#E7F6EE", line: "#BFE6D2" },
        wait: { DEFAULT: "#4F46E5", ink: "#3B36B8", soft: "#EEF0FE", line: "#D7DAFB" },
        fail: { DEFAULT: "#C6392C", ink: "#B33325", soft: "#FDECEA", line: "#F2CEC9" },
        info: { DEFAULT: "#3B6FB8", ink: "#3F5875", soft: "#F2F6FD", line: "#DBE5F5" },

        // ชื่อเดิมจาก v1 เก็บไว้ให้ไฟล์ที่ยังไม่ได้แตะคอมไพล์ผ่าน
        panel: "#FFFFFF",
        panel2: "#F6F5F2",
        heart: "#C98C15",
      },
      boxShadow: {
        // ระดับเดียวที่ใช้กับการ์ดทั้งระบบ — เงาลึกกว่านี้ทำให้หน้าดูฟู
        xs: "0 1px 2px rgba(16, 24, 40, 0.05)",
        card: "0 1px 2px rgba(16, 24, 40, 0.04)",
        pop: "0 1px 3px rgba(16, 24, 40, 0.08), 0 4px 12px rgba(16, 24, 40, 0.05)",
        // ปุ่มหลัก: ไฮไลต์ด้านในบน + เงาสั้น ๆ ด้านล่าง
        btn: "inset 0 1px 0 rgba(255, 255, 255, 0.34), 0 1px 2px rgba(16, 24, 40, 0.10)",
        btnHover: "inset 0 1px 0 rgba(255, 255, 255, 0.28), 0 2px 5px rgba(180, 127, 16, 0.22)",
        inset: "inset 0 1px 2px rgba(16, 24, 40, 0.04)",
      },
      borderRadius: {
        card: "12px",
      },
      fontFamily: {
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "IBM Plex Sans Thai", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
