#!/usr/bin/env node
/**
 * Script de test : envoie une facture avec des données aléatoires à enzomonnetmata@gmail.com
 *
 * Prérequis :
 * 1. Récupérer la clé JWT : kubectl get secret clos-secrets -n clos-de-la-reine -o jsonpath='{.data.jwt-invoice-private-key}' | base64 -d > jwt_invoice_private_key.pem
 * 2. Port-forward si local : kubectl port-forward -n invoice-service svc/invoice-service 8080:8080
 *
 * Usage : node scripts/test-invoice.js
 * Env : INVOICE_SERVICE_URL (défaut http://localhost:8080), JWT_INVOICE_PRIVATE_KEY_PATH (défaut ./jwt_invoice_private_key.pem)
 */

import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const INVOICE_SERVICE_URL = process.env.INVOICE_SERVICE_URL || 'http://localhost:8080';
const JWT_KEY_PATH = process.env.JWT_INVOICE_PRIVATE_KEY_PATH || join(__dirname, '..', 'jwt_invoice_private_key.pem');
const TO_EMAIL = 'enzomonnetmata@gmail.com';

const PRENOMS = ['Marie', 'Jean', 'Sophie', 'Pierre', 'Emma', 'Lucas', 'Léa', 'Hugo', 'Chloé', 'Thomas'];
const NOMS = ['Dupont', 'Martin', 'Bernard', 'Dubois', 'Petit', 'Moreau', 'Laurent', 'Simon', 'Michel', 'Lefebvre'];
const RUES = ['12 rue de la Paix', '5 avenue des Champs', '8 boulevard Victor Hugo', '23 impasse des Lilas', '45 chemin des Vignes'];
const VILLES = [
  { cp: '75001', ville: 'Paris' },
  { cp: '69001', ville: 'Lyon' },
  { cp: '13001', ville: 'Marseille' },
  { cp: '31000', ville: 'Toulouse' },
  { cp: '33000', ville: 'Bordeaux' },
];
const PRODUITS = ['Collier cuir', 'Laisse extensible', 'Harnais réglable', 'Jouet Kong', 'Croquettes premium'];

function random(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPrice() {
  return (Math.random() * 80 + 15).toFixed(2);
}

function generateOrderData() {
  const prenom = random(PRENOMS);
  const nom = random(NOMS);
  const ville = random(VILLES);
  const nbItems = randomInt(1, 4);
  const items = [];
  let subtotal = 0;

  for (let i = 0; i < nbItems; i++) {
    const price = parseFloat(randomPrice());
    const qty = randomInt(1, 3);
    items.push({
      name: random(PRODUITS),
      quantity: qty,
      price,
    });
    subtotal += price * qty;
  }

  const shippingCost = 5.9;
  const total = Math.round((subtotal + shippingCost) * 100) / 100;

  return {
    orderNumber: `TEST-${Date.now().toString(36).toUpperCase()}`,
    firstName: prenom,
    lastName: nom,
    items,
    totalAmount: total,
    shippingCost,
    shippingAddress: {
      firstName: prenom,
      lastName: nom,
      address: random(RUES),
      postalCode: ville.cp,
      city: ville.ville,
      country: 'France',
      email: TO_EMAIL,
    },
    customerName: `${prenom} ${nom}`,
    customerEmail: TO_EMAIL,
    customerPhone: `06 ${randomInt(10, 99)} ${randomInt(10, 99)} ${randomInt(10, 99)} ${randomInt(10, 99)}`,
    paymentMethod: 'Stripe',
  };
}

async function main() {
  let privateKey;
  try {
    privateKey = readFileSync(JWT_KEY_PATH, 'utf8');
  } catch (e) {
    console.error('❌ Clé JWT introuvable. Récupère-la avec :');
    console.error('   kubectl get secret clos-secrets -n clos-de-la-reine -o jsonpath=\'{.data.jwt-invoice-private-key}\' | base64 -d > jwt_invoice_private_key.pem');
    process.exit(1);
  }

  const orderData = generateOrderData();
  const token = jwt.sign(
    { project: 'clos-de-la-reine', permissions: ['generate_invoice'] },
    privateKey,
    { algorithm: 'RS256', issuer: 'clos-de-la-reine-back', expiresIn: '1h' }
  );

  console.log('📤 Envoi facture test vers', TO_EMAIL);
  console.log('   Commande:', orderData.orderNumber);
  console.log('   Client:', orderData.customerName);
  console.log('   Total:', orderData.totalAmount + '€');

  const res = await fetch(`${INVOICE_SERVICE_URL}/api/v1/generate-and-send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      project: 'clos-de-la-reine',
      order_data: orderData,
      to_email: TO_EMAIL,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    console.error('❌ Erreur:', err.error || err.details || res.statusText);
    process.exit(1);
  }

  console.log('✅ Facture envoyée avec succès !');
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
