// store.js — in-memory application state (no localStorage/sessionStorage —
// sandboxed preview iframes block storage APIs, so state lives in JS memory
// for the duration of the page session instead).
var RicciStore = (function () {
  var state = {
    products: [], // all active products from the API
    cart: [], // [{ productId, size, qty }]
    adminKey: null, // set once the admin unlocks the Inventory Manager
  };

  var listeners = [];
  function notify() {
    listeners.forEach(function (fn) {
      fn(state);
    });
  }

  function setProducts(products) {
    state.products = products;
    notify();
  }

  function findProduct(id) {
    return state.products.find(function (p) {
      return p.id === id;
    });
  }

  function getSize(product, sizeName) {
    var sizes = product && Array.isArray(product.sizes) ? product.sizes : [];
    return sizes.find(function (size) { return size.name === sizeName; }) || sizes[0] || { name: 'One Size', stock: product ? product.stock : 0 };
  }

  function addToCart(productId, sizeName, qty) {
    qty = qty || 1;
    var product = findProduct(productId);
    if (!product) return;
    var size = getSize(product, sizeName);
    var existing = state.cart.find(function (c) {
      return c.productId === productId && c.size === size.name;
    });
    var maxStock = size.stock;
    if (existing) {
      existing.qty = Math.min(maxStock, existing.qty + qty);
    } else {
      state.cart.push({ productId: productId, size: size.name, qty: Math.min(maxStock, qty) });
    }
    notify();
  }

  function setQty(productId, sizeName, qty) {
    var item = state.cart.find(function (c) {
      return c.productId === productId && c.size === sizeName;
    });
    if (!item) return;
    var product = findProduct(productId);
    var maxStock = getSize(product, sizeName).stock;
    item.qty = Math.max(1, Math.min(maxStock, qty));
    notify();
  }

  function removeFromCart(productId, sizeName) {
    state.cart = state.cart.filter(function (c) {
      return c.productId !== productId || c.size !== sizeName;
    });
    notify();
  }

  function clearCart() {
    state.cart = [];
    notify();
  }

  function getCartItems() {
    return state.cart
      .map(function (c) {
        var product = findProduct(c.productId);
        if (!product) return null;
        return { product: product, size: c.size, qty: c.qty };
      })
      .filter(Boolean);
  }

  function getCartCount() {
    return state.cart.reduce(function (sum, c) {
      return sum + c.qty;
    }, 0);
  }

  function getSubtotal() {
    return getCartItems().reduce(function (sum, item) {
      return sum + item.product.price * item.qty;
    }, 0);
  }

  function setAdminKey(key) {
    state.adminKey = key;
  }

  function getAdminKey() {
    return state.adminKey;
  }

  function subscribe(fn) {
    listeners.push(fn);
  }

  return {
    setProducts: setProducts,
    findProduct: findProduct,
    addToCart: addToCart,
    setQty: setQty,
    removeFromCart: removeFromCart,
    clearCart: clearCart,
    getCartItems: getCartItems,
    getCartCount: getCartCount,
    getSubtotal: getSubtotal,
    setAdminKey: setAdminKey,
    getAdminKey: getAdminKey,
    subscribe: subscribe,
    get state() {
      return state;
    },
  };
})();

function riccyFormatHKD(amount) {
  return 'HK$' + Number(amount).toLocaleString('en-HK', { maximumFractionDigits: 0 });
}

function riccyToast(message, tone) {
  var stack = document.getElementById('toastStack');
  if (!stack) return;
  var el = document.createElement('div');
  el.className = 'toast';
  if (tone === 'error') el.style.background = 'var(--color-error)';
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(function () {
    el.style.transition = 'opacity 200ms';
    el.style.opacity = '0';
    setTimeout(function () {
      el.remove();
    }, 220);
  }, 2600);
}

function riccyEscapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}
