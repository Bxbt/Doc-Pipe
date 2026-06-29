"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  GitBranch,
  FileText,
  Users,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/templates", label: "Templates", icon: FileText },
  { href: "/team", label: "Team", icon: Users },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem("sidebar-collapsed") === "1");
  }, []);

  function toggle() {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 md:flex",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo → Home */}
      <div className={cn("flex items-center px-3 py-4", collapsed ? "justify-center" : "gap-2 px-4")}>
        <Link href="/" className="flex items-center gap-2" title="Doc-Pipe — Home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-icon.png"
            alt="Doc-Pipe"
            className="h-9 w-9 shrink-0 object-contain dark:invert"
          />
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-sm font-semibold">Doc-Pipe</div>
              <div className="text-[11px] text-muted">Document Pipeline</div>
            </div>
          )}
        </Link>
        {!collapsed && (
          <button
            onClick={toggle}
            title="Collapse sidebar"
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
          >
            <PanelLeftClose size={16} />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          onClick={toggle}
          title="Expand sidebar"
          className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
        >
          <PanelLeftOpen size={16} />
        </button>
      )}

      <nav className={cn("flex flex-col gap-1 py-2", collapsed ? "px-2" : "px-3")}>
        {nav.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center rounded-lg py-2 text-sm transition-colors",
                collapsed ? "justify-center px-2" : "gap-3 px-3",
                active
                  ? "bg-brand/15 font-medium text-fg"
                  : "text-muted hover:bg-surface-2 hover:text-fg"
              )}
            >
              <Icon size={17} className="shrink-0" />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="mt-auto flex items-center gap-1.5 px-4 py-4 text-[11px] leading-relaxed text-muted">
          <GitBranch size={12} className="shrink-0" />
          Built by prompting AI.
        </div>
      )}
    </aside>
  );
}
