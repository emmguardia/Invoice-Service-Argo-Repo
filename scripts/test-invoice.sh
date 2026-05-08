#!/usr/bin/env bash
# Test bout-en-bout invoice-service: signe un JWT, port-forward, envoie une facture-test à 0 €.
# Usage: bash test-invoice.sh [email destinataire]
# Pré-requis sur le serveur: kubectl, openssl (toujours dispo), curl, base64.

set -euo pipefail

TO_EMAIL="${1:-enzomonnetmata@gmail.com}"
NAMESPACE_INVOICE="invoice-service"
NAMESPACE_BACKEND="clos-de-la-reine"
LOCAL_PORT="${LOCAL_PORT:-18080}"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"; [[ -n "${PF_PID:-}" ]] && kill "$PF_PID" 2>/dev/null || true' EXIT

echo "==> Récupération clé privée JWT du Backend"
kubectl get secret clos-secrets -n "$NAMESPACE_BACKEND" \
  -o jsonpath='{.data.jwt-invoice-private-key}' \
  | base64 -d > "$TMPDIR/key.pem"

if [[ ! -s "$TMPDIR/key.pem" ]]; then
  echo "ERREUR: impossible de récupérer jwt-invoice-private-key depuis clos-secrets" >&2
  echo "Vérifie le nom de la clé:" >&2
  kubectl get secret clos-secrets -n "$NAMESPACE_BACKEND" -o jsonpath='{.data}' | jq -r 'keys[]' 2>/dev/null || \
    kubectl get secret clos-secrets -n "$NAMESPACE_BACKEND" -o yaml | grep -E '^  [a-z]'
  exit 1
fi

echo "==> Signature JWT (RS256, issuer=clos-de-la-reine-back, expiresIn=5min)"
NOW=$(date +%s)
EXP=$((NOW + 300))

HEADER='{"alg":"RS256","typ":"JWT"}'
PAYLOAD=$(printf '{"project":"clos-de-la-reine","permissions":["generate_invoice"],"iss":"clos-de-la-reine-back","iat":%s,"exp":%s}' "$NOW" "$EXP")

b64url() { base64 -w0 | tr '+/' '-_' | tr -d '='; }

H=$(printf '%s' "$HEADER"  | b64url)
P=$(printf '%s' "$PAYLOAD" | b64url)
S=$(printf '%s.%s' "$H" "$P" | openssl dgst -sha256 -sign "$TMPDIR/key.pem" | b64url)
JWT="$H.$P.$S"

echo "JWT: ${JWT:0:40}...${JWT: -10}"

echo "==> Port-forward invoice-service sur localhost:$LOCAL_PORT"
kubectl -n "$NAMESPACE_INVOICE" port-forward svc/invoice-service "$LOCAL_PORT:8080" >/dev/null 2>&1 &
PF_PID=$!
sleep 3

if ! curl -s --max-time 3 "http://localhost:$LOCAL_PORT/health" | grep -q '"status":"ok"'; then
  echo "ERREUR: /health KO — port-forward défaillant ou service down" >&2
  kubectl -n "$NAMESPACE_INVOICE" get pods
  exit 1
fi

ORDER_NUMBER="ZZ-TEST-$(date +%Y%m%d-%H%M%S)"
echo "==> Envoi facture-test (orderNumber=$ORDER_NUMBER, to=$TO_EMAIL)"

BODY=$(cat <<JSON
{
  "project": "clos-de-la-reine",
  "to_email": "$TO_EMAIL",
  "order_data": {
    "orderNumber": "$ORDER_NUMBER",
    "customerName": "TEST - Enzo Monnet-Mata",
    "customerEmail": "$TO_EMAIL",
    "items": [
      { "name": "Article test (ne pas comptabiliser)", "quantity": 1, "price": 0 }
    ],
    "shippingCost": 0,
    "totalAmount": 0,
    "shippingAddress": {
      "address": "1 chemin de la Marnière",
      "postalCode": "77150",
      "city": "Lésigny",
      "country": "France"
    }
  }
}
JSON
)

RESPONSE=$(curl -sS -w "\n__HTTP__%{http_code}" \
  -X POST "http://localhost:$LOCAL_PORT/api/v1/generate-and-send" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d "$BODY")

HTTP_CODE=$(echo "$RESPONSE" | grep '^__HTTP__' | sed 's/__HTTP__//')
BODY_RESP=$(echo "$RESPONSE" | sed '$ d')

echo "==> HTTP $HTTP_CODE"
echo "$BODY_RESP" | jq . 2>/dev/null || echo "$BODY_RESP"

if [[ "$HTTP_CODE" == "200" ]]; then
  echo ""
  echo "✅ OK — vérifie ta boîte mail ($TO_EMAIL) et le bucket R2 (clos-invoices/invoices/clos-de-la-reine/...)"
  exit 0
else
  echo ""
  echo "❌ Échec — voir les logs:"
  echo "   kubectl -n $NAMESPACE_INVOICE logs deploy/invoice-service --tail=50"
  exit 1
fi
