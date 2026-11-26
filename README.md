# Stinō

A self-hosted, open-source replacement for TickTick.

I know, I know. There are already a million todo apps out there, but for some reason every free, open-source alternative falls short of what I want. So to resolve this, I vibecoded this project as a TickTick alternative that I keep up to date with leftover tokens.

It's purely made for my personal use: no auth (I connect through Tailscale) and I only built the features I actually used within TickTick, while adding some personal tweaks to it.

Feel free to fork it and make it your own!

## Stack

A Rust (Axum + SQLx + SQLite) backend serves a Svelte (Vite + Tailwind) SPA from a single Docker
container.

## Run

```bash
git clone https://github.com/szasadny/Stino.git && cd Stino
docker compose up -d --build
```

## Update

```bash
git pull && docker compose up -d --build
```

## Develop

```bash
cd backend  && cargo run                     # JSON API on :8080
cd frontend && npm install && npm run dev    # SPA on :5173, proxies /api
```

Checks and tests (run from the repo root):

```bash
scripts/test.sh                                            # full pipeline, same stages as CI
scripts/test.sh --guards                                   # fast checks only: lint, types, guards, duplication
scripts/test.sh --skip frontend,quality                    # skip stages: backend, frontend, quality

cd backend  && cargo test --locked                         # backend tests
cd frontend && npm run lint && npm run check && npm test   # frontend lint, types, tests
```

## License

[MIT](./LICENSE)
