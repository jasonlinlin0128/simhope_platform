import {
  getServerCatalog,
  getServerToolHelpful,
  getServerToolViews,
} from "@/lib/serverCatalog";
import { attachHelpfulCounts } from "@/lib/helpfulBadge.mjs";
import HubExplorer from "@/components/HubExplorer";

/**
 * 資源中心（公開頁）。server 端抓 catalog → 傳 client 島；讀 ?cat= 帶初始分類
 * （故為 dynamic render）。getServerCatalog() 仍是 REST fetch + 300s 快取；
 * getServerToolHelpful()/getServerToolViews() 已改走 Admin SDK 未快取讀取
 * （2026-07-18 analytics 逐工具明細收斂為 admin-only 後的必要調整，見
 * docs/superpowers/specs/2026-07-18-analytics-read-lockdown-design.md——
 * 對這個內部工具的流量量級可接受）。
 */
export default async function HubPage({ searchParams }) {
  const { cat } = await searchParams;
  const [tools, toolHelpful, toolViews] = await Promise.all([
    getServerCatalog(),
    getServerToolHelpful(),
    getServerToolViews(),
  ]);
  const enriched = attachHelpfulCounts(tools, toolHelpful);
  // ?cat= 重複時 Next 給陣列；取首值，與舊 useSearchParams().get() 行為一致。
  const initialCat = (Array.isArray(cat) ? cat[0] : cat) || "all";
  return (
    <HubExplorer
      tools={enriched}
      viewsMap={toolViews}
      initialCat={initialCat}
    />
  );
}
