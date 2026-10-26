# Builds sonirico/mcp-stockfish at a pinned commit.
# The upstream Dockerfile installs Stockfish from Alpine 3.19, which no longer ships it,
# so the runtime stage uses Debian's stockfish package instead.
#
# Two targets share the same engine:
#   stdio  mcp-stockfish over stdin/stdout. The server starts one per connection with
#          `docker run -i` (local development; `npm run engine:build`).
#   http   the same engine behind gateway/server.mjs, an MCP-over-HTTP front on port 8080 that
#          runs ENGINE_POOL_SIZE mcp-stockfish processes (Azure Container Apps;
#          `npm run engine:build:http`). This is the default target.

FROM golang:1.23-bookworm AS builder
ARG MCP_STOCKFISH_REF=eafa8f5c89876222b3b3b4be7324c2f613516957
WORKDIR /src
RUN git clone https://github.com/sonirico/mcp-stockfish.git . && git checkout "$MCP_STOCKFISH_REF"
RUN CGO_ENABLED=0 go build -ldflags "-s -w" -o /out/mcp-stockfish .

FROM debian:trixie-slim AS stdio
RUN apt-get update \
    && apt-get install -y --no-install-recommends stockfish \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /out/mcp-stockfish /usr/local/bin/mcp-stockfish
ENV MCP_STOCKFISH_PATH=/usr/games/stockfish \
    MCP_STOCKFISH_LOG_OUTPUT=stderr \
    MCP_STOCKFISH_LOG_LEVEL=warn
RUN useradd -m mcpuser
USER mcpuser
ENTRYPOINT ["mcp-stockfish"]

FROM node:22-bookworm-slim AS gateway
WORKDIR /gateway
COPY gateway/package.json gateway/package-lock.json ./
RUN npm ci --omit=dev
COPY gateway/server.mjs ./

FROM stdio AS http
# Node's binary only needs glibc and libstdc++, which the stdio stage already has (Stockfish needs them too).
COPY --from=gateway /usr/local/bin/node /usr/local/bin/node
COPY --from=gateway /gateway /opt/gateway
ENV PORT=8080 \
    ENGINE_POOL_SIZE=2
EXPOSE 8080
ENTRYPOINT ["node", "/opt/gateway/server.mjs"]
