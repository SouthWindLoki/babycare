ARG NODE_IMAGE=public.ecr.aws/docker/library/node:22-bookworm-slim
FROM ${NODE_IMAGE}

WORKDIR /app
COPY package.json server.js ./
COPY public ./public

RUN mkdir -p /app/data
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data
EXPOSE 3000
VOLUME ["/app/data"]

CMD ["node", "--experimental-sqlite", "server.js"]
