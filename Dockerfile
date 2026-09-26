# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage: compile the browser half.
#
# A TV cannot run TypeScript, so client/ has to be compiled to plain ES modules.
# This is the only stage that needs npm or the TypeScript compiler, and none of
# it survives into the image below.
# ---------------------------------------------------------------------------
FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.json tsconfig.client.json ./
RUN npm ci

COPY shared/ ./shared/
COPY client/ ./client/
RUN npm run build


# ---------------------------------------------------------------------------
# Runtime stage.
#
# Node 24 strips types on its own, so the server runs straight from .ts source
# with no build step. The project has zero runtime dependencies, so this stage
# carries no node_modules at all -- just Node, ffmpeg, and the source.
# ---------------------------------------------------------------------------
FROM node:24-alpine

# ffmpeg does the remuxing and, when a file needs it, the re-encoding. Alpine's
# build includes libx264, which is the software encoder the policy falls back to
# when no hardware encoder is present -- which is always, inside a container.
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package.json ./
COPY shared/ ./shared/
COPY src/ ./src/
COPY public/ ./public/
COPY --from=build /app/public/app/ ./public/app/

# Both of these are mount points, so settings and thumbnails live outside the
# image and survive it being rebuilt. src/main.ts reads them from here.
ENV PARADISO_CONFIG=/config/config.json \
    PARADISO_CACHE=/cache
RUN mkdir -p /cache /config
VOLUME ["/cache"]

# Always 8080 inside the container. To serve on a different port, remap it from
# outside (`-p 9000:8080`) rather than changing the config -- the healthcheck
# below and EXPOSE both assume 8080.
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1:8080/api/library || exit 1

CMD ["node", "src/main.ts"]
