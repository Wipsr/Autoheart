import { Suspense } from "react";
import LoginPage from "./LoginClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-muted">กำลังโหลด...</div>}>
      <LoginPage />
    </Suspense>
  );
}
