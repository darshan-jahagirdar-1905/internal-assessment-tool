# Progress

Every change to this repo gets one row here, newest first, in the same commit as the change. Format and rules: `AGENTS.md` section 7.

## Log

| Date | Who | Area | What changed |
|---|---|---|---|
| 2026-11-04 | Darshan | docs | Allowed sign-in domain set to transfunnel.com, approved packages listed, test sign-in described as header-only, and seed data marked local-only so it never reaches the hosted database |
| 2026-11-03 | Darshan | docs | Sign-in decided: WorkOS AuthKit with 6-digit email codes (no DNS needed), company domains only, encrypted session cookie; sign-in routes, environment variables, WorkOS dashboard setup and security checks documented. Next: API scaffold |
| 2026-11-02 | Darshan | docs | Design rewritten for the learning platform: sign-in with company accounts (method on hold, test sign-in on previews until then), course catalog and enrollment, YouTube videos watched to 80% in order, one assessment per course with score-only results, admin course builder and tracking. Next: API scaffold |
| 2026-10-28 | Darshan | docs | Backend moves from Supabase Edge Functions to a portable Node + TypeScript API (Hono) on Vercel, with Supabase used only as Postgres; all server secrets now live in Vercel and the frontend needs no env vars. Next: API scaffold PR replaces the Deno function stubs |
| 2026-10-16 | Darshan | docs | Team rules updated: PRs are squash-merged with one progress row per PR, branch conflicts are fixed by merging main (no rebase of pushed branches), hosted deploys happen only from main and anyone can do them, PRs touching migrations, tokens/auth or the employee function need a second approval, and the admin function is split into a router plus admin/routes/ handlers |
| 2026-10-15 | Darshan | setup | Repo scaffolded: React + Vite + TS app in web/ with /admin and /t/:token placeholder routes and API wrappers, Supabase project with empty admin and employee function stubs, .gitignore and .env.example files. Next: schema and RLS migration |
| 2026-10-15 | Team | docs | Added architecture.md, AGENTS.md, CLAUDE.md and progress.md. Next: scaffold the repo and run the schema and RLS migration |
