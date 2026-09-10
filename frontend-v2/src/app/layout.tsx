import type { Metadata } from "next";
import { Anuphan, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/hooks/useAuth";
import { SiteNotices } from "@/components/layout/SiteNotices";

// ทั้งหัวข้อและเนื้อความใช้ตระกูลเดียวกัน — Anuphan ตัดไทยกับละตินความสูงใกล้กัน
// หัวข้อต่างที่น้ำหนักและ letter-spacing ไม่ใช่ต่างที่ฟอนต์
const sans = Anuphan({
  subsets: ["latin", "thai"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const display = Anuphan({
  subsets: ["latin", "thai"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

// ตัวเลข เวลา คิว และ log — หลักตัวเลขตรงกันทุกแถว
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Autoheart — ฟาร์มหัวใจ Cookie Run",
  description: "บริการฟาร์มหัวใจ Cookie Run อัตโนมัติ เติมพอยท์ผ่านซองอั่งเปา TrueMoney",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body
        className={`${display.variable} ${sans.variable} ${mono.variable} antialiased bg-mesh`}
      >
        <AuthProvider>
          <SiteNotices>{children}</SiteNotices>
        </AuthProvider>
      </body>
    </html>
  );
}
