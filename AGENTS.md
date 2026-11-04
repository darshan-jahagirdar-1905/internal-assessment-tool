# AGENTS.md

Instructions for any AI coding agent working in this repository. Read this whole file before starting any task.

> ## RULE 1: NEVER COMMIT OR PUSH WITHOUT ASKING FIRST
>
> Before **every** commit, stop and ask the person **who is committing** and whether to **commit and push, commit only, or change the message** (section 6). Then wait for their answer.
>
> This applies in **every** permission mode, including **Accept edits** and **Auto** in cloud sessions. Finishing a task never means committing it, even if the task says "finish", "ship it" or "push when done". If nobody answers, leave the changes uncommitted and say so.

---

## 1. Project

An internal learning platform (V1 pilot). Employees sign in, enroll in courses (or are assigned them), watch each course's videos to at least 80% in order, then take the course's assessment and see only their score. Admins build courses, assign them by email, and track progress and results.

The repo keeps **two docs**, and both must stay accurate:

| Doc | What it holds | When it changes |
|---|---|---|
| `architecture.md` | The design: scope, stack, database, RLS, endpoints, rules | Only when the design changes, and only after the person agrees (section 5) |
| `progress.md` | A log of every change: who did what, and when | In **every** commit (section 7) |

`architecture.md` is the source of truth. If a task conflicts with it or goes beyond it, stop and ask.

---

## 2. Team

Three people share this agent: **Darshan, Vidit and Shiva**.

- The person talking to you can change between tasks, even in the same session. Never assume who it is from earlier messages; ask at commit time (section 6).
- Roles change often. Work out what area someone is working on from the task they give you, and help with it. Don't question whether it's "their" area.
- If your change touches code another person changed recently (check `progress.md`), mention it before committing.

| Name | Git email |
|---|---|
| Darshan | darshanj@transfunnel.com |
| Vidit | |
| Shiva | |

If the committing person's email is blank, ask for it once and add it to this table as part of that commit.

---

## 3. Before starting any task

1. Run `git status`. If there are uncommitted changes you didn't make, leave them alone and mention them. Never discard, stash or overwrite someone else's work.
2. Make sure you start from the latest `main`: run `git fetch origin main`, and if `main` has moved, bring it in with `git pull --rebase origin main` (only your unpushed commits are replayed). If this fails because of uncommitted changes, tell the person instead of forcing it.
3. Read the latest entries in `progress.md`, so you know what changed recently.
4. Read the sections of `architecture.md` that relate to the task.

---

## 4. Hard rules (never break these)

1. **Never commit or push without asking first** (Rule 1 at the top of this file).
2. **Until V1 ships, commits are pushed straight to `main`, and only when the committing person says "commit and push"** (section 6). Every push to `main` deploys to production, so the checks must pass first. Never force push. After V1, the team goes back to branches and pull requests.
3. **RLS stays on every table, with no policies for public access.** The `anon` and `authenticated` roles get no table or function privileges.
4. **The browser never queries tables directly.** All data goes through the `/api` (learner) and `/api/admin` routes.
5. **`DATABASE_URL` and other server secrets are only in Vercel server environment variables.** Never in frontend code, never with a `VITE_` prefix, never committed.
6. **Learner routes never return `options.is_correct`, `answers.is_correct`, `answers.points_awarded`, `attempts.passed` or `courses.pass_percentage`.** Learners see only their score.
7. **Every learner query is scoped to the user returned by `getCurrentUser()`** (`server/lib/identity.ts`). The API never accepts a user id from the browser for learner routes.
8. **Every admin request checks that the signed-in user has `role = 'admin'` first.** Identity is worked out only in `server/lib/identity.ts`; sign-in uses WorkOS AuthKit (`architecture.md` section 4.3).
9. **Every new database function gets** `revoke execute ... from public, anon, authenticated`. The API connects as the owner role, so no grant is needed.
10. **Schema changes are new migration files.** Never edit a migration that has already been applied or committed.
11. **Secrets never go in the repo or in the cloud session's environment variables.** Server secrets (`DATABASE_URL`, `WORKOS_API_KEY`, `WORKOS_COOKIE_PASSWORD`) live in Vercel environment variables without a `VITE_` prefix, set by a person. The frontend needs no environment variables. `.env*` files stay in `.gitignore`, except `.env.example`. The repo is public.
12. **Published courses are read-only.** Changes go through "duplicate as new draft".
13. **Test sign-in never works in production.** It needs `TEST_SIGNIN=on` and a non-production deployment. Before the pilot, turn it off or give previews their own database.
14. **Sign-in sessions stay server-side.** WorkOS tokens never reach the browser (only the encrypted HttpOnly cookie), only allowed company domains get a session, and every non-GET API request must pass the `Origin` check.

