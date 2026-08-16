// Online payment gateway integration (Razorpay).
//
// Works in two modes:
//  • REAL  — when RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are set: creates real
//    orders and verifies the checkout signature (HMAC-SHA256).
//  • MOCK  — otherwise: issues a fake order and auto-accepts verification, so the
//    full pay flow is demoable without any credentials.
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { Invoice } from '../models/Invoice.js';
import { ApiError } from '../utils/ApiError.js';
import { recordPayment } from './billingService.js';

const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
export const isLive = Boolean(KEY_ID && KEY_SECRET);

let client = null;
function getClient() {
  if (!client && isLive) client = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });
  return client;
}

export function gatewayStatus() {
  return { mode: isLive ? 'razorpay' : 'mock', keyId: isLive ? KEY_ID : 'mock' };
}

// Create a gateway order for the invoice's outstanding amount.
export async function createOrder(invoiceId) {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw ApiError.notFound('Invoice not found', 'INVOICE_NOT_FOUND');
  if (invoice.dueAmount <= 0) throw ApiError.badRequest('Nothing due on this invoice', 'NOTHING_DUE');
  if (['CANCELLED', 'REFUNDED'].includes(invoice.status)) {
    throw ApiError.badRequest(`Cannot pay a ${invoice.status.toLowerCase()} invoice`, 'INVOICE_LOCKED');
  }

  const amountPaise = Math.round(invoice.dueAmount * 100);

  if (isLive) {
    const order = await getClient().orders.create({
      amount: amountPaise, currency: 'INR', receipt: invoice.invoiceNo,
      notes: { invoiceId: String(invoice._id), invoiceNo: invoice.invoiceNo },
    });
    return { mode: 'razorpay', keyId: KEY_ID, orderId: order.id, amount: amountPaise, currency: 'INR', invoiceNo: invoice.invoiceNo };
  }

  // Mock order — deterministic id from the invoice + due for demo flows.
  const orderId = `order_mock_${invoice.invoiceNo}_${amountPaise}`;
  return { mode: 'mock', keyId: 'mock', orderId, amount: amountPaise, currency: 'INR', invoiceNo: invoice.invoiceNo };
}

// Verify a completed checkout and record the payment against the invoice.
export async function verifyAndCapture(invoiceId, { orderId, paymentId, signature }) {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw ApiError.notFound('Invoice not found', 'INVOICE_NOT_FOUND');

  if (isLive) {
    const expected = crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
    if (expected !== signature) throw ApiError.badRequest('Payment signature mismatch', 'SIGNATURE_INVALID');
  }
  // Mock mode accepts any verification.

  const amount = invoice.dueAmount;
  if (amount <= 0) return { invoice, payment: null, alreadyPaid: true };

  const result = await capturePayment(invoiceId, amount, paymentId || orderId, 'Online payment');
  return { ...result, mode: isLive ? 'razorpay' : 'mock' };
}

// Bank a gateway payment exactly once.
//
// The same payment reaches us twice as a matter of course — the browser
// returns from checkout at roughly the moment Razorpay posts its webhook.
// The unique transactionId on Payment settles which one wins; the loser is a
// no-op, not an error, so a webhook is never left retrying forever.
async function capturePayment(invoiceId, amount, transactionId, note) {
  try {
    return await recordPayment(invoiceId, { amount, method: 'ONLINE', transactionId, note }, null);
  } catch (err) {
    if (err?.errorCode !== 'PAYMENT_ALREADY_RECORDED' && err?.errorCode !== 'OVERPAYMENT') throw err;
    const invoice = await Invoice.findById(invoiceId);
    return { invoice, payment: null, alreadyPaid: true };
  }
}

// Razorpay webhook — captures payments confirmed server-side.
export async function handleWebhook(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (secret) {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    if (expected !== signature) throw ApiError.badRequest('Webhook signature mismatch', 'WEBHOOK_INVALID');
  }
  const payload = JSON.parse(rawBody);
  const entity = payload?.payload?.payment?.entity;
  const invoiceId = entity?.notes?.invoiceId;
  if (payload?.event === 'payment.captured' && invoiceId) {
    const invoice = await Invoice.findById(invoiceId);
    if (invoice && invoice.dueAmount > 0) {
      await capturePayment(invoiceId, invoice.dueAmount, entity.id, 'Webhook capture');
    }
  }
  return { received: true };
}
