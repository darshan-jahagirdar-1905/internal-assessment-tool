# Internal Learning Platform

Employees sign in with their company email (WorkOS sends a 6-digit code), enroll in courses and work through each course as a path of levels: a level's videos, then a short quiz that must be answered fully right to unlock the next level, then a final test that gives their score. Admins build courses (with an import box for question lists), assign them by email and track results.

Live at https://internal-assessment-tool.vercel.app. Status and next steps: `architecture.md` section 13.

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
