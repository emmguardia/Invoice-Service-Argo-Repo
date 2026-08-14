# Service de génération de factures PDF : l'image de base Playwright est
# conservée telle quelle, épinglée en v1.58.2-noble. Elle embarque les
# navigateurs headless dans /ms-playwright (exposé par PLAYWRIGHT_BROWSERS_PATH),
# dont le service a besoin au runtime — la restructurer risquerait de casser la
# génération.
#
# IMPORTANT : la version du paquet npm `playwright` doit correspondre à celle de
# l'image, les révisions de navigateurs étant liées. package.json l'épingle donc
# en 1.58.2 exact. Bouger l'un sans l'autre casse la génération de PDF.
#
# ── CE QUI A CHANGÉ ──────────────────────────────────────────────────────────
#
# 1. `npm install -g npm@latest` supprimé.
#    Il servait à patcher les dépendances bundlées de npm (brace-expansion,
#    tar). Le runtime n'exécute que `node src/server.js` : npm n'y sert à rien.
#    On le retire de l'image après installation, ce qui fait disparaître ces
#    CVE d'un coup plutôt que de courir après leurs versions.
#
# 2. Suppression manuelle des copies imbriquées de brace-expansion et tar
#    supprimée. C'est exactement ce que `pnpm.overrides` fait proprement dans
#    package.json : forcer une version unique dans tout l'arbre, sans `find` ni
#    `rm -rf` sur des chemins devinés.
#
# 3. `npm ci || npm install` remplacé par `pnpm install --frozen-lockfile`.
#    Le fallback silencieux vers `npm install` rendait les builds non
#    reproductibles dès que le lockfile ne collait pas.

FROM mcr.microsoft.com/playwright:v1.58.2-noble

# Corriger CVE Ubuntu (dirmngr, gpg, git, libtiff6)
USER root
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

WORKDIR /app

# pnpm épinglé, installé via le npm de l'image — qui sera retiré ensuite.
RUN npm install -g pnpm@10.33.4 --no-audit --no-fund

# .npmrc porte ignore-scripts=true : le script d'install de Playwright ne
# s'exécute pas. C'est voulu — il servirait à TÉLÉCHARGER les navigateurs, que
# l'image fournit déjà dans /ms-playwright.
COPY package.json pnpm-lock.yaml .npmrc ./

RUN pnpm install --prod --frozen-lockfile \
    && pnpm store prune 2>/dev/null || true

# HARDENING SUPPLY-CHAIN : npm, npx et corepack ne servent plus une fois les
# dépendances installées. Les retirer élimine les CVE de leurs dépendances
# bundlées (brace-expansion, tar, cross-spawn, glob…) sans patch à maintenir.
# pnpm part avec eux : le runtime ne lance que `node`.
RUN rm -rf \
      /usr/lib/node_modules/npm \
      /usr/lib/node_modules/corepack \
      /usr/lib/node_modules/pnpm \
      /usr/lib/node_modules/yarn \
      /usr/local/lib/node_modules/npm \
      /usr/local/lib/node_modules/corepack \
      /usr/local/lib/node_modules/pnpm \
      /usr/bin/npm /usr/bin/npx /usr/bin/corepack /usr/bin/pnpm /usr/bin/pnpx \
      /usr/bin/yarn /usr/bin/yarnpkg \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/pnpm \
      /pnpm \
    && rm -rf /root/.npm /root/.cache 2>/dev/null || true

COPY src/ ./src/
COPY templates/ ./templates/

RUN mkdir -p /app/secrets && chown -R 1000:1000 /app

USER 1000

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "const http=require('http');http.get('http://localhost:8080/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "src/server.js"]
