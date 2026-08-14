# --- HMS backend (Express API) ---
FROM node:22-alpine

WORKDIR /app

# Install deps first for better layer caching.
COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 5000

# Uploads (local storage driver) persist via a mounted volume in compose.
CMD ["node", "src/server.js"]
