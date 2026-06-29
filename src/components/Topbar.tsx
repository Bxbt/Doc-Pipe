"use client";

import { useRouter } from "next/navigation";
import { Search, Menu } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { RoleBadge } from "./badges";

export function Topbar({
  user,
  onMenuClick,
}: {
  user: { name: string; email: string; role: string };
  onMenuClick?: () => void;
}) {
  const router = useRouter();

  function onSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q")?.toString().trim();
    if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-bg/80 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
      <button
        onClick={onMenuClick}
        title="Open menu"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted hover:text-fg md:hidden"
      >
        <Menu size={18} />
      </button>
      <form onSubmit={onSearch} className="relative max-w-md flex-1">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          name="q"
          placeholder="Search projects, documents, requirements…"
          className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm outline-none placeholder:text-muted focus:border-brand"
        />
      </form>

      <div className="ml-auto flex items-center gap-3">
        <ThemeToggle />
        <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface py-1.5 pl-1.5 pr-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-xs font-semibold text-brand-fg">
            {initials}
          </div>
          <div className="hidden leading-tight sm:block">
            <div className="text-xs font-medium">{user.name}</div>
            <div className="text-[10px] text-muted">{user.email}</div>
          </div>
          <RoleBadge role={user.role} />
        </div>
      </div>
    </header>
  );
}
