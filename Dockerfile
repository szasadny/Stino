# syntax=docker/dockerfile:1

# --- 1. Build the Svelte SPA ---
FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci || npm install
COPY frontend/ ./
RUN npm run build

# --- 2. Build the Rust backend ---
# Pin bookworm to match the runtime's glibc; full image has the C toolchain for
# bundled SQLite. Cache the cargo registry + target across builds, then copy the
# binary OUT of the cache mount so it lands in the image layer.
# SQLX_OFFLINE makes the compile-time query! checks read the committed .sqlx
# cache instead of a live database (there is none at build time). Regenerate the
# cache after changing any query — see ARCHITECTURE.md § Build & run.
FROM rust:1-bookworm AS backend
WORKDIR /app/backend
ENV SQLX_OFFLINE=true
COPY backend/ ./
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/backend/target \
    cargo build --release \
    && cp target/release/stino-backend /app/stino-backend

# --- 3. Slim runtime: the binary + the built SPA, nothing else ---
FROM debian:bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=backend /app/stino-backend /app/stino-backend
COPY --from=frontend /app/frontend/dist /app/static
ENV DATA_DIR=/data \
    STATIC_DIR=/app/static \
    PORT=8080
EXPOSE 8080
VOLUME ["/data"]
CMD ["/app/stino-backend"]
