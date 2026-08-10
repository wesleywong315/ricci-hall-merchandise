// render.js — DOM rendering helpers

var PLACEHOLDER_SVG =
  '<div class="placeholder-art"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
  '<path d="M4 4h16v16H4z" opacity="0"/>' +
  '<path d="M3 8l9-5 9 5-9 5-9-5z"/><path d="M3 8v9l9 5 9-5V8"/><path d="M12 13v9"/>' +
  '</svg></div>';

function riccyProductMedia(product) {
  var image = product.imageUrl || (product.images && product.images[0]);
  if (image) {
    return '<img src="' + riccyEscapeHtml(image) + '" alt="' + riccyEscapeHtml(product.name) + '" loading="lazy" width="240" height="180" />';
  }
  return PLACEHOLDER_SVG;
}

function riccyProductCard(product) {
  var lowStock = product.stock > 0 && product.stock <= 5;
  var outOfStock = product.stock <= 0;
  var badge = product.category === 'new-release' ? '<span class="product-badge">New</span>' : '';
  var stockBadge = outOfStock
    ? '<span class="stock-badge">Sold out</span>'
    : lowStock
    ? '<span class="stock-badge">Only ' + product.stock + ' left</span>'
    : '';
  return (
    '<article class="product-card" data-product-id="' + product.id + '">' +
    '<a class="product-media product-link" href="#/product?id=' + encodeURIComponent(product.id) + '" aria-label="View ' + riccyEscapeHtml(product.name) + '">' +
    badge +
    stockBadge +
    riccyProductMedia(product) +
    '</a>' +
    '<div class="product-body">' +
    '<h3 class="product-name"><a href="#/product?id=' + encodeURIComponent(product.id) + '">' + riccyEscapeHtml(product.name) + '</a></h3>' +
    (product.description ? '<p class="product-desc">' + riccyEscapeHtml(product.description) + '</p>' : '<p class="product-desc"></p>') +
    '<div class="product-footer">' +
    '<span class="product-price">' + Number(product.price).toLocaleString('en-HK') + '</span>' +
    '<a class="btn btn--primary btn--sm' + (outOfStock ? ' is-disabled' : '') + '" href="#/product?id=' + encodeURIComponent(product.id) + '">' +
    (outOfStock ? 'View Product' : 'Choose Options') +
    '</a>' +
    '</div></div></article>'
  );
}

function riccyRenderProductDetail(product) {
  var el = document.getElementById('productDetail');
  if (!el) return;
  if (!product) {
    el.innerHTML = '<div class="empty-state"><h3>Product not found</h3><p>This listing may have been removed or hidden.</p></div>';
    return;
  }
  var images = Array.isArray(product.images) ? product.images.filter(Boolean) : [];
  if (!images.length && product.imageUrl) images = [product.imageUrl];
  var sizes = Array.isArray(product.sizes) && product.sizes.length ? product.sizes : [{ name: 'One Size', stock: product.stock }];
  var firstImage = images[0];
  var mainMedia = firstImage
    ? '<img id="productGalleryMainImage" src="' + riccyEscapeHtml(firstImage) + '" alt="' + riccyEscapeHtml(product.name) + '" />'
    : PLACEHOLDER_SVG;
  var thumbs = images.length
    ? images.map(function (url, index) {
        return '<button class="gallery-thumb' + (index === 0 ? ' is-active' : '') + '" data-gallery-image="' + riccyEscapeHtml(url) + '" aria-label="Show product image ' + (index + 1) + '"><img src="' + riccyEscapeHtml(url) + '" alt="" /></button>';
      }).join('')
    : [1, 2, 3].map(function (index) {
        return '<div class="gallery-thumb gallery-thumb--empty" aria-label="Reserved photo slot ' + index + '">' + PLACEHOLDER_SVG + '</div>';
      }).join('');
  var availableSizes = sizes.filter(function (size) { return size.stock > 0; });
  var sizeOptions = sizes.map(function (size) {
    return '<option value="' + riccyEscapeHtml(size.name) + '" data-stock="' + size.stock + '"' + (size.stock <= 0 ? ' disabled' : '') + '>' +
      riccyEscapeHtml(size.name) + (size.stock <= 0 ? ' — Sold out' : '') + '</option>';
  }).join('');
  var stockRows = sizes.map(function (size) {
    var level = size.stock <= 0 ? 'Sold out' : size.stock <= 5 ? 'Low stock' : 'In stock';
    return '<tr><td>' + riccyEscapeHtml(size.name) + '</td><td class="num">' + size.stock + '</td><td><span class="stock-dot stock-dot--' + (size.stock <= 0 ? 'out' : size.stock <= 5 ? 'low' : 'ok') + '"></span>' + level + '</td></tr>';
  }).join('');

  el.innerHTML =
    '<div class="product-detail">' +
      '<div class="product-gallery">' +
        '<div class="product-gallery-main">' + mainMedia + '</div>' +
        '<div class="product-gallery-thumbs">' + thumbs + '</div>' +
      '</div>' +
      '<div class="product-purchase">' +
        '<span class="eyebrow">' + (product.category === 'new-release' ? 'New Release' : 'Hall Inventory') + '</span>' +
        '<h1 class="product-detail-title">' + riccyEscapeHtml(product.name) + '</h1>' +
        '<p class="product-detail-price">' + riccyFormatHKD(product.price) + '</p>' +
        '<div class="product-description"><h2>Description</h2><p>' + riccyEscapeHtml(product.description || 'Product details will be added soon.') + '</p></div>' +
        '<div class="product-options">' +
          '<div><label class="field-label" for="productSizeSelect">Size</label><select class="select-input" id="productSizeSelect">' + sizeOptions + '</select></div>' +
          '<div><label class="field-label" for="productQuantitySelect">Quantity</label><select class="select-input" id="productQuantitySelect"></select></div>' +
        '</div>' +
        '<button class="btn btn--primary btn--block" id="productAddToCart" data-product-id="' + product.id + '"' + (!availableSizes.length ? ' disabled' : '') + '>' +
          (availableSizes.length ? 'Add to Cart' : 'Sold Out') +
        '</button>' +
        '<div class="stock-table-wrap"><div class="stock-table-head"><h2>Live stock</h2><span>Updated from Inventory Manager</span></div>' +
          '<table class="data-table stock-table"><thead><tr><th>Size</th><th class="num">Pieces</th><th>Status</th></tr></thead><tbody>' + stockRows + '</tbody></table>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function riccyRenderGrid(containerId, products, emptyMessage) {
  var el = document.getElementById(containerId);
  if (!el) return;
  if (!products.length) {
    el.innerHTML =
      '<div class="empty-state" style="grid-column: 1 / -1;"><h3>Nothing here yet</h3><p>' +
      riccyEscapeHtml(emptyMessage || 'Check back soon.') +
      '</p></div>';
    return;
  }
  el.innerHTML = products.map(riccyProductCard).join('');
}

