FROM node:20-alpine AS builder

WORKDIR /app

ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tec3_gestao

COPY package*.json ./
RUN npm install --ignore-scripts

COPY . .
RUN npm run prisma:generate
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

RUN apk add --no-cache wget

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 expressjs

COPY --from=builder --chown=expressjs:nodejs /app/dist ./dist
COPY --from=builder --chown=expressjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=expressjs:nodejs /app/package*.json ./
COPY --from=builder --chown=expressjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=expressjs:nodejs /app/prisma.config.ts ./prisma.config.ts

RUN mkdir -p uploads && chown expressjs:nodejs uploads

USER expressjs

EXPOSE 5000

CMD ["node", "dist/index.js"]
