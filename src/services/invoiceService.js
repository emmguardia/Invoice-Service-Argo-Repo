import { readFileSync } from 'fs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { computeTotals, fromCents } from './money.js';
import { resolveInvoiceNumber } from './numbering.js';
import { getTemplate, renderPdf } from './pdf.js';
import { archiveInvoicePdf, STORAGE_ENABLED, sha256 } from './storageService.js';

const EMAIL_SERVICE_URL =
  process.env.EMAIL_SERVICE_URL ||
  'http://email-service.email-service.svc.cluster.local:8080';
const JWT_PRIVATE_KEY_PATH = process.env.JWT_PRIVATE_KEY_PATH || '/app/secrets/jwt_private_key.pem';
const EMAIL_SERVICE_TIMEOUT_MS = Number(process.env.EMAIL_SERVICE_TIMEOUT_MS || 10_000);
const TEMPLATE_NAME = process.env.INVOICE_TEMPLATE || 'clos-de-la-reine';
const VENDOR_SIRET = process.env.VENDOR_SIRET || 'À RENSEIGNER';
const PAYMENT_TERMS_DAYS = Number(process.env.PAYMENT_TERMS_DAYS || 0);
// Conformité: par défaut on exige l'archivage avant envoi (la facture "existe" légalement quand elle est archivée).
// Mettre INVOICE_REQUIRE_ARCHIVE=false en dev pour bypasser.
const REQUIRE_ARCHIVE = process.env.INVOICE_REQUIRE_ARCHIVE !== 'false';

const PRIVATE_KEY = (() => {
  try {
    return readFileSync(JWT_PRIVATE_KEY_PATH, 'utf8');
  } catch {
    throw new Error(`JWT private key introuvable: ${JWT_PRIVATE_KEY_PATH}`);
  }
})();

function signEmailServiceToken(project) {
  // NB: issuer='email-service' est ce que vérifie email-service côté pair publique.
  // Inhabituel (par convention iss = signer), mais c'est l'API existante.
  return jwt.sign(
    { project, permissions: ['send_email'] },
    PRIVATE_KEY,
    {
      algorithm: 'RS256',
      issuer: 'email-service',
      subject: project,
      jwtid: crypto.randomUUID(),
      expiresIn: '60s',
    }
  );
}

function formatShippingAddress(ship) {
  if (!ship) return '-';
  if (typeof ship === 'string') return ship;
  const parts = [
    ship.address,
    `${ship.postalCode || ''} ${ship.city || ''}`.trim(),
    ship.country || 'France',
  ].filter(Boolean);
  return parts.join(', ') || '-';
}

function buildInvoiceHtml(orderData, orderNumber) {
  const template = getTemplate(TEMPLATE_NAME);
  const { lines, itemsCents, shippingCents, totalCents } = computeTotals(orderData);

  const items = lines.map((l) => ({
    name: l.name,
    quantity: l.qty,
    price: fromCents(l.unitCents),
    lineTotal: fromCents(l.lineCents),
  }));

  const now = new Date();
  const dueDate = new Date(now.getTime() + PAYMENT_TERMS_DAYS * 24 * 60 * 60 * 1000);
  const fmtDate = (d) => d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });

  return template({
    order_number: orderNumber,
    items,
    subtotal: fromCents(itemsCents),
    shipping_cost: fromCents(shippingCents),
    total: fromCents(totalCents),
    shipping_address: formatShippingAddress(orderData.shippingAddress),
    customer_name: orderData.customerName || 'Client',
    customer_email: orderData.customerEmail || '',
    date: fmtDate(now),
    due_date: PAYMENT_TERMS_DAYS > 0 ? fmtDate(dueDate) : 'à réception',
    vendor_siret: VENDOR_SIRET,
  });
}

async function postToEmailService(payload, token) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), EMAIL_SERVICE_TIMEOUT_MS);
  try {
    const response = await fetch(`${EMAIL_SERVICE_URL}/api/v1/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({ error: response.statusText }));
      const err = new Error(detail.error || detail.details || 'Email-Service error');
      err.code = 'EMAIL_SERVICE_ERROR';
      err.status = response.status;
      throw err;
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      const e = new Error(`Email-Service timeout (${EMAIL_SERVICE_TIMEOUT_MS}ms)`);
      e.code = 'EMAIL_SERVICE_TIMEOUT';
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateAndSendInvoice(project, orderData, toEmail) {
  const orderNumber = resolveInvoiceNumber(orderData);
  const toName = orderData.customerName || toEmail.split('@')[0];

  const html = buildInvoiceHtml(orderData, orderNumber);
  const pdfBuffer = await renderPdf(html);
  const filename = `facture-${orderNumber}.pdf`;

  // 1) Archivage immuable AVANT envoi: on ne peut pas envoyer une facture qui n'a pas été archivée.
  let archive = null;
  if (REQUIRE_ARCHIVE) {
    archive = await archiveInvoicePdf({ project, orderNumber, pdfBuffer });
  } else if (STORAGE_ENABLED) {
    try {
      archive = await archiveInvoicePdf({ project, orderNumber, pdfBuffer });
    } catch (err) {
      console.warn('[INVOICE] archive R2 échouée (mode non-strict):', err.message);
      archive = { sha256: sha256(pdfBuffer), key: null };
    }
  } else {
    archive = { sha256: sha256(pdfBuffer), key: null };
  }

  // 2) Envoi de l'email avec hash en référence (audit/traçabilité)
  const pdfBase64 = pdfBuffer.toString('base64');
  const token = signEmailServiceToken(project);
  await postToEmailService(
    {
      template_id: 'invoice',
      to_email: toEmail,
      to_name: toName,
      project,
      variables: {
        order_number: orderNumber,
        customer_name: toName,
      },
      subject: `Facture n°${orderNumber} - Le Clos de la Reine`,
      attachments: [{ filename, content: pdfBase64 }],
    },
    token
  );

  return {
    success: true,
    orderNumber,
    archive: { key: archive.key, sha256: archive.sha256 },
  };
}
