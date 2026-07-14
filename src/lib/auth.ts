import { headers } from "next/headers";
import { prisma } from "./db";
import { ROLE_RANK, type Role } from "./constants";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// A bootstrap admin (listed in ADMIN_EMAILS) is always elevated to Admin on
// login and must not be demotable — getCurrentUser would just re-elevate them.
export function isBootstrapAdmin(email: string): boolean {
  return adminEmails().includes(email.toLowerCase());
}

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[.\-_]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

// Resolve the authenticated email:
//  - production: Cloudflare Access sets `Cf-Access-Authenticated-User-Email`
//  - local dev:  fall back to DEV_EMAIL from the environment
async function resolveEmail(): Promise<string> {
  const h = await headers();
  const cfEmail = h.get("cf-access-authenticated-user-email");
  if (cfEmail) return cfEmail.toLowerCase();
  return (process.env.DEV_EMAIL ?? "dev@localhost").toLowerCase();
}

// Returns the current user, creating a record on first sign-in.
// Bootstrap admins (ADMIN_EMAILS) are always elevated to Admin.
export async function getCurrentUser(): Promise<CurrentUser> {
  const email = await resolveEmail();
  const isBootstrapAdmin = adminEmails().includes(email);

  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: nameFromEmail(email),
        role: isBootstrapAdmin ? "Admin" : "Viewer",
      },
    });
  } else if (isBootstrapAdmin && user.role !== "Admin") {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { role: "Admin" },
    });
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
  };
}

export function hasRole(user: { role: Role }, min: Role): boolean {
  return ROLE_RANK[user.role] >= ROLE_RANK[min];
}

// Editors and above may create/edit documents.
export function canEdit(user: { role: Role }): boolean {
  return hasRole(user, "Editor");
}

// Reviewers and above may approve documents.
export function canReview(user: { role: Role }): boolean {
  return hasRole(user, "Reviewer");
}

export function canAdmin(user: { role: Role }): boolean {
  return hasRole(user, "Admin");
}
