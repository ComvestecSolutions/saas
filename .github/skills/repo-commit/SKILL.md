---
name: repo-commit
description: Create repository-compliant commits for the Comvestec Solutions SaaS Foundation. Use when asked to commit work, split a dirty worktree into commit batches, or choose a Conventional Commit message and scope.
metadata:
  owner: Comvestec Solutions
  version: "1.0"
---

# Repo Commit

Create **small, related commit batches** that follow this repository's commit workflow.

## Required sources of truth

Read these before staging or committing when they are not already in context:

1. `CONTRIBUTING.md`
2. `.github/copilot-instructions.md`
3. The nearest spec, ADR, manifest, tracker entry, or runbook for the slice you are committing

`CONTRIBUTING.md` is the source of truth when any commit rule appears to conflict with another document.

## When to use

- The user asks you to commit current work
- The worktree contains multiple logical changes and needs batching
- You need help choosing a commit scope or Conventional Commit message
- You need to turn a review-worthy slice into one or more repo-compliant commits

## When not to use

- The user explicitly wants analysis only and does **not** want a commit yet
- The worktree is intentionally unready and still missing required validation or required companion updates
- You are being asked to amend, rewrite, or squash history in ways the user did not request

## Completion criteria

The skill is complete when you have:

- [ ] Identified the smallest related batch you can commit truthfully
- [ ] Kept each commit to one primary change area
- [ ] Included only directly supporting tests/docs/specs/tooling in that same batch
- [ ] Used a Conventional Commit message with a valid scope
- [ ] Avoided automatic AI attribution trailers
- [ ] Created the commit and reported what remains in the worktree, if anything

## Commit rules this skill enforces

1. **One primary change area per commit.** Companion `tests/`, `specs/`, docs, and repo-tooling updates are allowed only when they directly support that same area.
2. **Prefer the smallest related batch.** If the worktree spans multiple primary areas, split it into multiple commits even on a repo-scoped branch.
3. **Truthful subject rule.** If you cannot describe the staged diff honestly with one Conventional Commit subject, split the batch before committing.
4. **Conventional Commits are required.** Use `<type>(<scope>): <subject>`.
5. **Scopes must be repo-approved.** Commit scopes use the allowed branch-scope list from `CONTRIBUTING.md`, plus `docs` and `ci` when those are the truthful primary areas.
6. **No automatic Copilot co-author trailer.** Only add a co-author trailer when a human explicitly asks for it or repo policy requires it.
7. **Do not hide unrelated changes by staging everything.** Prefer explicit path staging or patch staging over `git add -A` when the worktree contains more than one logical change.

## Workflow

### Step 1: Inspect the worktree

Run at least:

```bash
git --no-pager status --short --branch
git --no-pager diff --stat
git --no-pager diff --name-only
```

Identify whether the worktree is already one related slice or whether it needs splitting.

### Step 2: Define the batch boundary

Ask:

1. What is the **single primary change area**?
2. Which tests/docs/specs/tooling files directly support that same area?
3. Which files belong to a different area and must stay out of this commit?

Use these heuristics:

- **Same batch:** implementation + tests + spec/tracker/doc updates for the same behavior change
- **Separate batch:** unrelated app route work, unrelated package refactors, unrelated tooling cleanup, unrelated generated churn

### Step 3: Stage only that batch

Prefer explicit staging:

```bash
git add <paths...>
git --no-pager diff --cached --stat
git --no-pager diff --cached
```

If needed, use patch staging to keep the batch small and truthful.

### Step 4: Validate the commit message

Choose:

- a Conventional Commit **type**
- a valid **scope**
- a short **subject** that describes only the staged batch

Examples:

- `chore(repo): add repo commit batching skill`
- `docs(repo): tighten grouped commit policy`
- `chore(tooling): enforce outbound commit batching`

If one subject cannot describe everything staged, the batch is too large.

### Step 5: Create the commit

Use a non-interactive commit command:

```bash
git commit -m "<type>(<scope>): <subject>"
```

Do **not** amend unless the user explicitly asked for an amend.

### Step 6: Report the result

After the commit:

1. show the created commit hash and message
2. state whether the worktree is clean
3. if files remain, explain the next logical batch rather than pretending the work is finished

## Output expectations

When using this skill, report:

- the batch boundary you chose
- the commit message you used
- the resulting commit hash
- whether anything remains unstaged or uncommitted
