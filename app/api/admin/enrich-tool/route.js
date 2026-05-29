import { NextResponse } from "next/server";

/**
 * POST /api/admin/enrich-tool
 *
 * Admin-only。讀工具主連結（若是 GitHub repo 抓 README）→ Gemini 生成建議的
 * desc (Pattern C) / scenarios / tags / icon / typeData，回給 admin 在審核
 * wizard 裡一鍵套用。
 *
 * Auth：Bearer idToken → Firebase Identity Toolkit 驗證 → Firestore users/{uid}.role 必須是 admin
 * Required env：FIREBASE_WEB_API_KEY, FIREBASE_PROJECT_ID, GEMINI_API_KEY
 *
 * Body：{ url, title, tagline, type }
 * Returns：{ desc, scenarios[], tags[], icon, typeData{} }
 */
export async function POST(request) {
  // ── Auth ──
  const authHeader = request.headers.get("authorization");
  const idToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  if (!idToken) return NextResponse.json({ error: "未授權" }, { status: 401 });

  const verifyRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_WEB_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );
  if (!verifyRes.ok)
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  const verifyData = await verifyRes.json();
  const uid = verifyData.users?.[0]?.localId;
  if (!uid) return NextResponse.json({ error: "未授權" }, { status: 401 });

  // 只有 admin 能用（enrich 是審核工具）
  const profileRes = await fetch(
    `https://firestore.googleapis.com/v1/projects/${process.env.FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}`,
    { headers: { Authorization: `Bearer ${idToken}` } },
  );
  if (!profileRes.ok)
    return NextResponse.json({ error: "無法驗證使用者權限" }, { status: 403 });
  const profileData = await profileRes.json();
  if (profileData.fields?.role?.stringValue !== "admin") {
    return NextResponse.json({ error: "需要管理員權限" }, { status: 403 });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key)
    return NextResponse.json(
      { error: "伺服器未設定 Gemini API Key" },
      { status: 500 },
    );

  const {
    url = "",
    title = "",
    tagline = "",
    type = "webapp",
  } = await request.json();

  // ── 嘗試抓 GitHub README（抓不到也沒關係，靠 title/tagline 生成）──
  let readme = "";
  const gh = url.match(/github\.com\/([^/]+)\/([^/?#]+)/);
  if (gh) {
    const owner = gh[1];
    const repo = gh[2].replace(/\.git$/, "");
    try {
      const r = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/readme`,
        {
          headers: {
            Accept: "application/vnd.github.raw+json",
            "User-Agent": "simhope-platform",
          },
        },
      );
      if (r.ok) readme = (await r.text()).slice(0, 6000); // 截斷避免 prompt 過長
    } catch {
      /* 私有 repo 或不存在 → 略過 */
    }
  }

  const TYPE_DATA_HINT = {
    webapp: "不需要 typeData，回 {}",
    download:
      "typeData: { fileUrl, platform (windows/mac/linux/crossplatform), version, fileName }，沒把握的留空字串",
    doc: "typeData: { fileUrl, fileType (pdf/docx/xlsx/zip), version, fileName }",
    mcp: "typeData: { mcpbUrl, npmPackage, repoUrl, configSnippet }（configSnippet 是給 Cursor/VSCode 貼的 mcp JSON 字串）",
    api: "typeData: { endpoint, docsUrl, sdkPackage }",
    embedded:
      "typeData: { location (部署在哪台電腦/設備), accessNote (怎麼使用), contact (負責窗口) }",
  };

  const systemPrompt = `你是 SimHope 內部 AI 工具平台的審核助理。根據以下工具資訊，產生「上架建議內容」。

固定輸出純 JSON（不要 markdown code fence），schema：
{
  "icon": "單一 emoji",
  "desc": "Pattern C 文案，必須是兩段：第一段以 **Before**： 開頭描述原本痛點，第二段以 **After**： 開頭描述用了工具後的改善。用 \\n 換行分段。白話、給非技術同仁看，可含具體時間/流程數據。約 60-120 字。",
  "scenarios": ["適用場景1", "適用場景2"],
  "tags": ["關鍵字1", "關鍵字2", "關鍵字3"],
  "typeData": { ... }
}

這個工具的類型是「${type}」，對應的 typeData 規則：${TYPE_DATA_HINT[type] || "回 {}"}。
typeData 只放你有把握的欄位，沒把握就不要編造（留空字串或省略）。`;

  const userContent = `工具名稱：${title}
一句話介紹：${tagline}
主連結：${url}
${readme ? `\nGitHub README（節錄）：\n${readme}` : "\n（沒有可讀的 README，請依名稱與介紹合理推測）"}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: systemPrompt + "\n\n" + userContent }],
          },
        ],
        generationConfig: {
          temperature: 0.6,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    return NextResponse.json(
      {
        error: `Gemini API 呼叫失敗 (${res.status}): ${errBody?.error?.message || "未知錯誤"}`,
      },
      { status: 502 },
    );
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  let result;
  try {
    result = JSON.parse(text.replace(/```json\n?|\n?```/g, "").trim());
  } catch {
    return NextResponse.json(
      { error: "AI 回傳格式無法解析，請重試" },
      { status: 502 },
    );
  }
  result._readmeFound = !!readme; // 讓前端知道有沒有抓到 README
  return NextResponse.json(result);
}
