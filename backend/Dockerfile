# Production image. Development uses Dockerfile.dev, which bind-mounts the
# source and runs tsx watch; nothing here is shared with it deliberately —
# the two have opposite goals.

# ─────────────────────────────────────────────────────────────
# deps — every dependency, dev included. Separate stage so the install
# layer stays cached as long as the lockfile doesn't move.
# ─────────────────────────────────────────────────────────────
FROM node:26-slim AS deps

WORKDIR /app

# Same pin as Dockerfile.dev, so both images resolve the lockfile the same way.
RUN npm install -g pnpm@10.10.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ─────────────────────────────────────────────────────────────
# build — generate, then compile. The order is not interchangeable.
# ─────────────────────────────────────────────────────────────
FROM deps AS build

WORKDIR /app
COPY . .

# The prisma-client generator writes TypeScript into src/generated/prisma,
# which tsconfig's `include: ["src/**/*"]` then compiles into
# dist/generated/prisma. Running tsc first would compile a directory that
# does not exist yet.
#
# The URL is scoped to this one command rather than set as ENV: `generate`
# reads the schema and never opens a connection, and a placeholder left in
# the image environment is a plausible-looking string that a later stage
# could pick up by accident.
RUN DATABASE_URL="postgresql://unused:unused@127.0.0.1:5432/unused?schema=public" \
    pnpm exec prisma generate

RUN pnpm build

# tsc emits .ts and .js (allowJs carries routes/index.js and
# utils/persianToEnglish.js across) but copies nothing else. If the generator
# ever emits a non-TypeScript asset — a wasm query compiler, a schema copy —
# it would be silently missing from dist and only surface at runtime.
RUN mkdir -p dist/generated/prisma && \
    cd src/generated/prisma && \
    find . -type f ! -name '*.ts' -exec cp --parents {} /app/dist/generated/prisma/ \;

# ─────────────────────────────────────────────────────────────
# prod-deps — the same install without devDependencies.
# ─────────────────────────────────────────────────────────────
FROM node:26-slim AS prod-deps

WORKDIR /app
RUN npm install -g pnpm@10.10.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

# ─────────────────────────────────────────────────────────────
# runtime — dist and production dependencies, nothing else. No tsx, no
# compiler, no prisma CLI, no source.
# ─────────────────────────────────────────────────────────────
FROM node:26-slim AS runtime

WORKDIR /app

# Set here rather than in compose: with NODE_ENV unset the refresh cookie
# goes out without `Secure`, which is a silent downgrade nobody would notice
# in a working app. Baking it in means forgetting an environment variable
# cannot cause it.
ENV NODE_ENV=production

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node

EXPOSE 5001

CMD ["node", "dist/server.js"]

# ─────────────────────────────────────────────────────────────
# tooling — migrations and seed. Never runs alongside the API: it is the
# only container that connects as the database owner (DATABASE_URL), and
# the owner bypasses RLS, so that credential must not exist in the
# environment of a process that serves requests.
#
# Built from `build` rather than assembled again: it needs the prisma CLI,
# tsx, the schema, the migrations and seed.ts, which is everything that
# stage already has.
# ─────────────────────────────────────────────────────────────
FROM build AS tooling

CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]