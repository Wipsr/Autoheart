import type { Metadata } from "next";
import { Chakra_Petch, IBM_Plex_Mono, IBM_Plex_Sans_Thai } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/hooks/useAuth";
import { SiteNotices } from "@/components/layout/SiteNotices";

// หัวข้อ: เหลี่ยม อ่านไทยได้ ให้กลิ่นเกม/เครื่องจักร
const display = Chakra_Petch({
  subsets: ["latin", "thai"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

// เนื้อความ: ความสูงตัวอักษรไทยสม่ำเสมอ อ่านย่อหน้ายาวสบาย
const sans = IBM_Plex_Sans_Thai({
  subsets: ["latin", "thai"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
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
  title: "Autoheart — Cookie Run Heart Farm",
  description: "บริการฟาร์มหัวใจ Cookie Run อัตโนมัติ ชำระผ่านซองอั่งเปา TrueMoney",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className="dark">
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
