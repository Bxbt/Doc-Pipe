# Project Document Pipeline

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
| **Document Pipeline** | Every project's documents shown as a connected, ordered pipeline |
| **Dependency Graph** ⭐ | Click any document → all downstream documents light up. The hero feature. |
| **Impact Analysis** | "Mark as changed" → every downstream document is flagged **Outdated** automatically |
| **Traceability Matrix** | For each requirement, see which SRS / User Story / API / Test / UAT it traces to |
| **Project Health** | Completion % overall and per phase (Requirement → Design → API → Testing → Release) |
| **Smart Checklist** | Recommended documents per business type (E-Commerce, HR, Banking, …) |
| **Document Editor** | Markdown editing, versioning, copy, export `.md`, review/approve workflow |
| **Roles** | Admin · Editor · Reviewer · Viewer (authorization enforced server-side) |
| **Search** | Global search across projects and documents |
| **Templates** | Built-in starters for BR, FR, SRS, BOI SRS, User Story, API, Test, UAT, Rollback, … |

## 🧱 Tech Stack

- **Next.js 14** (App Router, Server Actions) + **React 18** + **TypeScript**
- **Tailwind CSS** (dark mode by default)
- **Prisma** ORM + **SQLite** (single file, zero external DB to run)
- **Docker** + **Cloudflare Tunnel** + **Cloudflare Access** for production

Authentication is **delegated to Cloudflare Access** — the app reads the verified
`Cf-Access-Authenticated-User-Email` header, so there is no password code to maintain.

---

## 🚀 Run locally

```bash
npm install
npm run db:reset      # create SQLite schema + seed the demo project
npm run dev           # http://localhost:3000
```

Locally there is no Cloudflare header, so the app signs you in as `DEV_EMAIL` from `.env`.
Change `DEV_EMAIL` to test different users/roles. Emails in `ADMIN_EMAILS` are always Admin.

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

### 1. Create a Cloudflare Tunnel
1. Cloudflare dashboard → **Zero Trust → Networks → Tunnels → Create a tunnel** (type *Cloudflared*).
2. Add a **Public Hostname**: `pipeline.bboybezz.xyz` → Service `HTTP` → `http://app:3000`.
3. Copy the **tunnel token**.

### 2. Gate it with Cloudflare Access (this is your login)
1. Zero Trust → **Access → Applications → Add an application** (Self-hosted).
2. Application domain: `pipeline.bboybezz.xyz`.
3. Add a policy → Action **Allow** → Include **Emails** = your team's emails
   (e.g. `na.thanabodee@gmail.com`). Use Google as the login method.

Now only approved emails can reach the app, and the app receives their verified email.

### 3. Deploy the stack in Portainer
1. **Stacks → Add stack**, paste `docker-compose.yml`.
2. Set environment variables:
   - `TUNNEL_TOKEN` = the token from step 1
   - `ADMIN_EMAILS` = `na.thanabodee@gmail.com` (comma-separated for more)
   - `SEED_ON_EMPTY` = `true` (seeds the demo once; never overwrites later)
3. Deploy. Portainer builds the image (arm64 on Ampere) and starts `app` + `cloudflared`.

Visit **https://pipeline.bboybezz.xyz** → Cloudflare Access login → you're in as Admin.

> **Build note:** Apple Silicon and Oracle Ampere are both `arm64`, so building locally and
> pushing, or building on the server, produces the correct Prisma engine. If you ever build on
> x86 for an ARM target, use `docker buildx build --platform linux/arm64`.

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
  schema.prisma        # User, Project, Document, DocumentDependency, …
  seed.ts              # demo project "Meeting Room Booking System"
src/
  app/                 # routes: dashboard, projects, documents, team, search, templates
  components/          # DependencyGraph (hero), ProjectWorkspace, DocumentDetail, …
  lib/
    graph.ts           # pure downstream/upstream traversal — powers impact + traceability
    actions.ts         # server actions: markChanged, saveDocument, setStatus, …
    auth.ts            # Cloudflare Access identity + role checks
    queries.ts         # health, missing docs, dashboard aggregation
    constants.ts       # document types, statuses, roles, smart checklists
Dockerfile
docker-compose.yml     # app + cloudflared
```

## 🧠 How the "smart" features work (no AI)

Everything derives from one directed graph where **`target` depends on `source`**:

- **Impact analysis** = downstream traversal from the changed node → mark each `Outdated`.
- **Traceability** = for each requirement, which downstream types are reachable.
- **Project health** = share of `Approved` documents, grouped by phase.

See `src/lib/graph.ts` — about 40 lines of plain TypeScript.
