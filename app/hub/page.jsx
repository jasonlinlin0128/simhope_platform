import { getServerCatalog, getServerToolHelpful } from "@/lib/serverCatalog";
import { attachHelpfulCounts } from "@/lib/helpfulBadge.mjs";
import HubExplorer from "@/components/HubExplorer";

/**
 * 資源中心（公開頁）。server 端抓 catalog → 傳 client 島；讀 ?cat= 帶初始分類
 * （故為 dynamic render，但 REST fetch 有 300s 快取）。
 */
export default async function HubPage({ searchParams }) {
  const { cat } = await searchParams;
  const [tools, toolHelpful] = await Promise.all([
    getServerCatalog(),
    getServerToolHelpful(),
  ]);
  const enriched = attachHelpfulCounts(tools, toolHelpful);
  // ?cat= 重複時 Next 給陣列；取首值，與舊 useSearchParams().get() 行為一致。
  const initialCat = (Array.isArray(cat) ? cat[0] : cat) || "all";
  return <HubExplorer tools={enriched} initialCat={initialCat} />;
}
