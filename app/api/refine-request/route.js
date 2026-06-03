import { NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rateLimit";

const SYSTEM_PROMPT = `你是公司內部「需求收件」助理。使用者會用口語描述他工作上的痛點或想要的工具。
請做兩件事，並固定輸出純 JSON：
1. optimized：把他的描述改寫得更清楚具體（白話、保留原意、別誇大、別亂加他沒說的需求），約 40-120 字。
2. suggestions：列 1-3 個「他可能沒講清楚、補上會更好評估」的點（每點一句話、繁體中文）。若已很完整可給空陣列。

JSON Schema:
{ "optimized": "改寫後的需求描述", "suggestions": ["可補充的點1", "可補充的點2"] }`;

export async function POST(request) {
  // 限流（免登入端點）：每 IP 每分鐘 5 次
  const ip = clientIp(request);
  if (!rateLimit(`refine:${ip}`, { limit: 5, windowMs: 60000 }).ok) {
    return NextResponse.json(
      { error: "操作過於頻繁，請稍後再試" },
      { status: 429 },
    );
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "伺服器未設定 Gemini API Key" },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const text = String(body.text || "")
    .slice(0, 1000)
    .trim();
  if (!text) {
    return NextResponse.json({ error: "請先輸入需求內容" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: SYSTEM_PROMPT + "\n使用者描述：" + text }],
            },
          ],
          generationConfig: {
            temperature: 0.5,
            responseMimeType: "application/json",
          },
        }),
      },
    );
    if (!res.ok) {
      await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: `AI 服務暫時無法使用 (${res.status})` },
        { status: 502 },
      );
    }
    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());
    return NextResponse.json({
      optimized: String(parsed.optimized || ""),
      suggestions: Array.isArray(parsed.suggestions)
        ? parsed.suggestions.slice(0, 3)
        : [],
    });
  } catch (e) {
    console.error("/api/refine-request 失敗：", e);
    return NextResponse.json(
      { error: "AI 輔助失敗，請稍後再試" },
      { status: 500 },
    );
  }
}
