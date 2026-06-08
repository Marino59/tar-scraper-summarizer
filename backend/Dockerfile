FROM node:20-slim

# Install Chromium via apt - path is fixed at /usr/bin/chromium, no env var needed
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Tell Playwright NOT to download its own browser (we use the system one)
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .

EXPOSE 10000

CMD ["node", "server.js"]
