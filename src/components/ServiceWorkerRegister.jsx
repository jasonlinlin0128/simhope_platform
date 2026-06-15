"use client";

import { useEffect } from "react";

/** Production 時註冊 /sw.js（PWA 離線殼）。無 UI。dev 不註冊，避免快取干擾開發。 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" &&
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker.register("/sw.js").catch((e) => {
        console.error("SW 註冊失敗:", e);
      });
    }
  }, []);
  return null;
}
