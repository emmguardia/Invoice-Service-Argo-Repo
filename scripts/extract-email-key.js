#!/usr/bin/env node
/**
 * Extrait jwt-private-key depuis Email-Service/K3s/secret.yaml
 * Usage: node scripts/extract-email-key.js
 * Génère: jwt_email_private.pem (à utiliser pour invoice-service-secrets)
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const secretPath = join(__dirname, '..', '..', 'Email-Service', 'K3s', 'secret.yaml');
const outPath = join(__dirname, '..', 'jwt_email_private.pem');

const content = readFileSync(secretPath, 'utf8');
const match = content.match(/jwt-private-key:\s*\|\s*\n([\s\S]*?)(?=\n  [a-z-]+:|\n---|\z)/);
if (!match) {
  console.error('❌ jwt-private-key non trouvé dans', secretPath);
  process.exit(1);
}
const key = match[1].replace(/^ {4}/gm, '').trim();
writeFileSync(outPath, key);
console.log('✅ jwt_email_private.pem généré depuis Email-Service/K3s/secret.yaml');
console.log('   Fichier:', outPath);
