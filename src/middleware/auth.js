import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';

const PUBLIC_KEY_PATH = process.env.JWT_PUBLIC_KEY_PATH || '/app/secrets/jwt_public_key.pem';
const JWT_ISSUER = process.env.JWT_ISSUER || 'clos-de-la-reine-back';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || undefined;
const ALLOWED_PROJECTS = new Set(
  (process.env.ALLOWED_PROJECTS || 'clos-de-la-reine')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

const PUBLIC_KEY = (() => {
  try {
    return readFileSync(PUBLIC_KEY_PATH, 'utf8');
  } catch {
    throw new Error(`JWT public key introuvable: ${PUBLIC_KEY_PATH}`);
  }
})();

export function verifyJWTToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  try {
    req.jwtPayload = jwt.verify(auth.slice(7), PUBLIC_KEY, {
      algorithms: ['RS256'],
      issuer: JWT_ISSUER,
      ...(JWT_AUDIENCE ? { audience: JWT_AUDIENCE } : {}),
      clockTolerance: 5,
    });
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

export function verifyProjectAccess(req, res, next) {
  const project = req.jwtPayload?.project;
  if (!project || !ALLOWED_PROJECTS.has(project)) {
    return res.status(403).json({ error: 'Projet non autorisé' });
  }
  req.project = project;
  next();
}
