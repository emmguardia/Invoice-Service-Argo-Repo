FROM mcr.microsoft.com/playwright:v1.61.0-noble

# Corriger CVE Ubuntu (dirmngr, gpg, git, libtiff6)
USER root
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

# Corriger CVE npm global (brace-expansion, tar dans /usr/lib/node_modules/npm)
RUN npm install -g npm@latest

ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=error

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev --no-audit --no-fund 2>/dev/null || npm install --omit=dev --no-audit --no-fund
# Supprimer TOUTES les copies nested vulnérables → Node résout vers le root
RUN for d in $(find node_modules -path "*/node_modules/@isaacs/brace-expansion" -type d 2>/dev/null | grep -v "^node_modules/@isaacs/brace-expansion$"); do rm -rf "$d"; done; \
    for d in $(find node_modules -path "*/node_modules/tar" -type d 2>/dev/null | grep -v "^node_modules/tar$"); do rm -rf "$d"; done

COPY src/ ./src/
COPY templates/ ./templates/

RUN mkdir -p /app/secrets && chown -R 1000:1000 /app

USER 1000

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "const http=require('http');http.get('http://localhost:8080/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "src/server.js"]
