# Servidor MCP do GeoMannequin (HTTP). Construa a partir da pasta "geomannequin":
#   docker build -f mcp/Dockerfile -t geomannequin-mcp .
#   docker run -p 8787:8787 -e GM_TOKEN=uma-senha geomannequin-mcp
FROM node:22-slim
WORKDIR /app
COPY index.html ./index.html
COPY mcp/package.json mcp/package-lock.json ./mcp/
RUN cd mcp && npm ci --omit=dev
COPY mcp/ ./mcp/
WORKDIR /app/mcp
ENV PORT=8787 NODE_ENV=production
EXPOSE 8787
USER node
CMD ["node", "server.mjs", "--http"]
