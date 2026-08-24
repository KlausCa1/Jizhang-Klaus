# 轻量镜像（适用于任意支持容器的云主机：Fly.io / Railway / 腾讯云 / 阿里云 等）
FROM node:18-alpine
WORKDIR /app
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
