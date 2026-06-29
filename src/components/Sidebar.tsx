"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FolderKanban, GitBranch, FileText, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/templates", label: "Templates", icon: FileText },
  { href: "/team", label: "Team", icon: Users },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-brand-fg">
          <GitBranch size={18} />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Doc Pipeline</div>
          <div className="text-[11px] text-muted">Project Copilot</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1 px-3 py-2">
        {nav.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-brand/15 font-medium text-fg"
                  : "text-muted hover:bg-surface-2 hover:text-fg"
              )}
            >
              <Icon size={17} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-5 py-4 text-[11px] leading-relaxed text-muted">
        Built entirely by prompting AI.
        <br />
        No code written by hand.
      </div>
    </aside>
  );
}
