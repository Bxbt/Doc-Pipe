import { userFromToken } from "./tokens";
import type { CurrentUser } from "./auth";

// Resolve the caller of an MCP/API request from its bearer token, or null.
export async function authFromRequest(req: Request): Promise<CurrentUser | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? userFromToken(match[1]) : null;
}

export function unauthorized(): Response {
  return Response.json(
    { error: "Missing or invalid access token. Create one in Settings." },
    { status: 401 }
  );
}
