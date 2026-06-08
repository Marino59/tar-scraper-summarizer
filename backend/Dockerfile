FROM node:20-slim

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .

EXPOSE 10000

CMD ["node", "server.js"]
