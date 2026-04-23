# Specify the base Docker image. You can read more about
# the available images at https://crawlee.dev/docs/guides/docker-images
# You can also use any other image from Docker Hub.
FROM apify/actor-node-playwright-chrome:24-1.58.2 AS builder

# Copy package manifest and lockfile first to maximize Docker layer cache hits.
COPY --chown=myuser package.json pnpm-lock.yaml ./

# Install all dependencies needed for the build.
RUN pnpm install --frozen-lockfile

# Next, copy the source files using the user set
# in the base image.
COPY --chown=myuser . ./

# Build the project.
RUN pnpm run build

# Create final image
FROM apify/actor-node-playwright-chrome:24-1.58.2

# Copy package manifest and lockfile first for production dependency install.
COPY --chown=myuser package.json pnpm-lock.yaml ./

# Install only production dependencies.
RUN pnpm install --prod --frozen-lockfile

# Copy only built JS files from builder image.
COPY --from=builder --chown=myuser /home/myuser/dist ./dist

# Run the image. If you know you won't need headful browsers,
# you can remove the XVFB start script for a micro perf gain.
CMD ./start_xvfb_and_run_cmd.sh && pnpm run start:prod
