FROM mcr.microsoft.com/playwright:v1.44.1-jammy

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
