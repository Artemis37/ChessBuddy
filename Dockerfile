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
# CI passes the commit; /api/health reports it so the deploy job can tell the new build is up.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
USER node
EXPOSE 3001
CMD ["node", "--import", "tsx", "server/index.ts"]
