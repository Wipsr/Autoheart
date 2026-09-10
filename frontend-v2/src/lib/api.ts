import { API_URL } from "./constants";

export class ApiError extends Error {
  code: string;
  status: number;
  detail?: unknown;

  constructor(code: string, message: string, status: number, detail?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // statusText เป็นสตริงว่างเสมอบน HTTP/2 (โปรโตคอลไม่มี reason phrase) ถ้าปล่อยผ่าน
    // จะได้ ApiError ที่ message ว่าง แล้วโดน `{error && ...}` ของหน้าเว็บกลืนหายทั้งใบ
    // — กดปุ่มแล้วเงียบสนิท ไม่มีอะไรบอกผู้ใช้เลย
    throw new ApiError(
      data.code || "error",
      data.message || res.statusText || `คำขอไม่สำเร็จ (HTTP ${res.status})`,
      res.status,
      data.detail
    );
  }
  return data as T;
}
