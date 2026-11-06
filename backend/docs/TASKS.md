# Backend Phase 1 — Task Tracker

Ticket details live in `docs/ROADMAP.md` §6. This file tracks order, status and blockers only. Claude updates the status column at the end of each `/ticket` run; you update it when you merge.

**Status:** `todo` · `blocked` · `in progress` · `in review` · `done`
**Who:** 🤖 Claude can do it end to end · 👤 needs you (accounts, dashboards, secrets, repo settings) · 🤝 Claude prepares files and a checklist, you do the account steps

| Order | Ticket | Title | Who | Depends on | Blocked by (ARCHITECTURE §10) | Status | PR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | B101 | Workspace, tooling and CI | 🤝 | — | — | in review | |
| 2 | B201 | Local DB, Supabase projects, env guards | 🤝 | B101 | Supabase projects + IPv4 check are 👤 (docs/ENVIRONMENTS.md) | in review | |
| 3 | B301 | Prisma schema and first migration | 🤖 | B201 | — | in review | |
| 4 | B302 | Schema review and ADRs | 🤖 | B301 | — | todo | |
| 5 | B401 | Idempotent seed | 🤖 | B302 | — | todo | |
| 6 | B501 | Config, validation, errors, logging | 🤖 | B201 | — | in review | |
| 7 | B502 | OpenAPI contract | 🤖 | B501 | Angular client + mock contract test wait for frontend TABLZ-401/402/403 (ADR 0012) | in review (backend half) | |
| 8 | B503 | Tenant context, auth seam, health, demo safety | 🤖 | B301, B501 | — | todo | |
| 9 | B601 | Menu, categories and ingredients | 🤖 | B503 | — | todo | |
| 10 | B701 | Deduction service (single entry point) | 🤖 | B503 | — | todo | |
| 11 | B702 | Stock queries and restock | 🤖 | B701 | — | todo | |
| 12 | B801 | Workflow stages and order lifecycle | 🤖 | B601, B701 | — | todo | |
| 13 | B802 | Order queries for the board and tracking | 🤖 | B801 | — | todo | |
| 14 | B901 | Waste logging | 🤖 | B701 | — | todo | |
| 15 | B902 | Reconciliation and snapshots | 🤖 | B701, B901 | — | todo | |
| 16 | B1001 | Staff management | 🤖 | B503 | — | todo | |
| 17 | B1101 | KPIs, aggregates and anomalies | 🤖 | B801, B901, B902 | — | todo | |
| 18 | B1201 | Render deployment | 👤 | B201, B503 | — | todo | |
| 19 | B1202 | Migration workflows | 🤝 | B1201 | — | todo | |
| 20 | B1203 | Keep-alive workflow | 🤝 | B1201 | — | todo | |
| 21 | B1204 | Backups and restore drill | 🤝 | B1202 | — | todo | |
| 22 | B1301 | Swap mock for real (Angular) | 🤝 | B502, B1101 | — | todo | |
| 23 | B1401 | Final hardening and sign-off | 🤝 | all | — | todo | |

## Notes

- **Parallel work:** B501 can run alongside B301/B302. B901 and B1001 can run alongside B801. Don't run two tickets that both create Prisma migrations at the same time — merge one, then start the other.
- **Frontend references:** B302 (TABLZ-401 models), B401 (TABLZ-404 seed), B502 (frontend mock handlers) and B1301 (TABLZ-403 service layer, TABLZ-1902 demo script) need the Angular repo. Per ADR 0001 this is a monorepo: start Claude Code in `backend/` with `--add-dir ../frontend` for those tickets.
- **👤 / 🤝 steps Claude must not attempt:** creating Supabase or Render projects, setting GitHub branch protection or secrets, configuring UptimeRobot, and anything that connects to staging or production.
