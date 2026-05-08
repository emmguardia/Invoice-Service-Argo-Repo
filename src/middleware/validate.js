const MAX_EMAIL = 320;
const MAX_ITEMS = 50;
const MAX_PRICE = 100_000;
const MAX_QTY = 1000;
const MAX_NAME = 200;
const MAX_STR = 500;

const bad = (res, details) =>
  res.status(400).json({ error: 'Validation error', details });

function isStr(v, max) {
  return typeof v === 'string' && v.length <= max;
}

// Validation email en O(n) sans regex polynomiale (évite le ReDoS):
// borne d'abord la longueur, puis check structurel via indexOf/charCodeAt.
function isValidEmail(s) {
  if (typeof s !== 'string') return false;
  const len = s.length;
  if (len < 3 || len > MAX_EMAIL) return false;

  const at = s.indexOf('@');
  // exactement un @, pas en début, pas en fin
  if (at < 1 || at !== s.lastIndexOf('@') || at === len - 1) return false;

  // pas de whitespace, scan une seule passe O(n)
  for (let i = 0; i < len; i++) {
    const c = s.charCodeAt(i);
    // espaces & contrôles: \t \n \v \f \r ' '
    if (c === 0x20 || (c >= 0x09 && c <= 0x0d)) return false;
  }

  // domaine doit contenir un '.' qui n'est ni juste après '@' ni en dernière position
  const dot = s.indexOf('.', at + 2);
  if (dot < 0 || dot === len - 1) return false;

  return true;
}

function validateAddress(a) {
  if (a == null) return true;
  if (typeof a === 'string') return a.length <= MAX_STR;
  if (typeof a !== 'object') return false;
  return (
    isStr(a.address ?? '', MAX_STR) &&
    isStr(a.postalCode ?? '', 32) &&
    isStr(a.city ?? '', 128) &&
    isStr(a.country ?? '', 64)
  );
}

export function validateInvoiceBody(req, res, next) {
  const { order_data, to_email } = req.body || {};

  if (!order_data || typeof order_data !== 'object' || Array.isArray(order_data)) {
    return bad(res, 'order_data requis (objet)');
  }
  if (!isValidEmail(to_email)) {
    return bad(res, 'to_email invalide');
  }

  const items = order_data.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) {
    return bad(res, `items: 1..${MAX_ITEMS}`);
  }
  for (const it of items) {
    if (!it || typeof it !== 'object') return bad(res, 'item invalide');
    const p = Number(it.price);
    const q = Number(it.quantity);
    if (!Number.isFinite(p) || p < 0 || p > MAX_PRICE) return bad(res, 'price invalide');
    if (!Number.isInteger(q) || q < 1 || q > MAX_QTY) return bad(res, 'quantity invalide');
    if (it.name != null && !isStr(it.name, MAX_NAME)) return bad(res, 'item.name invalide');
  }

  if (order_data.shippingCost != null) {
    const s = Number(order_data.shippingCost);
    if (!Number.isFinite(s) || s < 0 || s > MAX_PRICE) return bad(res, 'shippingCost invalide');
  }
  if (order_data.totalAmount != null) {
    const t = Number(order_data.totalAmount);
    if (!Number.isFinite(t) || t < 0 || t > MAX_PRICE * MAX_QTY) return bad(res, 'totalAmount invalide');
  }
  if (order_data.orderNumber != null && !isStr(order_data.orderNumber, 64)) {
    return bad(res, 'orderNumber invalide');
  }
  if (order_data.customerName != null && !isStr(order_data.customerName, MAX_NAME)) {
    return bad(res, 'customerName invalide');
  }
  if (order_data.customerEmail != null && !isValidEmail(order_data.customerEmail)) {
    return bad(res, 'customerEmail invalide');
  }
  if (!validateAddress(order_data.shippingAddress)) {
    return bad(res, 'shippingAddress invalide');
  }

  next();
}
