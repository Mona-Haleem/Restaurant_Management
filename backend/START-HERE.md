# Start here

Setup notes for this Claude Code kit. Delete this file once you're up and running.

## What's in the kit

```
CLAUDE.md                       project rules Claude reads every session
docs/PRD.md                     your PRD, unchanged
docs/ROADMAP.md                 your Backend Phase 1 roadmap, as markdown
docs/ARCHITECTURE.md            cross-ticket rules + 10 open questions
docs/TASKS.md                   ticket order, dependencies, blockers, status
docs/adr/0000-template.md       template for decisions
.claude/settings.json           permissions + hooks
.claude/hooks/guard.mjs         blocks db push, migrate deploy, Supabase/prod access, force push, editing committed migrations
.claude/hooks/format-file.mjs   runs Prettier on each edited file (inactive until Prettier is installed)
.claude/agents/ticket-reviewer.md   subagent that reviews a branch against its ticket
.claude/skills/ticket/SKILL.md      the /ticket command
```

## Setup

1. Copy everything into the folder you'll start Claude Code from (the API repo root).
2. Add `.claude/settings.local.json` and `.env*` (except `.env.example`) to `.gitignore` when B101 creates it.
3. Start Claude Code there and run `/hooks` to confirm the two hooks are registered.

## First session: answer the open questions

Before any code, start in plan mode and paste:

> Read docs/ARCHITECTURE.md §10. Walk me through the open questions one at a time, starting with the ones that block B101 and B301. For each, give me the options and trade-offs in a few lines and wait for my answer. After I decide, write an ADR in docs/adr/ from the template, mark the question resolved in ARCHITECTURE.md, and update the blockers in TASKS.md.

## Then build, one ticket per session

```
/ticket B101
```

After each ticket: review the diff, run the app yourself, merge the PR, then `/clear` (or start a new session) before the next ticket.
