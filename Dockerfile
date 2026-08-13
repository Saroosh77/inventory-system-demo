FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

# Real DATABASE_URL/DIRECT_URL are supplied at runtime via docker-compose's
# environment block, sourced from .env — never baked into the image. Build
# steps above need no DB connection: prisma generate only needs the schema
# file, and every route/page here is force-dynamic (no data fetched at
# build time), both confirmed by testing this Dockerfile end to end.

RUN chown -R node:node /app
USER node

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npm run auth:bootstrap && npm start -- -H 0.0.0.0"]
