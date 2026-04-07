import { Nunito, Noto_Sans_TC } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import Navbar from "@/components/Navbar";
import ThemeProvider from "@/components/ThemeProvider";
import BlobBackground from "@/components/BlobBackground";
import ChatbotWidget from "@/components/ChatbotWidget";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
  display: "swap",
});

const notoSansTC = Noto_Sans_TC({
  variable: "--font-noto-sans-tc",
  weight: ["400", "500", "700", "900"],
  display: "swap",
  preload: false,   // required for CJK fonts — no latin subset to preload
});

export const metadata = {
  title: "SimHope AI 工具箱",
  description: "專為公司同仁設計的 AI 工具中心",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-TW" className="scroll-smooth">
      <body className={`${nunito.variable} ${notoSansTC.variable} antialiased bg-[var(--color-bg)] text-[var(--color-text-dark)] min-h-screen flex flex-col`}>
        <ThemeProvider>
          <BlobBackground />
          <AuthProvider>
            <Navbar />
            <main className="flex-1 w-full max-w-7xl mx-auto py-8">
              {children}
            </main>
            <ChatbotWidget />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
