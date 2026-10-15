# AGENTS.md

Instructions for any AI coding agent working in this repository. Read this whole file before starting any task.

> ## RULE 1: NEVER COMMIT OR PUSH WITHOUT ASKING FIRST
>
> Before **every** commit, stop and ask the person **who is committing** and whether to **commit and push, commit only, or change the message** (section 6). Then wait for their answer.
>
> This applies in **every** permission mode, including **Accept edits** and **Auto** in cloud sessions. Finishing a task never means committing it, even if the task says "finish", "ship it" or "push when done". If nobody answers, leave the changes uncommitted and say so.

---

## 1. Project

An internal assessment tool (V1). Admins create multiple-choice assessments, upload employees, and email each one a personal link. Employees take the assessment without logging in and see only their score and pass/fail.

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
2. Make sure your branch starts from the latest `main`: run `git fetch origin main`, and if `main` has moved, `git rebase origin/main`. If this fails because of uncommitted changes, tell the person instead of forcing it.
3. Read the latest entries in `progress.md`, so you know what changed recently.
4. Read the sections of `architecture.md` that relate to the task.

---

## 4. Hard rules (never break these)

1. **Never commit or push without asking first** (Rule 1 at the top of this file).
2. **Never push to `main` directly.** Push your own branch; changes reach `main` only through a pull request (section 6).
3. **RLS stays on every table, with no policies for public access.** The `anon` and `authenticated` roles get no table or function privileges.
4. **The browser never queries tables directly.** All data goes through the `admin` and `employee` Edge Functions.
5. **The service role key is only in Edge Function secrets.** Never in frontend code, never with a `VITE_` prefix, never committed.
6. **The `employee` function never returns `options.is_correct`, `answers.is_correct` or `answers.points_awarded`.** Employees see only score and pass/fail.
7. **Every `employee` function query is filtered by the assignment found from the link token.** It never accepts an employee id or assignment id from the browser.
8. **Every admin request checks the admin password first.**
9. **Every new database function gets** `revoke execute ... from public, anon, authenticated` and `grant execute ... to service_role`.
10. **Schema changes are new migration files.** Never edit a migration that has already been applied or committed.
11. **Secrets never go in the repo or in the cloud session's environment variables.** Frontend values (`VITE_*`, public only) live in Vercel. Server secrets (service role key, admin password, Resend key) live in Supabase Edge Function secrets, set by a person. `.env*` files stay in `.gitignore`, except `.env.example`. The repo is public.
12. **Published assessments are read-only.** Changes go through "duplicate as new draft".

---

## 5. Ask before doing any of these

- Anything that differs from, or adds to, `architecture.md` (a new table, column, endpoint, screen or feature). If the person agrees, update `architecture.md` in the same commit.
- Adding or removing a dependency.
- Deleting or renaming files outside the task.
- Reading or changing `.env` files or secrets.
- Anything that changes the **hosted** Supabase project or Vercel, whether through the Supabase or Vercel connector or the CLI: applying migrations, running SQL that changes data, deploying functions, changing secrets or environment variables, deploying the site. Read-only checks (listing tables, reading logs) don't need asking. A migration is applied only after its file is in the repo.
- Any git command that rewrites or discards history: `reset --hard`, `checkout -- <file>`, `rebase` of pushed commits, `commit --amend` on a pushed commit. **Never force push.**

---

## 6. Committing (every commit)

Each cloud session works on its own branch. Commit to that branch, push it, and the change reaches `main` through a pull request. Follow these steps every time.

1. **Check.** Run the checks that exist for what you changed (section 8). Don't commit if they fail; tell the person instead.
2. **Update `progress.md`.** Add one entry for this change (section 7). It goes in the same commit.
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
7. **Push (if asked).** Push the session's branch with `git push -u origin HEAD`. Never push to `main`.
8. **Remind them to create a PR.** After every push, end your reply with: **"Pushed to `<branch>`. Create a PR into `main` (Create PR in the diff view) and merge it."**
    - If the PR has conflicts with `main`, rebase the branch on `origin/main` when asked.
    - If `progress.md` conflicts, keep **both** entries, newest first.
    - If code conflicts, stop and show the conflicting files. Don't resolve someone else's code without asking.

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
| `chore: add zod to edge functions` | `feat: improve architecture and add many improvements` (vague, inflated) |
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

These are the standard commands. Update this section once the repo is scaffolded.

```bash
# Frontend (web/)
npm install
npm run dev              # local dev server
npm run build            # production build
npm run lint
npx tsc --noEmit         # typecheck

# Supabase (local)
supabase start                       # local Postgres + functions
supabase migration new <name>        # new migration file
supabase db reset                    # re-apply all migrations locally (wipes LOCAL data only)
supabase functions serve             # run edge functions locally
```

**Hosted Supabase and Vercel:** use the Supabase and Vercel connectors. Ask before any change (section 5). Resend and other integrations are written in code, not used through connectors.

**Cloud sessions:** Deno and the Supabase CLI aren't pre-installed. If a check below needs a tool that isn't available, say which check you couldn't run instead of skipping it silently.

**Checks before committing**

- Frontend change: `npx tsc --noEmit`, `npm run lint`, `npm run build`
- Edge Function change: `deno check supabase/functions/<name>/index.ts`
- SQL change: `supabase db reset` succeeds, and the RLS checklist in `architecture.md` section 5.2 still passes

---

## 9. Conventions

- **TypeScript strict mode.** Avoid `any`; if it's unavoidable, add a comment saying why.
- **Edge Functions:** validate every request body with Zod. Shared code (database client, auth, tokens, email, CSV, CORS) lives in `supabase/functions/_shared/`.
- **Database logic that must be atomic** (starting, submitting, auto-submitting attempts) lives in Postgres functions called with `rpc()`.
- **Frontend:** all server calls go through `web/src/api/adminApi.ts` and `web/src/api/employeeApi.ts`. Never use `supabase-js` to read tables from the browser.
- **Folder structure** follows `architecture.md` section 10.
- Keep changes small and focused. One logical change per commit.
