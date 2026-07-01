"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { Mermaid } from "./Mermaid";

// Documents are stored as HTML (from BlockNote) so formatting survives a save.
// Older documents are Markdown; react-markdown renders both, and rehype-raw lets
// the embedded HTML through. rehype-sanitize then strips anything unsafe while
// keeping the inline formatting BlockNote emits (colour, alignment, underline…).
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // Allow inline styling + classes on every element: BlockNote encodes text
    // colour, background, and alignment as inline `style`, and code language as
    // a class. (Internal trusted tool — style-based XSS vectors are obsolete.)
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "style", "className", "dataLanguage"],
    img: [...(defaultSchema.attributes?.img ?? []), "width", "height", "style"],
    code: [...(defaultSchema.attributes?.code ?? []), "className", "dataLanguage"],
  },
  // Keep <u> and <mark> (underline / highlight) alongside the defaults.
  tagNames: [...(defaultSchema.tagNames ?? []), "u", "mark"],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function classList(node: any): string[] {
  const c = node?.properties?.className;
  if (Array.isArray(c)) return c.map(String);
  if (typeof c === "string") return c.split(/\s+/);
  return [];
}

const components: Components = {
  // Render mermaid code blocks as diagrams; everything else as normal code.
  pre({ node, children, ...props }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const code: any = (node as any)?.children?.[0];
    const classes = classList(code);
    const lang = code?.properties?.dataLanguage;
    const isMermaid =
      classes.some((c) => c === "language-mermaid" || c === "mermaid") ||
      lang === "mermaid";
    const text: string = code?.children?.[0]?.value ?? "";
    if (isMermaid && text.trim()) {
      return <Mermaid chart={text.replace(/\n$/, "")} />;
    }
    return <pre {...props}>{children}</pre>;
  },
  // Honor the `#w=<px>` width fragment legacy markdown stored on resized images.
  // (HTML content carries width natively on the <img>, so this only fires for
  // older documents.)
  img({ node, src, alt, style, ...props }) {
    const raw = typeof src === "string" ? src : "";
    const m = /#w=(\d+)$/.exec(raw);
    const realSrc = m ? raw.replace(/#w=\d+$/, "") : raw;
    const mergedStyle = m
      ? { ...(style as object), width: `${m[1]}px`, maxWidth: "100%" }
      : style;
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img src={realSrc} alt={alt ?? ""} style={mergedStyle} {...props} />;
  },
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-doc">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
