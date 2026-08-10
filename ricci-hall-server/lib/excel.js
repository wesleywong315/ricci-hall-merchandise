/**
 * Excel-backed data layer.
 *
 * Every product and order lives in a real .xlsx file on disk
 * (data/inventory.xlsx). The Inventory Manager admin page, and any
 * spreadsheet software, can open the exact same file — it IS the database.
 * We read the workbook fresh on every write and re-save it, so manual edits
 * made directly in Excel (while the server is stopped) are respected too.
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const LOCAL_DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || LOCAL_DATA_DIR;
const WORKBOOK_PATH = path.join(DATA_DIR, 'inventory.xlsx');
const SEED_WORKBOOK_PATH = path.join(__dirname, '..', 'seed', 'inventory.xlsx');

const PRODUCTS_SHEET = 'Products';
const ORDERS_SHEET = 'Orders';
const CUSTOMERS_SHEET = 'Customers';

const PRODUCT_COLUMNS = [
  'id',
  'name',
  'category', // "inventory" | "new-release"
  'price',    // HKD, number
  'stock',    // derived total across sizes
  'sizes',    // JSON string: [{name,stock}]
  'imageUrl',
  'images',   // JSON string: [url]
  'description',
  'sku',
  'active',   // TRUE/FALSE — soft hide instead of delete
];

const ORDER_COLUMNS = [
  'id',
  'createdAt',
  'customerId',
  'customerName',
  'yearOfEntry',
  'customerEmail',
  'items',     // JSON string: [{productId,name,qty,price}]
  'total',
  'status',    // pending | paid | cancelled
  'stripeSessionId',
  'cancellationReason',
  'cancelledAt',
  'confirmationEmailSentAt',
  'cancellationEmailSentAt',
];

const CUSTOMER_COLUMNS = [
  'id',
  'email',
  'name',
  'yearOfEntry',
  'createdAt',
  'updatedAt',
];

function ensureWorkbook() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(WORKBOOK_PATH) && fs.existsSync(SEED_WORKBOOK_PATH)) {
    fs.copyFileSync(SEED_WORKBOOK_PATH, WORKBOOK_PATH);
  }
  const wb = fs.existsSync(WORKBOOK_PATH) ? XLSX.readFile(WORKBOOK_PATH) : XLSX.utils.book_new();
  let changed = false;
  [
    [PRODUCTS_SHEET, PRODUCT_COLUMNS],
    [ORDERS_SHEET, ORDER_COLUMNS],
    [CUSTOMERS_SHEET, CUSTOMER_COLUMNS],
  ].forEach(([name, columns]) => {
    if (!wb.Sheets[name]) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([columns]), name);
      changed = true;
    }
  });
  if (changed || !fs.existsSync(WORKBOOK_PATH)) XLSX.writeFile(wb, WORKBOOK_PATH);
}

function readWorkbook() {
  ensureWorkbook();
  return XLSX.readFile(WORKBOOK_PATH);
}

function writeWorkbook(wb) {
  XLSX.writeFile(wb, WORKBOOK_PATH);
}

function sheetToRows(wb, sheetName, columns) {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return rows.map((r) => {
    const out = {};
    columns.forEach((c) => (out[c] = r[c] !== undefined ? r[c] : ''));
    return out;
  });
}

function rowsToSheet(rows, columns) {
  const aoa = [columns, ...rows.map((r) => columns.map((c) => r[c]))];
  return XLSX.utils.aoa_to_sheet(aoa);
}

// ---------- Products ----------

function coerceProduct(row) {
  let sizes = [];
  let images = [];
  try {
    sizes = typeof row.sizes === 'string' ? JSON.parse(row.sizes) : row.sizes || [];
  } catch (e) {
    sizes = [];
  }
  try {
    images = typeof row.images === 'string' ? JSON.parse(row.images) : row.images || [];
  } catch (e) {
    images = [];
  }
  const legacyStock = Number.isFinite(Number(row.stock)) ? Math.max(0, Math.trunc(Number(row.stock))) : 0;
  sizes = Array.isArray(sizes)
    ? sizes
        .map((size) => ({
          name: String((size && size.name) || '').trim(),
          stock: Math.max(0, Math.trunc(Number(size && size.stock) || 0)),
        }))
        .filter((size, index, all) => size.name && all.findIndex((x) => x.name.toLowerCase() === size.name.toLowerCase()) === index)
    : [];
  if (!sizes.length) sizes = [{ name: 'One Size', stock: legacyStock }];
  images = Array.isArray(images) ? images.map((url) => String(url || '').trim()).filter(Boolean) : [];
  const legacyImage = String(row.imageUrl || '').trim();
  if (!images.length && legacyImage) images = [legacyImage];
  const stock = sizes.reduce((total, size) => total + size.stock, 0);
  return {
    id: String(row.id),
    name: String(row.name || ''),
    category: row.category === 'new-release' ? 'new-release' : 'inventory',
    price: Number(row.price) || 0,
    stock,
    sizes,
    imageUrl: images[0] || legacyImage,
    images,
    description: String(row.description || ''),
    sku: String(row.sku || ''),
    active: row.active === false || row.active === 'FALSE' || row.active === 0 ? false : true,
  };
}

function getProducts({ includeInactive = false } = {}) {
  const wb = readWorkbook();
  const rows = sheetToRows(wb, PRODUCTS_SHEET, PRODUCT_COLUMNS).filter((r) => r.id !== '');
  const products = rows.map(coerceProduct);
  return includeInactive ? products : products.filter((p) => p.active);
}

function getProductById(id) {
  return getProducts({ includeInactive: true }).find((p) => p.id === id) || null;
}

function saveAllProducts(products) {
  const wb = readWorkbook();
  const rows = products.map((product) => {
    const clean = coerceProduct(product);
    return {
      ...clean,
      sizes: JSON.stringify(clean.sizes),
      images: JSON.stringify(clean.images),
    };
  });
  const sheet = rowsToSheet(rows, PRODUCT_COLUMNS);
  wb.Sheets[PRODUCTS_SHEET] = sheet;
  if (!wb.SheetNames.includes(PRODUCTS_SHEET)) wb.SheetNames.push(PRODUCTS_SHEET);
  writeWorkbook(wb);
}

function upsertProduct(product) {
  const all = getProducts({ includeInactive: true });
  const idx = all.findIndex((p) => p.id === product.id);
  const clean = coerceProduct(product);
  if (idx === -1) all.push(clean);
  else all[idx] = clean;
  saveAllProducts(all);
  return clean;
}

function deleteProduct(id) {
  const all = getProducts({ includeInactive: true });
  const idx = all.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  all.splice(idx, 1);
  saveAllProducts(all);
  return true;
}

function decrementStock(items) {
  // items: [{productId, size, qty}]
  const all = getProducts({ includeInactive: true });
  for (const item of items) {
    const p = all.find((x) => x.id === item.productId);
    if (!p) continue;
    const size = p.sizes.find((x) => x.name === item.size) || p.sizes[0];
    if (size) size.stock = Math.max(0, size.stock - item.qty);
  }
  saveAllProducts(all);
}

function incrementStock(items) {
  const all = getProducts({ includeInactive: true });
  for (const item of items) {
    const p = all.find((x) => x.id === item.productId);
    if (!p) continue;
    const size = p.sizes.find((x) => x.name === item.size) || p.sizes[0];
    if (size) size.stock += Math.max(0, Math.trunc(Number(item.qty) || 0));
  }
  saveAllProducts(all);
}

function migrateWorkbook() {
  saveAllProducts(getProducts({ includeInactive: true }));
  saveAllOrders(getOrders());
  saveAllCustomers(getCustomers());
}

// ---------- Orders ----------

function coerceOrder(row) {
  let items = [];
  try {
    items = typeof row.items === 'string' ? JSON.parse(row.items) : row.items || [];
  } catch (e) {
    items = [];
  }
  return {
    id: String(row.id),
    createdAt: String(row.createdAt || ''),
    customerId: String(row.customerId || ''),
    customerName: String(row.customerName || ''),
    yearOfEntry: String(row.yearOfEntry || ''),
    customerEmail: String(row.customerEmail || ''),
    items,
    total: Number(row.total) || 0,
    status: String(row.status || 'pending'),
    stripeSessionId: String(row.stripeSessionId || ''),
    cancellationReason: String(row.cancellationReason || ''),
    cancelledAt: String(row.cancelledAt || ''),
    confirmationEmailSentAt: String(row.confirmationEmailSentAt || ''),
    cancellationEmailSentAt: String(row.cancellationEmailSentAt || ''),
  };
}

function getOrders() {
  const wb = readWorkbook();
  const rows = sheetToRows(wb, ORDERS_SHEET, ORDER_COLUMNS).filter((r) => r.id !== '');
  return rows.map(coerceOrder).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function saveOrder(order) {
  const orders = getOrders();
  const idx = orders.findIndex((row) => row.id === order.id);
  const clean = coerceOrder(order);
  if (idx === -1) orders.push(clean);
  else orders[idx] = clean;
  saveAllOrders(orders);
  return clean;
}

function saveAllOrders(orders) {
  const wb = readWorkbook();
  const rows = orders.map((order) => {
    const clean = coerceOrder(order);
    return { ...clean, items: JSON.stringify(clean.items) };
  });
  const sheet = rowsToSheet(rows, ORDER_COLUMNS);
  wb.Sheets[ORDERS_SHEET] = sheet;
  if (!wb.SheetNames.includes(ORDERS_SHEET)) wb.SheetNames.push(ORDERS_SHEET);
  writeWorkbook(wb);
}

function updateOrder(id, patch) {
  const orders = getOrders();
  const order = orders.find((o) => o.id === id);
  if (!order) return null;
  return saveOrder({ ...order, ...patch, id: order.id });
}

function updateOrderStatus(id, status) {
  return updateOrder(id, { status });
}

// ---------- Customers ----------

function coerceCustomer(row) {
  return {
    id: String(row.id || ''),
    email: String(row.email || '').trim().toLowerCase(),
    name: String(row.name || '').trim(),
    yearOfEntry: String(row.yearOfEntry || '').trim(),
    createdAt: String(row.createdAt || ''),
    updatedAt: String(row.updatedAt || ''),
  };
}

function getCustomers() {
  const wb = readWorkbook();
  return sheetToRows(wb, CUSTOMERS_SHEET, CUSTOMER_COLUMNS)
    .filter((row) => row.id !== '')
    .map(coerceCustomer)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function saveAllCustomers(customers) {
  const wb = readWorkbook();
  const rows = customers.map(coerceCustomer);
  const sheet = rowsToSheet(rows, CUSTOMER_COLUMNS);
  wb.Sheets[CUSTOMERS_SHEET] = sheet;
  if (!wb.SheetNames.includes(CUSTOMERS_SHEET)) wb.SheetNames.push(CUSTOMERS_SHEET);
  writeWorkbook(wb);
}

function upsertCustomer(customer) {
  const customers = getCustomers();
  const email = String(customer.email || '').trim().toLowerCase();
  const now = new Date().toISOString();
  const existingIndex = customers.findIndex((item) => item.email === email);
  const existing = existingIndex >= 0 ? customers[existingIndex] : null;
  const clean = coerceCustomer({
    id: existing ? existing.id : customer.id,
    email,
    name: customer.name || (existing && existing.name),
    yearOfEntry: customer.yearOfEntry || (existing && existing.yearOfEntry),
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  });
  if (existingIndex >= 0) customers[existingIndex] = clean;
  else customers.push(clean);
  saveAllCustomers(customers);
  return clean;
}

function getCustomerPurchaseHistory(id) {
  const customer = getCustomers().find((item) => item.id === id);
  if (!customer) return null;
  const orders = getOrders().filter((order) =>
    order.customerId === customer.id ||
    (!order.customerId && order.customerEmail.toLowerCase() === customer.email)
  );
  return { customer, orders };
}

module.exports = {
  WORKBOOK_PATH,
  ensureWorkbook,
  getProducts,
  getProductById,
  upsertProduct,
  deleteProduct,
  decrementStock,
  incrementStock,
  migrateWorkbook,
  getOrders,
  saveOrder,
  saveAllOrders,
  updateOrder,
  updateOrderStatus,
  getCustomers,
  upsertCustomer,
  getCustomerPurchaseHistory,
};
