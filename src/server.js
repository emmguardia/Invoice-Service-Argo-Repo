import express from 'express';
import { generateAndSendInvoice } from './services/invoiceService.js';
import { verifyJWTToken, verifyProjectAccess } from './middleware/auth.js';
import rateLimit from 'express-rate-limit';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json({ limit: '1mb' }));

const ipRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  message: { error: 'Trop de requêtes, réessayez plus tard' },
  standardHeaders: true,
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post(
  '/api/v1/generate-and-send',
  ipRateLimiter,
  verifyJWTToken,
  verifyProjectAccess,
  async (req, res) => {
    try {
      const { order_data, to_email } = req.body;
      if (!order_data || !to_email) {
        return res.status(400).json({
          error: 'Validation error',
          details: 'order_data et to_email requis',
        });
      }
      const result = await generateAndSendInvoice(req.body.project, order_data, to_email);
      if (result.success) {
        return res.json({ success: true, message: 'Facture générée et envoyée' });
      }
      return res.status(500).json({ error: result.error || 'Échec envoi facture' });
    } catch (err) {
      console.error('[INVOICE] Erreur:', err);
      return res.status(500).json({ error: err.message || 'Erreur serveur' });
    }
  }
);

app.listen(PORT, () => {
  console.log(`Invoice-Service démarré sur le port ${PORT}`);
});
