# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /workspace
ARG NPM_CONFIG_REGISTRY=https://registry.npmmirror.com

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY plugin-poc/minecraft-js/package.json plugin-poc/minecraft-js/package.json

FROM base AS build
RUN --mount=type=cache,target=/root/.npm \
  npm ci --workspace @gamemulti/api --include-workspace-root=false
COPY apps/api apps/api
RUN npm --workspace @gamemulti/api run prisma:generate \
  && npm --workspace @gamemulti/api run build

FROM build AS migration
ENV NODE_ENV=production
WORKDIR /workspace/apps/api
ENTRYPOINT ["npx", "prisma"]
CMD ["migrate", "deploy", "--schema=prisma/schema.prisma"]

FROM base AS production-dependencies
ENV NODE_ENV=production
RUN --mount=type=cache,target=/root/.npm \
  npm ci --omit=dev --workspace @gamemulti/api --include-workspace-root=false

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
  PORT=3401
WORKDIR /workspace/apps/api

COPY --from=production-dependencies /workspace/node_modules /workspace/node_modules
COPY --from=build /workspace/node_modules/.prisma /workspace/node_modules/.prisma
COPY --from=build /workspace/node_modules/@prisma/client /workspace/node_modules/@prisma/client
COPY --from=build /workspace/apps/api/dist ./dist
COPY apps/api/package.json ./package.json

USER node
EXPOSE 3401
CMD ["node", "dist/main.js"]
