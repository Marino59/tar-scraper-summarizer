FROM mcr.microsoft.com/playwright:v1.44.1-jammy

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .

EXPOSE 10000

# Set PLAYWRIGHT_BROWSERS_PATH before Node starts so Playwright's module init reads the correct path.
# The 'VAR=value command' syntax overrides parent-shell env vars for the child process.
CMD ["sh", "-c", "PLAYWRIGHT_BROWSERS_PATH=/ms-playwright node server.js"]
