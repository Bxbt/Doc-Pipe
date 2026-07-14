import { userFromToken } from "@/lib/tokens";
import { DOC_TYPES } from "@/lib/constants";
import { specForType } from "@/lib/doc-type-specs";
import {
  listProjects,
  getProject,
  getDocument,
  createDocument,
  updateDocument,
  listBusinessTypes,
  createProject,
  updateProject,
  linkDocuments,
  unlinkDocuments,
  reorderPipeline,
} from "@/lib/mcp";
import type { CurrentUser } from "@/lib/auth";

// Remote MCP endpoint (Streamable HTTP transport). This is what Claude's
// "Add custom connector" dialog talks to: users just paste the URL, no install.
//
//   https://<host>/mcp/<dp_ token>
//
// The personal access token lives in the URL path because the connector dialog
// only accepts a URL (+ optional OAuth). It carries the caller's role, so the
// same permission checks as the web app apply. We run stateless: every JSON-RPC
// request gets a single application/json response — no sessions, no SSE stream.
export const dynamic = "force-dynamic";

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "doc-pipe", version: "0.1.0" };

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version",
};

// Tool catalogue advertised to the client (JSON Schema for inputs).
const TOOLS = [
  {
    name: "list_projects",
    description:
      "List all Doc-Pipe projects (id, name, customer, business type, document count).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_project",
    description:
      "Get a project and its documents (each with id, type, title, status, version).",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
  },
  {
    name: "get_document",
    description:
      "Get a document's content plus the content of every document upstream of it (for grounding) and the authoring spec for its type. Use this before drafting.",
    inputSchema: {
      type: "object",
      properties: { documentId: { type: "string" } },
      required: ["documentId"],
    },
  },
  {
    name: "list_doc_types",
    description:
      "List document types and their authoring specs (required format/conditions). Use before create_document.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_business_types",
    description:
      "List available business types and the document pipeline each one scaffolds. Use before create_project to pick a valid businessType.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "create_project",
    description:
      "Create a new project. By default it scaffolds the business type's document pipeline (documents + dependencies) as Drafts for you to fill in with update_document.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        businessType: {
          type: "string",
          description: "A name from list_business_types, e.g. 'Web Application'",
        },
        customer: { type: "string" },
        description: { type: "string" },
        scaffold: {
          type: "boolean",
          description: "Scaffold the pipeline documents (default true). Set false for an empty project.",
        },
      },
      required: ["name", "businessType"],
    },
  },
  {
    name: "update_project",
    description:
      "Update a project's metadata (name, customer, businessType, description, status). Only the fields you provide change. Cannot delete a project.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        name: { type: "string" },
        customer: { type: "string" },
        businessType: { type: "string" },
        description: { type: "string" },
        status: { type: "string", description: "e.g. Active, On Hold, Completed" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "create_document",
    description:
      "Create a new document in a project from Markdown you generate. It lands as a Draft for a human to review.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        type: {
          type: "string",
          description: "A document type key from list_doc_types, e.g. SRS",
        },
        title: { type: "string" },
        content: {
          type: "string",
          description: "Document body in Markdown, following the type's spec",
        },
      },
      required: ["projectId", "type", "content"],
    },
  },
  {
    name: "update_document",
    description:
      "Replace a document's content with Markdown you generate. It lands as In Review — a human must approve it. Downstream documents are not flagged.",
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string" },
        content: { type: "string" },
      },
      required: ["documentId", "content"],
    },
  },
  {
    name: "reorder_pipeline",
    description:
      "Set the order of documents in a project's pipeline. Pass the document ids in the order you want (first = top). Omitted documents keep their current order after the listed ones.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        orderedDocumentIds: {
          type: "array",
          items: { type: "string" },
          description: "Document ids, top to bottom",
        },
      },
      required: ["projectId", "orderedDocumentIds"],
    },
  },
  {
    name: "link_documents",
    description:
      "Add a dependency: targetId depends on sourceId (source is upstream of target). Rejected if it would create a circular dependency. Does not flag downstream documents.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        sourceId: { type: "string", description: "The upstream document" },
        targetId: { type: "string", description: "The downstream document that depends on source" },
      },
      required: ["projectId", "sourceId", "targetId"],
    },
  },
  {
    name: "unlink_documents",
    description:
      "Remove a dependency edge (targetId no longer depends on sourceId).",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        sourceId: { type: "string" },
        targetId: { type: "string" },
      },
      required: ["projectId", "sourceId", "targetId"],
    },
  },
];

