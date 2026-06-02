import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseChangelog } from "@/lib/changelog";
import ChangelogTimeline from "@/components/ChangelogTimeline";

export const metadata = { title: "更新日誌 · SimHope Hub" };

export default async function ChangelogPage() {
  let versions = [];
  try {
    const md = await readFile(path.join(process.cwd(), "CHANGELOG.md"), "utf8");
    versions = parseChangelog(md);
  } catch (e) {
    console.error("讀取 CHANGELOG.md 失敗：", e);
  }
  return (
    <div className="max-w-3xl mx-auto px-4 md:px-0 py-10">
      <header className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-black text-[var(--color-text-dark)] mb-3">
          更新日誌
        </h1>
        <p className="text-[var(--color-text-mid)] font-semibold">
          平台每個版本做了什麼。技術細節可展開。
        </p>
      </header>
      {versions.length ? (
        <ChangelogTimeline versions={versions} />
      ) : (
        <p className="text-center text-[var(--color-text-mid)]">
          目前沒有更新紀錄。
        </p>
      )}
      <p className="text-center text-xs text-[var(--color-text-mid)] mt-8">
        想看完整技術版本紀錄？看 repo 的{" "}
        <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">
          CHANGELOG.md
        </code>
        。
      </p>
    </div>
  );
}
