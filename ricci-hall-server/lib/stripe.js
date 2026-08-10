/**
 * Stripe Checkout wrapper.
 *
 * Reads STRIPE_SECRET_KEY from the environment. If it isn't set, the store
 * still runs end-to-end in "demo mode": checkout returns a fake session that
 * simulates a successful payment so the cart -> order flow can be tested
 * before a real Stripe account is connected.
 *
 * Money settles to the hall's bank account through Stripe's own payout
 * schedule once a real Stripe account with bank details is connected —
 * there is no separate "send to bank" code path to write, Stripe does this
 * automatically after a Checkout Session is paid.
 */
const Stripe = require('stripe');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const CURRENCY = 'hkd';

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

function isLive() {
  return Boolean(stripe);
}

async function createCheckoutSession({ order, successUrl, cancelUrl, customerEmail }) {
  if (!stripe) {
    // Demo mode — no real Stripe account connected yet.
    return {
      id: `demo_${order.id}`,
      url: `${successUrl}${successUrl.includes('?') ? '&' : '?'}demo=1&order=${order.id}`,
      demo: true,
    };
  }

  const line_items = order.items.map((item) => ({
    price_data: {
      currency: CURRENCY,
      product_data: { name: item.size ? `${item.name} — ${item.size}` : item.name },
      unit_amount: Math.round(item.price * 100), // HKD cents
    },
    quantity: item.qty,
  }));

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items,
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: customerEmail || undefined,
    metadata: { orderId: order.id },
  });

  return { id: session.id, url: session.url, demo: false };
}

function constructWebhookEvent(rawBody, signature) {
  if (!stripe) return null;
  const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
  if (!secret) return null;
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

module.exports = { isLive, createCheckoutSession, constructWebhookEvent };
