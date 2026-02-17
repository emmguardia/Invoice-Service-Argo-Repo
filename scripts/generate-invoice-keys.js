import { generateKeyPairSync } from 'crypto';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..');

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

writeFileSync(join(outDir, 'jwt_invoice_private.pem'), privateKey);
writeFileSync(join(outDir, 'jwt_invoice_public.pem'), publicKey);

console.log('✅ Clés générées :');
console.log('   - jwt_invoice_private.pem');
console.log('   - jwt_invoice_public.pem');
