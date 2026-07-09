---
name: verify
description: Run Stinō against a scratch DB and drive it with Playwright to verify a change end-to-end. Use when confirming a change works in the real app (desktop and phone widths), including drag-and-drop.
---

# Verifying Stinō end-to-end

## Launch (scratch DB — never touch `backend/data/stino.db`)

```bash
cd frontend && npm run build                     # backend serves dist
SCRATCH=$(mktemp -d /tmp/stino-verify-XXXX) && mkdir -p $SCRATCH/data
cd backend && SQLX_OFFLINE=true \
  DATABASE_URL="sqlite://$SCRATCH/data/stino.db?mode=rwc" \
  DATA_DIR=$SCRATCH/data STATIC_DIR=<abs>/frontend/dist PORT=8125 cargo run
```

`SQLX_OFFLINE=true` is required — the `query!` macros otherwise compile against the empty scratch DB. Poll `GET /api/health` until 200.

## Seed via the API

- `POST /api/labels {name, color}` — color MUST be a `lib/palette.js` hex (e.g. `#2F5D50`, `#B0714A`) or it's rejected.
- `POST /api/tasks {title, due_date, due_time?, label_id?}`; range read is `GET /api/tasks?from=&to=` (no `/tasks/range`); Inbox = `GET /api/tasks` with no params.
- No `sqlite3` CLI on this box — inspect the DB with Python's `sqlite3` module.

## Drive (Python Playwright — no Node playwright installed)

`~/.local/bin/playwright`, browsers cached in `~/.cache/ms-playwright`. Phone context: `viewport 390x844, has_touch=True, is_mobile=True`; desktop `1280x800` (use `1280x1600` to fit all pills in a month cell — cell line-fit hides overflow behind "+N more").

- Day cells: `[aria-label*="9 July"]` (`"{Weekday}, {D} {Month}, N tasks"`). Nav tabs are `<button>`s; the header period-nav also has a "Today" button — the bottom tab bar's is `.last`.
- **Taps: never `.click()` in a touch context** (misses the phantom double-click). Use CDP `Input.dispatchTouchEvent`: touchStart → ~60ms → touchEnd.
- **Touch drag:** touchStart → 0.45s hold → one >3px touchMove to arm → stepped moves (~35ms) → ~0.5s settle → touchEnd.
- **Desktop drag:** CDP `Input.dispatchMouseEvent` (Playwright `mouse`/`drag_to` won't arm svelte-dnd-action): mousePressed → one >3px mouseMoved → stepped moves (~35ms) → ~0.5s settle → mouseReleased.
- **DayPanel hides itself mid-drag by design** (`{dragging ? 'hidden' : 'flex'}`) — its drags MOVE tasks to other days; a within-day reorder is a drag inside the grid cell, not the panel.
- In the phone Month split, `get_by_text("<task>")` matches the drag-disabled grid-cell line first — use `.last` or scope to the agenda.

## Teardown

`pkill -f target/debug/stino`; the scratch dir under /tmp needs no cleanup.
