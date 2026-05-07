// Numérotation factures.
//
// Conformité art. 242 nonies A CGI: numérotation chronologique, continue, sans rupture.
// Ce service ne tient pas d'état durable (pas de DB) — la séquentialité réelle DOIT être
// garantie par le caller (back applicatif) qui fournit `orderNumber`.
//
// Deux modes:
//   - STRICT_NUMBERING=true (défaut prod): refus si `orderNumber` n'est pas fourni.
//   - STRICT_NUMBERING=false: fallback in-memory (DEV uniquement, perd l'unicité au redémarrage).

const STRICT = process.env.STRICT_NUMBERING !== 'false';
const PREFIX = process.env.INVOICE_PREFIX || 'CDLR';

const NUMBER_RE = /^[A-Za-z0-9_\-/]{1,64}$/;

let memCounter = 0;
let memDay = '';

function devFallbackNumber() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const j = String(d.getUTCDate()).padStart(2, '0');
  const day = `${y}${m}${j}`;
  if (day !== memDay) {
    memDay = day;
    memCounter = 0;
  }
  memCounter += 1;
  return `${PREFIX}-DEV-${day}-${String(memCounter).padStart(6, '0')}`;
}

export function resolveInvoiceNumber(orderData) {
  const provided = typeof orderData.orderNumber === 'string' ? orderData.orderNumber.trim() : '';

  if (provided) {
    if (!NUMBER_RE.test(provided)) {
      const err = new Error('orderNumber invalide');
      err.code = 'INVOICE_NUMBER_INVALID';
      throw err;
    }
    return provided;
  }

  if (STRICT) {
    const err = new Error('orderNumber requis (numérotation séquentielle déléguée au caller)');
    err.code = 'INVOICE_NUMBER_REQUIRED';
    throw err;
  }

  return devFallbackNumber();
}
