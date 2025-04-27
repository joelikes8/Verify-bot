FROM node:18-slim

WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy project files
COPY . .

# Build the application
RUN npm run build

# Set environment variables
ENV NODE_ENV=production

# Expose the port
EXPOSE 10000
ENV PORT=10000

# Start the application
CMD ["node", "dist/server/index.js"]