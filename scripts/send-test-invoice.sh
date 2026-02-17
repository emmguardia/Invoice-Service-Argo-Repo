#!/bin/bash
# Script tout-en-un : récupère la clé, port-forward, envoie la facture test, nettoie
# Usage : ./scripts/send-test-invoice.sh   ou   sudo ./scripts/send-test-invoice.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

TMP_KEY=$(mktemp)
PF_PID=""

cleanup() {
  if [ -n "$PF_PID" ] && kill -0 "$PF_PID" 2>/dev/null; then
    kill "$PF_PID" 2>/dev/null || true
  fi
  rm -f "$TMP_KEY"
}
trap cleanup EXIT

echo "📥 Récupération de la clé JWT depuis le cluster..."
kubectl get secret clos-secrets -n clos-de-la-reine -o jsonpath='{.data.jwt-invoice-private-key}' 2>/dev/null | base64 -d > "$TMP_KEY" || {
  echo "❌ Impossible de récupérer le secret. Vérifie que kubectl est configuré et que tu as accès au cluster."
  exit 1
}

echo "🔌 Démarrage du port-forward (invoice-service:8080 -> localhost:8080)..."
kubectl port-forward -n invoice-service svc/invoice-service 8080:8080 &
PF_PID=$!

echo "⏳ Attente que le port soit prêt (3s)..."
sleep 3

echo "📤 Envoi de la facture test..."
INVOICE_SERVICE_URL=http://localhost:8080 JWT_INVOICE_PRIVATE_KEY_PATH="$TMP_KEY" node test-invoice.js

echo ""
echo "✅ Terminé ! Vérifie ta boîte mail (enzomonnetmata@gmail.com)"
