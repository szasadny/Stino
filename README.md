# Stinō

A personal, self-hosted task + calendar web app — a calm, core-only replacement for TickTick.
Rust (Axum + SQLx + SQLite) backend serving a Svelte (Vite + Tailwind) SPA from a single
Docker container, reachable over Tailscale. See [CLAUDE.md](./CLAUDE.md) for the product spec
and [ARCHITECTURE.md](./ARCHITECTURE.md) for the contract.

> ⚠️ **Folder name must not contain a colon.** Rust (`LD_LIBRARY_PATH`), npm (`PATH`), and
> Docker bind mounts (`host:container`) all use `:` as a separator, so a `:` in the project
> path (e.g. `ToDo: …`) breaks `cargo run`, `npm run`, **and** `docker compose up` (the
> `./data:/data` mount). The Docker *image build* itself is fine (it copies into `/app`).
> **Fix:** rename the folder to a colon-free slug like `stino` — then everything below works
> unchanged. (Verified interim workarounds without renaming: `CARGO_TARGET_DIR=$HOME/.cache/stino/target`
> for cargo, calling `./node_modules/.bin/*` directly for the frontend, and `docker run` with a
> colon-free `-v` path instead of compose.)

## Run it (Docker — the intended deployment)

```bash
docker compose up --build
# → http://localhost:8080   (data persists in ./data/stino.db)
```

## Develop locally

Two terminals (assumes a colon-free folder path):

```bash
# backend — JSON API on :8080
cd backend && cargo run

# frontend — SPA on :5173, proxies /api to the backend
cd frontend && npm install && npm run dev
# open http://localhost:5173
```

## Checks

```bash
cd backend  && cargo fmt --check && cargo clippy -- -D warnings && cargo test
cd frontend && npm run check && npm run lint && npm run build
```

## Layout

```
backend/    Axum + SQLx; routes/ (thin) → services/ → db/ ; migrations/
frontend/   Svelte 5 + Vite + Tailwind; lib/api.ts is the only HTTP client
Dockerfile  multi-stage: build SPA → build Rust → slim runtime serving both
```
