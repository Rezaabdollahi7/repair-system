# RULES.md

Engineering workflow rules for Claude Code on the Dofixo project. These apply on top of
`CLAUDE.md` (project context) and `ROADMAP.md` (task list). Read all three before starting work.

## 1. Workflow: one task at a time

- Work on exactly **one numbered task from `ROADMAP.md`** per work session, unless told
  otherwise. Don't jump ahead to a later phase or bundle unrelated tasks together.
- Before starting, restate in one or two sentences what the task involves and which files you
  expect to touch, so scope is clear up front.
- If a task turns out to depend on something not yet done (e.g. task 2.5 needs 2.2 finished
  first), stop and say so instead of improvising a workaround.

## 2. Approval before commit — mandatory

- **Never run `git commit` or `git push` without explicit approval from Reza in that session.**
- After finishing a task: show a summary of the changes (what changed and why) and, if useful, the
  diff or `git status` / `git diff` output. Then **wait** for an explicit go-ahead
  ("commit it", "looks good", "تایید" etc.) before committing.
- If Reza asks for changes after review, apply them, show the update, and wait for approval again
  before committing.
- Never batch multiple tasks into a single commit unless explicitly asked to.

## 3. Testing — required before requesting approval

- **Every task that touches backend logic must include or update the relevant unit tests**
  (per `CLAUDE.md`: focus is on controller/service unit tests for now).
- Run the test suite (`pnpm test` or equivalent) before presenting the task as done. Include the
  test run result (pass/fail summary) alongside the change summary.
- If a task is purely frontend UI with no testable logic, say so explicitly instead of silently
  skipping tests — don't leave it ambiguous whether tests were considered.
- Never present a task as complete if tests are failing. Fix or clearly flag failures first.

## 4. Commit conventions

- Use **Conventional Commits** format: `type(scope): short description`
  - Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `build`, `ci`
  - Scope: the affected area, e.g. `auth`, `devices`, `invoices`, `db`, `workspace`, `infra`
  - Example: `feat(auth): add refresh token issuance and rotation`
  - Example: `refactor(db): migrate device queries from sql.js to Prisma`
- Keep commits **small and scoped to one logical change** — prefer several small commits over one
  large one, even within a single roadmap task, if the task naturally splits into steps
  (e.g. "add Prisma model" then "migrate controller to use it" can be two commits).
- Commit message body (when needed) should explain **why**, not just repeat what the diff shows.
- Never include secrets, `.env` values, or credentials in a commit. Double-check `.env`,
  `*.pem`, and any credential files are in `.gitignore` before committing.
- Reference the roadmap task number in the commit body when relevant, e.g.
  `Roadmap: 2.3 — implement RLS policies`.

## 5. Branching

- Continue working on `feature/multi-tenant-migration` for the SaaS migration work unless a task
  is clearly independent and risky enough to warrant its own branch (ask if unsure).
- Don't merge to `main`/`master` without explicit instruction — that decision belongs to Reza.

## 6. Code quality standards

- **Match existing patterns first.** Before introducing a new pattern (e.g. a new way of
  structuring a controller, a new state-management approach), check how similar things are
  already done in the codebase and follow that unless there's a specific reason to diverge —
  and if you do diverge, say why.
- **No dead code.** Don't leave commented-out old implementations "just in case" — Git history is
  the safety net, not the file itself.
- **Validate all external input.** Every new/modified Express route handler must
  validate `req.body`/`req.params`/`req.query` with a Zod schema via the
  `validate()` middleware before using the data. Handlers read from `req.valid`,
  not from `req.body` directly.
  route handler must validate `req.body`/`req.params`/`req.query` with a Zod schema before using
  the data.
- **Never trust the client for `workspaceId` or `role`.** These must always come from the verified
  JWT on the server side, never from a request body/query param, to prevent tenant-isolation
  bypass.
- **Small, focused functions.** Prefer extracting a helper over writing a long function with mixed
  concerns (e.g. separate "validate input" / "compute totals" / "persist" steps in invoice logic).
- **Consistent naming.** Follow existing naming conventions in the repo (camelCase for JS
  variables/functions, PascalCase for React components and Prisma models) — don't introduce a
  different convention mid-file.
- **Comments explain "why", not "what".** Only add a comment where the reasoning isn't obvious
  from the code itself (e.g. "RLS also enforces this — this check is a defense-in-depth
  duplicate", not "// loop over items").
- **No silent failures.** Every `catch` block must either handle the error meaningfully or
  re-throw/log it — never an empty catch block.
- **Full, readable output.** Prefer writing complete functions or files, so the
  code stays easy to review. The exception is a large file receiving many small
  edits: there, showing each change as "from → to" is less error-prone to apply
  than re-sending six hundred lines.
  functions or files over partial fragments, so the code stays easy to review and reason about.

## 7. Security checklist (apply throughout, not just Phase 2/3)

- Every new tenant-scoped table/query: confirm `workspaceId` scoping AND RLS policy exist before
  marking a task done.
- Every new auth-sensitive endpoint: confirm role checks (`authorize.js`) are in place.
- Every file upload path: validate file type/size before accepting.
- Every new environment variable (DB credentials, object storage keys, JWT secrets): added to
  `.env.example` (without real values) and documented, never hardcoded.

## 8. Documentation upkeep

- When a roadmap task is completed and approved, update `ROADMAP.md`: flip `[ ]` to `[x]`.
- If a task reveals that `CLAUDE.md` is out of date (e.g. a decision changed), update it in the
  same commit as the task, and call this out explicitly when presenting the change for approval.

## 9. Communication style

- When presenting finished work, structure it as: **what was done → test results → open
  questions/risks (if any) → waiting for approval to commit.**
- If a task is ambiguous or a decision is needed that isn't already answered in `CLAUDE.md`, ask
  before proceeding rather than guessing — especially for anything touching auth, tenancy
  isolation, or data deletion.

## 10. Network commands — run manually

Because of local VPN interference, commands that hit the network (npm/pnpm install,
npm view/npm outdated, docker pull, docker run against a registry, git fetch/clone
over https) are unreliable when run directly by you and may hang or time out.

From now on, whenever a task needs one of these, don't run it yourself — instead,
print the exact command in a code block and ask me to run it in my own terminal and
paste back the output. Wait for that output before continuing. This does not apply
to commands that only touch the local filesystem or an already-running local
container (e.g. `docker compose ps`, `docker compose exec`, `git status`, `git diff`,
`git commit` after approval) — those you can keep running yourself as usual.

- After installing any dependency on the host, the affected container must be
  rebuilt with `docker compose up -d --build --renew-anon-volumes <service>`.
  A plain restart or even `--build` alone won't do: the anonymous volume that
  shadows /app/node_modules survives container recreation, so the container
  keeps the dependency set from whenever its image was first built.

- After deleting or renaming a source file the running container has loaded,
  restart the service with `docker compose restart backend`. tsx watch's module
  resolution gets stuck on the removed path and doesn't recover; the resulting
  error usually points at the new file and is misleading.

- Any migration that adds a table with a `workspace_id` column must enable RLS
  and create its `workspace_isolation` policy in the same migration. Grants
  carry forward automatically via ALTER DEFAULT PRIVILEGES; RLS does not.
  `backend/prisma/rls-check.sql` lists tables that were missed.
