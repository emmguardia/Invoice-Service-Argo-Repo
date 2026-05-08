# Chiffre invoice-service-secrets.yaml avec kubeseal
# Utilise le pub-cert.pem du Clos-De-La-Reine-Argo-Repo
# Le fichier plain reste local, seul le SealedSecret est commité

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent
$SecretsPlain = Join-Path $RepoRoot "charts\invoice-service\secrets\invoice-service-secrets.yaml"
$SealedTemplate = Join-Path $RepoRoot "charts\invoice-service\templates\sealed-secret.yaml"
$Cert = if ($env:CERT) { $env:CERT } else { Join-Path (Split-Path $RepoRoot -Parent) "Clos-De-La-Reine-Argo-Repo\pub-cert.pem" }

if (-not (Test-Path $SecretsPlain)) {
  Write-Error "Fichier non trouvé: $SecretsPlain"
  exit 1
}
if (-not (Test-Path $Cert)) {
  Write-Error "Certificat non trouvé: $Cert"
  Write-Host "Définis `$env:CERT=chemin\vers\pub-cert.pem si besoin"
  exit 1
}

Write-Host "Chiffrement de invoice-service-secrets..."
$sealed = Get-Content $SecretsPlain -Raw | kubeseal --format yaml --cert $Cert --scope namespace-wide
# Remplacer le namespace fixe par le template Helm
$sealed = $sealed -replace 'namespace: invoice-service', 'namespace: {{ include "invoice.namespace" . }}'
$sealed | Set-Content -Path $SealedTemplate -Encoding utf8

Write-Host "sealed-secret.yaml mis à jour"
Write-Host "Fichier plain (ne pas committer): $SecretsPlain"
