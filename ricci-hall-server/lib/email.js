const nodemailer = require('nodemailer');

function isConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function transporter() {
  if (!isConfigured()) return null;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

function greeting(order) {
  return `Dear Mr ${order.customerName} (Riccian ${order.yearOfEntry})`;
}

function itemLines(order) {
  return order.items.map((item) => {
    const size = item.size ? `, size ${item.size}` : '';
    return `${item.qty} x ${item.name}${size} at HK$${item.price} each = HK$${item.qty * item.price}`;
  });
}

async function sendMail(message) {
  const mailer = transporter();
  if (!mailer || !message.to) return { sent: false, reason: 'not-configured' };
  await mailer.sendMail({
    from: `"Ricci Hall Merchandise" <${process.env.GMAIL_USER}>`,
    ...message,
  });
  return { sent: true };
}

async function sendPurchaseConfirmation(order) {
  const lines = itemLines(order);
  const text = [
    greeting(order),
    '',
    `Thank you for order #${order.id.slice(0, 8)} placed on ${new Date(order.createdAt).toLocaleString('en-HK')}.`,
    '',
    ...lines,
    '',
    `Total: HK$${order.total}`,
    'Collection: Pickup at Ricci Hall',
    '',
    'Thank you for your purchase!',
    '',
    'Best Regards',
    'Ricci Hall Merchandise',
  ].join('\n');
  return sendMail({
    to: order.customerEmail,
    subject: `Ricci Hall Merchandise order #${order.id.slice(0, 8)}`,
    text,
  });
}

async function sendCancellationEmail(order) {
  const text = [
    greeting(order),
    '',
    `Your order #${order.id.slice(0, 8)} has been cancelled.`,
    '',
    `Cancellation reason: ${order.cancellationReason}`,
    '',
    'Best Regards',
    'Ricci Hall Merchandise',
  ].join('\n');
  return sendMail({
    to: order.customerEmail,
    subject: `Cancellation of Ricci Hall Merchandise order #${order.id.slice(0, 8)}`,
    text,
  });
}

module.exports = {
  isConfigured,
  sendPurchaseConfirmation,
  sendCancellationEmail,
};
