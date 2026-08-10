const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const excel = require('./lib/excel');
const stripeLib = require('./lib/stripe');
const emailService = require('./lib/email');

const app = express();
const PORT = process.env.PORT || 8000;
const ADMIN_KEY = process.env.ADMIN_KEY || '';

app.use(cors());

// Stripe webhook needs the raw body for signature verification, so it must
// be registered BEFORE the global express.json() middleware.
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = stripeLib.constructWebhookEvent(req.body, req.headers['stripe-signature']);
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
  }
  if (!event) return res.status(400).json({ error: 'Webhook not configured' });

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const orderId = session.metadata && session.metadata.orderId;
    if (orderId) {
      const order = excel.getOrders().find((o) => o.id === orderId);
      if (order && order.status !== 'paid') {
        const paidOrder = excel.updateOrderStatus(orderId, 'paid');
        excel.decrementStock(order.items.map((i) => ({ productId: i.productId, size: i.size, qty: i.qty })));
        try {
          const emailResult = await emailService.sendPurchaseConfirmation(paidOrder);
          if (emailResult.sent) excel.updateOrder(orderId, { confirmationEmailSentAt: new Date().toISOString() });
        } catch (error) {
          console.error('Purchase confirmation email error:', error.message);
        }
      }
    }
  }
  res.json({ received: true });
});

app.use(express.json());

function requireAdmin(req, res, next) {
  if (!ADMIN_KEY) return res.status(503).json({ error: 'Inventory Manager is not configured on this server' });
  const key = req.headers['x-admin-key'];
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Invalid admin key' });
  next();
}

// ---------- Health ----------
app.get('/api/health', (req, res) => res.json({
  ok: true,
  stripeLive: stripeLib.isLive(),
  emailConfigured: emailService.isConfigured(),
}));

// ---------- Products ----------
app.get('/api/products', (req, res) => {
  res.json(excel.getProducts());
});

app.get('/api/admin/products', requireAdmin, (req, res) => {
  res.json(excel.getProducts({ includeInactive: true }));
});

app.post('/api/admin/products', requireAdmin, (req, res) => {
  const body = req.body || {};
  if (!body.name || !body.name.trim()) return res.status(400).json({ error: 'Product name is required' });
  const product = {
    id: uuidv4(),
    name: body.name.trim(),
    category: body.category === 'new-release' ? 'new-release' : 'inventory',
    price: Number(body.price) || 0,
    stock: Number(body.stock) || 0,
    sizes: Array.isArray(body.sizes) && body.sizes.length ? body.sizes : [{ name: 'One Size', stock: Number(body.stock) || 0 }],
    imageUrl: body.imageUrl || '',
    images: Array.isArray(body.images) ? body.images : body.imageUrl ? [body.imageUrl] : [],
    description: body.description || '',
    sku: body.sku || '',
    active: body.active !== false,
  };
  const saved = excel.upsertProduct(product);
  res.status(201).json(saved);
});

app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const existing = excel.getProductById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  const merged = { ...existing, ...req.body, id: existing.id };
  const saved = excel.upsertProduct(merged);
  res.json(saved);
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  const ok = excel.deleteProduct(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Product not found' });
  res.json({ deleted: req.params.id });
});

