import { NextResponse } from 'next/server';

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

export async function POST(request) {
    // Verify Firebase ID token
    const authHeader = request.headers.get('authorization');
    const idToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) {
        return NextResponse.json({ error: '未授權' }, { status: 401 });
    }
    // Verify token and extract uid
    const verifyRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_WEB_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken })
        }
    );
    if (!verifyRes.ok) {
        return NextResponse.json({ error: '未授權' }, { status: 401 });
    }
    const verifyData = await verifyRes.json();
    const uid = verifyData.users?.[0]?.localId;
    if (!uid) {
        return NextResponse.json({ error: '未授權' }, { status: 401 });
    }

    // Check role: only developer or admin can use AI generation
    const profileRes = await fetch(
        `https://firestore.googleapis.com/v1/projects/${process.env.FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}`,
        { headers: { Authorization: `Bearer ${idToken}` } }
    );
    if (profileRes.ok) {
        const profileData = await profileRes.json();
        const role = profileData.fields?.role?.stringValue;
        if (role !== 'developer' && role !== 'admin') {
            return NextResponse.json({ error: '需要開發者權限才能使用 AI 生成功能' }, { status: 403 });
        }
    } else {
        return NextResponse.json({ error: '無法驗證使用者權限' }, { status: 403 });
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        return NextResponse.json({ error: '伺服器未設定 Gemini API Key' }, { status: 500 });
    }

    const { prompt } = await request.json();
    if (!prompt) {
        return NextResponse.json({ error: '缺少 prompt' }, { status: 400 });
    }

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: SYSTEM_PROMPT + '\n使用者描述：' + prompt }] }],
                generationConfig: { temperature: 0.7, responseMimeType: 'application/json' }
            })
        }
    );

    if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        return NextResponse.json({ error: `Gemini API 呼叫失敗 (${res.status}): ${errBody?.error?.message || '未知錯誤'}` }, { status: 502 });
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const result = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());
    return NextResponse.json(result);
}
