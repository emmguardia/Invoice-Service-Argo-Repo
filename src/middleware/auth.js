import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PUBLIC_KEY_PATH = process.env.JWT_PUBLIC_KEY_PATH || '/app/secrets/jwt_public_key.pem';
const ALLOWED_PROJECTS = ['clos-de-la-reine'];

function getPublicKey() {
  try {
    return readFileSync(PUBLIC_KEY_PATH, 'utf8');
  } catch (e) {
    throw new Error('JWT public key not found');
  }
}

export function verifyJWTToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  const token = auth.slice(7);
  try {
    const decoded = jwt.verify(token, getPublicKey(), {
      algorithms: ['RS256'],
      issuer: 'clos-de-la-reine-back',
    });
    req.jwtPayload = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

export function verifyProjectAccess(req, res, next) {
  const project = req.body?.project || req.jwtPayload?.project;
  if (!project || !ALLOWED_PROJECTS.includes(project)) {
    return res.status(403).json({ error: 'Projet non autorisé' });
  }
  req.project = project;
  next();
}
