// Next 16 manifest 慣例：自動注入 <link rel="manifest">（服務於 /manifest.webmanifest）。
export default function manifest() {
  return {
    name: "SimHope AI 工具中心",
    short_name: "SimHope",
    description: "公司內部 AI 資源中心 — 工具、平臺、專案、MCP、Skill",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#6366f1",
    icons: [
      {
        src: "/icons/192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: "/icons/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };
}
