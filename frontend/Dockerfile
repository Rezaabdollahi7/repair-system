# Production image. Development uses Dockerfile.dev, which bind-mounts the
# source and runs Vite's dev server; nothing here is shared with it.

# ─────────────────────────────────────────────────────────────
# build — `pnpm build` is `tsc --noEmit && vite build`, so a type error
# fails the image rather than shipping. The frontend has no tests; the
# compiler is the only automated gate it has.
# ─────────────────────────────────────────────────────────────
FROM node:26-alpine AS build

WORKDIR /app

RUN npm install -g pnpm@10.10.0

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# No build arg for the API URL on purpose: src/api reads import.meta.env.PROD
# and uses a relative /api, so this image works behind any domain.
RUN pnpm build

# ─────────────────────────────────────────────────────────────
# runtime — static files only. Nothing from node_modules ships; after
# `vite build` the app is HTML, CSS and JS.
#
# nginx-unprivileged rather than the stock nginx image: the stock one runs
# its master process as root, and there is no reason for a container that
# only reads files off disk to have it.
# ─────────────────────────────────────────────────────────────
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html

# 8080, not 80: an unprivileged process cannot bind a port below 1024.
# Nothing external reaches this — the reverse proxy in 7.4 does.
EXPOSE 8080