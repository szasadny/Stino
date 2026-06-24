# Stinō

A personal, self-hosted task + calendar web app — a calm, core-only replacement for TickTick.
Rust (Axum + SQLx + SQLite) backend serving a Svelte (Vite + Tailwind) SPA from a single
Docker container, reachable over Tailscale. See [CLAUDE.md](./CLAUDE.md) for the product spec,
[ARCHITECTURE.md](./ARCHITECTURE.md) for the contract, and [ROADMAP.md](./ROADMAP.md) for what's
built and what's next.

> ℹ️ **Keep the folder path colon-free.** Rust (`LD_LIBRARY_PATH`), npm (`PATH`), and Docker bind
> mounts (`host:container`) all use `:` as a separator, so a `:` anywhere in the project path
> breaks `cargo run`, `npm run`, **and** `docker compose up` (the `./data:/data` mount). The folder
> is now `Stino` (colon-free), so everything below works unchanged — just don't reintroduce a `:`.

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