---

## 5. Ask before doing any of these

- Anything that differs from, or adds to, `architecture.md` (a new table, column, endpoint, screen or feature). If the person agrees, update `architecture.md` in the same commit.
- Adding or removing a dependency.
- Deleting or renaming files outside the task.
- Reading or changing `.env` files or secrets.
- Anything that changes the **hosted** Supabase project or Vercel, whether through the Supabase or Vercel connector or the CLI: applying migrations, running SQL that changes data, deploying functions, changing secrets or environment variables, deploying the site. Read-only checks (listing tables, reading logs) don't need asking. A migration is applied only after its file is in the repo. Hosted migrations are applied only from an up-to-date `main`, after the commit that adds them is pushed. Anyone on the team can deploy.
- Any git command that rewrites or discards history: `reset --hard`, `checkout -- <file>`, `rebase` of pushed commits, `commit --amend` on a pushed commit. **Never force push.**

---

## 6. Committing (every commit)

**Until V1, everyone works directly on `main`:** commit locally, then push to `main`. There are no pull requests. Every push to `main` deploys to production straight away, so a broken push breaks the live site. Follow these steps every time.

1. **Check.** Run the checks that exist for what you changed (section 8). Don't commit if they fail; tell the person instead.
2. **Update `progress.md`.** Each commit gets one row (section 7), in the same commit.
3. **Stage only this task's files, by name.** Never use `git add .`, `git add -A` or `git commit -a`.
4. **Write the message from `git diff --staged`.** Describe only what the diff actually shows. If the diff contains unrelated changes, suggest splitting them into separate commits.
5. **STOP AND ASK (Rule 1, never skip).** Show the person the file list and the commit message, then ask both of these together and **wait for the answer**:
    - **Who is committing?** Darshan, Vidit or Shiva. Ask every time, even if you asked earlier in the session.
    - **Commit and push, commit only, or change the message?**
6. **Commit with the person as author:**
   ```
   git commit --author="<Name> <<email from section 2>>" -m "<summary>" [-m "<body>"]
   ```
   Don't change `git config`. The `--author` flag credits the right person on a shared setup.
7. **Push (if asked).** First `git pull --rebase origin main`; if anything came in, run the checks again. Then `git push origin HEAD:main`. If the push is rejected because `main` moved, pull with rebase again, re-check, and push. **Never force push.**
    - If `progress.md` conflicts during the rebase, keep **both** rows, newest first.
    - If code conflicts, stop and show the conflicting files. Don't resolve someone else's code without asking.
8. **Check production.** Wait for the Vercel deployment of the pushed commit, then confirm it is Ready and `GET /api/health` returns `ok: true`. If it failed, say so and fix it straight away (a new commit, or Vercel's instant rollback with the person's OK). End your reply with: **"Pushed to `main` (`<short sha>`); production deploy: <Ready / failed>."**
9. **Sensitive changes:** before pushing changes to `supabase/migrations/`, `server/lib/identity.ts`, `server/auth/` or the learner routes, ask whether a teammate should look at the diff first.

### Commit message format

```
<type>: <summary>

<optional body: why, in 1–3 short lines>
```

