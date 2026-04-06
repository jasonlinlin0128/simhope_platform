import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import Navbar from "@/components/Navbar";
import ThemeProvider from "@/components/ThemeProvider";
import BlobBackground from "@/components/BlobBackground";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "SimHope AI 工具箱",
  description: "專為公司同仁設計的 AI 工具中心",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-TW" className="scroll-smooth">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[var(--color-bg)] text-[var(--color-text-dark)] min-h-screen flex flex-col`}>
        <ThemeProvider>
          <BlobBackground />
          <AuthProvider>
            <Navbar />
            <main className="flex-1 w-full max-w-7xl mx-auto py-8">
              {children}
            </main>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
