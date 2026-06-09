# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Create the runner with Playwright
FROM mcr.microsoft.com/playwright:v1.44.1-jammy
WORKDIR /usr/src/app

# Copy backend dependencies
COPY backend/package*.json ./
RUN npm ci --ignore-scripts

# Copy backend source code
COPY backend/ .

# Copy built frontend dist from Stage 1 into the backend's directory structure
COPY --from=frontend-builder /app/frontend/dist /usr/src/frontend/dist

# Cloud Run injects $PORT at runtime, backend uses it. We document 8080 as a default.
EXPOSE 8080

# Set PLAYWRIGHT_BROWSERS_PATH before Node starts so Playwright's module init reads the correct path.
CMD ["sh", "-c", "PLAYWRIGHT_BROWSERS_PATH=/ms-playwright node server.js"]
