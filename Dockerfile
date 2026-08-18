# --- HMS, whole application in one image ---
#
# Builds the React frontend, then serves it from the Express API process, so a
# deployment is a single service on a single URL. The browser talks only to its
# own origin: no CORS, no cross-origin cookies, and no pair of URLs that have
# to be kept in sync between a frontend host and an API host.
#
# Used by Render (see render.yaml). `docker compose` still builds backend/ and
# frontend/ separately with nginx in front — both remain valid.

# ---------- 1. Build the frontend ----------
FROM node:22-alpine AS frontend

WORKDIR /build

# Dependencies first, so a source-only change doesn't reinstall them.
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./

# Vite inlines VITE_* at BUILD time — there is no runtime configuration for a
# static bundle, so these have to arrive as build args rather than as service
# environment variables. Both are optional:
#
#   • without VITE_SENTRY_DSN the browser still reports every crash to this
#     app's own /api/errors/report, which is where the /errors screen reads
#     from. Only the Sentry half is skipped, and its SDK is never downloaded.
#   • VITE_APP_RELEASE stamps the build onto those reports, so "is that fixed?"
#     is answerable. A DSN is a public value by design — it only permits
#     writing events — so baking it into the bundle is expected, not a leak.
ARG VITE_SENTRY_DSN=""
ARG VITE_APP_RELEASE=""
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ENV VITE_APP_RELEASE=$VITE_APP_RELEASE

RUN npm run build

# ---------- 2. Runtime: API + built frontend ----------
FROM node:22-alpine AS runtime

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/src ./src

# staticSite.js looks here first.
COPY --from=frontend /build/dist ./public

ENV NODE_ENV=production
# Render provides PORT; this is the fallback for a plain `docker run`.
ENV PORT=5000
EXPOSE 5000

# Run as a non-root user. The node image ships one already.
USER node

CMD ["node", "src/server.js"]
