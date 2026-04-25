const PROJECT_ID = 'simhope-platform';

/**
 * Route segment layout for /tool/[id].
 * Exports generateMetadata so the client-side page.jsx can still use 'use client'
 * while each tool detail page gets its own SEO title and description.
 */
export async function generateMetadata({ params }) {
    const { id } = await params;
    try {
        const res = await fetch(
            `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/tools/${id}`,
            { next: { revalidate: 3600 } }
        );
        if (res.ok) {
            const data = await res.json();
            const title = data.fields?.title?.stringValue;
            const tagline = data.fields?.tagline?.stringValue;
            if (title) {
                return {
                    title: `${title} — SimHope AI 工具箱`,
                    description: tagline || '專為公司同仁設計的 AI 工具中心',
                };
            }
        }
    } catch {}
    return {
        title: 'SimHope AI 工具箱',
        description: '專為公司同仁設計的 AI 工具中心',
    };
}

export default function ToolLayout({ children }) {
    return children;
}
