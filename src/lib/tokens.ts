import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./db";
import type { CurrentUser } from "./auth";
import type { Role } from "./constants";

// Personal access tokens are prefixed so they're easy to spot in logs/config
// and to reject non-tokens early.
const PREFIX = "dp_";

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// Create a new raw token plus the fields we store. The raw value is returned
// once (to show the user) and never persisted — only its hash and a non-secret
// preview are kept.
export function generateToken(): { raw: string; tokenHash: string; preview: string } {
  const raw = PREFIX + randomBytes(24).toString("base64url");
  return {
    raw,
    tokenHash: hashToken(raw),
    preview: `${raw.slice(0, 7)}…${raw.slice(-4)}`,
  };
}

// Resolve a raw bearer token to its owning user, or null if unknown/invalid.
// Touches lastUsedAt so the settings UI can show activity.
export async function userFromToken(raw: string | null | undefined): Promise<CurrentUser | null> {
  if (!raw || !raw.startsWith(PREFIX)) return null;

  const token = await prisma.personalAccessToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: true },
  });
  if (!token) return null;

  // Fire-and-forget; a failed timestamp update must not block authentication.
  prisma.personalAccessToken
    .update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return {
    id: token.user.id,
    email: token.user.email,
    name: token.user.name,
    role: token.user.role as Role,
  };
}
