"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ROLES } from "@/lib/constants";
import { setUserRole } from "@/lib/actions";

export function RoleSelect({ userId, role }: { userId: string; role: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <select
      value={role}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value;
        startTransition(async () => {
          await setUserRole(userId, next);
          router.refresh();
        });
      }}
      className="rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs outline-none focus:border-brand disabled:opacity-50"
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  );
}
