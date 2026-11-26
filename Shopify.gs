/** ====== Shopify.gs : ربط مباشر بـ Shopify Admin GraphQL API ======
 * الصلاحيات المطلوبة للـ Custom App: read_products, read_inventory, read_orders
 * (وعلشان أوردرات أقدم من 60 يوم: read_all_orders)
 */
/** بيظبط الدومين أي شكل يتكتب بيه: mystore / https://mystore.myshopify.com/admin / admin.shopify.com/store/mystore */
function normShopDomain_(v) {
  var d = String(v || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
  var m = d.match(/admin\.shopify\.com\/store\/([a-z0-9-]+)/);
  if (m) return m[1] + '.myshopify.com';
  d = d.replace(/[\/?#].*$/, '');
  if (d && d.indexOf('.') < 0) d += '.myshopify.com';
  return d;
}
function shopifyConfigured_() {
  var p = PropertiesService.getScriptProperties();
  return !!(p.getProperty('SHOPIFY_DOMAIN') && (p.getProperty('SHOPIFY_TOKEN') || (p.getProperty('SHOPIFY_CLIENT_ID') && p.getProperty('SHOPIFY_CLIENT_SECRET'))));
}
/** بيرجّع Access Token: إما الثابت (shpat_) أو مؤقت بيتجاب بـ Client ID + Secret (صالح 24 ساعة) */
function shopifyToken_(forceRefresh) {
  var p = PropertiesService.getScriptProperties(), fixed = p.getProperty('SHOPIFY_TOKEN');
  if (fixed) return fixed;
  var tmp = p.getProperty('SHOPIFY_TMP_TOKEN'), exp = Number(p.getProperty('SHOPIFY_TMP_EXP') || 0);
  if (!forceRefresh && tmp && exp > now_().getTime() + 5 * 60000) return tmp;
  var res = UrlFetchApp.fetch('https://' + normShopDomain_(p.getProperty('SHOPIFY_DOMAIN')) + '/admin/oauth/access_token', {
    method: 'post', contentType: 'application/x-www-form-urlencoded', muteHttpExceptions: true,
    payload: 'grant_type=client_credentials&client_id=' + encodeURIComponent(p.getProperty('SHOPIFY_CLIENT_ID')) +
      '&client_secret=' + encodeURIComponent(p.getProperty('SHOPIFY_CLIENT_SECRET'))
  });
  var code = res.getResponseCode(), body = res.getContentText();
  if (code !== 200) throw new Error('فشل جلب التوكن من Client ID/Secret (HTTP ' + code + '): ' + body.slice(0, 200) + '\nتأكد إن التطبيق متثبت على المتجر وإن الدومين صح.');
  var j = JSON.parse(body);
  if (!j.access_token) throw new Error('الرد مفيهوش access_token: ' + body.slice(0, 200));
  p.setProperty('SHOPIFY_TMP_TOKEN', j.access_token);
  p.setProperty('SHOPIFY_TMP_EXP', String(now_().getTime() + (Number(j.expires_in) || 86399) * 1000));
  return j.access_token;
}
function menuShopifyCredentials() {
  var ui = SpreadsheetApp.getUi(), p = PropertiesService.getScriptProperties();
  var d = normShopDomain_(ui.prompt('دومين المتجر (مثال: mystore أو mystore.myshopify.com)').getResponseText());
  if (!d) { ui.alert('اتلغى'); return; }
  var id = ui.prompt('Client ID (سيبه فاضي لو هتستخدم Access Token يبدأ بـ shpat_)').getResponseText().trim();
  p.setProperty('SHOPIFY_DOMAIN', d);
  ['SHOPIFY_TOKEN', 'SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET', 'SHOPIFY_TMP_TOKEN', 'SHOPIFY_TMP_EXP'].forEach(function (k) { p.deleteProperty(k); });
  if (id) {
    var sec = ui.prompt('Client secret').getResponseText().trim();
    if (!sec) { ui.alert('اتلغى'); return; }
    p.setProperty('SHOPIFY_CLIENT_ID', id); p.setProperty('SHOPIFY_CLIENT_SECRET', sec);
  } else {
    var t = ui.prompt('Admin API access token (يبدأ shpat_)').getResponseText().trim();
    if (!t) { ui.alert('اتلغى'); return; }
    p.setProperty('SHOPIFY_TOKEN', t);
  }
  try { var n = shopifyGql_('{ shop { name } }').shop.name; ui.alert('اتصال ناجح بمتجر: ' + n); }
  catch (e) { ui.alert('فشل الاتصال: ' + e.message); }
}
/** حد أمان: عدّاد طلبات يومي علشان منوصلش لحد جوجل (20,000) */
var DAILY_FETCH_LIMIT = 8000;
function countFetch_(n) {
  var p = PropertiesService.getScriptProperties(), day = dstr_(), k = 'FETCH_' + day, c = Number(p.getProperty(k) || 0) + (n || 1);
  if (c > DAILY_FETCH_LIMIT) throw new Error('وصلت حد الأمان اليومي لطلبات Shopify (' + DAILY_FETCH_LIMIT + '). اتوقفت علشان متتخطاش حد جوجل. كمّل بكرة.');
  p.setProperty(k, String(c));
  p.setProperty('FETCH_LAST_DAY', day);
  return c;
}
function fetchesToday() { return Number(PropertiesService.getScriptProperties().getProperty('FETCH_' + dstr_()) || 0); }
var API_VERSIONS = ['2026-07', '2026-04', '2026-01', '2025-10'];
function shopifyGql_(query, variables) {
  var p = PropertiesService.getScriptProperties(), dom = normShopDomain_(p.getProperty('SHOPIFY_DOMAIN'));
  var cfgV = cfg_('ShopifyApiVersion', API_VERSIONS[0]);
  var versions = [cfgV].concat(API_VERSIONS.filter(function (v) { return v !== cfgV; }));
  var lastErr = '', refreshed = false;
  for (var vi = 0; vi < versions.length; vi++) {
    var url = 'https://' + dom + '/admin/api/' + versions[vi] + '/graphql.json', versionBad = false;
    for (var attempt = 0; attempt < 5; attempt++) {
      var opts = { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { 'X-Shopify-Access-Token': shopifyToken_(false), 'Accept': 'application/json' },
        payload: JSON.stringify({ query: query, variables: variables || {} }) };
      countFetch_(1);
      var res = UrlFetchApp.fetch(url, opts), code = res.getResponseCode(), body = res.getContentText();
      if (code === 401 && !refreshed && !p.getProperty('SHOPIFY_TOKEN')) { refreshed = true; shopifyToken_(true); continue; }
      if (code === 429 || code >= 500) { Utilities.sleep(1500 * (attempt + 1)); continue; }
      if (code === 404 || code === 406 || code === 400 && /version/i.test(body)) { versionBad = true; lastErr = 'HTTP ' + code + ' على نسخة ' + versions[vi] + ' (' + (body || 'رد فاضي').slice(0, 120) + ')'; break; }
      if (code !== 200) throw new Error('Shopify HTTP ' + code + ' (' + url + '): ' + (body || '[رد فاضي]').slice(0, 200));
      var j = JSON.parse(body);
      if (j.errors) {
        if (JSON.stringify(j.errors).indexOf('THROTTLED') >= 0) { Utilities.sleep(2000 * (attempt + 1)); continue; }
        throw new Error('Shopify: ' + JSON.stringify(j.errors).slice(0, 300));
      }
      if (versions[vi] !== cfgV) setConfigValue_('ShopifyApiVersion', versions[vi]);   // احفظ النسخة اللي اشتغلت
      return j.data;
    }
    if (!versionBad) throw new Error('Shopify: فشل بعد عدة محاولات (' + url + ')');
  }
  throw new Error('Shopify رفض كل نسخ الـ API اللي جربتها. آخر خطأ: ' + lastErr + '\nتأكد من الدومين (' + dom + ') وإن التطبيق متثبت على المتجر.');
}
/** اختبار الاتصال (من القايمة) */
function menuShopifyTest() {
  try { var d = shopifyGql_('{ shop { name myshopifyDomain } }').shop; alert_('اتصال ناجح ✔\nالمتجر: ' + d.name + '\n' + d.myshopifyDomain + '\nنسخة الـ API: ' + cfg_('ShopifyApiVersion')); }
  catch (e) { alert_('فشل الاتصال: ' + e.message); }
}

/** سحب المخزون على دفعات: لو الوقت قرّب يخلص (6 دقايق حد جوجل) بيحفظ مكانه ويكمّل لوحده بعد دقيقة */
var SYNC_BUDGET_MS = 4.5 * 60 * 1000;
function syncShopifyInventory() {
  if (!shopifyConfigured_()) throw new Error('Shopify مش متظبط. من القايمة: ربط Shopify.');
  var p = PropertiesService.getScriptProperties(), t0 = new Date().getTime();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'syncShopifyContinue') ScriptApp.deleteTrigger(t); });
  var cursor = null;
  if (p.getProperty('INV_ACTIVE')) cursor = p.getProperty('INV_CURSOR') || null;
  else { writeTable_('Shopify_Staging', []); p.setProperty('INV_ACTIVE', '1'); p.deleteProperty('INV_CURSOR'); p.setProperty('INV_COUNT', '0'); }
  var q = 'query($c:String){ productVariants(first:250, after:$c){ pageInfo{hasNextPage endCursor} nodes{ sku barcode title inventoryQuantity product{title} } } }';
  var buf = [], ts = now_(), pages = 0, more = true;
  function flush() { if (buf.length) { appendRows_('Shopify_Staging', buf); p.setProperty('INV_COUNT', String(Number(p.getProperty('INV_COUNT') || 0) + buf.length)); buf = []; } }
  while (more) {
    var d = shopifyGql_(q, { c: cursor }).productVariants;
    d.nodes.forEach(function (v) {
      buf.push({ Barcode: normBarcode_(v.barcode), SKU: trim_(v.sku), Title: (v.product ? v.product.title : '') + (v.title && v.title !== 'Default Title' ? ' - ' + v.title : ''), Available: num_(v.inventoryQuantity), Updated: ts });
    });
    pages++; cursor = d.pageInfo.hasNextPage ? d.pageInfo.endCursor : null; more = !!cursor;
    if (buf.length >= 2000 || !more) flush();
    if (more && new Date().getTime() - t0 > SYNC_BUDGET_MS) {
      flush(); p.setProperty('INV_CURSOR', cursor);
      ScriptApp.newTrigger('syncShopifyContinue').timeBased().after(60 * 1000).create();
      toast_('Shopify: اتسحب ' + p.getProperty('INV_COUNT') + ' صنف لحد دلوقتي، هيكمّل لوحده بعد دقيقة…');
      return { partial: true, rows: Number(p.getProperty('INV_COUNT')) };
    }
  }
  flush();
  var rows = readTable_('Shopify_Staging');
  withLock_(function () { writeTable_('Shopify_Inventory', rows); writeTable_('Shopify_Staging', []); linkShopify_(); });
  p.deleteProperty('INV_ACTIVE'); p.deleteProperty('INV_CURSOR'); p.deleteProperty('INV_COUNT'); p.setProperty('LAST_SYNC', Utilities.formatDate(now_(), tz_(), 'yyyy-MM-dd HH:mm'));
  audit_('', 'syncShopifyInventory', rows.length + ' variants');
  toast_('Shopify مخزون: ' + rows.length + ' صنف | طلبات اليوم: ' + fetchesToday());
  return { partial: false, rows: rows.length };
}
function syncShopifyContinue() {
  try { var r = syncShopifyInventory(); if (!r.partial) rebuildAll(); }
  catch (e) { audit_('system', 'syncShopifyContinue error', e.message); PropertiesService.getScriptProperties().deleteProperty('INV_ACTIVE'); }
}
var ORDER_FIELDS = 'id name createdAt displayFinancialStatus displayFulfillmentStatus note fulfillments{ trackingInfo{ number } } lineItems(first:20){ nodes{ sku quantity title variant{ barcode } } }';
function orderNodeToRows_(o, orders, lines) {
  var num = String(o.name || '').replace('#', '');
  var tr = []; (o.fulfillments || []).forEach(function (f) { (f.trackingInfo || []).forEach(function (t) { if (t.number) tr.push(normWaybill_(t.number)); }); });
  orders.push({ 'Order #': num, 'Order ID': String(o.id).replace(/\D/g, ''), Created: o.createdAt, Payment: o.displayFinancialStatus, Fulfillment: o.displayFulfillmentStatus, Tracking: tr.join(','), Note: o.note || '' });
  o.lineItems.nodes.forEach(function (li) { lines.push({ 'Order #': num, SKU: trim_(li.sku), Barcode: li.variant ? normBarcode_(li.variant.barcode) : '', Qty: li.quantity, Title: li.title }); });
}
function upsertOrders_(orders, lines) {
  withLock_(function () {
    var have = {}; orders.forEach(function (o) { have[o['Order #']] = 1; });
    var keepO = readTable_('Shopify_Orders').filter(function (o) { return !have[String(o['Order #'])]; });
    var keepL = readTable_('Order_Lines').filter(function (l) { return !have[String(l['Order #'])]; });
    writeTable_('Shopify_Orders', keepO.concat(orders)); writeTable_('Order_Lines', keepL.concat(lines));
  });
}
function syncShopifyOrders(daysBack) {
  if (!shopifyConfigured_()) throw new Error('Shopify مش متظبط.');
  daysBack = daysBack || 30;
  var since = Utilities.formatDate(new Date(now_().getTime() - daysBack * 86400000), 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
  var q = 'query($c:String,$q:String){ orders(first:10, after:$c, query:$q, sortKey:CREATED_AT){ pageInfo{hasNextPage endCursor} nodes{ ' + ORDER_FIELDS + ' } } }';
  var orders = [], lines = [], cursor = null, guard = 0;
  do {
    var d = shopifyGql_(q, { c: cursor, q: 'created_at:>=' + since }).orders;
    d.nodes.forEach(function (o) { orderNodeToRows_(o, orders, lines); });
    cursor = d.pageInfo.hasNextPage ? d.pageInfo.endCursor : null;
  } while (cursor && ++guard < 200);
  upsertOrders_(orders, lines);
  audit_('', 'syncShopifyOrders', orders.length + ' orders');
  toast_('Shopify أوردرات: ' + orders.length);
  return orders.length;
}
/** بيجيب أوردرات معيّنة بأرقامها (للمرتجعات القديمة) — 20 أوردر في الطلب */
function fetchOrdersByNumbers_(nums) {
  if (!shopifyConfigured_() || !nums.length) return 0;
  var orders = [], lines = [];
  for (var i = 0; i < nums.length; i += 10) {
    var chunk = nums.slice(i, i + 10);
    var q = 'query($q:String){ orders(first:10, query:$q){ nodes{ ' + ORDER_FIELDS + ' } } }';
    var d = shopifyGql_(q, { q: chunk.map(function (n) { return 'name:' + n; }).join(' OR ') }).orders;
    d.nodes.forEach(function (o) { orderNodeToRows_(o, orders, lines); });
  }
  if (orders.length) upsertOrders_(orders, lines);
  return orders.length;
}
/** يربط Products بـ Shopify_Inventory بالـ UPC (Barcode) */
function linkShopify_() {
  var inv = readTable_('Shopify_Inventory'), byBc = {};
  inv.forEach(function (v) { var b = normBarcode_(v.Barcode); if (b) byBc[b] = (byBc[b] || 0) + num_(v.Available); });
  var p = readTable_('Products');
  p.forEach(function (x) {
    var b = normBarcode_(x.Barcode), hit = byBc[b];
    x['In Shopify'] = inv.length ? (hit === undefined ? 'No' : 'Yes') : '';
    x['Shopify Available'] = hit === undefined ? '' : hit;
  });
  writeTable_('Products', p);
}
