# BlackBoard Next – static web app served by nginx.
#
# The build needs the classic library from the repository root (parts/,
# symbols/, models/, samples/), so the build context is the repository root:
#
#   docker build -f blackboard-next/Dockerfile -t blackboard-next .
#   docker run -p 8080:8080 blackboard-next
#
# The app only uses relative URLs and therefore also works below a path
# prefix (e.g. https://example.org/blackboard/) behind a reverse proxy that
# strips the prefix.

FROM node:26-alpine AS build
WORKDIR /repo/blackboard-next
COPY blackboard-next/package.json blackboard-next/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY parts /repo/parts
COPY symbols /repo/symbols
COPY models /repo/models
COPY samples /repo/samples
COPY blackboard-next/ ./
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY blackboard-next/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/blackboard-next/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
