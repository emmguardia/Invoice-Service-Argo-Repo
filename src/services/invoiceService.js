import { chromium } from 'playwright';
import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEMPLATES_DIR = process.env.TEMPLATES_DIR || '/app/templates';
const EMAIL_SERVICE_URL = process.env.EMAIL_SERVICE_URL || 'http://email-service.email-service.svc.cluster.local:8080';
const JWT_PRIVATE_KEY_PATH = process.env.JWT_PRIVATE_KEY_PATH || '/app/secrets/jwt_private_key.pem';

function loadTemplate(name) {
  const path = join(TEMPLATES_DIR, `${name}.html`);
  return Handlebars.compile(readFileSync(path, 'utf8'), { strict: true });
}

function getPrivateKey() {
  return readFileSync(JWT_PRIVATE_KEY_PATH, 'utf8');
}

function generateEmailServiceToken(project) {
  return jwt.sign(
    { project, permissions: ['send_email'] },
    getPrivateKey(),
    { algorithm: 'RS256', issuer: 'email-service', expiresIn: '1h' }
  );
}

function buildInvoiceHtml(orderData) {
  const template = loadTemplate('invoice');
  const items = (orderData.items || []).map(i =>
    `- ${i.name} x${i.quantity} - ${i.price.toFixed(2)}€`
  ).join('\n');
  const shippingCost = orderData.shippingCost ?? 5.9;
  const subtotal = (orderData.totalAmount || 0) - shippingCost;
  const total = orderData.totalAmount || 0;
  const orderTotal = `Sous-total: ${subtotal.toFixed(2)}€\nFrais de port: ${shippingCost.toFixed(2)}€\nTotal: ${total.toFixed(2)}€`;
  const ship = orderData.shippingAddress || {};
  const shippingAddress = typeof ship === 'string'
    ? ship
    : [ship.address, `${ship.postalCode || ''} ${ship.city || ''}`.trim(), ship.country || 'France']
        .filter(Boolean).join('\n') || '-';

  return template({
    order_number: orderData.orderNumber || 'N/A',
    order_items: items,
    order_total: orderTotal,
    shipping_address: shippingAddress,
    customer_name: orderData.customerName || 'Client',
    customer_email: orderData.customerEmail || '',
    date: new Date().toLocaleDateString('fr-FR'),
  });
}

async function htmlToPdf(html) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '1.5cm', right: '1.5cm', bottom: '1.5cm', left: '1.5cm' },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

export async function generateAndSendInvoice(project, orderData, toEmail) {
  const toName = orderData.customerName || toEmail.split('@')[0];
  const html = buildInvoiceHtml(orderData);
  const pdfBuffer = await htmlToPdf(html);
  const pdfBase64 = pdfBuffer.toString('base64');
  const orderNumber = orderData.orderNumber || 'N/A';
  const filename = `facture-${orderNumber}.pdf`;

  const token = generateEmailServiceToken(project);
  const response = await fetch(`${EMAIL_SERVICE_URL}/api/v1/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
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
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || err.details || 'Email-Service error');
  }
  return { success: true };
}
