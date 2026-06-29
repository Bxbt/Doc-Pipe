"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({
  user,
  children,
}: {
  user: { name: string; email: string; role: string };
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem("sidebar-collapsed") === "1");
  }, []);

  function toggleCollapse() {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Topbar user={user} onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
