# Stinō — Claude Code shim

**[AGENTS.md](./AGENTS.md) is the single source of truth** for all project instructions (hard rules, scope, architecture, design language, testing, definition of done). It is imported below — never duplicate its content here; project knowledge goes in AGENTS.md.

@AGENTS.md

## Claude-specific notes

Only deltas that apply when Claude Code (not codex) is driving:

- The `.codex/agents/` planner/executor roles are for codex sessions — as Claude, ignore that section and work directly (use your own subagents per your normal judgment).
- Skill mapping for the AGENTS.md task-routing table: `verify` → `/verify`, `maintaining-agents-md` → `/maintaining-agents-md`, `modern-web-guidance` → `/modern-web-guidance` (all live in `.claude/skills/`; `.agents/skills/` holds symlinks for codex).
- Frontend / UI work: additionally follow the `frontend-design` plugin skill.
- Reviewing your own diff before finishing: run `/code-review` (bugs) and `/simplify` (cleanups).
- Launching or driving the real app: `/run` (launch) or `/verify` (drive and observe).
