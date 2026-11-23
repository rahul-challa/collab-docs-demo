# Single image: builds the React client, then serves it and the API from one Node process.
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
COPY client/package*.json ./client/
RUN npm ci --omit=dev && npm --prefix client ci
COPY . .
RUN npm --prefix client run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3001 DB_PATH=/data/collabdocs.db
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/client/dist ./client/dist
COPY package.json ./
COPY server ./server
VOLUME /data
EXPOSE 3001
CMD ["node", "--no-warnings=ExperimentalWarning", "server/index.js"]
