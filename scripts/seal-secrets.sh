#!/bin/bash
# Chiffre invoice-service-secrets.yaml avec kubeseal
# Utilise le pub-cert.pem du Clos-De-La-Reine-Argo-Repo
# Le fichier plain reste local, seul le SealedSecret est commité

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SECRETS_PLAIN="$REPO_ROOT/charts/invoice-service/secrets/invoice-service-secrets.yaml"
SEALED_TEMPLATE="$REPO_ROOT/charts/invoice-service/templates/sealed-secret.yaml"
CERT="${CERT:-$REPO_ROOT/../Clos-De-La-Reine-Argo-Repo/pub-cert.pem}"

if [ ! -f "$SECRETS_PLAIN" ]; then
  echo "❌ Fichier non trouvé: $SECRETS_PLAIN"
  exit 1
fi
if [ ! -f "$CERT" ]; then
  echo "❌ Certificat non trouvé: $CERT"
  echo "   Définis CERT=chemin/vers/pub-cert.pem si besoin"
  exit 1
fi

echo "🔐 Chiffrement de invoice-service-secrets..."
kubeseal --format yaml --cert "$CERT" --scope namespace-wide < "$SECRETS_PLAIN" | \
  sed 's/namespace: invoice-service/namespace: {{ include "invoice.namespace" . }}/g' > "$SEALED_TEMPLATE"

echo "✅ sealed-secret.yaml mis à jour"
echo "   Fichier plain (ne pas committer): $SECRETS_PLAIN"
