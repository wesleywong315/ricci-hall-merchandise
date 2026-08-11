// app.js — hash router + event wiring
(function () {
  var VIEWS = ['/', '/store', '/product', '/cart', '/admin'];

  function parseHash() {
    var hash = window.location.hash || '#/';
    var raw = hash.replace(/^#/, '');
    var parts = raw.split('?');
    var path = parts[0] || '/';
    var query = {};
    if (parts[1]) {
      parts[1].split('&').forEach(function (pair) {
        var kv = pair.split('=');
        if (kv[0]) query[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
      });
    }
    if (VIEWS.indexOf(path) === -1) path = '/';
    return { path: path, query: query };
  }

  function showView(path) {
    document.querySelectorAll('.view').forEach(function (el) {
      el.classList.toggle('is-active', el.dataset.view === path);
    });
    document.querySelectorAll('[data-nav-link]').forEach(function (el) {
      if (el.dataset.navLink === path) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
    document.getElementById('mainNav').classList.remove('is-open');
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  var currentCategory = 'inventory';
  var currentSearch = '';

  function applyStoreFilters() {
    var products = RicciStore.state.products.filter(function (p) {
      return p.category === currentCategory;
    });
    if (currentSearch.trim()) {
      var q = currentSearch.trim().toLowerCase();
      products = products.filter(function (p) {
        return p.name.toLowerCase().indexOf(q) !== -1 || (p.description || '').toLowerCase().indexOf(q) !== -1;
      });
    }
    riccyRenderGrid(
      'storeGrid',
      products,
      currentSearch ? 'No products match your search.' : 'No products in this category yet — check back soon.'
    );
  }

  function setActiveTab(category) {
    currentCategory = category;
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.setAttribute('aria-selected', tab.dataset.category === category ? 'true' : 'false');
    });
    applyStoreFilters();
  }

  async function loadPublicProducts() {
    riccySkeletonGrid('storeGrid', 8);
    riccySkeletonGrid('homeNewReleases', 4);
    try {
      var products = await RicciAPI.getProducts();
      RicciStore.setProducts(products);
      applyStoreFilters();
      var newReleases = products.filter(function (p) { return p.category === 'new-release'; }).slice(0, 4);
      riccyRenderGrid('homeNewReleases', newReleases, 'New releases are on the way — check back soon.');
      riccyUpdateCartBadge();
      if (parseHash().path === '/product') route();
    } catch (e) {
      var unavailable =
        '<div class="empty-state" style="grid-column:1/-1"><h3>Store unavailable</h3><p>Could not reach the inventory service. Please refresh in a moment.</p></div>';
      document.getElementById('storeGrid').innerHTML = unavailable;
      document.getElementById('homeNewReleases').innerHTML = unavailable;
      console.error(e);
    }
  }

  function route() {
    var parsed = parseHash();
    showView(parsed.path);
    if (parsed.path === '/store' && parsed.query.category) {
      setActiveTab(parsed.query.category === 'new-release' ? 'new-release' : 'inventory');
    }
    if (parsed.path === '/cart') {
      riccyRenderCart();
      handleCheckoutRedirectBanner(parsed.query);
    }
    if (parsed.path === '/product') {
      var product = RicciStore.findProduct(parsed.query.id || '');
      riccyRenderProductDetail(product);
      updateProductQuantityOptions();
    }
  }

  function updateProductQuantityOptions() {
    var sizeSelect = document.getElementById('productSizeSelect');
    var qtySelect = document.getElementById('productQuantitySelect');
    if (!sizeSelect || !qtySelect) return;
    var selected = sizeSelect.options[sizeSelect.selectedIndex];
    var stock = selected ? Number(selected.dataset.stock) : 0;
    var options = [];
    for (var i = 1; i <= stock; i++) options.push('<option value="' + i + '">' + i + '</option>');
    qtySelect.innerHTML = options.join('');
    qtySelect.disabled = stock <= 0;
  }

  async function handleCheckoutRedirectBanner(query) {
    var banner = document.getElementById('cartBanner');
    if (!banner) return;
    if (query.checkout === 'success') {
      var emailMessage = ' Your email confirmation is pending.';
      if (query.order) {
        try {
          var completedOrder = await RicciAPI.getOrder(query.order);
          emailMessage = completedOrder.confirmationEmailSentAt
            ? ' A confirmation email has been sent.'
            : ' Your confirmation email is pending; please contact the store if it does not arrive.';
        } catch (error) {
          emailMessage = ' Your email confirmation will follow shortly.';
        }
      }
      banner.innerHTML =
        '<div class="banner banner--success"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>' +
        '<div><strong>Payment received.</strong> Your order' + (query.order ? ' (#' + query.order.slice(0, 8) + ')' : '') + ' has been placed.' + emailMessage + '</div></div>';
      RicciStore.clearCart();
      riccyRenderCart();
      riccyUpdateCartBadge();
      resetCheckoutButton();
      loadPublicProducts();
    } else if (query.checkout === 'cancelled') {
      resetCheckoutButton();
      banner.innerHTML =
        '<div class="banner banner--info"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>' +
        '<div>Checkout was cancelled. Your cart is still saved below.</div></div>';
    } else {
      banner.innerHTML = '';
    }
  }

  // ---------- Event wiring ----------
  function wireNav() {
    document.getElementById('navToggle').addEventListener('click', function () {
      var nav = document.getElementById('mainNav');
      var isOpen = nav.classList.toggle('is-open');
      this.setAttribute('aria-expanded', String(isOpen));
    });

    document.getElementById('themeToggle').addEventListener('click', function () {
      var root = document.documentElement;
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      this.setAttribute('aria-label', 'Switch to ' + (next === 'dark' ? 'light' : 'dark') + ' mode');
    });
  }

  function wireStore() {
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        setActiveTab(tab.dataset.category);
      });
    });
    document.getElementById('storeSearch').addEventListener('input', function (e) {
      currentSearch = e.target.value;
      applyStoreFilters();
    });
    document.getElementById('productDetail').addEventListener('change', function (e) {
      if (e.target.id === 'productSizeSelect') updateProductQuantityOptions();
    });
    document.getElementById('productDetail').addEventListener('click', function (e) {
      var thumb = e.target.closest('[data-gallery-image]');
      if (!thumb) return;
      var image = document.getElementById('productGalleryMainImage');
      if (image) image.src = thumb.dataset.galleryImage;
      document.querySelectorAll('.gallery-thumb').forEach(function (item) { item.classList.remove('is-active'); });
      thumb.classList.add('is-active');
    });
  }

  function handleAddToCartClick(e) {
    var btn = e.target.closest('#productAddToCart');
    if (!btn) return;
    var id = btn.dataset.productId;
    var size = document.getElementById('productSizeSelect').value;
    var qty = Number(document.getElementById('productQuantitySelect').value) || 1;
    var product = RicciStore.findProduct(id);
    RicciStore.addToCart(id, size, qty);
    riccyUpdateCartBadge();
    riccyToast((product ? product.name : 'Item') + ' added to cart');
  }

  function handleCartClick(e) {
    var inc = e.target.closest('[data-qty-increase]');
    var dec = e.target.closest('[data-qty-decrease]');
    var rem = e.target.closest('[data-remove-item]');
    if (inc) {
      var item = RicciStore.getCartItems().find(function (i) { return i.product.id === inc.dataset.productId && i.size === inc.dataset.size; });
      if (item) RicciStore.setQty(item.product.id, item.size, item.qty + 1);
      riccyRenderCart();
      riccyUpdateCartBadge();
    } else if (dec) {
      var item2 = RicciStore.getCartItems().find(function (i) { return i.product.id === dec.dataset.productId && i.size === dec.dataset.size; });
      if (item2) {
        if (item2.qty <= 1) RicciStore.removeFromCart(item2.product.id, item2.size);
        else RicciStore.setQty(item2.product.id, item2.size, item2.qty - 1);
      }
      riccyRenderCart();
      riccyUpdateCartBadge();
    } else if (rem) {
      RicciStore.removeFromCart(rem.dataset.productId, rem.dataset.size);
      riccyRenderCart();
      riccyUpdateCartBadge();
    }
  }

  async function handleCheckoutSubmit(e) {
    e.preventDefault();
    var btn = document.getElementById('checkoutBtn');
    var email = document.getElementById('checkoutEmail').value;
    var customerName = document.getElementById('checkoutName').value.trim();
    var yearOfEntry = document.getElementById('checkoutYear').value.trim();
    var items = RicciStore.state.cart.map(function (c) { return { productId: c.productId, size: c.size, qty: c.qty }; });
    if (!items.length) return;

    btn.disabled = true;
    btn.textContent = 'Redirecting to payment…';
    try {
      var origin = window.location.origin + window.location.pathname;
      var res = await RicciAPI.checkout({
        items: items,
        customerEmail: email,
        customerName: customerName,
        yearOfEntry: yearOfEntry,
        origin: origin,
      });
      window.location.href = res.url;
    } catch (err) {
      riccyToast(err.message || 'Checkout failed', 'error');
      btn.disabled = false;
      btn.textContent = 'Proceed to Payment';
    }
  }

  function resetCheckoutButton() {
    var btn = document.getElementById('checkoutBtn');
    if (!btn) return;
    btn.disabled = false;
    btn.textContent = 'Proceed to Payment';
  }

  function wireCart() {
    document.getElementById('cartList').addEventListener('click', handleCartClick);
    document.getElementById('checkoutForm').addEventListener('submit', handleCheckoutSubmit);
  }

  function wireAdmin() {
    document.getElementById('adminLoginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var key = document.getElementById('adminKeyInput').value.trim();
      RicciAdmin.login(key);
    });
    document.getElementById('adminLogoutBtn').addEventListener('click', RicciAdmin.logout);
    document.getElementById('addProductBtn').addEventListener('click', function () {
      RicciAdmin.openProductModal(null);
    });
    document.getElementById('closeProductModal').addEventListener('click', RicciAdmin.closeProductModal);
    document.getElementById('cancelProductForm').addEventListener('click', RicciAdmin.closeProductModal);
    document.getElementById('productForm').addEventListener('submit', RicciAdmin.saveProductForm);
    document.getElementById('productModal').addEventListener('click', function (e) {
      if (e.target.id === 'productModal') RicciAdmin.closeProductModal();
    });

    document.querySelectorAll('.admin-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.admin-tab').forEach(function (t) { t.setAttribute('aria-selected', 'false'); });
        tab.setAttribute('aria-selected', 'true');
        var target = tab.dataset.adminTab;
        document.getElementById('adminProductsPanel').hidden = target !== 'products';
        document.getElementById('adminOrdersPanel').hidden = target !== 'orders';
        document.getElementById('adminAccountsPanel').hidden = target !== 'accounts';
      });
    });

    document.getElementById('adminProductsList').addEventListener('click', function (e) {
      var editBtn = e.target.closest('[data-edit-product]');
      var delBtn = e.target.closest('[data-delete-product]');
      if (editBtn) RicciAdmin.editProduct(editBtn.dataset.editProduct);
      if (delBtn) RicciAdmin.deleteProduct(delBtn.dataset.deleteProduct);
      var addSizeBtn = e.target.closest('[data-show-add-size]');
      var createSizeBtn = e.target.closest('[data-create-size]');
      var saveSizeBtn = e.target.closest('[data-save-size]');
      if (addSizeBtn) RicciAdmin.showAddSize(addSizeBtn.dataset.showAddSize);
      if (createSizeBtn) RicciAdmin.createSize(createSizeBtn.dataset.createSize);
      if (saveSizeBtn) RicciAdmin.saveSize(saveSizeBtn.dataset.saveSize, Number(saveSizeBtn.dataset.sizeIndex));
    });
    document.getElementById('adminOrdersBody').addEventListener('click', function (e) {
      var cancelBtn = e.target.closest('[data-cancel-order]');
      if (cancelBtn) RicciAdmin.openCancelOrder(cancelBtn.dataset.cancelOrder);
    });
    document.getElementById('adminAccountsList').addEventListener('click', function (e) {
      var accountBtn = e.target.closest('[data-account-id]');
      if (accountBtn) RicciAdmin.selectAccount(accountBtn.dataset.accountId);
    });
    document.getElementById('keepOrderBtn').addEventListener('click', RicciAdmin.closeCancelOrder);
    document.getElementById('confirmCancelOrderBtn').addEventListener('click', RicciAdmin.confirmCancelOrder);
    document.getElementById('cancelOrderModal').addEventListener('click', function (e) {
      if (e.target.id === 'cancelOrderModal') RicciAdmin.closeCancelOrder();
    });
  }

  document.addEventListener('click', handleAddToCartClick);

  window.RicciApp = {
    reloadPublicProducts: loadPublicProducts,
  };


  window.addEventListener('hashchange', route);

  wireNav();
  wireStore();
  wireCart();
  wireAdmin();
  loadPublicProducts();
  route();
})();
