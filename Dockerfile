# syntax=docker/dockerfile:1

# Build the Svelte SPA.
FROM node:26-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci || npm install
COPY frontend/ ./
RUN npm run build

# Build the Rust backend with the offline SQLx cache.
FROM rust:1-bookworm AS backend
WORKDIR /app/backend
ENV SQLX_OFFLINE=true
COPY backend/ ./
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/backend/target \
    cargo build --release \
    && cp target/release/stino-backend /app/stino-backend

# Slim runtime containing only the binary and built SPA.
FROM debian:bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=backend /app/stino-backend /app/stino-backend
COPY --from=frontend /app/frontend/dist /app/static
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# Entrypoint fixes bind-mounted /data ownership before dropping privileges.
RUN useradd --uid 1000 --user-group --home-dir /app --shell /usr/sbin/nologin stino \
    && mkdir -p /data && chown stino:stino /data \
    && chmod +x /usr/local/bin/docker-entrypoint.sh
ENV DATA_DIR=/data \
    STATIC_DIR=/app/static \
    PORT=8080
EXPOSE 8080
VOLUME ["/data"]
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["/app/stino-backend"]
