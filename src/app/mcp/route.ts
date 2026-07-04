// Landing for the bare /mcp path (no token). Because the remote MCP endpoint
// lives at /mcp/<token> and its Cloudflare Access bypass covers the /mcp prefix,
// a browser hitting /mcp with no token would otherwise fall through to the app's
// 404 — which is wrapped in the full app layout (sidebar/nav/user chip). A route
// handler bypasses the layout entirely, so we answer with a plain, chrome-less
// message and leak nothing about the app UI.
export const dynamic = "force-dynamic";

const INFO = `Doc-Pipe MCP endpoint

This URL is a Model Context Protocol server (Streamable HTTP transport), not a
web page. Add it to Claude/ChatGPT as a remote connector using your personal
access token:

    /mcp/<your access token>

Create a token in Doc-Pipe: user menu -> Access tokens.
`;

const headers = { "Content-Type": "text/plain; charset=utf-8" };

export async function GET() {
  return new Response(INFO, { status: 404, headers });
}

// A client that POSTs here without the token segment gets a clear JSON-RPC error.
export async function POST() {
  return Response.json(
    {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32001, message: "Missing access token. Use /mcp/<token>." },
    },
    { status: 401 }
  );
}
