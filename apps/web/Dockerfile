# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app
COPY apps/web/package*.json ./
RUN npm ci
COPY apps/web ./
# Inject public endpoints at build time so Next.js client code uses them
ARG SIGNALING_WS
ARG COORDINATOR_HTTP
ARG MATCH_ENGINE_HTTP
ARG ATPROTO_APPVIEW_HOST
ARG ATPROTO_PDS_URL
ENV SIGNALING_WS=${SIGNALING_WS}
ENV COORDINATOR_HTTP=${COORDINATOR_HTTP}
ENV MATCH_ENGINE_HTTP=${MATCH_ENGINE_HTTP}
ENV ATPROTO_APPVIEW_HOST=${ATPROTO_APPVIEW_HOST}
ENV ATPROTO_PDS_URL=${ATPROTO_PDS_URL}
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV PORT=3000 NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "run", "start"]


