# Global build arg — available in all stages
ARG APP_VERSION=dev

# ----- Stage 1: Build -----
FROM node:24-slim AS builder

ARG APP_VERSION

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV APP_VERSION=${APP_VERSION}

RUN npm run build
RUN npm pkg delete scripts.prepare && npm ci --omit=dev


# ----- Stage 2: Runtime -----
FROM node:24-slim

ARG APP_VERSION

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ffmpeg \
      python3 \
      curl \
      ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    groupadd -r scrolly && useradd -r -g scrolly -m scrolly

WORKDIR /app

COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/src/lib/server/db/migrations ./migrations

RUN mkdir -p /app/data && chown -R scrolly:scrolly /app

ENV APP_VERSION=${APP_VERSION}
ENV NODE_ENV=production
ENV PORT=3000
# SvelteKit CSRF protection — must match the public URL when behind a reverse proxy.
# docker-compose.yml overrides this with PUBLIC_APP_URL or DOMAIN.
ENV ORIGIN=http://localhost:3000

VOLUME /app/data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

USER scrolly

CMD ["node", "build/index.js"]
