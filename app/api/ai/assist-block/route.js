import { NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { isSafeHttpUrl } from "@/lib/safeUrl";

/**
 * POST /api/ai/assist-block
 * 給 text block 編輯器的 AI 撰寫助理。polish/generate，部落格口吻。
 * Auth：Bearer idToken → Identity Toolkit → users/{uid}.role in [developer, admin]
 * Body：{ mode:'polish'|'generate', currentText?, instruction?, sourceUrl?, context? }
 * Returns：{ text }（markdown）
 */
export async function POST(request) {
  // ── rate limit（developer 可用，擋 Gemini 額度濫用）──
  const ip = clientIp(request);
  if (!rateLimit(`assist-block:${ip}`, { limit: 10, windowMs: 60000 }).ok) {
    return NextResponse.json(
      { error: "操作過於頻繁，請稍後再試" },
      { status: 429 },
    );
  }

  // ── auth：developer / admin ──
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

  const profileRes = await fetch(
    `https://firestore.googleapis.com/v1/projects/${process.env.FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}`,
    { headers: { Authorization: `Bearer ${idToken}` } },
  );
  if (!profileRes.ok)
    return NextResponse.json({ error: "無法驗證使用者權限" }, { status: 403 });
  const profileData = await profileRes.json();
  const role = profileData.fields?.role?.stringValue;
  if (role !== "admin" && role !== "developer") {
    return NextResponse.json(
      { error: "需要開發者或管理員權限" },
      { status: 403 },
    );
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key)
    return NextResponse.json(
      { error: "伺服器未設定 Gemini API Key" },
      { status: 500 },
    );

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
  if (mode === "polish" && !currentText) {
    return NextResponse.json(
      { error: "請先輸入要潤飾的內容" },
      { status: 400 },
    );
  }
  if (mode === "generate" && !instruction && !sourceUrl) {
    return NextResponse.json(
      { error: "請先輸入指示或來源連結" },
      { status: 400 },
    );
  }

  // ── 來源抓取（generate + sourceUrl）：GitHub README 走白名單，其餘走 SSRF-guarded fetch ──
  let sourceText = "";
  if (mode === "generate" && sourceUrl) {
    // 錨定 host 為 github.com（擋 evil.com/github.com/... 之類誤判）
    const gh = sourceUrl.match(
      /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/?#]+)/i,
    );
    if (gh) {
      try {
        const r = await fetch(
          `https://api.github.com/repos/${gh[1]}/${gh[2].replace(/\.git$/, "")}/readme`,
          {
            headers: {
              Accept: "application/vnd.github.raw+json",
              "User-Agent": "simhope-platform",
            },
          },
        );
        if (r.ok) sourceText = (await r.text()).slice(0, 6000);
      } catch {
        /* 抓不到就略過 */
      }
    } else if (isSafeHttpUrl(sourceUrl)) {
      try {
        const r = await fetch(sourceUrl, {
          headers: { "User-Agent": "simhope-platform" },
        });
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
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: `${VOICE}\n${ctx}\n\n${task}` }] },
          ],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1500 },
        }),
      },
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: `AI 服務暫時無法使用 (${res.status})` },
        { status: 502 },
      );
    }
    const data = await res.json();
    const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    if (!text)
      return NextResponse.json(
        { error: "AI 沒有產生內容，請重試" },
        { status: 502 },
      );
    return NextResponse.json({ text });
  } catch (e) {
    console.error("/api/ai/assist-block 失敗：", e);
    return NextResponse.json(
      { error: "AI 輔助失敗，請稍後再試" },
      { status: 500 },
    );
  }
}
