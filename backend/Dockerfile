FROM mcr.microsoft.com/playwright:v1.44.1-jammy

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .

EXPOSE 10000

CMD ["node", "server.js"]
