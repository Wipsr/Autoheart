import type { Config } from "tailwindcss";

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
        ink: "#0A0E13",
        panel: "#111922",
        panel2: "#16212C",
        line: "#22303E",
        lineSoft: "#1A242F",
        muted: "#8496A8",
        dim: "#5D6E7F",
        // ชมพู = หัวใจ/เครดิต + ปุ่มหลัก, ที่เหลือคือสีสถานะงาน
        heart: "#FF4D7E",
        live: "#3DDC97",
        wait: "#F2A93B",
        fail: "#FF6156",
        info: "#5AA9FF",
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
