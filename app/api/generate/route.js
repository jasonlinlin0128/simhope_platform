import { NextResponse } from "next/server";
import { requireRole } from "@/lib/apiAuth.mjs";
import { callGemini } from "@/lib/gemini.mjs";
import { HttpError, handleApiError } from "@/lib/apiError.mjs";
import { rateLimit, clientIp } from "@/lib/rateLimit";

const SYSTEM_PROMPT = `你是一個非常厲害的行銷企劃與產品經理。你要幫內部的開發者撰寫「工具上架文案」。
使用者會用一句話描述他的小工具，請生出吸引人、白話文的文案，並固定輸出為純 JSON 格式。

JSON Schema:
{
  "icon": "單一Emoji",
  "title": "簡短名稱 (約6-12字)",
  "tagline": "吸引人的副標題 (約10-25字)",
  "desc": "功能與價值說明 (約50-80字，對非技術人員要友善白話)",
  "dept": "factory 或 admin 或 mgmt 或 quality 或 defense 或 other",
  "s1": "步驟1 (動詞開頭，最多8字)",
  "s2": "步驟2 (動詞開頭，最多8字)",
  "s3": "步驟3 (動詞開頭，最多8字)",
  "tags": ["關鍵字1", "關鍵字2"]
}`;

/**
 * POST /api/generate
 * 生成工具上架文案。IP 前置限流 → auth(developer/admin, Admin SDK) → Gemini JSON。
 */
export async function POST(request) {
  try {
    const ip = clientIp(request);
    if (!rateLimit(`generate:${ip}`, { limit: 10, windowMs: 60000 }).ok)
      throw new HttpError(429, "操作過於頻繁，請稍後再試");

    await requireRole(request, ["developer", "admin"], {
      forbiddenMessage: "需要開發者權限才能使用 AI 生成功能",
    });

    const { prompt } = await request.json();
    if (!prompt) throw new HttpError(400, "缺少 prompt");

    const result = await callGemini({
      prompt: SYSTEM_PROMPT + "\n使用者描述：" + prompt,
      json: true,
      temperature: 0.7,
    });
    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e, "/api/generate");
  }
}
