import express from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { generateAndSendInvoice } from './services/invoiceService.js';
import { verifyJWTToken, verifyProjectAccess } from './middleware/auth.js';
import { validateInvoiceBody } from './middleware/validate.js';
import { isPdfReady, shutdownPdf } from './services/pdf.js';

const app = express();
const PORT = process.env.PORT || 8080;

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

const ipRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_PER_HOUR || 100),
  message: { error: 'Trop de requêtes, réessayez plus tard' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Liveness: process up. Pas de dépendances externes.
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Readiness: dépendances critiques (browser Playwright lançable).
app.get('/ready', async (_req, res) => {
  const ready = await isPdfReady();
  if (!ready) return res.status(503).json({ status: 'not-ready' });
  return res.json({ status: 'ready' });
});

const STATUS_BY_CODE = {
  TOTAL_MISMATCH: 422,
  INVOICE_NUMBER_REQUIRED: 422,
  INVOICE_NUMBER_INVALID: 400,
  EMAIL_SERVICE_TIMEOUT: 504,
  EMAIL_SERVICE_ERROR: 502,
  STORAGE_NOT_CONFIGURED: 503,
  STORAGE_UPLOAD_FAILED: 502,
};

app.post(
  '/api/v1/generate-and-send',
  ipRateLimiter,
  verifyJWTToken,
  verifyProjectAccess,
  validateInvoiceBody,
  async (req, res) => {
    const correlationId = crypto.randomUUID();
    try {
      const result = await generateAndSendInvoice(
        req.project,
        req.body.order_data,
        req.body.to_email
      );
      return res.json({
        success: true,
        message: 'Facture générée et envoyée',
        orderNumber: result.orderNumber,
        archive: result.archive,
        correlationId,
      });
    } catch (err) {
      console.error('[INVOICE]', JSON.stringify({
        correlationId,
        project: req.project,
        code: err.code,
        message: err.message,
      }));
      const status = STATUS_BY_CODE[err.code] || 500;
      const safeMessage =
        status >= 400 && status < 500 ? err.message : 'Erreur serveur';
      return res.status(status).json({
        error: safeMessage,
        correlationId,
        ...(err.code ? { code: err.code } : {}),
      });
    }
  }
);

const server = app.listen(PORT, () => {
  console.log(`Invoice-Service démarré sur le port ${PORT}`);
});

async function gracefulShutdown(signal) {
  console.log(`[shutdown] reçu ${signal}, fermeture...`);
  server.close(async () => {
    await shutdownPdf();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 15_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
