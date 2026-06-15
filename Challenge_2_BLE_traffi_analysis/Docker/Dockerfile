FROM node:22-alpine AS build
WORKDIR /app/Web

COPY Web/package*.json ./
RUN npm ci

COPY Web/ ./
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

COPY Docker/server.mjs ./server.mjs
COPY --from=build /app/Web/dist ./dist

USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
