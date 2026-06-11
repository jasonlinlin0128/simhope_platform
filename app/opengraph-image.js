import { ImageResponse } from "next/og";

// 全站分享卡（被貼到 Slack / Discord / LINE / FB 時的預覽圖）。
// 設計核可版見 docs/superpowers/specs/2026-06-11-og-metadata-design.md。
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "SimHope AI Hub — 公司內部 AI 資源中心";

// 卡片上會出現的所有字（拉丁 + 中文 + 標點），用來跟 Google Fonts 要「子集」字型，
// 只下載這些字形 → 很小、且 Satori 才有字渲染中文。
const OG_TEXT =
  "SimHope AI Hub 公司內部·AI資源中心工具平臺專案MCPSkill，打開就能用";

// 品牌 hub mark（C3 紫→靛漸層）。Satori 對 <img> 的 SVG data-URI 支援穩定，
// 故以 data-URI 圖嵌入（與 src/components/HubMark.jsx 同一形狀）。
const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs><g fill="none" stroke="url(#g)" stroke-width="4.4" stroke-linecap="round"><path d="M50 50 Q41.9 34.3 24 26"/><path d="M50 50 Q66.6 45.4 78 30"/><path d="M50 50 Q60 66.4 80 74"/><path d="M50 50 Q33.9 59.1 26 78"/></g><g fill="url(#g)"><circle cx="50" cy="50" r="11.5"/><circle cx="24" cy="26" r="6.5"/><circle cx="78" cy="30" r="6"/><circle cx="80" cy="74" r="7"/><circle cx="26" cy="78" r="5.5"/></g></svg>`;
const MARK_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(MARK_SVG).toString("base64")}`;

// 跟 Google Fonts 要某 weight 的子集字型，回傳 arrayBuffer 給 Satori。
async function loadGoogleFont(weight) {
  const url = `https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@${weight}&text=${encodeURIComponent(OG_TEXT)}`;
  const css = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SimHopeOG/1.0)" },
  }).then((r) => r.text());
  const src = css.match(/src:\s*url\(([^)]+)\)/);
  if (!src) throw new Error("Noto Sans TC subset URL not found");
  return fetch(src[1]).then((r) => r.arrayBuffer());
}

const CHIPS = ["工具", "平臺", "專案", "MCP", "Skill"];

export default async function OpengraphImage() {
  // 兩個 weight：標題用 900、其餘用 700。單一 weight 抓失敗就略過該 weight
  // （另一個仍能撐住中文渲染）。
  const fonts = [];
  for (const weight of [900, 700]) {
    try {
      fonts.push({
        name: "Noto Sans TC",
        data: await loadGoogleFont(weight),
        weight,
        style: "normal",
      });
    } catch {
      // 略過該 weight。
    }
  }
  // 兩個 weight 都失敗 → 與其讓 Satori 丟隱晦的「No fonts are loaded」（本路由 build 期
  // 靜態產生 → 變成費解的 build 失敗），不如明講原因。仍是 fail-safe：壞圖不會上線。
  if (fonts.length === 0) {
    throw new Error("OG 字型子集抓取全失敗（Noto Sans TC）— 無法產生 OG 圖");
  }

  return new ImageResponse(
    <div
      style={{
        width: "1200px",
        height: "630px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 92px",
        color: "#fff",
        fontFamily: "Noto Sans TC",
        backgroundColor: "#16132c",
        backgroundImage: [
          "radial-gradient(820px 520px at 88% -12%, rgba(167,139,250,0.40), rgba(167,139,250,0) 60%)",
          "radial-gradient(720px 520px at 6% 118%, rgba(99,102,241,0.36), rgba(99,102,241,0) 60%)",
          "radial-gradient(680px 480px at 70% 122%, rgba(96,165,250,0.26), rgba(96,165,250,0) 60%)",
          "linear-gradient(135deg, #16132c 0%, #1d1840 55%, #121024 100%)",
        ].join(","),
      }}
    >
      <div
        style={{
          display: "flex",
          alignSelf: "flex-start",
          alignItems: "center",
          padding: "11px 24px",
          borderRadius: "999px",
          fontSize: "24px",
          fontWeight: 700,
          color: "#c9bdff",
          background: "rgba(167,139,250,0.15)",
          border: "1px solid rgba(167,139,250,0.32)",
          marginBottom: "38px",
        }}
      >
        公司內部 · AI 資源中心
      </div>

      <div style={{ display: "flex", alignItems: "center" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "194px",
            height: "194px",
            borderRadius: "46px",
            marginRight: "46px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.13)",
            boxShadow: "0 24px 60px rgba(99,102,241,0.30)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MARK_DATA_URI} width={150} height={150} alt="" />
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: "84px",
              fontWeight: 900,
              letterSpacing: "-2px",
              lineHeight: 1,
              color: "#fff",
            }}
          >
            SimHope AI Hub
          </div>
          <div
            style={{
              fontSize: "30px",
              fontWeight: 700,
              color: "#bdb6dc",
              marginTop: "20px",
            }}
          >
            工具 · 平臺 · 專案 · MCP · Skill，打開就能用
          </div>
        </div>
      </div>

      <div style={{ display: "flex", marginTop: "42px" }}>
        {CHIPS.map((c) => (
          <div
            key={c}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "13px 26px",
              borderRadius: "16px",
              marginRight: "13px",
              fontSize: "29px",
              fontWeight: 700,
              color: "#efeaff",
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.13)",
            }}
          >
            {c}
          </div>
        ))}
      </div>
    </div>,
    { ...size, fonts },
  );
}