- **type:** `feat` (new behaviour), `fix` (bug fix), `docs` (documentation only), `refactor` (no behaviour change), `test`, or `chore` (setup, config, dependencies).
- **summary:** imperative, lower-case, no full stop, 72 characters or fewer. Say what changed in plain words.
- **body:** only if the reason isn't obvious from the summary.
- **No** `Co-Authored-By` lines, no "Generated with" lines, no session links, no emoji, no names. The author field already says who did it.

| Good | Bad |
|---|---|
| `feat: save each answer as soon as it is selected` | `feat: autosave` (too vague) |
| `fix: block answer saves after the due date` | `fixed stuff` (no type, no detail) |
| `chore: add zod to the api` | `feat: improve architecture and add many improvements` (vague, inflated) |
| `docs: describe on-demand auto-submit in architecture` | `update` (says nothing) |

---

## 7. progress.md

Add one row for **every** commit, however small, at the **top** of the log table (newest first).

```
| Date | Who | Area | What changed |
|---|---|---|---|
| 2026-10-16 | Vidit | take-ui | Answers now autosave and show Saved / Saving / Not saved |
```

- **Date:** today's date (run `date +%F`).
- **Who:** the person committing (asked in section 6).
- **Area:** one of `db`, `api`, `admin-ui`, `take-ui`, `email`, `csv`, `docs`, `setup`.
- **What changed:** one plain sentence about what now works or is different, not how it was coded. Add "Next:" or "Known issue:" only if it matters to the others.

If you write `progress.md` before asking who is committing, fill in the name after they answer, before committing.

---

## 8. Commands

```bash
# Frontend (run inside web/)
npm install
npm run dev              # local dev server on http://localhost:5173
npm run build            # typecheck + production build
npm run lint
npm run typecheck        # tsc -b (plain `tsc --noEmit` checks nothing with this tsconfig layout)

# API (run from the repo root)
npm install
npm run dev:api          # API on http://localhost:8787/api (reads .env; copy .env.example)
npm run typecheck
npm run lint

# Database (Supabase CLI, run from the repo root; needs Docker for `start`)
supabase start                       # local Postgres
supabase migration new <name>        # new migration file
supabase db reset                    # re-apply all migrations locally (wipes LOCAL data only)
```

**Hosted Supabase and Vercel:** use the Supabase and Vercel connectors. Ask before any change (section 5). Resend and other integrations are written in code, not used through connectors. Supabase is used only as the database. Vercel's project root is the repo root: it builds `web/` and serves the API from `api/`.

**Cloud sessions:** the Supabase CLI isn't pre-installed, but it runs through npx: `npx -y supabase@2.48.3 ...`. `supabase start` / `db reset` still need Docker. If a check below needs a tool that isn't available, say which check you couldn't run instead of skipping it silently.

**Checks before committing**

- Frontend change (in `web/`): `npm run typecheck`, `npm run lint`, `npm run build`
- API change (`api/`, `server/`): `npm run typecheck` and `npm run lint` at the repo root
- SQL change: `supabase db reset` succeeds, and the RLS checklist in `architecture.md` section 6.2 still passes

---

## 9. Conventions

- **TypeScript strict mode.** Avoid `any`; if it's unavoidable, add a comment saying why.
- **API:** a Hono app in `server/`. Validate every request body with Zod. Shared code (database client, identity, WorkOS client, YouTube checks, CSV) lives in `server/lib/`. Sign-in routes live in `server/auth/`. Only `api/index.ts` may import Vercel-specific code.
- **Database logic that must be atomic** (starting, submitting, auto-submitting attempts) lives in Postgres functions that the API calls with plain SQL. This includes recording video progress.
- **Frontend:** all server calls go through `web/src/api/learnerApi.ts` and `web/src/api/adminApi.ts`. The frontend never connects to Supabase or the database.
- **Folder structure** follows `architecture.md` section 12.
- Keep changes small and focused. One logical change per commit.
