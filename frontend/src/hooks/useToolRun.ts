"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { WS_URL } from "@/lib/constants";
import type { ToolJob } from "@/types";

export type ToolSlug = "powder" | "giftbox" | "treasure";

/** สั่งงานเครื่องมือฟรี (ปั๊มผง/เปิดกล่อง/ตีสมบัติ) แล้วรับ log สดผ่าน WebSocket
 *
 * งานรันอยู่ฝั่ง ngmx และผูกกับ "การเชื่อมต่อเส้นนี้" — ปิดหน้าเว็บ = backend
 * สั่งยกเลิกงานให้ (ดู backend/api/routes/tools.py) จึงไม่มีหน้าประวัติของ
 * เครื่องมือพวกนี้ ต้องเปิดหน้าค้างไว้จนงานจบ
 */
export function useToolRun(slug: ToolSlug) {
  const { token } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  // เก็บสถานะ "ยังทำงานอยู่ไหม" ใน ref ด้วย เพราะ onclose ต้องอ่านค่าล่าสุด
  // ตอนถูกเรียก ไม่ใช่ค่าที่ค้างมาจาก closure ตอนกดเริ่ม
  const activeRef = useRef(false);
  const [job, setJob] = useState<ToolJob | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    activeRef.current = false;
    wsRef.current?.close();
    wsRef.current = null;
    setRunning(false);
  }, []);

  /** ล้างผลงานเดิมเพื่อกลับไปหน้าตั้งค่า (ยกเลิกงานที่ยังค้างอยู่ให้ด้วย) */
  const reset = useCallback(() => {
    stop();
    setJob(null);
    setLines([]);
    setProgress(0);
    setStep("");
    setError(null);
  }, [stop]);

  // ปิดหน้า/เปลี่ยนหน้า = ตัดการเชื่อมต่อ ให้ backend ยกเลิกงานที่ค้าง
  useEffect(
    () => () => {
      activeRef.current = false;
      wsRef.current?.close();
    },
    []
  );

  const start = useCallback(
    (payload: Record<string, unknown>) => {
      if (!token || wsRef.current) return;
      setJob(null);
      setLines([]);
      setProgress(0);
      setStep("กำลังส่งคำสั่ง …");
      setError(null);
      activeRef.current = true;
      setRunning(true);

      const ws = new WebSocket(`${WS_URL}/ws/tools/${slug}?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => ws.send(JSON.stringify(payload));
      ws.onmessage = (ev) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.type === "log") {
          setLines((prev) => [...prev, String(msg.line ?? "")]);
        } else if (msg.type === "progress") {
          setProgress(Number(msg.p) || 0);
          if (msg.step) setStep(String(msg.step));
        } else if (msg.type === "job") {
          setJob(msg.job as ToolJob);
        } else if (msg.type === "status") {
          const j = msg as unknown as ToolJob;
          setJob(j);
          if (j.step) setStep(j.step);
          if (typeof j.progress === "number") setProgress(j.progress);
          if (j.status === "error") setError(j.error?.message || "งานล้มเหลว");
          if (["success", "error", "cancelled"].includes(j.status)) stop();
        } else if (msg.type === "error") {
          setError(String(msg.message ?? "เกิดข้อผิดพลาด"));
          stop();
        }
      };
      // ต่อไม่ติด/หลุดกลางคัน — ถ้ายังไม่จบงานต้องบอกผู้ใช้ ไม่ใช่ค้างหมุนเงียบ ๆ
      ws.onclose = () => {
        wsRef.current = null;
        if (activeRef.current) {
          activeRef.current = false;
          setError((prev) => prev ?? "การเชื่อมต่อหลุด งานถูกยกเลิก กรุณาลองใหม่");
        }
        setRunning(false);
      };
    },
    [slug, stop, token]
  );

  return { job, lines, progress, step, running, error, start, reset, cancel: stop };
}
