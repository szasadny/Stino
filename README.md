# Stinō

A personal, self-hosted, open-source replacement for TickTick.

I know, I know. There are already a million todo apps out there, but for some reason every free, open-source alternative falls short of what I want. 

To resolve this, I made this project as a totally vibecoded TickTick alternative that I keep up-to-date through leftover tokens.

It's made for my purely personal use: no auth (I host through Tailscale) and I only built the features I actually use within TickTick with some personal tweaks that I wanted. If something you need is missing, feel free to fork it and use it as your own.

## Stack

A Rust (Axum + SQLx + SQLite) backend serves a Svelte (Vite + Tailwind) SPA from a single Docker
container. See [CLAUDE.md](./CLAUDE.md) for the spec and [ARCHITECTURE.md](./ARCHITECTURE.md) for
the contract.

## Run it

```bash
docker compose up --build
# → http://localhost:8080   (data persists in ./data/stino.db)
```

## Develop

```bash
cd backend  && cargo run                     # JSON API on :8080
cd frontend && npm install && npm run dev    # SPA on :5173, proxies /api
```

## License

[MIT](./LICENSE)
