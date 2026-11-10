# BlackBoard Next – three images from one Dockerfile:
#
#   web       the static app served by nginx; /api/ is passed on to the API
#   api       the account and cloud server (server/, Node with SQLite)
#   compiler  C/C++ to Intel HEX for the ATmega328P (compiler/, arduino-cli)
#
#   docker build --target web -t blackboard-next .
#   docker build --target api -t blackboard-api .
#   docker build --target compiler -t blackboard-compiler .
#   docker compose up -d --build        # all three, see compose.yaml
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

# arduino-cli with the Arduino AVR core (avr-gcc 7.3, as in the Arduino IDE)
# and the libraries for the parts BlackBoard simulates. It compiles code from
# the web, so the container holds nothing secret and has no network (see
# compose.yaml); the API passes the requests on. A glibc image: the Arduino
# tools are built for it.
FROM node:26-slim AS compiler
ARG ARDUINO_CLI_VERSION=1.5.1
ARG ARDUINO_CLI_SHA256=28a8e119c498a25607821c36cb2dc49e8463941b261a0d99091baa7bc692dd2b
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
ADD --checksum=sha256:${ARDUINO_CLI_SHA256} https://downloads.arduino.cc/arduino-cli/arduino-cli_${ARDUINO_CLI_VERSION}_Linux_64bit.tar.gz /tmp/arduino-cli.tgz
RUN tar -xzf /tmp/arduino-cli.tgz -C /usr/local/bin arduino-cli && rm /tmp/arduino-cli.tgz
USER node
WORKDIR /home/node
ENV ARDUINO_UPDATER_ENABLE_NOTIFICATION=false
RUN arduino-cli core update-index \
 && arduino-cli core install arduino:avr@1.8.6 \
 && arduino-cli lib install LiquidCrystal@1.0.7 Servo@1.2.2 Stepper@1.1.3
WORKDIR /app
COPY compiler/*.ts ./
RUN node main.ts --check
ENV NODE_ENV=production PORT=8789 JOBS=2
EXPOSE 8789
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:8789/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "main.ts"]
