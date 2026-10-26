# The web app: Express API and the built React client on port 3001 (Azure Container Apps).
# Stockfish runs in its own container (docker/mcp-stockfish.Dockerfile, http target), reached
# through ENGINE_URL. Settings and secrets come from environment variables, never from .env.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    API_PORT=3001
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY tsconfig.json ./
COPY shared ./shared
COPY server ./server
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3001
CMD ["node", "--import", "tsx", "server/index.ts"]
