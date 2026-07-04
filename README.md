# Stinō

A self-hosted, open-source replacement for TickTick.

I know, I know. There are already a million todo apps out there, but for some reason every free, open-source alternative falls short of what I want. So to resolve this, I vibecode this project as a TickTick alternative that I keep up-to-date through leftover tokens.

It's purely made for my personal use: no auth (I connect through Tailscale) and I only built the features I actually used within TickTick, while adding some personal tweaks to it.

Feel free to fork it and use it as your own!

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

## License

[MIT](./LICENSE)
