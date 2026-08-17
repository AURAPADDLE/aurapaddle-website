FROM node:22-alpine
WORKDIR /app
COPY . .
ENV HOST=0.0.0.0 PORT=4242 ORDER_DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 4242
CMD ["node","payments/server.mjs"]
