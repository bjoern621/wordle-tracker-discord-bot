# ca-certificates is needed for HTTPS fetches of the Activity's grid images.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

# docker-compose overrides this per service (bot vs logger).
CMD ["node", "src/bot.js"]