// Download the live Excel workbook (binary download requires a backend —
// browsers can't force-download blobs fetched through the sandbox proxy).
app.get('/api/admin/inventory.xlsx', requireAdmin, (req, res) => {
  excel.ensureWorkbook();
  res.setHeader('Content-Disposition', 'attachment; filename="ricci-hall-inventory.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  fs.createReadStream(excel.WORKBOOK_PATH).pipe(res);
});

// ---------- Orders / Checkout ----------
app.get('/api/admin/orders', requireAdmin, (req, res) => {
  res.json(excel.getOrders());
});

app.get('/api/admin/customers', requireAdmin, (req, res) => {
  res.json(excel.getCustomers());
});

app.get('/api/admin/customers/:id', requireAdmin, (req, res) => {
  const history = excel.getCustomerPurchaseHistory(req.params.id);
  if (!history) return res.status(404).json({ error: 'Customer not found' });
  res.json(history);
});

app.post('/api/admin/orders/:id/cancel', requireAdmin, async (req, res) => {
  const order = excel.getOrders().find((item) => item.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status === 'cancelled') return res.status(409).json({ error: 'Order is already cancelled' });
  const reason = String((req.body && req.body.reason) || '').trim();
  if (!reason) return res.status(400).json({ error: 'Cancellation reason is required' });
  if (order.status === 'paid') {
    excel.incrementStock(order.items.map((item) => ({
      productId: item.productId,
      size: item.size,
      qty: item.qty,
    })));
  }
  let cancelled = excel.updateOrder(order.id, {
    status: 'cancelled',
    cancellationReason: reason,
    cancelledAt: new Date().toISOString(),
  });
  let emailResult = { sent: false, reason: 'not-configured' };
  try {
    emailResult = await emailService.sendCancellationEmail(cancelled);
    if (emailResult.sent) {
      cancelled = excel.updateOrder(order.id, { cancellationEmailSentAt: new Date().toISOString() });
    }
  } catch (error) {
    console.error('Cancellation email error:', error.message);
    emailResult = { sent: false, reason: 'send-failed' };
  }
  res.json({
    order: cancelled,
    emailSent: emailResult.sent,
    refundRequired: Boolean(order.stripeSessionId && !order.stripeSessionId.startsWith('demo_')),
    refundStatus: 'not-configured',
  });
});

app.post('/api/checkout', async (req, res) => {
  if (process.env.NODE_ENV === 'production' && !stripeLib.isLive()) {
    return res.status(503).json({ error: 'Payments are not yet active. Please contact the Hall merchandise team.' });
  }
  const { items, customerEmail, customerName, yearOfEntry, origin } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }
  const cleanEmail = String(customerEmail || '').trim().toLowerCase();
  const cleanName = String(customerName || '').trim();
  const cleanYear = String(yearOfEntry || '').trim();
  if (!cleanName) return res.status(400).json({ error: 'Name is required' });
  if (!/^\d{4}$/.test(cleanYear)) return res.status(400).json({ error: 'Enter a valid four-digit year of entry' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return res.status(400).json({ error: 'Enter a valid email address' });

  const products = excel.getProducts();
  const resolvedItems = [];
  for (const item of items) {
    const product = products.find((p) => p.id === item.productId);
    if (!product) return res.status(400).json({ error: `Product ${item.productId} not found` });
    const qty = Math.max(1, Math.trunc(Number(item.qty) || 1));
    const requestedSize = String(item.size || '').trim();
    const size = product.sizes.find((option) => option.name === requestedSize) || (!requestedSize ? product.sizes[0] : null);
    if (!size) return res.status(400).json({ error: `Size "${requestedSize}" is not available for "${product.name}"` });
    if (qty > size.stock) {
      return res.status(400).json({ error: `Only ${size.stock} left of "${product.name}" in ${size.name}` });
    }
    resolvedItems.push({ productId: product.id, name: product.name, size: size.name, qty, price: product.price });
  }

  const total = resolvedItems.reduce((sum, i) => sum + i.qty * i.price, 0);
  const customer = excel.upsertCustomer({
    id: uuidv4(),
    email: cleanEmail,
    name: cleanName,
    yearOfEntry: cleanYear,
  });
  const order = {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    customerId: customer.id,
    customerName: customer.name,
    yearOfEntry: customer.yearOfEntry,
    customerEmail: customer.email,
    items: resolvedItems,
    total,
    status: 'pending',
    stripeSessionId: '',
    cancellationReason: '',
    cancelledAt: '',
    confirmationEmailSentAt: '',
    cancellationEmailSentAt: '',
  };
  excel.saveOrder(order);

  const base = origin || `http://localhost:${PORT}`;
  const successUrl = `${base}#/cart?checkout=success&order=${order.id}`;
  const cancelUrl = `${base}#/cart?checkout=cancelled&order=${order.id}`;

  try {
    const session = await stripeLib.createCheckoutSession({ order, successUrl, cancelUrl, customerEmail: cleanEmail });
    order.stripeSessionId = session.id;
    excel.saveOrder(order);

    if (session.demo) {
      // No live Stripe account connected yet: mark as paid immediately so
      // the full flow (order log + stock decrement) can be tested.
      const paidOrder = excel.updateOrderStatus(order.id, 'paid');
      excel.decrementStock(resolvedItems.map((i) => ({ productId: i.productId, size: i.size, qty: i.qty })));
      try {
        const emailResult = await emailService.sendPurchaseConfirmation(paidOrder);
        if (emailResult.sent) excel.updateOrder(order.id, { confirmationEmailSentAt: new Date().toISOString() });
      } catch (error) {
        console.error('Purchase confirmation email error:', error.message);
      }
    }

    res.json({ url: session.url, demo: Boolean(session.demo), orderId: order.id });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    res.status(500).json({ error: 'Could not start checkout. Please try again.' });
  }
});

app.get('/api/orders/:id', (req, res) => {
  const order = excel.getOrders().find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json({
    id: order.id,
    status: order.status,
    confirmationEmailSentAt: order.confirmationEmailSentAt || '',
  });
});

// ---------- Seed data (first run only) ----------
function seedIfEmpty() {
  const products = excel.getProducts({ includeInactive: true });
  if (products.length > 0) return;
  const seed = [
    {
      id: uuidv4(),
      name: 'Sample — Ricci Hall Classic Hoodie',
      category: 'inventory',
      price: 320,
      sizes: [{ name: 'S', stock: 5 }, { name: 'M', stock: 8 }, { name: 'L', stock: 8 }, { name: 'XL', stock: 4 }],
      images: [],
      imageUrl: '',
      description: 'Replace this sample with your real product name, photo and price in the Inventory Manager.',
      sku: 'RH-SAMPLE-01',
      active: true,
    },
    {
      id: uuidv4(),
      name: 'Sample — Ricci Hall Crest Tee',
      category: 'inventory',
      price: 150,
      sizes: [{ name: 'S', stock: 8 }, { name: 'M', stock: 12 }, { name: 'L', stock: 12 }, { name: 'XL', stock: 8 }],
      images: [],
      imageUrl: '',
      description: 'Replace this sample with your real product name, photo and price in the Inventory Manager.',
      sku: 'RH-SAMPLE-02',
      active: true,
    },
    {
      id: uuidv4(),
      name: 'Sample — 90th Anniversary Jacket',
      category: 'new-release',
      price: 480,
      sizes: [{ name: 'S', stock: 3 }, { name: 'M', stock: 4 }, { name: 'L', stock: 5 }, { name: 'XL', stock: 3 }],
      images: [],
      imageUrl: '',
      description: 'Replace this sample with your real product name, photo and price in the Inventory Manager.',
      sku: 'RH-SAMPLE-03',
      active: true,
    },
    {
      id: uuidv4(),
      name: 'Sample — Riccian Cap',
      category: 'new-release',
      price: 130,
      sizes: [{ name: 'One Size', stock: 30 }],
      images: [],
      imageUrl: '',
      description: 'Replace this sample with your real product name, photo and price in the Inventory Manager.',
      sku: 'RH-SAMPLE-04',
      active: true,
    },
  ];
  seed.forEach((p) => excel.upsertProduct(p));
  console.log(`Seeded ${seed.length} sample products into ${excel.WORKBOOK_PATH}`);
}

excel.ensureWorkbook();
excel.migrateWorkbook();
seedIfEmpty();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Ricci Hall store API listening on port ${PORT}`);
  console.log(`Stripe live mode: ${stripeLib.isLive()}`);
  console.log(`Inventory workbook: ${excel.WORKBOOK_PATH}`);
});
