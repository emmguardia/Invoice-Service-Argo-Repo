FROM mcr.microsoft.com/playwright:v1.58.2-noble

# Corriger CVE Ubuntu (dirmngr, gpg, git, libtiff6)
USER root
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=error

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev --no-audit --no-fund 2>/dev/null || npm install --omit=dev --no-audit --no-fund
# Supprimer les copies nested vulnérables (playwright) → Node résout vers les versions root
RUN rm -rf node_modules/playwright/node_modules/@isaacs node_modules/playwright/node_modules/tar 2>/dev/null || true; \
    rm -rf node_modules/playwright-core/node_modules/@isaacs node_modules/playwright-core/node_modules/tar 2>/dev/null || true

COPY src/ ./src/
COPY templates/ ./templates/

RUN mkdir -p /app/secrets && chown -R 1000:1000 /app

USER 1000

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "const http=require('http');http.get('http://localhost:8080/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "src/server.js"]
