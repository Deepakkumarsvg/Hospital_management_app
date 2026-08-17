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
