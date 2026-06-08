"use client";

import { ThemeContext } from "@/context/ThemeContext";

export default function ThemeProvider({ children }) {
  // 主題 class 由 layout 的 pre-paint inline script 在 hydration 前設好；
  // 這裡只負責「切換」：讀目前 class → flip → 寫回 + 存 localStorage。
  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <ThemeContext.Provider value={{ toggle }}>{children}</ThemeContext.Provider>
  );
}
