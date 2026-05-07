const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
  if (typeof to_email !== 'string' || !EMAIL_RE.test(to_email) || to_email.length > 320) {
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
  if (order_data.customerEmail != null) {
    if (!isStr(order_data.customerEmail, 320) || !EMAIL_RE.test(order_data.customerEmail)) {
      return bad(res, 'customerEmail invalide');
    }
  }
  if (!validateAddress(order_data.shippingAddress)) {
    return bad(res, 'shippingAddress invalide');
  }

  next();
}
