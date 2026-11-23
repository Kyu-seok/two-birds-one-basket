# The game server, which also serves the built client. See ADR 0006.
FROM node:24-slim
WORKDIR /app

# Dependencies first, so code changes don't reinstall them. --ignore-scripts skips the Husky hook setup.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci --ignore-scripts

COPY packages packages
RUN npm run build --workspace=@tbob/client

# Scores live on a volume mounted at /data, owned by the unprivileged node user.
RUN mkdir /data && chown node:node /data
USER node
ENV PORT=8100 DB_PATH=/data/scores.db
EXPOSE 8100
CMD ["npx", "tsx", "packages/server/src/main.ts"]
