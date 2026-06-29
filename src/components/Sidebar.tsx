"use client";

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
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/templates", label: "Templates", icon: FileText },
  { href: "/team", label: "Team", icon: Users },
];

function NavLinks({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "flex flex-col gap-1 py-2",
        collapsed ? "px-2" : "px-3"
      )}
    >
      {nav.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);

        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
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
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      href="/"
      className="flex items-center gap-2"
      title="Doc-Pipe — Home"
    >
      <img
        src="/logo-icon.png"
        alt="Doc-Pipe"
        className="h-9 w-9 shrink-0 object-contain dark:invert"
      />

      {!collapsed && (
        <div className="leading-tight">
          <div className="text-sm font-semibold">
            Doc-Pipe
          </div>

          <div className="text-[11px] text-muted">
            Document Pipeline
          </div>
        </div>
      )}
    </Link>
  );
}

export function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 md:flex",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <div className="px-3 py-4">
          {collapsed ? (
            <button
              onClick={onToggleCollapse}
              title="Expand sidebar"
              className="
                flex h-9 w-9 items-center justify-center
                rounded-md
                text-muted
                hover:bg-surface-2
                hover:text-fg
                transition-colors
              "
            >
              <PanelLeftOpen size={20} />
            </button>
          ) : (
            <div className="flex items-center gap-2 px-1">
              <Brand collapsed={false} />

              <button
                onClick={onToggleCollapse}
                title="Collapse sidebar"
                className="
                  ml-auto flex h-7 w-7 items-center justify-center
                  rounded-md
                  text-muted
                  hover:bg-surface-2
                  hover:text-fg
                  transition-colors
                "
              >
                <PanelLeftClose size={18} />
              </button>
            </div>
          )}
        </div>

        <NavLinks collapsed={collapsed} />

        {!collapsed && (
          <div className="mt-auto flex items-center gap-1.5 px-4 py-4 text-[11px] leading-relaxed text-muted">
            <GitBranch size={12} className="shrink-0" />
            Built by prompting AI.
          </div>
        )}
      </aside>
            {/* Mobile Drawer */}
      <div
        className={cn(
          "fixed inset-0 z-50 md:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none"
        )}
        aria-hidden={!mobileOpen}
      >
        <div
          onClick={onCloseMobile}
          className={cn(
            "absolute inset-0 bg-black/50 transition-opacity",
            mobileOpen ? "opacity-100" : "opacity-0"
          )}
        />

        <aside
          className={cn(
            "absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-surface shadow-xl transition-transform duration-200",
            mobileOpen
              ? "translate-x-0"
              : "-translate-x-full"
          )}
        >
          <div className="flex items-center gap-2 px-4 py-4">
            <Brand collapsed={false} />

            <button
              onClick={onCloseMobile}
              title="Close menu"
              className="
                ml-auto flex h-8 w-8 items-center justify-center
                rounded-md
                text-muted
                hover:bg-surface-2
                hover:text-fg
              "
            >
              <X size={18} />
            </button>
          </div>

          <NavLinks
            collapsed={false}
            onNavigate={onCloseMobile}
          />

          <div className="mt-auto flex items-center gap-1.5 px-4 py-4 text-[11px] text-muted">
            <GitBranch size={12} className="shrink-0" />
            Built by prompting AI.
          </div>
        </aside>
      </div>
    </>
  );
}