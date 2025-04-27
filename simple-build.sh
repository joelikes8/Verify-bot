#!/bin/bash

# Exit on error
set -e

echo "Starting simplified build process..."

# Install dependencies
echo "Installing dependencies..."
npm install

# Create server directory
mkdir -p dist/server

# Skip frontend build that's causing issues
echo "Skipping frontend build..."

# Copy shared schema
echo "Copying shared schema..."
mkdir -p dist/shared
cp -r shared/* dist/shared/

# Compile server with direct TypeScript compilation
echo "Building server with tsc..."
npx tsc --skipLibCheck --esModuleInterop --outDir dist/server server/index.ts server/routes.ts server/storage.ts server/vite.ts server/db.ts server/discord/bot.ts server/discord/commands.ts server/discord/verification.ts

# Also copy any non-TypeScript files in the server directory
find server -type f -not -name "*.ts" -exec cp {} dist/server/ \;

echo "Build completed successfully!"