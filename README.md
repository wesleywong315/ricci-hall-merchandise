# Ricci Hall Store — Project Files

Full-stack e-commerce site for Ricci Hall (HKU) merchandise.

## Structure
- `ricci-hall-store/` — Frontend (vanilla HTML/CSS/JS). Deploy with `deploy_website(project_path=".../ricci-hall-store", entry_point="index.html")`.
- `ricci-hall-server/` — Backend (Node/Express). Run with `node server.js` (port 8000). Uses `data/inventory.xlsx` as the live product/order database.

## Key facts
- Fonts: Bebas Neue (titles), Tangerine (accent mottos), League Spartan (body).
- Palette: maroon / white / gold, with the motto "Once a Riccian, always a Riccian" and the hall's 1929 founding.
- Frontend has no localStorage/sessionStorage (sandboxed iframe constraint) — cart/admin session state lives in JS memory only, reset on reload.
- `js/config.js` uses `http://localhost:8000` during local development and the hosted Railway API for deployed storefronts.
- The admin key is supplied only through the private `ADMIN_KEY` environment variable.
- Stripe runs in sandbox mode when a `sk_test_` key is supplied through `STRIPE_SECRET_KEY`. Never commit payment credentials.
- Railway must mount a persistent volume at `/app/data` so orders, customers and stock changes survive deployments.
- Add real products via the in-app Inventory Manager (Store > Inventory Manager > + Add Product) — no code changes needed.

## Local dev
```
cd ricci-hall-server && npm install && node server.js   # backend on :8000
cd ricci-hall-store && npx serve . -l 3000 --single      # frontend on :3000 (dev only)
```
