// admin.js — Inventory Manager logic
var RicciAdmin = (function () {
  var adminProducts = [];
  var adminOrders = [];
  var adminCustomers = [];
  var pendingCancelOrderId = null;

  function isUnlocked() {
    return Boolean(RicciStore.getAdminKey());
  }

  async function login(key) {
    try {
      await RicciAPI.admin.getProducts(key);
      RicciStore.setAdminKey(key);
      document.getElementById('adminGate').hidden = true;
      document.getElementById('adminShell').hidden = false;
      await refreshAll();
      return true;
    } catch (e) {
      riccyToast('Incorrect admin key', 'error');
      return false;
    }
  }

  function logout() {
    RicciStore.setAdminKey(null);
    document.getElementById('adminGate').hidden = false;
    document.getElementById('adminShell').hidden = true;
    document.getElementById('adminKeyInput').value = '';
  }

  async function refreshAll() {
    var key = RicciStore.getAdminKey();
    if (!key) return;
    var result = await Promise.all([
      RicciAPI.admin.getProducts(key),
      RicciAPI.admin.getOrders(key),
      RicciAPI.admin.getCustomers(key),
    ]);
    adminProducts = result[0];
    adminOrders = result[1];
    adminCustomers = result[2];
    renderStats();
    renderProducts();
    renderOrdersTable();
    renderAccounts();
    var dl = document.getElementById('downloadExcelLink');
    if (dl) dl.href = window.RICCI_API_BASE + '/api/admin/inventory.xlsx?x-admin-key=' + encodeURIComponent(key);
  }

  function renderStats() {
    var totalStock = adminProducts.reduce(function (sum, product) { return sum + product.stock; }, 0);
    var lowStock = adminProducts.filter(function (product) { return product.active && product.stock > 0 && product.stock <= 5; }).length;
    var soldOut = adminProducts.filter(function (product) { return product.active && product.stock <= 0; }).length;
    var revenue = adminOrders
      .filter(function (order) { return order.status === 'paid'; })
      .reduce(function (sum, order) { return sum + order.total; }, 0);
    var stats = [
      { label: 'Active Products', value: adminProducts.filter(function (product) { return product.active; }).length },
      { label: 'Units in Stock', value: totalStock },
      { label: 'Low Stock (≤5)', value: lowStock },
      { label: 'Sold Out', value: soldOut },
      { label: 'Paid Revenue', value: riccyFormatHKD(revenue) },
    ];
    document.getElementById('adminStats').innerHTML = stats.map(function (stat) {
      return '<div class="stat-card"><span class="stat-label">' + stat.label + '</span><span class="stat-value">' + stat.value + '</span></div>';
    }).join('');
  }

  function productPanel(product) {
    var sizes = Array.isArray(product.sizes) && product.sizes.length ? product.sizes : [{ name: 'One Size', stock: product.stock }];
    var sizeRows = sizes.map(function (size, index) {
      return (
        '<div class="size-tier-row">' +
          '<span class="size-tier-name">' + riccyEscapeHtml(size.name) + '</span>' +
          '<label class="visually-hidden" for="size-stock-' + product.id + '-' + index + '">Stock for ' + riccyEscapeHtml(size.name) + '</label>' +
          '<input class="text-input size-stock-input" id="size-stock-' + product.id + '-' + index + '" type="number" min="0" step="1" value="' + size.stock + '" />' +
          '<span class="size-tier-unit">pieces</span>' +
          '<button class="btn btn--ghost btn--sm" data-save-size="' + product.id + '" data-size-index="' + index + '">Save</button>' +
        '</div>'
      );
    }).join('');
    return (
      '<article class="admin-product-card">' +
        '<div class="admin-product-head">' +
          '<div><h4>' + riccyEscapeHtml(product.name) + (product.active ? '' : ' <span class="helper-text">(hidden)</span>') + '</h4>' +
          '<p>' + riccyFormatHKD(product.price) + ' · ' + product.stock + ' pieces total</p></div>' +
          '<div class="admin-product-actions">' +
            '<button class="btn btn--ghost btn--sm" data-edit-product="' + product.id + '">Edit</button>' +
            '<button class="btn btn--danger btn--sm" data-delete-product="' + product.id + '">Delete</button>' +
          '</div>' +
        '</div>' +
        '<div class="size-tier-list">' + sizeRows + '</div>' +
        '<button class="add-size-button" data-show-add-size="' + product.id + '">+ Add size</button>' +
        '<div class="add-size-form" id="add-size-form-' + product.id + '" hidden>' +
          '<input class="text-input" data-new-size-name placeholder="Size name, e.g. XXL" />' +
          '<input class="text-input" data-new-size-stock type="number" min="0" step="1" value="0" aria-label="Starting stock" />' +
          '<button class="btn btn--primary btn--sm" data-create-size="' + product.id + '">Add</button>' +
        '</div>' +
      '</article>'
    );
  }

  function renderProducts() {
    var list = document.getElementById('adminProductsList');
    if (!adminProducts.length) {
      list.innerHTML = '<div class="empty-state"><h3>No products yet</h3><p>Use Add Product below to create your first listing.</p></div>';
      return;
    }
    var categories = [
      { id: 'inventory', label: 'Inventory' },
      { id: 'new-release', label: 'New Releases' },
    ];
    list.innerHTML = categories.map(function (category) {
      var products = adminProducts.filter(function (product) { return product.category === category.id; });
      return (
        '<section class="admin-product-group">' +
          '<div class="admin-group-head"><div><span class="eyebrow">Product type</span><h3>' + category.label + '</h3></div><span>' + products.length + ' listings</span></div>' +
          (products.length ? products.map(productPanel).join('') : '<p class="admin-group-empty">No products in this type yet.</p>') +
        '</section>'
      );
    }).join('');
  }

  function renderOrdersTable() {
    var body = document.getElementById('adminOrdersBody');
    if (!adminOrders.length) {
      body.innerHTML = '<tr><td colspan="7">No orders yet.</td></tr>';
      return;
    }
    body.innerHTML = adminOrders.map(function (order) {
      var itemsSummary = order.items.map(function (item) {
        return item.qty + '× ' + riccyEscapeHtml(item.name) + (item.size ? ' (' + riccyEscapeHtml(item.size) + ')' : '');
      }).join(', ');
      var date = order.createdAt ? new Date(order.createdAt).toLocaleString('en-HK') : '—';
      var action = order.status === 'cancelled'
        ? '<span class="helper-text">Cancelled</span>'
        : '<button class="btn btn--danger btn--sm" data-cancel-order="' + order.id + '">Cancel order</button>';
      return (
        '<tr>' +
          '<td><code>' + order.id.slice(0, 8) + '</code></td>' +
          '<td>' + date + '</td>' +
          '<td><strong>' + riccyEscapeHtml(order.customerName || '—') + '</strong><br><span class="helper-text">' +
            riccyEscapeHtml(order.customerEmail || '—') +
            (order.yearOfEntry ? ' · Riccian ' + riccyEscapeHtml(order.yearOfEntry) : '') + '</span></td>' +
          '<td>' + itemsSummary + '</td>' +
          '<td class="num">' + riccyFormatHKD(order.total) + '</td>' +
          '<td>' + riccyOrderStatusBadge(order.status) + '</td>' +
          '<td>' + action + (order.cancellationReason ? '<div class="order-cancel-reason">' + riccyEscapeHtml(order.cancellationReason) + '</div>' : '') + '</td>' +
        '</tr>'
      );
    }).join('');
  }

  function renderAccounts() {
    var list = document.getElementById('adminAccountsList');
    document.getElementById('adminAccountCount').textContent = adminCustomers.length + ' accounts';
    if (!adminCustomers.length) {
      list.innerHTML = '<div class="empty-state"><h3>No accounts yet</h3><p>Customer accounts appear here after checkout begins.</p></div>';
      return;
    }
    list.innerHTML = adminCustomers.map(function (customer) {
      var orderCount = adminOrders.filter(function (order) {
        return order.customerId === customer.id || (!order.customerId && order.customerEmail.toLowerCase() === customer.email);
      }).length;
      return (
        '<button class="account-row" data-account-id="' + customer.id + '">' +
          '<span><strong>' + riccyEscapeHtml(customer.name) + '</strong>' +
          '<small>' + riccyEscapeHtml(customer.email) + '</small></span>' +
          '<span><b>Riccian ' + riccyEscapeHtml(customer.yearOfEntry) + '</b><small>' + orderCount + ' order' + (orderCount === 1 ? '' : 's') + '</small></span>' +
        '</button>'
      );
    }).join('');
  }

  async function selectAccount(id) {
    var detail = document.getElementById('adminAccountDetail');
    detail.innerHTML = '<div class="empty-state"><h3>Loading history</h3><p>Retrieving this Riccian’s purchases.</p></div>';
    document.querySelectorAll('.account-row').forEach(function (row) {
      row.classList.toggle('is-active', row.dataset.accountId === id);
    });
    try {
      var result = await RicciAPI.admin.getCustomer(RicciStore.getAdminKey(), id);
      var customer = result.customer;
      var orders = result.orders || [];
      var paidTotal = orders.filter(function (order) { return order.status === 'paid'; })
        .reduce(function (sum, order) { return sum + order.total; }, 0);
      var history = orders.length ? orders.map(function (order) {
        var items = order.items.map(function (item) {
          return item.qty + '× ' + riccyEscapeHtml(item.name) + (item.size ? ' (' + riccyEscapeHtml(item.size) + ')' : '');
        }).join(', ');
        return (
          '<article class="history-order">' +
            '<div><strong>Order #' + order.id.slice(0, 8) + '</strong><span>' + new Date(order.createdAt).toLocaleString('en-HK') + '</span></div>' +
            '<p>' + items + '</p>' +
            '<div><span>' + riccyOrderStatusBadge(order.status) + '</span><strong>' + riccyFormatHKD(order.total) + '</strong></div>' +
            (order.cancellationReason ? '<small>Cancellation: ' + riccyEscapeHtml(order.cancellationReason) + '</small>' : '') +
          '</article>'
        );
      }).join('') : '<div class="empty-state"><h3>No purchases yet</h3><p>This account has no recorded orders.</p></div>';
      detail.innerHTML =
        '<div class="account-profile">' +
          '<span class="eyebrow">Account</span><h3>' + riccyEscapeHtml(customer.name) + '</h3>' +
          '<p>' + riccyEscapeHtml(customer.email) + '</p><p>Riccian ' + riccyEscapeHtml(customer.yearOfEntry) + '</p>' +
          '<div class="account-metrics"><span><b>' + orders.length + '</b> Orders</span><span><b>' + riccyFormatHKD(paidTotal) + '</b> Paid purchases</span></div>' +
        '</div><div class="history-list"><h4>Purchase history</h4>' + history + '</div>';
    } catch (error) {
      detail.innerHTML = '<div class="empty-state"><h3>Could not load account</h3><p>' + riccyEscapeHtml(error.message || 'Please try again.') + '</p></div>';
    }
  }

  function openProductModal(productId) {
    var modal = document.getElementById('productModal');
    var title = document.getElementById('productModalTitle');
    document.getElementById('productForm').reset();
    document.getElementById('productId').value = '';
    document.getElementById('productActive').checked = true;
    if (productId) {
      var product = adminProducts.find(function (item) { return item.id === productId; });
      if (product) {
        title.textContent = 'Edit Product';
        document.getElementById('productId').value = product.id;
        document.getElementById('productName').value = product.name;
        document.getElementById('productCategory').value = product.category;
        document.getElementById('productSku').value = product.sku || '';
        document.getElementById('productPrice').value = product.price;
        document.getElementById('productImages').value = (product.images || []).join('\n');
        document.getElementById('productDescription').value = product.description || '';
        document.getElementById('productActive').checked = product.active;
      }
    } else {
      title.textContent = 'Add Product';
    }
    modal.hidden = false;
  }

  function closeProductModal() {
    document.getElementById('productModal').hidden = true;
  }

  async function saveProductForm(event) {
    event.preventDefault();
    var key = RicciStore.getAdminKey();
    var id = document.getElementById('productId').value;
    var existing = adminProducts.find(function (product) { return product.id === id; });
    var images = document.getElementById('productImages').value.split(/\n|,/).map(function (value) { return value.trim(); }).filter(Boolean);
    var payload = {
      name: document.getElementById('productName').value.trim(),
      category: document.getElementById('productCategory').value,
      sku: document.getElementById('productSku').value.trim(),
      price: Number(document.getElementById('productPrice').value),
      sizes: existing && existing.sizes ? existing.sizes : [{ name: 'One Size', stock: 0 }],
      images: images,
      imageUrl: images[0] || '',
      description: document.getElementById('productDescription').value.trim(),
      active: document.getElementById('productActive').checked,
    };
    try {
      if (id) {
        await RicciAPI.admin.updateProduct(key, id, payload);
        riccyToast('Product updated');
      } else {
        await RicciAPI.admin.createProduct(key, payload);
        riccyToast('Product added');
      }
      closeProductModal();
      await refreshAll();
      if (window.RicciApp) window.RicciApp.reloadPublicProducts();
    } catch (error) {
      riccyToast(error.message || 'Could not save product', 'error');
    }
  }

  function showAddSize(id) {
    var form = document.getElementById('add-size-form-' + id);
    if (!form) return;
    form.hidden = !form.hidden;
    if (!form.hidden) form.querySelector('[data-new-size-name]').focus();
  }

  async function createSize(id) {
    var product = adminProducts.find(function (item) { return item.id === id; });
    var form = document.getElementById('add-size-form-' + id);
    if (!product || !form) return;
    var name = form.querySelector('[data-new-size-name]').value.trim();
    var stock = Math.max(0, Math.trunc(Number(form.querySelector('[data-new-size-stock]').value) || 0));
    if (!name) return riccyToast('Enter a size name', 'error');
    if (product.sizes.some(function (size) { return size.name.toLowerCase() === name.toLowerCase(); })) {
      return riccyToast('That size already exists', 'error');
    }
    await updateSizes(product, product.sizes.concat([{ name: name, stock: stock }]), 'Size added');
  }

  async function saveSize(id, index) {
    var product = adminProducts.find(function (item) { return item.id === id; });
    var input = document.getElementById('size-stock-' + id + '-' + index);
    if (!product || !input || !product.sizes[index]) return;
    var sizes = product.sizes.map(function (size) { return { name: size.name, stock: size.stock }; });
    sizes[index].stock = Math.max(0, Math.trunc(Number(input.value) || 0));
    await updateSizes(product, sizes, sizes[index].name + ' stock updated');
  }

  async function updateSizes(product, sizes, message) {
    try {
      await RicciAPI.admin.updateProduct(RicciStore.getAdminKey(), product.id, { sizes: sizes });
      riccyToast(message);
      await refreshAll();
      if (window.RicciApp) window.RicciApp.reloadPublicProducts();
    } catch (error) {
      riccyToast(error.message || 'Could not update stock', 'error');
    }
  }

  async function deleteProduct(id) {
    if (!confirm('Delete this product? This cannot be undone.')) return;
    try {
      await RicciAPI.admin.deleteProduct(RicciStore.getAdminKey(), id);
      riccyToast('Product deleted');
      await refreshAll();
      if (window.RicciApp) window.RicciApp.reloadPublicProducts();
    } catch (error) {
      riccyToast(error.message || 'Could not delete product', 'error');
    }
  }

  function openCancelOrder(id) {
    pendingCancelOrderId = id;
    var order = adminOrders.find(function (item) { return item.id === id; });
    document.getElementById('cancelOrderMessage').textContent =
      'Order #' + id.slice(0, 8) + (order ? ' for ' + riccyFormatHKD(order.total) : '') +
      ' will be marked cancelled. Paid-order stock will be returned to the correct size tiers.';
    document.getElementById('cancelOrderReason').value = '';
    document.getElementById('cancelOrderModal').hidden = false;
    document.getElementById('cancelOrderReason').focus();
  }

  function closeCancelOrder() {
    pendingCancelOrderId = null;
    document.getElementById('cancelOrderModal').hidden = true;
  }

  async function confirmCancelOrder() {
    if (!pendingCancelOrderId) return;
    var id = pendingCancelOrderId;
    var reason = document.getElementById('cancelOrderReason').value.trim();
    if (!reason) {
      riccyToast('Enter a cancellation reason', 'error');
      document.getElementById('cancelOrderReason').focus();
      return;
    }
    var button = document.getElementById('confirmCancelOrderBtn');
    button.disabled = true;
    button.textContent = 'Cancelling…';
    try {
      var result = await RicciAPI.admin.cancelOrder(RicciStore.getAdminKey(), id, reason);
      closeCancelOrder();
      var message = result.refundRequired ? 'Order cancelled. Stripe refund setup is still pending.' : 'Order cancelled and stock restored';
      if (!result.emailSent) message += ' Cancellation email was not sent because email is not configured.';
      riccyToast(message);
      await refreshAll();
      if (window.RicciApp) window.RicciApp.reloadPublicProducts();
    } catch (error) {
      riccyToast(error.message || 'Could not cancel order', 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Confirm Cancellation';
    }
  }

  return {
    isUnlocked: isUnlocked,
    login: login,
    logout: logout,
    refreshAll: refreshAll,
    openProductModal: openProductModal,
    closeProductModal: closeProductModal,
    saveProductForm: saveProductForm,
    deleteProduct: deleteProduct,
    editProduct: openProductModal,
    showAddSize: showAddSize,
    createSize: createSize,
    saveSize: saveSize,
    openCancelOrder: openCancelOrder,
    closeCancelOrder: closeCancelOrder,
    confirmCancelOrder: confirmCancelOrder,
    selectAccount: selectAccount,
  };
})();
