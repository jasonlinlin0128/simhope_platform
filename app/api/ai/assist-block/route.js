import { NextResponse } from "next/server";
import { requireRole } from "@/lib/apiAuth.mjs";
import { callGemini } from "@/lib/gemini.mjs";
import { HttpError, handleApiError } from "@/lib/apiError.mjs";
import { rateLimit, clientIp } from "@/lib/rateLimit.mjs";
import { isSafeHttpUrl } from "@/lib/safeUrl";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout.mjs";

/**
 * POST /api/ai/assist-block
 * text block AI 撰寫助理。polish/generate，部落格口吻。
 * IP 前置限流 → auth(developer/admin, Admin SDK) → Gemini 純文字。
 */
export async function POST(request) {
  try {
    // ── rate limit（IP 前置閘，擋 Gemini 額度濫用）──
    const ip = clientIp(request);
    if (!rateLimit(`assist-block:${ip}`, { limit: 10, windowMs: 60000 }).ok)
      throw new HttpError(429, "操作過於頻繁，請稍後再試");

    await requireRole(request, ["developer", "admin"], {
      forbiddenMessage: "需要開發者或管理員權限",
    });

    // ── 參數 ──
    const body = await request.json().catch(() => ({}));
    const mode = body.mode === "generate" ? "generate" : "polish";
    const currentText = String(body.currentText || "").slice(0, 6000);
    const instruction = String(body.instruction || "").slice(0, 6000);
    const sourceUrl = String(body.sourceUrl || "").trim();
    const rawCtx = body.context || {};
    const context = {
      title: String(rawCtx.title || "").slice(0, 200),
      tagline: String(rawCtx.tagline || "").slice(0, 200),
      type: String(rawCtx.type || "").slice(0, 40),
    };

    // ── 空請求擋掉（省 Gemini 額度）──
    if (mode === "polish" && !currentText)
      throw new HttpError(400, "請先輸入要潤飾的內容");
    if (mode === "generate" && !instruction && !sourceUrl)
      throw new HttpError(400, "請先輸入指示或來源連結");

    // ── 來源抓取（generate + sourceUrl）：GitHub README 走白名單，其餘走 SSRF-guarded fetch ──
    let sourceText = "";
    if (mode === "generate" && sourceUrl) {
      // 錨定 host 為 github.com（擋 evil.com/github.com/... 之類誤判）
      const gh = sourceUrl.match(
        /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/?#]+)/i,
      );
      if (gh) {
        try {
          const r = await fetchWithTimeout(
            `https://api.github.com/repos/${gh[1]}/${gh[2].replace(/\.git$/, "")}/readme`,
            {
              headers: {
                Accept: "application/vnd.github.raw+json",
                "User-Agent": "simhope-platform",
              },
            },
            { timeoutMs: 8000 },
          );
          if (r.ok) sourceText = (await r.text()).slice(0, 6000);
        } catch {
          /* 抓不到就略過 */
        }
      } else if (isSafeHttpUrl(sourceUrl)) {
        try {
          // redirect: manual → 3xx 變 opaqueredirect（r.ok=false）→ 不跟隨轉址，
          // 擋掉「安全 host 30x 轉到內網」的 redirect-SSRF。
          const r = await fetchWithTimeout(
            sourceUrl,
            {
              headers: { "User-Agent": "simhope-platform" },
              redirect: "manual",
            },
            { timeoutMs: 8000 },
          );
          if (r.ok) sourceText = (await r.text()).slice(0, 6000);
        } catch {
          /* 抓不到就略過 */
        }
      }
      // 不安全 URL → 靜默不 fetch
    }

    // ── prompt ──
    const VOICE = `你是 SimHope 內部 AI 工具平台的內容撰寫助理。用親切、像在跟一般同仁解釋的「部落格口吻」寫——娓娓道來的內文，寫給非技術的一般讀者。避免：條列式技術 changelog 腔、整段粗體、堆砌 markdown 標記。適度用 ## 小標分段（2–4 段）讓人好讀；關鍵字才加粗；多用完整句子與生活化比喻。只輸出繁體中文 markdown 內文，前後不要加說明或 code fence。`;
    const ctx = `（工具背景：名稱「${context.title || ""}」、一句話介紹「${context.tagline || ""}」、類型「${context.type || ""}」）`;
    const task =
      mode === "polish"
        ? `請把下面這段內容潤飾成上述口吻，保留原意與事實，只改表達方式：\n\n${currentText}`
        : `請依下面指示撰寫內容${sourceText ? "（若附了來源內容，請據實摘要、不要編造）" : ""}：\n指示：${instruction}${sourceText ? `\n\n來源內容（節錄）：\n${sourceText}` : ""}`;

    // ── Gemini（純文字、限輸出長度）──
    const text = await callGemini({
      prompt: `${VOICE}\n${ctx}\n\n${task}`,
      json: false,
      temperature: 0.7,
      maxOutputTokens: 1500,
    });
    if (!text) throw new HttpError(502, "AI 沒有產生內容，請重試");
    return NextResponse.json({ text });
  } catch (e) {
    return handleApiError(e, "/api/ai/assist-block");
  }
}
