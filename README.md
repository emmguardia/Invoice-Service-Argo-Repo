# Invoice-Service

Service de génération de factures PDF (Playwright + Handlebars) pour Le Clos de la Reine.

## Flux

1. Backend Clos reçoit la confirmation de paiement Stripe
2. Backend appelle Invoice-Service avec les données de commande
3. Invoice-Service génère un PDF depuis le template HTML
4. Invoice-Service envoie l'email avec le PDF en pièce jointe via Email-Service (Gmail)

## Déploiement

### 1. Créer le secret `invoice-service-secrets`

```bash
kubectl create secret generic invoice-service-secrets -n invoice-service \
  --from-file=jwt_private_key.pem=./jwt_private_key.pem \
  --from-file=jwt_public_key.pem=./jwt_public_key.pem
```

**Clés requises :**
- `jwt_private_key.pem` : même clé que le backend Clos (pour signer vers Email-Service)
- `jwt_public_key.pem` : clé publique de la **nouvelle paire** (pour vérifier les requêtes du backend)

### 2. Créer le secret Invoice pour le backend Clos

Le backend signe les requêtes vers Invoice-Service avec une **nouvelle paire** JWT :

```bash
openssl genrsa -out jwt_invoice_private.pem 2048
openssl rsa -in jwt_invoice_private.pem -pubout -out jwt_invoice_public.pem
```

- `jwt_invoice_public.pem` → dans `invoice-service-secrets` (clé `jwt_public_key`)
- Créer le secret `clos-invoice-secret` dans le namespace `clos-de-la-reine` :

```bash
kubectl create secret generic clos-invoice-secret -n clos-de-la-reine \
  --from-file=jwt-invoice-private-key=./jwt_invoice_private.pem
```

### 3. ArgoCD

Créer une Application ArgoCD pointant vers ce repo, path `charts/invoice-service`, namespace `invoice-service`.

### 4. ghcr-secret

Copier le `ghcr-secret` depuis zenix vers le namespace `invoice-service` (comme pour clos-de-la-reine).

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
