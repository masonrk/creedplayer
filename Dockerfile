# Use an official Node.js image as base
FROM node:18

# Set the working directory
WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install --production

# Copy all files
COPY . .

# Expose a port (if required, otherwise ignore)
EXPOSE 3000

# Start the bot
CMD ["node", "index.js"]