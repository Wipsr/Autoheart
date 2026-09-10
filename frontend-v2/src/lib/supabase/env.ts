/**
 * อ่านค่า Supabase จาก env แล้วบอกให้ชัดว่าขาดตัวไหน
 *
 * เดิมสามไฟล์ที่สร้าง client ใช้ `process.env.X!` ตรง ๆ พอค่าหาย TypeScript
 * ไม่เตือน (`!` ปิดปากมันไว้) แล้วไปโผล่เป็น error ของ @supabase/ssr ว่า
 * "Your project's URL and API key are required" ซึ่งไม่ได้บอกว่าตัวไหนหาย
 * และไม่ได้บอกว่าต้องไปตั้งที่ไหน
 *
 * ตอน build บน Vercel อาการยิ่งอ่านยาก เพราะ error เดียวกันถูกพ่นซ้ำทุกหน้า
 * ที่ prerender ไม่ผ่าน (30 หน้า) กว่าจะไถหาบรรทัดที่เป็นสาเหตุจริงก็นาน
 *
 * ต้องเขียน process.env.NEXT_PUBLIC_* เป็น property ตรง ๆ แบบนี้เท่านั้น
 * Next.js ถึงจะแทนค่าให้ตอน build — ถ้าอ่านผ่านตัวแปรหรือ index signature
 * ค่าจะกลายเป็น undefined ใน bundle ฝั่งเบราว์เซอร์
 */

const URL_KEY = "NEXT_PUBLIC_SUPABASE_URL";
const KEY_KEY = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

export function supabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const missing = [
    !url && URL_KEY,
    !anonKey && KEY_KEY,
  ].filter((v): v is string => Boolean(v));

  if (missing.length) {
    throw new Error(
      `ตั้งค่า Supabase ไม่ครบ — ขาด ${missing.join(" และ ")}\n` +
        "ตอน dev: ใส่ใน frontend-v2/.env.local (ดู .env.example)\n" +
        "ตอน deploy: Vercel → โปรเจกต์ → Settings → Environment Variables " +
        "แล้วติ๊กให้ครบทั้ง Production และ Preview\n" +
        "ค่าที่ใส่ต้องขึ้นต้นด้วย NEXT_PUBLIC_ ไม่งั้น Next.js จะไม่แทนค่าให้ตอน build\n" +
        "หมายเหตุ: การแก้ Environment Variables ไม่ trigger deploy ให้เอง ต้องกด Redeploy อีกที"
    );
  }

  return { url: url as string, anonKey: anonKey as string };
}
