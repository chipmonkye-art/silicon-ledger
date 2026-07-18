FROM node:22-alpine AS client-builder
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22-alpine AS server-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
WORKDIR /app
COPY --from=client-builder /app/client/dist ./client/dist
COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server/ ./server/
COPY db/ ./db/
EXPOSE 4000
ENV NODE_ENV=production
CMD ["node", "server/src/index.js"]
