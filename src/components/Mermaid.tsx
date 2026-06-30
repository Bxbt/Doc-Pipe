"use client";

import { useEffect, useRef, useState } from "react";

// Lazy-load mermaid once, on first use, so it never bloats the initial bundle.
let mermaidPromise: Promise<typeof import("mermaid")["default"]> | null = null;
function loadMermaid() {
  if (!mermaidPromise) mermaidPromise = import("mermaid").then((m) => m.default);
  return mermaidPromise;
}

export function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "default">("dark");

  // Track the app theme so diagrams match light/dark mode.
  useEffect(() => {
    const read = () =>
      setTheme(document.documentElement.classList.contains("dark") ? "dark" : "default");
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    loadMermaid().then(async (mermaid) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme });
      try {
        const id = "mmd-" + Math.random().toString(36).slice(2);
        const { svg } = await mermaid.render(id, chart);
        if (active && ref.current) {
          ref.current.innerHTML = svg;
          setError(null);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Invalid diagram");
      }
    });
    return () => {
      active = false;
    };
  }, [chart, theme]);

  if (error) {
    return (
      <pre className="my-3 overflow-x-auto rounded-lg border border-red-500/40 bg-red-500/5 p-3 text-[11px] text-red-300">
        {`Mermaid error: ${error}\n\n${chart}`}
      </pre>
    );
  }

  return <div ref={ref} className="mermaid-diagram my-3 flex justify-center overflow-x-auto" />;
}
