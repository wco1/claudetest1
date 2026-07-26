FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
FROM node:22-alpine

# ffprobe lets the indexer read real audio tracks out of containers instead of
# guessing from filenames.
RUN apk add --no-cache ffmpeg tini

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
COPY server/package.json ./server/
RUN npm install --omit=dev --no-audit --no-fund --workspace=server

COPY server ./server
COPY --from=build /app/web/dist ./web/dist

RUN addgroup -S kino && adduser -S kino -G kino && mkdir -p /app/data && chown -R kino:kino /app/data
USER kino

EXPOSE 8080
ENV HOST=0.0.0.0 PORT=8080 DATA_DIR=/app/data

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/src/index.js"]
