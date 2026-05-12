# Base image
FROM node:20-alpine AS builder

# Create app directory
WORKDIR /app

# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./
COPY prisma ./prisma/

# Install app dependencies
RUN npm ci

# Copy app source
COPY . .

# Generate Prisma client and build NestJS app
RUN npx prisma generate
RUN npm run build

# Production image
FROM node:20-alpine AS production

WORKDIR /app

# Copy the bundled code from the build stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Add a non-root user for security
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs
USER nodejs

# Expose port
EXPOSE 3005

# Start the server
CMD ["npm", "run", "start:prod"]
