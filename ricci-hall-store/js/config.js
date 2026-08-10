// config.js — API base resolution
// Local development uses the backend on port 8000. Hosted storefronts use
// the Railway API so inventory, orders, Stripe and email share one backend.
(function () {
  var isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  window.RICCI_API_BASE = isLocal
    ? 'http://localhost:8000'
    : 'https://ricci-hall-merchandise-production.up.railway.app';
})();
