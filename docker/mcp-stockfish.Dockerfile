# Builds sonirico/mcp-stockfish at a pinned commit.
# The upstream Dockerfile installs Stockfish from Alpine 3.19, which no longer ships it,
# so the runtime stage uses Debian's stockfish package instead.

FROM golang:1.23-bookworm AS builder
ARG MCP_STOCKFISH_REF=eafa8f5c89876222b3b3b4be7324c2f613516957
WORKDIR /src
RUN git clone https://github.com/sonirico/mcp-stockfish.git . && git checkout "$MCP_STOCKFISH_REF"
RUN CGO_ENABLED=0 go build -ldflags "-s -w" -o /out/mcp-stockfish .

FROM debian:trixie-slim
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
