# Debian-based image so better-sqlite3 installs from a prebuilt binary, with
# build tools present as a fallback for architectures without one (e.g. ARM Pi).
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

# docker-compose overrides this per service (bot vs logger).
CMD ["node", "src/bot.js"]
