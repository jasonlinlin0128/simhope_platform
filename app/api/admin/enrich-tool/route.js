import { NextResponse } from "next/server";
import { requireRole } from "@/lib/apiAuth.mjs";
import { callGemini } from "@/lib/gemini.mjs";
import { HttpError, handleApiError } from "@/lib/apiError.mjs";
import { rateLimit, clientIp } from "@/lib/rateLimit.mjs";

/**
 * POST /api/admin/enrich-tool
 * Admin-only。讀工具主連結（GitHub 抓 README）→ Gemini 生成建議內容。
 * IP 前置限流 → auth(admin, Admin SDK) → Gemini JSON。
 */
export async function POST(request) {
  try {
    const ip = clientIp(request);
    if (!rateLimit(`enrich:${ip}`, { limit: 20, windowMs: 60000 }).ok)
      throw new HttpError(429, "操作過於頻繁，請稍後再試");

    await requireRole(request, ["admin"], {
      forbiddenMessage: "需要管理員權限",
    });

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

    const result = await callGemini({
      prompt: systemPrompt + "\n\n" + userContent,
      json: true,
      temperature: 0.6,
    });
    result._readmeFound = !!readme; // 讓前端知道有沒有抓到 README
    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e, "/api/admin/enrich-tool");
  }
}
