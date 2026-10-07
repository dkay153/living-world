FROM node:22.23.3-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY public ./public
COPY scripts ./scripts
COPY config ./config
COPY docs ./docs
RUN mkdir /app/data && chown node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/data BACKUP_DIR=/app/data/backups
EXPOSE 3000
VOLUME /app/data
CMD ["node", "server/index.js"]
