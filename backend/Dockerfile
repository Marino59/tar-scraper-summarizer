FROM mcr.microsoft.com/playwright:v1.44.1-jammy

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm ci

# Copy application source
COPY . .

# Expose backend port
EXPOSE 3001

# Start the application
CMD ["node", "server.js"]
