// api.js — thin fetch wrapper for the Ricci Hall store backend
var RicciAPI = (function () {
  function base() {
    return window.RICCI_API_BASE;
  }

  async function request(path, options) {
    options = options || {};
    var headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    var res = await fetch(base() + path, Object.assign({}, options, { headers }));
    var data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!res.ok) {
      var message = (data && data.error) || 'Request failed (' + res.status + ')';
      if (data && data.code) message += ' [' + data.code + (data.responseCode ? ' ' + data.responseCode : '') + ']';
      var err = new Error(message);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  return {
    getProducts: function () {
      return request('/api/products');
    },
    checkout: function (payload) {
      return request('/api/checkout', { method: 'POST', body: JSON.stringify(payload) });
    },
    getOrder: function (id) {
      return request('/api/orders/' + id);
    },
    admin: {
      getProducts: function (adminKey) {
        return request('/api/admin/products', { headers: { 'x-admin-key': adminKey } });
      },
      createProduct: function (adminKey, product) {
        return request('/api/admin/products', {
          method: 'POST',
          headers: { 'x-admin-key': adminKey },
          body: JSON.stringify(product),
        });
      },
      updateProduct: function (adminKey, id, product) {
        return request('/api/admin/products/' + id, {
          method: 'PUT',
          headers: { 'x-admin-key': adminKey },
          body: JSON.stringify(product),
        });
      },
      deleteProduct: function (adminKey, id) {
        return request('/api/admin/products/' + id, {
          method: 'DELETE',
          headers: { 'x-admin-key': adminKey },
        });
      },
      getOrders: function (adminKey) {
        return request('/api/admin/orders', { headers: { 'x-admin-key': adminKey } });
      },
      getCustomers: function (adminKey) {
        return request('/api/admin/customers', { headers: { 'x-admin-key': adminKey } });
      },
      getCustomer: function (adminKey, id) {
        return request('/api/admin/customers/' + id, { headers: { 'x-admin-key': adminKey } });
      },
      testEmail: function (adminKey) {
        return request('/api/admin/email/test', {
          method: 'POST',
          headers: { 'x-admin-key': adminKey },
        });
      },
      cancelOrder: function (adminKey, id, reason) {
        return request('/api/admin/orders/' + id + '/cancel', {
          method: 'POST',
          headers: { 'x-admin-key': adminKey },
          body: JSON.stringify({ reason: reason }),
        });
      },
    },
  };
})();
