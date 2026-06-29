# Build stage: compile TypeScript to dist/ with the full dependency set.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build

# Runtime stage: production deps plus the compiled output only.
# ca-certificates is needed for HTTPS fetches of the Activity's grid images.
FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
# Bundled assets loaded at runtime: the font for the canvas renderers and the
# answer word list for the /share solver overlays.
COPY assets/fonts ./assets/fonts
COPY assets/words ./assets/words

# docker-compose overrides this per service (bot vs logger).
CMD ["node", "dist/index.js"]
