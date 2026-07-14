"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, Menu, LogOut, ChevronDown, KeyRound, UserRound } from "lucide-react";
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
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Navigate to the search results for a query. While already on /search we
  // replace (no history spam per keystroke); otherwise push once. Clearing the
  // box leaves search (back to where you came from) rather than landing on an
  // empty "type a query" page.
  function goSearch(raw: string) {
    const q = raw.trim();
    if (!q) {
      if (pathname === "/search") router.back();
      return;
    }
    const url = `/search?q=${encodeURIComponent(q)}`;
    if (pathname === "/search") router.replace(url);
    else router.push(url);
  }

  // Debounced live search as the user types.
  function onSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => goSearch(value), 350);
  }

  // Enter searches immediately (cancel any pending debounce).
  function onSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    clearTimeout(searchTimer.current);
    const q = new FormData(e.currentTarget).get("q")?.toString() ?? "";
    goSearch(q);
  }

  // Close the user menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

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
          onChange={onSearchChange}
          placeholder="Search projects, documents, requirements…"
          className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm outline-none placeholder:text-muted focus:border-brand"
        />
      </form>

      <div className="ml-auto flex items-center gap-3">
        <ThemeToggle />
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-2.5 rounded-lg border border-border bg-surface py-1.5 pl-1.5 pr-2.5 hover:border-brand"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-xs font-semibold text-brand-fg">
              {initials}
            </div>
            <div className="hidden leading-tight sm:block">
              <div className="text-xs font-medium">{user.name}</div>
              <div className="text-[10px] text-muted">{user.email}</div>
            </div>
            <RoleBadge role={user.role} />
            <ChevronDown
              size={14}
              className={`text-muted transition-transform ${menuOpen ? "rotate-180" : ""}`}
            />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-44 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
            >
              <Link
                href="/profile"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-fg hover:bg-surface-2"
              >
                <UserRound size={15} className="text-muted" />
                Profile
              </Link>
              <Link
                href="/settings"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-fg hover:bg-surface-2"
              >
                <KeyRound size={15} className="text-muted" />
                Access tokens
              </Link>
              <div className="my-1 border-t border-border" />
              <a
                href="/cdn-cgi/access/logout"
                role="menuitem"
                className="flex items-center gap-2 px-3 py-2 text-sm text-fg hover:bg-surface-2"
              >
                <LogOut size={15} className="text-muted" />
                Log out
              </a>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
