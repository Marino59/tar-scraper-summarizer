FROM node:20-slim

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --ignore-scripts

# Let Playwright install Chromium AND all its system dependencies automatically
ENV PLAYWRIGHT_BROWSERS_PATH=/pw-browsers
RUN npx playwright install --with-deps chromium

COPY . .

EXPOSE 10000

CMD ["node", "server.js"]
