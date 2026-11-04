# Internal Learning Platform

Employees sign in with their company email, enroll in courses, watch each course's videos, then take the course's assessment. Admins build courses, assign them and track results.

| Path | What |
|---|---|
| `architecture.md` | The design and source of truth |
| `AGENTS.md` | Rules for AI agents and commits (read before any task) |
| `progress.md` | Log of every change, newest first |
| `web/` | React + Vite + TypeScript frontend |
| `server/` | The API (Hono); `api/index.ts` runs it on Vercel |
| `supabase/migrations/` | Database schema, RLS and functions |

## Local setup

```bash
supabase start                 # local Postgres on port 54322 (needs the Supabase CLI and Docker)
cp .env.example .env           # local API settings; never commit .env
npm install && npm run dev:api # API on http://localhost:8787/api
cd web && npm install && npm run dev   # site on http://localhost:5173
```

Locally, sign in with **Test sign-in** using any `@transfunnel.com` address. Real sign-in (WorkOS) only works on the production URL.
