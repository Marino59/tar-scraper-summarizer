FROM mcr.microsoft.com/playwright:v1.44.1-jammy

# Force Playwright to use browsers pre-installed in this image
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy application source
COPY . .

# Expose backend port
EXPOSE 10000

# Start the application
CMD ["node", "server.js"]
