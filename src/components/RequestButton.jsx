"use client";

import { useState } from "react";
import RequestCard from "@/components/RequestCard";

/** client 觸發鈕 — 讓 server 元件（Footer / 首頁）也能開提需求卡。 */
export default function RequestButton({ className = "", children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {open && <RequestCard onClose={() => setOpen(false)} />}
    </>
  );
}
