# Stinō — Claude Code shim

**[AGENTS.md](./AGENTS.md) is the single source of truth** for all project instructions (hard rules, priorities, scope, architecture, design language, testing, definition of done). It is imported below — never duplicate its content here; project knowledge goes in AGENTS.md.

@AGENTS.md

## Claude-specific notes

Only deltas that apply when Claude Code (not codex) is driving:

- Subagents: `.claude/agents/executor.md` (one plan step) and `.claude/agents/explorer.md` (read-only research) are pinned to Opus. Every Agent call passes `model: opus` explicitly, also for built-in agent types; never omit it.
- Skill mapping for the AGENTS.md task-routing table: `verify` → `/verify`, `maintaining-agents-md` → `/maintaining-agents-md`, `modern-web-guidance` → `/modern-web-guidance`, `skill-creator` → `/skill-creator` (all in `.claude/skills/`; `.agents/skills/` symlinks them for codex).
- Frontend / UI work: additionally follow the `frontend-design` plugin skill.
- Comments: Claude tends to over-comment — follow the AGENTS.md comment rule (default none, one short line of *why*) and paste it into every code-writing subagent prompt.
- Before finishing: `scripts/test.sh --guards` while working, `scripts/test.sh` at the end; review your own diff with `/code-review` (bugs) and `/simplify` (cleanups).
- Launching or driving the real app: `/run` (launch) or `/verify` (scratch DB + Playwright, drive and observe).
