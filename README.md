# Internal Assessment Tool

Admins create multiple-choice assessments, upload employees, and email each one a personal link. Employees take the assessment without logging in and see only their score and pass/fail.

| Path | What |
|---|---|
| `architecture.md` | The design and source of truth |
| `AGENTS.md` | Rules for AI agents and commits (read before any task) |
| `progress.md` | Log of every change, newest first |
| `web/` | React + Vite + TypeScript frontend |
| `supabase/` | Migrations and the `admin` / `employee` Edge Functions |

## Local setup

```bash
cd web && cp .env.example .env.local && npm install && npm run dev
supabase start                 # local Postgres + functions (needs the Supabase CLI and Docker)
supabase functions serve --env-file supabase/functions/.env
```
