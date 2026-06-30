"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Mermaid } from "./Mermaid";

// Render ```mermaid fenced blocks as diagrams; everything else as normal code.
const components: Components = {
  pre({ node, children, ...props }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const code: any = (node as any)?.children?.[0];
    const className: string[] = code?.properties?.className ?? [];
    const isMermaid = Array.isArray(className) && className.includes("language-mermaid");
    const text: string = code?.children?.[0]?.value ?? "";
    if (isMermaid && text.trim()) {
      return <Mermaid chart={text.replace(/\n$/, "")} />;
    }
    return <pre {...props}>{children}</pre>;
  },
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-doc">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
