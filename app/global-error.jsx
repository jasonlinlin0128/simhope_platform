"use client";

import { useEffect } from "react";

/**
 * root layout 本身拋錯時的最後防線（取代整個 layout，因此必須自帶 html/body）。
 * 只在 production 生效；保持極簡、用 inline style（此時可能連 CSS/字型都沒載到）。
 * @param {{ error: Error, reset: () => void }} props
 */
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error("[app/global-error]", error);
  }, [error]);

  return (
    <html lang="zh-TW">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "2rem",
          gap: "1rem",
        }}
      >
        <div style={{ fontSize: "3.5rem" }} aria-hidden="true">
          😵
        </div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: 0 }}>
          系統發生錯誤
        </h1>
        <p style={{ color: "#6b7280", fontWeight: 600, margin: 0 }}>
          請重新整理頁面；若持續發生，請聯絡經企室。
        </p>
        <button
          onClick={() => reset()}
          style={{
            padding: "0.625rem 1.25rem",
            borderRadius: "9999px",
            border: "none",
            background: "#6366f1",
            color: "#fff",
            fontWeight: 800,
            fontSize: "0.875rem",
            cursor: "pointer",
          }}
        >
          重新嘗試
        </button>
      </body>
    </html>
  );
}
