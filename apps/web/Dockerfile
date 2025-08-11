# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app
COPY apps/web/package*.json ./
RUN npm ci
COPY apps/web ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV PORT=3000 NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "run", "start", "--", "-p", "3000"]


