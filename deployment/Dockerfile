FROM node:24-bookworm-slim
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN pnpm install --frozen-lockfile --filter streamcinema-server...
COPY server server
RUN pnpm --dir server build
ENV NODE_ENV=production
WORKDIR /app/server
USER node
EXPOSE 8080
CMD ["node", "dist/index.js"]
