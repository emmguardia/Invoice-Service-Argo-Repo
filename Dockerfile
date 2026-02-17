FROM mcr.microsoft.com/playwright:v1.49.0-noble

ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=error

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev --no-audit --no-fund 2>/dev/null || npm install --omit=dev --no-audit --no-fund

COPY src/ ./src/
COPY templates/ ./templates/

RUN mkdir -p /app/secrets && chown -R 1000:1000 /app

USER 1000

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "const http=require('http');http.get('http://localhost:8080/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "src/server.js"]
