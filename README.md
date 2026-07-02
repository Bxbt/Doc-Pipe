# Doc-Pipe — Project Document Pipeline

Connect every project document into one **living pipeline**. Change a requirement and
instantly see which downstream documents (SRS → User Story → API → Test Case → UAT → Release)
go out of date. No more drifting docs.

> Built end-to-end **by prompting AI only** — no code written by hand — for a Friday Sharing.
> The application itself contains **no AI at runtime**; every "smart" feature (impact analysis,
> traceability, project health, smart checklist) is deterministic logic over a single
> document dependency graph.

---

## ✨ Features

| Feature | What it does |
| --- | --- |
| **Dashboard** | Active projects, total/outdated/pending documents, recent activity, missing docs |
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
| **Document Editor** | **Notion-style block editor** (BlockNote) — headings, tables, checklists, **Mermaid diagrams**, code blocks, plus **text colour, highlight, underline, and text/image alignment**; versioning, copy, export |
| **Attachments** | Upload images / PDF / Word / Excel / CSV / zip (≤10 MB); inline preview for images & PDF. Browse, paste, or drag images straight into a document |
| **Export project** | Bundle every document (in pipeline order) into one self-contained HTML file — cover page, team, table of contents, and each document with its status/version. Markdown is rendered to HTML and **Mermaid diagrams render as real diagrams** (not source). Download the `.html` or **Save as PDF** via the browser's print dialog (print-optimised, one document per page) |
| **Document Library** | Editable catalogue of reusable documents (create / edit / delete) edited with the same block editor; new project documents draw starter content from it, and Business Type pickers list from it |
| **Custom inputs** | App-wide styled dropdowns and a calendar date picker (portal-based, theme-aware) |
| **Edit lock** | One person edits a document at a time; others see a "being edited" modal and can't enter. Stale locks (no heartbeat for 90s) auto-release so a closed tab never deadlocks; admins can force-unlock |
| **Roles** | Admin · Editor · Reviewer · Viewer (authorization enforced server-side) |
| **Project meta** | Customer, business type, status, start/end dates |
| **Search** | Global search across projects and documents |
| **Audit log** | Activity feed; entries survive even after a project is deleted |

## 🧱 Tech Stack

- **Next.js 14** (App Router, Server Actions + Route Handlers) + **React 18** + **TypeScript**
- **Tailwind CSS** (dark mode by default)
- **Prisma** ORM + **SQLite** in **WAL mode** with indexed foreign keys — comfortably
  handles ~10–50 concurrent users (single file, zero external DB to run)
- **BlockNote** block editor — saves content as **HTML** so rich formatting
  (colour, underline, alignment, image size) persists; legacy Markdown documents
  still load. The view renders HTML through `rehype-raw` + `rehype-sanitize`
- **Mermaid** for diagrams (lazy-loaded client-side)
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
        {"name":"ADMIN_EMAILS","value":"<admin-email>"},
        {"name":"SEED_ON_EMPTY","value":"true"},
        {"name":"TUNNEL_TOKEN","value":"<tunnel-token>"}]}'
```

> **Build note:** Apple Silicon and Oracle Ampere are both `arm64`. To build on x86 for ARM:
> `docker buildx build --platform linux/arm64`.

### 4. Backups
The `pipeline-data` volume holds both the SQLite DB (`/data/app.db`) and uploaded
attachments (`/data/uploads`). Back up the whole volume:

```bash
docker run --rm -v pipeline-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/doc-pipe-$(date +%F).tar.gz -C /data .
```

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
