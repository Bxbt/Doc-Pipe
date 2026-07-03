# Doc-Pipe MCP bridge

Let your **own** Claude (or ChatGPT) read and draft documents in Doc-Pipe. The
AI runs on your side using your subscription — this bridge just exposes Doc-Pipe
as MCP tools, authenticated by a personal access token. Doc-Pipe never holds an
AI key.

> **Most people don't need this.** If Doc-Pipe is deployed, the easiest path is
> the **remote connector**: in Claude → Connectors → *Add custom connector*,
> paste `https://<host>/mcp/<your dp_ token>` and click Add — nothing to install.
> This local bridge is only for running Doc-Pipe on `localhost` or wiring a
> client that needs stdio.

## 1. Get a token

In Doc-Pipe: **user menu → Access tokens → Generate token**. Copy it (shown once).

## 2. Install

```bash
cd mcp-bridge
npm install
```

## 3. Add it to Claude Desktop

Edit the MCP config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "doc-pipe": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-bridge/index.mjs"],
      "env": {
        "DOCPIPE_URL": "http://localhost:3000",
        "DOCPIPE_TOKEN": "dp_your_token_here"
      }
    }
  }
}
```

Use your deployed URL (e.g. `https://doc-pipe.bboybezz.xyz`) instead of
`localhost:3000` to work against the live instance. Restart Claude Desktop.

## 4. Use it

Ask Claude naturally, e.g.:

> Read the Business Requirement of the "Doc-Pipe" project and draft the SRS,
> following its type spec. Save it as an In Review draft.

## Tools

| Tool | Purpose |
| --- | --- |
| `list_projects` | Discover projects |
| `get_project` | List a project's documents |
| `get_document` | Read a document + its upstream context + type spec |
| `list_doc_types` | Document types and their authoring specs |
| `list_business_types` | Business types and the pipeline each scaffolds |
| `create_document` | Create a document (lands as **Draft**) |
| `update_document` | Replace a document's content (lands as **In Review**) |
| `create_project` | Create a project (scaffolds its pipeline as Drafts) |
| `update_project` | Update a project's metadata |

## Safety

- The token carries **your role** — a Viewer's token can only read.
- AI writes always land as **Draft / In Review**; a human approves them. Nothing
  is auto-approved and downstream documents are never auto-flagged.
- A document locked by someone editing it in the app cannot be overwritten.
- Revoke a token anytime in **Settings**.
