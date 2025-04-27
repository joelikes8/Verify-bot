#!/bin/bash

# Exit on error
set -e

echo "Starting ultra-minimal build process..."

# Install dependencies 
echo "Installing dependencies..."
npm install

# Create output directories
echo "Creating output directories..."
mkdir -p dist
mkdir -p dist/server
mkdir -p dist/server/discord
mkdir -p dist/shared

# Directly copy TypeScript files first
echo "Copying TypeScript files..."
cp -r server dist/
cp -r shared dist/

# Use direct TypeScript compilation instead of bundling
echo "Compiling TypeScript files..."
npx tsc --skipLibCheck \
  --allowJs \
  --esModuleInterop \
  --module CommonJS \
  --moduleResolution Node \
  --resolveJsonModule \
  --target ES2020 \
  --outDir dist

# Copy package files for runtime
echo "Copying package.json..."
cp package.json dist/

echo "Build completed successfully!"