# Ricci Hall Merchandise Server Setup

The server is ready for customer accounts, purchase history, stock updates, confirmation emails, cancellation reasons, and cancellation emails. Secrets are intentionally not stored in this repository.

## Required environment variables

Copy the variable names from `.env.example` into your hosting provider's environment-variable settings and set:

- `ADMIN_KEY`: the private key used to unlock Inventory Manager.
- `GMAIL_USER`: `riccihallmerchandise@gmail.com`.
- `GMAIL_APP_PASSWORD`: a Google App Password generated after enabling 2-Step Verification. Do not use the normal Gmail account password.
- `STRIPE_SECRET_KEY`: a Stripe sandbox key beginning with `sk_test_` for the investor demo. Use a live key only after completing the production launch checklist.
- `STRIPE_WEBHOOK_SECRET`: the signing secret for a Stripe webhook pointed at `/api/webhook`.

Never upload or commit a real `.env` file.

## Gmail

1. Enable 2-Step Verification on the Gmail account.
2. Open Google Account settings, search for App Passwords, and create one for this merchandise server.
3. Store the generated App Password as `GMAIL_APP_PASSWORD` on the host.
4. Restart the server and check `/api/health`. `emailConfigured` should be `true`.

Purchase confirmations are sent only after an order becomes paid. Cancellation emails are sent after an administrator enters a cancellation reason and confirms the action.

## Stripe

1. Create or activate a Stripe account for the organization responsible for sales.
2. Complete business verification and add the bank account that should receive payouts.
3. Add a Stripe sandbox key beginning with `sk_test_` as `STRIPE_SECRET_KEY`. Do not use a live key for the investor demo.
4. Create a `checkout.session.completed` webhook for `https://your-domain.example/api/webhook`.
5. Add its signing secret as `STRIPE_WEBHOOK_SECRET`.
6. Test the full checkout in Stripe test mode before switching to live keys.

The current cancellation workflow restores stock and records the reason. Automatic Stripe refunds are deliberately not enabled yet; add a refund call only after the Stripe account and refund policy are finalized.

## Railway sandbox deployment

1. Create a Railway service from the private GitHub repository.
2. Set the service Root Directory to `/ricci-hall-server`.
3. Use `npm start` as the Start Command.
4. Add the environment variables from `.env.example` in Railway's Variables tab.
5. Set `NODE_ENV=production` after entering a Stripe sandbox `sk_test_` key. This prevents accidental demo checkout while keeping Stripe in sandbox mode.
6. Attach a Railway Volume at `/app/data`. The server uses `RAILWAY_VOLUME_MOUNT_PATH` automatically and copies the clean seed inventory on first startup.
7. Generate a public Railway service domain and register `https://<railway-domain>/api/webhook` with Stripe.

The runtime workbook is excluded from Git because it contains orders and customer data. The sanitized seed workbook in `seed/inventory.xlsx` contains only the initial product catalogue.
