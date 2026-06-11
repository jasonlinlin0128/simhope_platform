import { getServerCatalog } from "@/lib/serverCatalog";
import HubExplorer from "@/components/HubExplorer";

/**
 * 資源中心（公開頁）。server 端抓 catalog → 傳 client 島；讀 ?cat= 帶初始分類
 * （故為 dynamic render，但 REST fetch 有 300s 快取）。
 */
export default async function HubPage({ searchParams }) {
  const { cat } = await searchParams;
  const tools = await getServerCatalog();
  return <HubExplorer tools={tools} initialCat={cat || "all"} />;
}
