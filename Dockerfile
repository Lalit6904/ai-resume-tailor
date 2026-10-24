# syntax=docker/dockerfile:1

# ---- Build the React client ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci

COPY client client
COPY server server
RUN npm run build

# ---- Production runtime ----
FROM node:22-bookworm-slim AS runtime

# Optional: install LibreOffice for PDF previews. The app honestly falls back to
# an HTML content preview when no renderer is available.
ARG INSTALL_LIBREOFFICE=false

ENV NODE_ENV=production \
    PORT=4000 \
    STORAGE_DIR=/app/storage \
    NODE_OPTIONS=--enable-source-maps

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends dumb-init ca-certificates gosu \
  && if [ "$INSTALL_LIBREOFFICE" = "true" ]; then \
       apt-get install -y --no-install-recommends libreoffice-writer fonts-dejavu-core; \
     fi \
  && rm -rf /var/lib/apt/lists/*

# Install production dependencies only.
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci --omit=dev && npm cache clean --force

# Client build + server source.
COPY --from=build /app/client/dist client/dist
COPY server/src server/src
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh \
  && mkdir -p /app/storage \
  && chown -R node:node /app

EXPOSE 4000
VOLUME ["/app/storage"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Starts as root only to fix ownership of a mounted storage disk, then execs the
# application as the unprivileged "node" user.
ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "server/src/server.js"]
