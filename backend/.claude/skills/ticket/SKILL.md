---
name: ticket
description: Work one Tablz Backend Phase 1 roadmap ticket end to end — check readiness, plan, write failing tests, implement, verify and get it reviewed. Run as /ticket B701.
argument-hint: [ticket-id, e.g. B701]
disable-model-invocation: true
---

Work ticket **$ARGUMENTS** from the Backend Phase 1 roadmap.

## 1. Check it is ready

- Read the ticket in `docs/ROADMAP.md` §6 (requirements, quality guidelines, acceptance), its row in `docs/TASKS.md`, and the ARCHITECTURE sections it touches. Read PRD sections only where the ticket points at them.
- If a dependency in TASKS.md is not `done`, or an open question in ARCHITECTURE §10 blocks this ticket and has no ADR yet, **stop**. Say which one and what decision you need. Don't pick an answer yourself.
- If the ticket is marked 👤 or 🤝, do only the parts that are files in this repo, and end with a checklist of the account/dashboard steps for the user.

## 2. Plan (no code yet)

Present a short plan and wait for approval:

- Each requirement and acceptance criterion → the test(s) that will prove it.
- Files and modules to create or change; any migration.
- Anything ambiguous, phrased as a question.

## 3. Build test-first

1. Create the branch `feat/$ARGUMENTS-<short-name>` (or `fix/` / `chore/`).
2. Write the tests for the acceptance criteria first. Run them and confirm they fail for the right reason.
3. Implement the smallest change that makes them pass, following CLAUDE.md rules and ARCHITECTURE invariants.
4. Run lint, type-check, unit and integration tests. Fix until everything is green. Never skip, delete or weaken a test to get there; if a test looks wrong, say so and ask.

## 4. Verify

- Use the `ticket-reviewer` subagent on the branch diff with the ticket ID. Fix every blocking finding, then re-run the checks.
- Re-read the acceptance criteria and confirm each one is covered by a passing test.

## 5. Hand over

- Set the ticket to `in review` in `docs/TASKS.md`. If you made a decision the docs don't cover, add an ADR in `docs/adr/` from the template.
- Commit with Conventional Commits, ending the subject with `[$ARGUMENTS]`.
- Reply with: what changed, how each acceptance criterion is proven, any deviation from the ticket, and follow-ups. Include a ready-to-paste PR description. Ask before pushing.
