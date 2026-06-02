"use client";

import { useState } from "react";
import RequestModal from "@/components/RequestModal";

/** client 觸發鈕 — 讓 server 元件（Footer）也能開 RequestModal。 */
export default function RequestButton({
  type = "feature",
  className = "",
  children,
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {open && <RequestModal type={type} onClose={() => setOpen(false)} />}
    </>
  );
}
