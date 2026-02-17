#!/bin/bash
# À exécuter sur le serveur K3s (où kubectl fonctionne)
# Prérequis : copier jwt_invoice_public.pem et jwt_email_private.pem sur le serveur
# Pour jwt_email_private.pem : en local, lance "node scripts/extract-email-key.js" (depuis Email-Service/K3s/secret.yaml)

set -e

# 1. Créer le namespace si besoin
kubectl create namespace invoice-service 2>/dev/null || true

# 2. Extraire la clé Email-Service depuis clos-secrets (ou utiliser jwt_email_private.pem généré par extract-email-key.js)
if [ ! -f jwt_email_private.pem ]; then
  kubectl get secret clos-secrets -n clos-de-la-reine -o jsonpath='{.data.jwt-private-key}' | base64 -d > /tmp/jwt_email_private.pem
  JWT_PRIV=/tmp/jwt_email_private.pem
else
  JWT_PRIV=./jwt_email_private.pem
fi

# 3. Créer invoice-service-secrets
# jwt_public_key.pem = clé publique Invoice (pour vérifier le backend)
# jwt_private_key.pem = clé Email-Service (pour signer vers Email-Service)
kubectl create secret generic invoice-service-secrets -n invoice-service \
  --from-file=jwt_public_key.pem=./jwt_invoice_public.pem \
  --from-file=jwt_private_key.pem=$JWT_PRIV \
  --dry-run=client -o yaml | kubectl apply -f -

[ -f /tmp/jwt_email_private.pem ] && rm -f /tmp/jwt_email_private.pem

echo "✅ invoice-service-secrets créé dans le namespace invoice-service"
echo ""
echo "Pense à copier jwt_invoice_public.pem sur le serveur avant de lancer ce script."
