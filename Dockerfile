FROM mcr.microsoft.com/playwright:v1.49.0-noble

ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=error \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

RUN groupadd -r appuser 2>/dev/null || true && \
    useradd -r -g appuser -u 1000 appuser 2>/dev/null || true

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev --no-audit --no-fund 2>/dev/null || npm install --omit=dev --no-audit --no-fund && \
    npx playwright install chromium && \
    npm cache clean --force 2>/dev/null || true

COPY src/ ./src/
COPY templates/ ./templates/

RUN mkdir -p /app/secrets && chown -R 1000:1000 /app 2>/dev/null || true

USER 1000

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "const http=require('http');http.get('http://localhost:8080/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "src/server.js"]
