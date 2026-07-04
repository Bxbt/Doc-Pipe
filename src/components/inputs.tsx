"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, Search, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared anchored popover: renders `panel` in a body portal positioned under
 * `anchorRef`, flipping above when there isn't room. Closes on outside click,
 * Escape, scroll, or resize. Used by Select and DatePicker so their dropdowns
 * are never clipped by a scrollable modal.
 */
function Popover({
  open,
  onClose,
  anchorRef,
  children,
  width = "anchor",
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement>;
  children: ReactNode;
  width?: "anchor" | "auto";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; minWidth: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const place = () => {
      const a = anchorRef.current!.getBoundingClientRect();
      const panelH = panelRef.current?.offsetHeight ?? 0;
      const below = window.innerHeight - a.bottom;
      const openUp = below < Math.min(panelH, 280) && a.top > below;
      setPos({
        left: a.left,
        top: openUp ? a.top - (panelH || 0) - 4 : a.bottom + 4,
        minWidth: a.width,
      });
    };
    place();
    // Close when the page/anchor scrolls, but NOT when scrolling inside the
    // panel itself (otherwise the options list can never be scrolled).
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
    };
  }, [open, anchorRef, onClose]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (
        panelRef.current?.contains(e.target as Node) ||
        anchorRef.current?.contains(e.target as Node)
      )
        return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, anchorRef, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        minWidth: width === "anchor" ? pos?.minWidth : undefined,
        visibility: pos ? "visible" : "hidden",
        zIndex: 60,
      }}
      className="overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
    >
      {children}
    </div>,
    document.body
  );
}

export type Option = { value: string; label: string };

/**
 * Styled dropdown. Works controlled (`value` + `onChange`) or inside a plain
 * form (`name` → hidden input mirrors the value, like a native <select>).
 */
export function Select({
  value,
  defaultValue,
  onChange,
  name,
  options,
  placeholder = "Select…",
  disabled,
  className,
  searchable,
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  // Show a filter box inside the dropdown. Defaults on for long lists.
  searchable?: boolean;
}) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue ?? "");
  const current = controlled ? value! : inner;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === current);
  const showSearch = searchable ?? options.length > 8;
  const q = query.trim().toLowerCase();
  const shown = q
    ? options.filter(
        (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
      )
    : options;

  // Reset the filter each time the dropdown opens and focus the search box.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    if (showSearch) {
      const t = setTimeout(() => searchRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open, showSearch]);

  function pick(v: string) {
    if (!controlled) setInner(v);
    onChange?.(v);
    setOpen(false);
  }

  return (
    <>
      {name && <input type="hidden" name={name} value={current} />}
      <button
        type="button"
        ref={btnRef}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-left text-sm outline-none transition-colors hover:border-brand/60 focus:border-brand disabled:opacity-50",
          open && "border-brand",
          className
        )}
      >
        <span className={cn("truncate", !selected && "text-muted")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={15} className={cn("shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>

      <Popover open={open} onClose={() => setOpen(false)} anchorRef={btnRef}>
        {showSearch && (
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
            <Search size={14} className="shrink-0 text-muted" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (shown.length === 1) pick(shown[0].value);
                }
              }}
              placeholder="Search…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </div>
        )}
        <div className="max-h-64 overflow-y-auto p-1">
          {options.length === 0 && <div className="px-3 py-2 text-xs text-muted">No options</div>}
          {options.length > 0 && shown.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted">No matches</div>
          )}
          {shown.map((o) => {
            const on = o.value === current;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => pick(o.value)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                  on ? "bg-brand/10 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg"
                )}
              >
                <span className="truncate">{o.label}</span>
                {on && <Check size={14} className="shrink-0 text-brand" />}
              </button>
            );
          })}
        </div>
      </Popover>
    </>
  );
}

// ── DatePicker ────────────────────────────────────────────────────────────

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// Format a Y/M/D as a local "YYYY-MM-DD" (no timezone shift).
function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseYmd(s: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return null;
  return { y: +match[1], m: +match[2] - 1, d: +match[3] };
}

/**
 * Styled date picker with a month calendar. Controlled (`value` + `onChange`)
 * or form mode (`name`). Value is a "YYYY-MM-DD" string (or "" for empty).
 */
export function DatePicker({
  value,
  defaultValue,
  onChange,
  name,
  placeholder = "Pick a date",
  disabled,
  className,
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue ?? "");
  const current = controlled ? value! : inner;
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  const parsed = parseYmd(current);
  const today = new Date();
  // The month currently shown in the calendar.
  const [view, setView] = useState(() => ({
    y: parsed?.y ?? today.getFullYear(),
    m: parsed?.m ?? today.getMonth(),
  }));

  // Re-sync the visible month when opening on an existing value.
  useEffect(() => {
    if (open && parsed) setView({ y: parsed.y, m: parsed.m });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function set(v: string) {
    if (!controlled) setInner(v);
    onChange?.(v);
    setOpen(false);
  }

  const firstWeekday = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function shiftMonth(delta: number) {
    setView((v) => {
      const m = v.m + delta;
      return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
    });
  }

  const label = parsed
    ? new Date(parsed.y, parsed.m, parsed.d).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <>
      {name && <input type="hidden" name={name} value={current} />}
      <button
        type="button"
        ref={btnRef}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-left text-sm outline-none transition-colors hover:border-brand/60 focus:border-brand disabled:opacity-50",
          open && "border-brand",
          className
        )}
      >
        <span className={cn("truncate", !label && "text-muted")}>{label ?? placeholder}</span>
        <CalendarIcon size={15} className="shrink-0 text-muted" />
      </button>

      <Popover open={open} onClose={() => setOpen(false)} anchorRef={btnRef} width="auto">
        <div className="w-[260px] p-3" key={id}>
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="text-sm font-medium">
              {MONTHS[view.m]} {view.y}
            </div>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] text-muted">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1">{w}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              if (d === null) return <div key={i} />;
              const isSel = parsed && parsed.y === view.y && parsed.m === view.m && parsed.d === d;
              const isToday =
                today.getFullYear() === view.y && today.getMonth() === view.m && today.getDate() === d;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => set(ymd(view.y, view.m, d))}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-md text-xs transition-colors",
                    isSel
                      ? "bg-brand font-medium text-brand-fg"
                      : "text-fg hover:bg-surface-2",
                    !isSel && isToday && "border border-brand/50"
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <button
              type="button"
              onClick={() => set(ymd(today.getFullYear(), today.getMonth(), today.getDate()))}
              className="rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => set("")}
              className="rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg"
            >
              Clear
            </button>
          </div>
        </div>
      </Popover>
    </>
  );
}
