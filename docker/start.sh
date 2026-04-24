#!/bin/sh

set -eu

echo "Starting container bootstrap..."

echo "Database service is marked healthy. Running database migrations..."
pnpm drizzle-kit migrate

echo "Starting application..."
exec pnpm run start:prod
