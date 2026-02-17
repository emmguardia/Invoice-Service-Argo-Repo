# Invoice-Service

Service de génération de factures PDF (Playwright + Handlebars) pour Le Clos de la Reine.

## Flux

1. Backend Clos reçoit la confirmation de paiement Stripe
2. Backend appelle Invoice-Service avec les données de commande
3. Invoice-Service génère un PDF depuis le template HTML
4. Invoice-Service envoie l'email avec le PDF en pièce jointe via Email-Service (Gmail)

## Déploiement

### 1. Clé Invoice (déjà générée)

Les clés `jwt_invoice_private.pem` et `jwt_invoice_public.pem` sont dans `Invoice-Service-Argo-Repo/`. La clé privée est déjà dans `clos-secrets` (backend Clos).

### 2. Créer le secret `invoice-service-secrets`

**Option A – En local (clé depuis `Email-Service/K3s/secret.yaml`) :**

```bash
node scripts/extract-email-key.js   # génère jwt_email_private.pem
# Copie jwt_invoice_public.pem + jwt_email_private.pem sur le serveur, puis :
kubectl create secret generic invoice-service-secrets -n invoice-service \
  --from-file=jwt_public_key.pem=./jwt_invoice_public.pem \
  --from-file=jwt_private_key.pem=./jwt_email_private.pem
```

**Option B – Sur le serveur (si clos-secrets existe déjà) :**

```bash
kubectl get secret clos-secrets -n clos-de-la-reine -o jsonpath='{.data.jwt-private-key}' | base64 -d > /tmp/jwt_email_private.pem
kubectl create secret generic invoice-service-secrets -n invoice-service \
  --from-file=jwt_public_key.pem=./jwt_invoice_public.pem \
  --from-file=jwt_private_key.pem=/tmp/jwt_email_private.pem
rm /tmp/jwt_email_private.pem
```

### 3. ArgoCD

Créer une Application ArgoCD pointant vers ce repo, path `charts/invoice-service`, namespace `invoice-service`.

### 4. ghcr-secret

Créer le namespace puis copier le secret (sur le serveur K3s) :

```bash
kubectl create namespace invoice-service
kubectl get secret ghcr-secret -n zenix -o json | jq 'del(.metadata.namespace, .metadata.resourceVersion, .metadata.uid, .metadata.creationTimestamp, .metadata.selfLink) | .metadata.namespace = "invoice-service"' | kubectl apply -n invoice-service -f -
```

## Structure

```
Invoice-Service-Argo-Repo/
├── src/
│   ├── server.js
│   ├── middleware/auth.js
│   └── services/invoiceService.js
├── templates/
│   └── invoice.html
├── charts/invoice-service/
├── Dockerfile
└── .github/workflows/build-and-push.yml
```