async function callTool(
  user: CurrentUser,
  name: string,
  args: Record<string, any>
): Promise<unknown> {
  switch (name) {
    case "list_projects":
      return listProjects();
    case "get_project": {
      const p = await getProject(args.projectId);
      if (!p) throw new Error("Project not found.");
      return p;
    }
    case "get_document": {
      const d = await getDocument(args.documentId);
      if (!d) throw new Error("Document not found.");
      return d;
    }
    case "list_doc_types":
      return DOC_TYPES.map((d) => ({
        type: d.type,
        label: d.label,
        spec: specForType(d.type),
      }));
    case "list_business_types":
      return listBusinessTypes();
    case "create_project":
      return createProject(user, {
        name: args.name,
        businessType: args.businessType,
        customer: args.customer,
        description: args.description,
        scaffold: args.scaffold,
      });
    case "update_project":
      return updateProject(user, args.projectId, {
        name: args.name,
        customer: args.customer,
        businessType: args.businessType,
        description: args.description,
        status: args.status,
      });
    case "create_document":
      return createDocument(
        user,
        args.projectId,
        args.type,
        args.title ?? "",
        args.content
      );
    case "update_document":
      return updateDocument(user, args.documentId, args.content);
    case "reorder_pipeline":
      return reorderPipeline(user, args.projectId, args.orderedDocumentIds ?? []);
    case "link_documents":
      return linkDocuments(user, args.projectId, args.sourceId, args.targetId);
    case "unlink_documents":
      return unlinkDocuments(user, args.projectId, args.sourceId, args.targetId);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

type JsonRpc = { jsonrpc: "2.0"; id?: string | number | null; method?: string; params?: any };

const rpcResult = (id: any, result: unknown) => ({ jsonrpc: "2.0" as const, id, result });
const rpcError = (id: any, code: number, message: string) => ({
  jsonrpc: "2.0" as const,
  id: id ?? null,
  error: { code, message },
});

// Handle one JSON-RPC message. Returns a response object, or null for
// notifications (which get no reply).
async function handleMessage(user: CurrentUser, msg: JsonRpc) {
  const { id, method, params } = msg;

  switch (method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, { tools: TOOLS });

    case "tools/call": {
      const name = params?.name as string;
      const args = (params?.arguments ?? {}) as Record<string, any>;
      try {
        const data = await callTool(user, name, args);
        const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
        return rpcResult(id, { content: [{ type: "text", text }] });
      } catch (e: any) {
        return rpcResult(id, {
          content: [{ type: "text", text: `Error: ${e?.message ?? String(e)}` }],
          isError: true,
        });
      }
    }

    // We don't offer resources/prompts, but answer the discovery calls cleanly.
    case "resources/list":
      return rpcResult(id, { resources: [] });
    case "prompts/list":
      return rpcResult(id, { prompts: [] });

    default:
      // Notifications (no id) get no response; unknown requests get an error.
      if (method?.startsWith("notifications/") || id === undefined || id === null) {
        return null;
      }
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

export async function POST(req: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const user = await userFromToken(params.token);
  if (!user) {
    return Response.json(rpcError(null, -32001, "Invalid access token"), {
      status: 401,
      headers: CORS,
    });
  }

  let body: JsonRpc | JsonRpc[];
  try {
    body = await req.json();
  } catch {
    return Response.json(rpcError(null, -32700, "Parse error"), {
      status: 400,
      headers: CORS,
    });
  }

  if (Array.isArray(body)) {
    const responses = (
      await Promise.all(body.map((m) => handleMessage(user, m)))
    ).filter((r) => r !== null);
    if (responses.length === 0) return new Response(null, { status: 202, headers: CORS });
    return Response.json(responses, { headers: CORS });
  }

  const res = await handleMessage(user, body);
  if (res === null) return new Response(null, { status: 202, headers: CORS });
  return Response.json(res, { headers: CORS });
}

// This endpoint doesn't offer a server-initiated SSE stream; POST-only.
export async function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: CORS });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
