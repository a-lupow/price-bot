# Specify the base Docker image for Raspberry Pi / ARM64 builds with system Chromium.
FROM node:20-bookworm AS builder

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

# Install build dependencies only.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package manifest and lockfile first to maximize Docker layer cache hits.
COPY package.json pnpm-lock.yaml ./

# Install all dependencies needed for the build.
RUN pnpm install --frozen-lockfile

# Next, copy the source files.
COPY . ./

# Build the project.
RUN pnpm run build

# Create final image with system Chromium installed from Debian packages.
FROM node:20-bookworm

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV="production"
ENV CHROMIUM_EXECUTABLE_PATH="/usr/bin/chromium"

RUN corepack enable

# Install Chromium and the runtime libraries it needs on Debian Bookworm.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        chromium \
        ca-certificates \
        fonts-liberation \
        gstreamer1.0-libav \
        gstreamer1.0-plugins-bad \
        gstreamer1.0-plugins-base \
        gstreamer1.0-plugins-good \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libavif15 \
        libc6 \
        libcairo2 \
        libcups2 \
        libdbus-1-3 \
        libdrm2 \
        libenchant-2-2 \
        libexpat1 \
        libflite1 \
        libfontconfig1 \
        libgbm1 \
        libgcc-s1 \
        libglib2.0-0 \
        libgraphene-1.0-0 \
        libgstreamer-gl1.0-0 \
        libgstreamer-plugins-bad1.0-0 \
        libgstreamer-plugins-base1.0-0 \
        libgstreamer1.0-0 \
        libgtk-3-0 \
        libgtk-4-1 \
        libharfbuzz-icu0 \
        libhyphen0 \
        libmanette-0.2-0 \
        libnspr4 \
        libnss3 \
        libopengl0 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libsecret-1-0 \
        libstdc++6 \
        libwoff1 \
        libx11-6 \
        libx11-xcb1 \
        libx264-164 \
        libxcb1 \
        libxcomposite1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxkbcommon0 \
        libxrandr2 \
        xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy package manifest, lockfile, config, startup script, and migrations needed at runtime.
COPY package.json pnpm-lock.yaml drizzle.config.ts ./
COPY docker/start.sh ./docker/start.sh
COPY drizzle ./drizzle

# Install all dependencies so drizzle-kit is available for startup migrations.
RUN pnpm install --frozen-lockfile

# Copy only built JS files from builder image.
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/env.ts ./src/env.ts

# Ensure the startup script is executable.
RUN chmod +x ./docker/start.sh

# Run the application through the startup script so migrations execute first.
CMD ["./docker/start.sh"]
