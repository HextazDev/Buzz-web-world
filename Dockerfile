# =============================================================================
# Buzz! Web World — Multi-Stage Cloud-First Production Dockerfile (Issue #9)
# =============================================================================
# Construit l'ensemble du monorepo (@buzz/shared, @buzz/server, @buzz/web)
# et exécute l'application sous un utilisateur non-root (node) sans secret en dur.

FROM node:22-alpine AS builder
WORKDIR /app

# Copie des manifestes de dépendances des workspaces
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/

RUN npm ci

# Copie des sources et build complet
COPY packages ./packages
COPY apps ./apps
RUN npm run build

# Stage d'exécution léger et sécurisé
FROM node:22-alpine AS runner
WORKDIR /app/apps/server

ENV NODE_ENV=production
ENV PORT=3456
ENV SERVE_STATIC_WEB=true

COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json /app/
COPY --from=builder --chown=node:node /app/node_modules /app/node_modules
COPY --from=builder --chown=node:node /app/packages/shared/package.json /app/packages/shared/
COPY --from=builder --chown=node:node /app/packages/shared/dist /app/packages/shared/dist
COPY --from=builder --chown=node:node /app/apps/server/package.json /app/apps/server/
COPY --from=builder --chown=node:node /app/apps/server/dist /app/apps/server/dist
COPY --from=builder --chown=node:node /app/apps/server/db /app/apps/server/db
COPY --from=builder --chown=node:node /app/apps/web/dist /app/apps/web/dist

USER node
EXPOSE 3456

CMD ["node", "dist/index.js"]
