# Doc-Pipe — Project Document Pipeline

Connect every project document into one **living pipeline**. Change a requirement and
instantly see which downstream documents (SRS → User Story → API → Test Case → UAT → Release)
go out of date. No more drifting docs.

> Built end-to-end **by prompting AI only** — no code written by hand — for a Friday Sharing.
> The app **runs no AI itself and holds no AI key**; every "smart" feature (impact analysis,
> traceability, project health, smart checklist) is deterministic logic over a single
> document dependency graph. Optionally, connect **your own** Claude/ChatGPT to read and draft
> documents via [MCP](#-ai-drafting-via-mcp) — the AI runs on your side, not ours.

---

## ✨ Features

| Feature | What it does |
| --- | --- |
| **Dashboard** | Active projects, total/outdated/pending documents, recent activity, missing docs; **Project Progress** is ordered by most recent document activity (latest edit first) |
| **Document Pipeline** | A project's documents as a connected pipeline; reorder with ↑/↓ |
| **Dependency Graph** ⭐ | Click a document → all downstream documents light up. The hero feature. |
| **Impact Analysis** | Editing an **Approved** document — or clicking "Mark as changed" — flags every downstream document **Outdated** automatically |
| **Auto status flow** | Saving edits moves status without manual steps: **Approved → InReview** (edit undoes approval), **Outdated → InReview** (the edit reconciles it); Draft/InReview stay. A save with no real change is a no-op (no version bump, no ripple) |
| **Minor edit** | Tick "Minor edit" when saving a typo/formatting fix: patch-version bump (v1.0 → v1.0.1), status untouched, and **downstream is not flagged** — so trivial changes don't cascade |
| **Bulk status** | Multi-select documents in the pipeline and set their status in one action; picking "In Review" clears the Outdated flag, reconciling over-flagged documents together |
| **Edit dependencies** | Add/remove links between documents from the graph or the document view (cycle-protected) |
| **Traceability Matrix** | For each requirement, see which SRS / User Story / API / Test / UAT it traces to |
| **Project Health** | Completion % overall and per phase (Requirement → Design → API → Testing → Release) |
| **Business Types** | Editable per-type "generate pipeline" (which documents + dependencies get scaffolded); the document choices come from the Document Library |
| **Smart Checklist** | Recommended documents per business type |
| **Document Editor** | **Notion-style block editor** (BlockNote) — headings, tables (drag to resize columns), checklists, **Mermaid diagrams**, code blocks, plus **text colour, highlight, underline, and text/image alignment**; versioning, copy, export |
| **In-document navigation** | A **pipeline rail** in the document view jumps to any sibling document without leaving (scroll position follows the current doc); editing **dims the surroundings** to keep focus on the document; a **Normal / Export size** toggle previews the compact Word table size on screen |
| **Version compare** | Every save snapshots the document; the **History** button diffs any two versions word-by-word (Markdown and HTML versions are normalised first). View as **inline** tracked-changes (added green, removed struck-through) or **side by side** — both from one diff, toggled by CSS. **Restore** loads an old version back into the editor to review and save (a normal save — so it bumps a version and ripples downstream; never a silent overwrite) |
| **Comments** | Threaded comments on a document — **doc-level** in the sidebar panel or **inline** (hover a paragraph in the read view to anchor a comment to that block). Reply, **resolve/reopen** (like Notion), edit/delete your own (Admins any), hide/show resolved, and an unresolved-count badge on each document card. Anchored threads re-attach by text snippet so they survive edits; anyone signed in (Viewers included) can comment |
| **Attachments** | Upload images / PDF / Word / Excel / CSV / zip (≤10 MB); inline preview for images & PDF. Browse, paste, or drag images straight into a document |
| **Export project** | Bundle every document (in pipeline order) into one self-contained HTML file — cover page, team, table of contents, and each document with its status/version. Markdown is rendered to HTML and **Mermaid diagrams render as real diagrams** (not source). Download the `.html` or **Save as PDF** via the browser's print dialog (print-optimised, one document per page) |
| **Word export** | **Word (BOI)** — fills the real BOI SRS Word template (cover, header/logo, footer, fonts, 16 section headings) with each pipeline document, matched by doc type, via docxtemplater. **Mermaid diagrams render as real images** (the browser rasterises each chart at export time and posts them to the route, so diagrams — not source — reach the `.docx`), and the project's **"Logo" library document is placed on the cover beside our own logo**. Injected content is normalised to the Thai document look — body paragraphs get `thaiDistribute` justification + a first-line indent (a **note** paragraph — starting with "หมายเหตุ" — stays flush-left), H2/H3 subheadings are bold at body size with space above and auto (black) colour, bullet/numbered items also justify `thaiDistribute`, every run is tagged complex-script (`<w:cs/>`, TH Sarabun New) so Thai wraps mid-word and **bold shows on Thai** (`<w:bCs/>` mirrors `<w:b/>`), and the whole document is single (1.0) line spacing. A **document revision-history table** is rendered near the front with a page break after it (so the first section always starts a fresh page). **Tables** get the house look — navy `#0A1C4A` header row with white text, `#AAAAAA` ½-pt borders on every edge, 16.51 cm preferred width, 0.1 cm cell padding, left-aligned cell text, and the header row repeats at the top of each page it spans. Cell text is **12pt** (the page body stays 16pt) with **always-bold header** cells (body cells keep their own bold), and list **bullet glyphs are 12pt** too. **Per-column widths carry over from the editor**: drag a column border in BlockNote and its `<colgroup>` widths become the Word column widths, normalised to the 16.51 cm table under a fixed layout (un-resized tables stay auto-distributed). The exported filename is `{Export file name || project name}_YYMMDD.docx` (date in Asia/Bangkok; the per-project **Export file name** is set in project Settings, so a Thai-named project can get a clean ASCII filename). The template lives in `public/boi/` (see `scripts/tag-boi-template.py` to regenerate the tagged template) |
| **Document Library** | Editable catalogue of reusable documents (create / edit / delete) edited with the same block editor; new project documents draw starter content from it, and Business Type pickers list from it. Names in any language (e.g. Thai) carry through to the project as the document's title |
| **Custom inputs** | App-wide styled dropdowns (with a built-in search filter on long lists) and a calendar date picker (portal-based, theme-aware) |
| **Edit lock** | One person edits a document at a time; others see a "being edited" modal and can't enter. Stale locks (no heartbeat for 90s) auto-release so a closed tab never deadlocks; admins can force-unlock |
| **AI drafting (MCP)** | Connect your **own** Claude/ChatGPT to read & draft documents via [MCP](#-ai-drafting-via-mcp) — a hosted remote connector (paste a URL) or a local bridge. Doc-Pipe never holds an AI key; AI writes land as **Draft / In Review** for a human to approve |
| **Access tokens** | Per-user personal access tokens (`dp_…`, SHA-256 hashed, role-scoped, revocable) in the user menu → *Access tokens*, used to authenticate MCP clients |
| **Profile** | Edit your display name from the user menu → *Profile* |
| **Roles** | Admin · Editor · Reviewer · Viewer (authorization enforced server-side) |
| **Project meta** | Customer, business type, status, start/end dates |
| **Search** | Global search across projects and documents, **debounced live** from the top bar as you type |
| **Audit log** | Activity feed; each entry **links to the document** it concerns (or its project) and shows the project name. Shows the latest 10 with a show-more toggle (up to 50); entries survive even after a project is deleted |

## 🧱 Tech Stack

- **Next.js 14** (App Router, Server Actions + Route Handlers) + **React 18** + **TypeScript**
- **Tailwind CSS** (dark mode by default)
- **Prisma** ORM + **SQLite** in **WAL mode** with indexed foreign keys — comfortably
  handles ~10–50 concurrent users (single file, zero external DB to run)
- **BlockNote** block editor — saves content as **HTML** so rich formatting
  (colour, underline, alignment, image size) persists; legacy Markdown documents
  still load. The view renders HTML through `rehype-raw` + `rehype-sanitize`
- **Mermaid** for diagrams (lazy-loaded client-side)
- **Model Context Protocol** (`@modelcontextprotocol/sdk`) — a remote Streamable-HTTP
  connector plus a local stdio bridge so a user's own AI can read and draft documents
- **Docker** + **Cloudflare Tunnel** + **Cloudflare Access** for production

Authentication is **delegated to Cloudflare Access** — the app reads the verified
`Cf-Access-Authenticated-User-Email` header, so there is no password code to maintain.
The app only handles **authorization** (roles).

---

## 🚀 Run locally

```bash
npm install
npm run db:reset      # create SQLite schema + seed the demo project
npm run dev           # http://localhost:3000
```

Locally there is no Cloudflare header, so the app signs you in as `DEV_EMAIL` from `.env`.
Change `DEV_EMAIL` to test different users/roles. Emails in `ADMIN_EMAILS` are always Admin.

### Environment variables

| Var | Purpose | Default |
| --- | --- | --- |
| `DATABASE_URL` | SQLite file location | `file:./dev.db` (prod: `file:/data/app.db`) |
| `UPLOAD_DIR` | Where attachments are stored | derived from `DATABASE_URL` dir (prod: `/data/uploads`) |
| `ADMIN_EMAILS` | Comma-separated emails always treated as Admin | — |
| `DEV_EMAIL` | Local-only signed-in identity (ignored behind Cloudflare Access) | `dev@localhost` |
| `SEED_ON_EMPTY` | Seed demo data once on an empty DB | `true` |

### Useful scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start dev server |
| `npm run build` | Production build (`prisma generate && next build`) |
| `npm run db:push` | Apply schema to SQLite |
| `npm run db:seed` | Seed demo data (wipes first) |
| `npm run db:reset` | Reset schema + reseed (clean demo state) |

---

## 🐳 Deploy on Oracle Cloud (ARM) with Portainer + Cloudflare

This stack opens **no inbound ports** on the server — Cloudflare Tunnel dials out.
The container entrypoint runs `prisma db push` on every boot, so schema changes apply
automatically, and seeds the demo **once** (a `/data/.seeded` marker prevents re-seeding,
and existing data is never overwritten).

### 1. Create a Cloudflare Tunnel
1. Cloudflare dashboard → **Zero Trust → Networks → Tunnels → Create a tunnel** (type *Cloudflared*).
2. Add a **Public Hostname**: `<your-domain>` → Service `HTTP` → `http://app:3000`.
3. Copy the **tunnel token**.

### 2. Gate it with Cloudflare Access (this is your login)
1. Zero Trust → **Access → Applications → Add an application** (Self-hosted).
2. Application domain: `<your-domain>`.
3. Add a policy → Action **Allow** → Include **Emails** = your team's emails. Use Google login.

### 3. Deploy the stack in Portainer
Deploy `docker-compose.yml` (App from **Repository** `Bxbt/Doc-Pipe`, or paste the file),
with environment variables:

- `TUNNEL_TOKEN` = the tunnel token from step 1
- `ADMIN_EMAILS` = your admin email(s), comma-separated
- `SEED_ON_EMPTY` = `true`

Portainer builds the arm64 image and starts `app` + `cloudflared`.

**Redeploy after a push** (pulls the latest commit + rebuilds) via the Portainer API:

```bash
curl -sk -X PUT "https://<portainer-host>/api/stacks/<stack-id>/git/redeploy?endpointId=<endpoint-id>" \
  -H "X-API-Key: <portainer-token>" -H "Content-Type: application/json" \
  -d '{"RepositoryReferenceName":"refs/heads/main","Env":[
        {"name":"POSTGRES_PASSWORD","value":"<db-password>"},
        {"name":"ADMIN_EMAILS","value":"<admin-email>"},
        {"name":"SEED_ON_EMPTY","value":"true"},
        {"name":"TUNNEL_TOKEN","value":"<tunnel-token>"}]}'
```

> **Build note:** Apple Silicon and Oracle Ampere are both `arm64`. To build on x86 for ARM:
> `docker buildx build --platform linux/arm64`.

### 4. Backups
Data lives in **two** places now: the **Postgres** database (volume `pg-data`)
and uploaded **attachments** on `pipeline-data` (`/data/uploads`). Back up both.

Database — `pg_dump` from the Postgres container:
```bash
docker exec doc-pipeline-db pg_dump -U docpipe docpipe \
  | gzip > doc-pipe-db-$(date +%F).sql.gz
```

Attachments — tar the uploads volume:
```bash
docker run --rm -v pipeline-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/doc-pipe-uploads-$(date +%F).tar.gz -C /data uploads
```

### Migrating from the old SQLite database
A one-shot copy script moves an existing SQLite DB into Postgres, preserving ids
and timestamps (so FKs, MCP tokens, and attachment references keep working):
```bash
SQLITE_URL="file:/path/to/app.db" \
DATABASE_URL="postgresql://…" DIRECT_URL="postgresql://…" \
npm run db:migrate-from-sqlite
```
It wipes the target first (safe to re-run for dry-runs) and verifies row counts.
See `prisma/sqlite-to-pg.ts` + `prisma/sqlite.prisma` (delete both once migrated).

---

## 🗂️ Project structure

```
prisma/
  schema.prisma          # User, Project, Document, DocumentDependency, Template,
                         #   BusinessType, Attachment, DocumentVersion, Comment, Activity
  demo-content.ts        # demo project content — Doc-Pipe documenting itself
  seed.ts                # fresh-install seed (users + demo project)
  replace-meeting.ts     # idempotent migration: swap old mock demo for Doc-Pipe
  seed-if-empty.ts       # one-time seed guarded by a /data/.seeded marker
src/
  app/
    (pages)              # dashboard, projects, documents, business-types, templates, team, search
    projects/[id]/export # route handler: whole-project HTML bundle (download / print-to-PDF)
    api/                 # route handlers: attachment upload + download/serve
  components/            # DependencyGraph (hero), ProjectWorkspace, DocumentDetail,
                         #   BlockEditor, Mermaid, AttachmentPanel, TemplatesManager, BusinessTypesManager, …
  lib/
    graph.ts             # pure downstream/upstream traversal — powers impact + traceability
    actions.ts           # server actions (markChanged, scaffoldPipeline, reorderDocument, …)
    auth.ts              # Cloudflare Access identity + role checks
    queries.ts           # health, missing docs, dashboard aggregation
    business-types.ts    # business-type pipeline definitions (DB-backed, auto-seeded)
    templates-db.ts      # editable template library (DB-backed, auto-seeded)
    storage.ts           # attachment storage (filesystem on the volume) — server only
    constants.ts         # document types, statuses, roles, smart checklists, standard pipeline
Dockerfile
docker-compose.yml       # app + cloudflared
docker-entrypoint.sh     # prisma db push → seed-once → next start
```

## 🧠 How the "smart" features work (no AI)

Everything derives from one directed graph where **`target` depends on `source`**:

- **Impact analysis** = downstream traversal from the changed node → mark each `Outdated`.
- **Traceability** = for each requirement, which downstream types are reachable.
- **Project health** = share of `Approved` documents, grouped by phase.

See `src/lib/graph.ts` — about 40 lines of plain TypeScript.

## 🤖 AI drafting via MCP

Doc-Pipe exposes its documents to **your own** Claude or ChatGPT through the
[Model Context Protocol](https://modelcontextprotocol.io). The AI runs on your
side (your subscription); Doc-Pipe never holds an AI key. Every request is
authenticated by a **personal access token** you create in the app
(user menu → **Access tokens**), so it carries your role — a Viewer's token can
only read. AI writes always land as **Draft / In Review** for a human to
approve, respect the edit lock, and never auto-flag downstream documents.

The AI is grounded before it writes: `get_document` returns the target plus the
full content of everything **upstream** of it, plus a per-type authoring spec
(`src/lib/doc-type-specs.ts`) so output is consistent per document type.

**Tools:** `list_projects`, `get_project`, `get_document`, `list_doc_types`,
`list_business_types`, `create_document` (→ Draft), `update_document`
(→ In Review), `create_project` (scaffolds the pipeline), `update_project`
(metadata), `reorder_pipeline`, `link_documents` / `unlink_documents`
(edit the dependency graph, cycle-protected). No delete and no approve via
MCP — those stay in human hands.

### Option A — Remote connector (no install) ⭐

Best for teaching non-technical users. In **Claude → Settings → Connectors →
Add custom connector**:

| Field | Value |
| --- | --- |
| **Name** | `Doc-Pipe` |
| **Remote MCP server URL** | `https://<your-host>/mcp/<your dp_ token>` |
| OAuth Client ID / Secret | leave blank |

Click **Add** — the six tools appear. The token in the URL *is* the auth, so
treat that URL as a secret; revoke the token to cut access. The endpoint speaks
the MCP **Streamable HTTP** transport (`src/app/mcp/[token]/route.ts`).

> If the site is behind Cloudflare Access, add a **bypass** policy for the path
> `/mcp/*` so the connector can reach it (the token still gates every call).

### Option B — Local bridge (Claude Desktop)

A stdio bridge you run beside Claude Desktop — see
[`mcp-bridge/README.md`](mcp-bridge/README.md).