function riccySkeletonGrid(containerId, count) {
  var el = document.getElementById(containerId);
  if (!el) return;
  var cards = [];
  for (var i = 0; i < (count || 4); i++) {
    cards.push(
      '<div class="product-card"><div class="skeleton" style="aspect-ratio:4/3;"></div>' +
      '<div class="product-body"><div class="skeleton" style="height:16px;width:70%;"></div>' +
      '<div class="skeleton" style="height:12px;width:100%;margin-top:8px;"></div>' +
      '<div class="skeleton" style="height:32px;width:100%;margin-top:16px;"></div></div></div>'
    );
  }
  el.innerHTML = cards.join('');
}

function riccyUpdateCartBadge() {
  var badge = document.getElementById('cartBadge');
  if (!badge) return;
  var count = RicciStore.getCartCount();
  badge.textContent = String(count);
  badge.hidden = count === 0;
}

function riccyRenderCart() {
  var items = RicciStore.getCartItems();
  var emptyEl = document.getElementById('cartEmpty');
  var contentEl = document.getElementById('cartContent');
  var listEl = document.getElementById('cartList');

  if (!items.length) {
    emptyEl.hidden = false;
    contentEl.hidden = true;
    listEl.innerHTML = '';
    return;
  }
  emptyEl.hidden = true;
  contentEl.hidden = false;

  listEl.innerHTML = items
    .map(function (item) {
      var p = item.product;
      return (
        '<div class="cart-item" data-cart-item="' + p.id + '::' + riccyEscapeHtml(item.size) + '">' +
        '<div class="cart-item-media">' + riccyProductMedia(p) + '</div>' +
        '<div><div class="cart-item-name">' + riccyEscapeHtml(p.name) + '</div>' +
        '<div class="cart-item-price">Size: ' + riccyEscapeHtml(item.size) + ' · ' + riccyFormatHKD(p.price) + ' each</div></div>' +
        '<div class="cart-item-actions">' +
        '<div class="qty-stepper">' +
        '<button type="button" data-qty-decrease data-product-id="' + p.id + '" data-size="' + riccyEscapeHtml(item.size) + '" aria-label="Decrease quantity">−</button>' +
        '<span>' + item.qty + '</span>' +
        '<button type="button" data-qty-increase data-product-id="' + p.id + '" data-size="' + riccyEscapeHtml(item.size) + '" aria-label="Increase quantity">+</button>' +
        '</div>' +
        '<button type="button" class="remove-link" data-remove-item data-product-id="' + p.id + '" data-size="' + riccyEscapeHtml(item.size) + '">Remove</button>' +
        '</div></div>'
      );
    })
    .join('');

  var subtotal = RicciStore.getSubtotal();
  document.getElementById('summarySubtotal').textContent = riccyFormatHKD(subtotal);
  document.getElementById('summaryTotal').textContent = riccyFormatHKD(subtotal);
}

function riccyOrderStatusBadge(status) {
  var cls = status === 'paid' ? 'badge--paid' : status === 'cancelled' ? 'badge--low' : 'badge--pending';
  return '<span class="badge ' + cls + '">' + riccyEscapeHtml(status) + '</span>';
}
