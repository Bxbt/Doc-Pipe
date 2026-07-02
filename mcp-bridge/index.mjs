#!/usr/bin/env node
// Doc-Pipe MCP bridge — a tiny stdio MCP server that runs beside your own
// Claude/ChatGPT and calls the Doc-Pipe API with your personal access token.
// It never holds an AI key: the AI runs on your side, this just exposes tools.
//
// Configure via environment:
//   DOCPIPE_URL    e.g. http://localhost:3000  or  https://doc-pipe.bboybezz.xyz
//   DOCPIPE_TOKEN  a "dp_…" token from Doc-Pipe → Settings → Access tokens

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = (process.env.DOCPIPE_URL || "").replace(/\/+$/, "");
const TOKEN = process.env.DOCPIPE_TOKEN || "";

if (!BASE || !TOKEN) {
  console.error("[doc-pipe] Set DOCPIPE_URL and DOCPIPE_TOKEN environment variables.");
  process.exit(1);
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Doc-Pipe API ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

// MCP tool results carry text blocks; JSON is returned pretty-printed.
const ok = (data) => ({
  content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
});

const server = new McpServer({ name: "doc-pipe", version: "0.1.0" });

server.tool(
  "list_projects",
  "List all Doc-Pipe projects (id, name, business type, document count).",
  {},
  async () => ok((await api("/api/mcp/projects")).projects)
);

server.tool(
  "get_project",
  "Get a project and its documents (each with id, type, title, status, version).",
  { projectId: z.string() },
  async ({ projectId }) => ok(await api(`/api/mcp/projects/${projectId}`))
);

server.tool(
  "get_document",
  "Get a document's content plus the content of every document upstream of it (for grounding) and the authoring spec for its type. Use this before drafting.",
  { documentId: z.string() },
  async ({ documentId }) => ok(await api(`/api/mcp/documents/${documentId}`))
);

server.tool(
  "list_doc_types",
  "List document types and their authoring specs (required format/conditions). Use before create_document.",
  {},
  async () => ok((await api("/api/mcp/doc-types")).docTypes)
);

server.tool(
  "create_document",
  "Create a new document in a project from Markdown you generate. It lands as a Draft for a human to review.",
  {
    projectId: z.string(),
    type: z.string().describe("A document type key from list_doc_types, e.g. SRS"),
    title: z.string().optional(),
    content: z.string().describe("Document body in Markdown, following the type's spec"),
  },
  async ({ projectId, type, title, content }) =>
    ok(await api(`/api/mcp/projects/${projectId}/documents`, { method: "POST", body: { type, title, content } }))
);

server.tool(
  "update_document",
  "Replace a document's content with Markdown you generate. It lands as In Review — a human must approve it. Downstream documents are not flagged.",
  { documentId: z.string(), content: z.string() },
  async ({ documentId, content }) =>
    ok(await api(`/api/mcp/documents/${documentId}`, { method: "POST", body: { content } }))
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[doc-pipe] MCP bridge connected to ${BASE}`);
