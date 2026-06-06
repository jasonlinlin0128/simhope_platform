"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// 文章級 typography（Phase 2.6）：正常字重內文、乾淨加粗（不換色）、✦ 清單、舒服行距。
// desc 與 text block 共用。
export const mdComponents = {
  h2: (props) => (
    <h2
      className="text-xl font-extrabold mt-7 mb-3 text-[var(--color-text-dark)]"
      {...props}
    />
  ),
  h3: (props) => (
    <h3
      className="text-lg font-bold mt-5 mb-2 text-[var(--color-text-dark)]"
      {...props}
    />
  ),
  ul: (props) => <ul className="flex flex-col gap-2 my-3" {...props} />,
  ol: (props) => (
    <ol className="list-decimal ml-5 flex flex-col gap-2 my-3" {...props} />
  ),
  li: (props) => (
    <li
      className="font-normal text-[var(--color-text-dark)] leading-[1.85] relative pl-5 before:content-['✦'] before:absolute before:left-0 before:top-0 before:text-[var(--color-clay-purple)] before:text-sm"
      {...props}
    />
  ),
  p: (props) => (
    <p
      className="font-normal text-[var(--color-text-dark)] leading-[1.9] text-[1.04rem] mb-4"
      {...props}
    />
  ),
  strong: (props) => (
    <strong className="font-bold text-[var(--color-text-dark)]" {...props} />
  ),
  code: ({ inline, ...props }) =>
    inline ? (
      <code
        className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-[0.85em]"
        {...props}
      />
    ) : (
      <code
        className="block bg-gray-900 text-gray-100 p-3 rounded-lg text-sm font-mono overflow-x-auto"
        {...props}
      />
    ),
  a: (props) => (
    <a
      className="text-[var(--color-clay-blue)] underline hover:opacity-80"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
};

export default function MarkdownContent({ children }) {
  if (!children) return null;
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
      {children}
    </ReactMarkdown>
  );
}
