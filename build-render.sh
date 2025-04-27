#!/bin/bash

# Exit on error
set -e

echo "Starting specialized Render build process..."

# Install dependencies
echo "Installing dependencies..."
npm install

# Create dist directories
mkdir -p dist
mkdir -p dist/server
mkdir -p dist/server/discord
mkdir -p dist/shared

# Copy shared schema
echo "Copying shared schema..."
cp shared/schema.ts dist/shared/

# Build server files with esbuild directly
echo "Building server with esbuild..."
npx esbuild \
  server/index.ts \
  server/routes.ts \
  server/storage.ts \
  server/vite.ts \
  server/db.ts \
  server/discord/bot.ts \
  server/discord/commands.ts \
  server/discord/verification.ts \
  --platform=node \
  --target=node16 \
  --format=cjs \
  --bundle \
  --outdir=dist/server \
  --external:express \
  --external:discord.js \
  --external:@neondatabase/serverless \
  --external:drizzle-orm \
  --external:ws \
  --external:noblox.js \
  --external:zod

# Copy over package.json to dist directory for runtime reference
cp package.json dist/

echo "Build completed successfully!"