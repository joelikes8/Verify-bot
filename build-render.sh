#!/bin/bash

# Exit on error
set -e

echo "Starting Render build process..."

# Install dependencies
echo "Installing dependencies..."
npm install

# Build frontend
echo "Building frontend with Vite..."
NODE_ENV=production npx vite build

# Create server directory
mkdir -p dist/server

# Copy static data if needed
echo "Copying necessary static files..."
cp -r shared dist/

# Compile server code with esbuild
echo "Building server with esbuild..."
npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist/server

echo "Build completed successfully!"