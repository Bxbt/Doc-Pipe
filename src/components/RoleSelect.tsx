"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ROLES } from "@/lib/constants";
import { setUserRole } from "@/lib/actions";
import { Select } from "./inputs";

export function RoleSelect({ userId, role }: { userId: string; role: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Select
      value={role}
      disabled={isPending}
      options={ROLES.map((r) => ({ value: r, label: r }))}
      onChange={(next) => {
        startTransition(async () => {
          await setUserRole(userId, next);
          router.refresh();
        });
      }}
      className="w-36 text-xs"
    />
  );
}
