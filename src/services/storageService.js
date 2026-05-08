import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

const R2_ENDPOINT = process.env.R2_ENDPOINT || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_REGION = process.env.R2_REGION || 'auto'; // R2 ignore la région, "auto" est l'usage standard

export const STORAGE_ENABLED = Boolean(
  R2_ENDPOINT && R2_BUCKET_NAME && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY
);

let client = null;
function getClient() {
  if (!STORAGE_ENABLED) return null;
  if (!client) {
    client = new S3Client({
      region: R2_REGION,
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true, // requis pour R2
    });
  }
  return client;
}

function buildKey(project, orderNumber) {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  // Sanitize: garde uniquement alphanum + - _ /
  const safeProject = String(project).replace(/[^A-Za-z0-9_\-]/g, '_');
  const safeOrder = String(orderNumber).replace(/[^A-Za-z0-9_\-]/g, '_');
  return `invoices/${safeProject}/${yyyy}/${mm}/${safeOrder}.pdf`;
}

export function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Upload immuable d'un PDF de facture vers R2.
 * Renvoie { key, etag, sha256 }. Lève si STORAGE_ENABLED mais l'upload échoue.
 * Si STORAGE_ENABLED est false, renvoie { key: null, sha256 } (calcul du hash quand même).
 */
export async function archiveInvoicePdf({ project, orderNumber, pdfBuffer }) {
  const hash = sha256(pdfBuffer);

  if (!STORAGE_ENABLED) {
    const e = new Error('R2 storage non configuré (variables R2_* manquantes)');
    e.code = 'STORAGE_NOT_CONFIGURED';
    throw e;
  }

  const key = buildKey(project, orderNumber);
  const cmd = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: pdfBuffer,
    ContentType: 'application/pdf',
    ContentDisposition: `attachment; filename="facture-${orderNumber}.pdf"`,
    ChecksumSHA256: Buffer.from(hash, 'hex').toString('base64'),
    Metadata: {
      project: String(project),
      'order-number': String(orderNumber),
      'sha256-hex': hash,
    },
  });

  try {
    const out = await getClient().send(cmd);
    return { key, etag: out.ETag, sha256: hash };
  } catch (err) {
    const e = new Error(`Échec upload R2: ${err.message}`);
    e.code = 'STORAGE_UPLOAD_FAILED';
    e.cause = err;
    throw e;
  }
}
