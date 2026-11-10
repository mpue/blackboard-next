# BlackBoard Next – two images from one Dockerfile:
#
#   web  the static app served by nginx; /api/ is passed on to the API
#   api  the account and cloud server (server/, Node with SQLite)
#
#   docker build --target web -t blackboard-next .
#   docker build --target api -t blackboard-api .
#   docker compose up -d --build        # both, see compose.yaml
#
# The app only uses relative URLs and therefore also works below a path
# prefix (e.g. https://example.org/blackboard/) behind a reverse proxy that
# strips the prefix.

FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29-alpine AS web
# the API as seen from this container, including the path prefix it runs
# under (its PUBLIC_PATH); the entrypoint fills it into the nginx configuration
ENV API_URL=http://api:8787
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1

FROM node:26-alpine AS api
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server/*.ts ./
RUN rm -f *.test.ts && mkdir /data && chown node:node /data
ENV NODE_ENV=production PORT=8787 DATA_DIR=/data
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null "http://127.0.0.1:8787${PUBLIC_PATH}/api/health" || exit 1
CMD ["node", "main.ts"]
