/** ====== ApiActions.gs : عمليات التطبيق (استعلام، استلام، مرتجعات، تحضير، استثناءات) ====== */
function isTrue_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }
function okBarcode_(b) { return /^[0-9A-Za-z\-]{5,24}$/.test(b); }
function seenScan_(id) { if (!id) return false; var c = CacheService.getScriptCache(), k = 'sc:' + id; if (c.get(k)) return true; c.put(k, '1', 21600); return false; }

/** ---- الرئيسية ---- */
function apiHome_() {
  var c = CacheService.getScriptCache(), v = c.get('home_v1');
  if (v) { try { return JSON.parse(v); } catch (e) {} }
  var m = computeDashboard_();
  m.held = readTable_('Picking_Hold').filter(function (r) { return trim_(r.Status) === HOLD_ACTIVE; }).length;
  m.putawayPieces = putawayAgg_().reduce(function (s, r) { return s + r.qty; }, 0);
  try { c.put('home_v1', JSON.stringify(m), 60); } catch (e) {}
  return m;
}

/** ---- استعلام عن صنف ---- */
function apiLookup_(a) {
  var q = trim_(a.q); if (!q) throw apiErr_('BAD_INPUT', 'اكتب باركود أو كود أو اسم');
  var bc = normBarcode_(q), ql = q.toLowerCase(), B = readCol_('Products', 'Barcode'), idx = [], exact = false, i;
  if (bc) for (i = 0; i < B.length; i++) if (normBarcode_(B[i]) === bc) idx.push(i);
  if (idx.length) exact = true;
  else {
    var S = readCol_('Products', 'SKU'), T = readCol_('Products', 'Title'), toks = ql.split(/\s+/).filter(Boolean);
    for (i = 0; i < B.length; i++) { var s = (trim_(S[i]) + ' ' + trim_(T[i]) + ' ' + trim_(B[i])).toLowerCase(); if (toks.every(function (t) { return s.indexOf(t) >= 0; })) idx.push(i); }
  }
  var total = idx.length, out = { query: q, total: total };
  if (!total) {   // مش في On Hand: ندوّر في Shopify (أصناف رصيدها صفر في الـ ERP)
    var sf = shopifyOnlyLookup_(q, bc, ql); if (sf) return sf;
    out.notFound = true; out.matches = []; return out;
  }
  var shown = idx.slice(0, 25), SK = readCol_('Products', 'SKU'), TI = readCol_('Products', 'Title'), LO = readCol_('Products', 'Location'), ER = readCol_('Products', 'ERP Qty');
  out.matches = shown.map(function (k) { return { upc: normBarcode_(B[k]), sku: trim_(SK[k]), title: trim_(TI[k]), location: trim_(LO[k]), erp: num_(ER[k]) }; });
  if (total === 1 || exact) out.detail = lookupDetail_(readRowsAt_('Products', [idx[0]])[0]);
  return out;
}
function shopifyOnlyLookup_(q, bc, ql) {
  var inv = readTable_('Shopify_Inventory'), by = {};
  var toks = ql.split(/\s+/).filter(Boolean), hits = [];
  inv.forEach(function (v) {
    var b = normBarcode_(v.Barcode), hit = bc ? b === bc : toks.every(function (t) { return (trim_(v.SKU) + ' ' + trim_(v.Title) + ' ' + b).toLowerCase().indexOf(t) >= 0; });
    if (hit) hits.push(v);
  });
  if (!hits.length) return null;
  var RL = loadRules_().rules, total = hits.length; hits = hits.slice(0, 25);
  var rows = hits.map(function (v) { var r = locFromRules_(RL, v.SKU, '', ''); return { upc: normBarcode_(v.Barcode), sku: trim_(v.SKU), title: trim_(v.Title), location: r ? r.l1 : '', erp: 0, shopify: num_(v.Available), r: r }; });
  var out = { total: total, shopifyOnly: true, matches: rows.map(function (x) { return { upc: x.upc, sku: x.sku, title: x.title, location: x.location, erp: 0 }; }) };
  if (total === 1 || bc) { var x = rows[0], s = parseSku_(x.sku), demand = 0; readTable_('Picking').forEach(function (r) { if (normBarcode_(r.UPC) === x.upc && !isTrue_(r.Done)) demand += num_(r.Qty); });
    out.detail = { upc: x.upc, sku: x.sku, title: x.title, category: s.cat, season: s.season, model: s.model, location: x.location, location2: x.r ? [x.r.l2, x.r.l3].filter(Boolean).join(' / ') : '', rule: x.r ? x.r.level + ': ' + x.r.key : '', erp: 0, shopify: x.shopify, inErp: 'No', inShopify: 'Yes',
      opening: 0, received: 0, sold: 0, returned: 0, adjust: 0, actual: 0, gapActualErp: null, erpShopify: null, returnsArea: 0, pendingDemand: demand, movements: [], hasOpening: false, notInErp: true }; }
  return out;
}
function lookupDetail_(p) {
  var b = normBarcode_(p.Barcode), si = findIdx_('Stock', 'Barcode', b), st = si.length ? readRowsAt_('Stock', [si[0]])[0] : {};
  var demand = 0, pk = readCols_('Picking', ['UPC', 'Qty', 'Done']); pk.forEach(function (r) { if (normBarcode_(r.UPC) === b && !isTrue_(r.Done)) demand += num_(r.Qty); });
  var mi = findIdx_('Movements', 'Barcode', b).slice(-8).reverse(), mv = readRowsAt_('Movements', mi).map(function (x) {
    return { time: x.Time ? Utilities.formatDate(new Date(x.Time), tz_(), 'yyyy-MM-dd HH:mm') : '', type: x.Type, qty: num_(x.Qty), ref: trim_(x.Ref), user: trim_(x.User), reason: trim_(x.Reason) };
  }), s = st;
  return { upc: b, sku: trim_(p.SKU), title: trim_(p.Title), category: trim_(p.Category), season: trim_(p.Season), model: trim_(p.Model), location: trim_(p.Location), location2: trim_(p['Location 2']), rule: trim_(p.Rule),
    erp: num_(p['ERP Qty']), shopify: p['Shopify Available'] === '' ? null : num_(p['Shopify Available']), inErp: p['In ERP'], inShopify: p['In Shopify'],
    opening: num_(s.Opening), received: num_(s.Received), sold: num_(s.Sold), returned: num_(s.Returned), adjust: num_(s.Adjust), actual: num_(s.Actual), gapActualErp: s['Gap (Actual-ERP)'] === undefined ? null : s['Gap (Actual-ERP)'],
    erpShopify: s['ERP-Shopify'] === undefined || s['ERP-Shopify'] === '' ? null : num_(s['ERP-Shopify']), returnsArea: num_(s['In Returns Area']), pendingDemand: demand, movements: mv, hasOpening: hasOpening_() };
}

/** ---- الاستلام ---- */
function receivingApproved_(code) {
  return readTable_('Sessions').some(function (x) { return x.Mode === 'receive' && trim_(x.Ref) === code && x.Status === 'Closed'; });
}
function apiReceivingCodes_() {
  var by = {}, order = [];
  readTable_('Receiving_Data').forEach(function (r) {
    var c = trim_(r['كود الإذن']); if (!c) return;
    if (!by[c]) { by[c] = { code: c, lines: 0, expected: 0, scanned: 0 }; order.push(c); }
    by[c].lines++; by[c].expected += num_(r['Orig Qty']);
  });
  var sh = sh_('Receiving_Scan'), last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 4, last - 1, 1).getValues().forEach(function (r) { var c = trim_(r[0]); if (by[c]) by[c].scanned++; });
  var done = {}; readTable_('Sessions').forEach(function (x) { if (x.Mode === 'receive' && x.Status === 'Closed') done[trim_(x.Ref)] = 1; });
  return { codes: order.reverse().map(function (c) { by[c].approved = !!done[c]; return by[c]; }) };
}
function apiReceivingOpen_(code) {
  code = trim_(code); if (!code) throw apiErr_('BAD_INPUT', 'اختار كود الإذن');
  var m = receivingCounts_(code), lm = productLocMap_(), exp = {}, loc = {}, pm = null;
  Object.keys(m.exp).forEach(function (b) { exp[b] = [m.exp[b], m.desc[b] || '']; loc[b] = locLabel_(lm, b); });
  Object.keys(m.counts).forEach(function (b) { if (!(b in loc)) loc[b] = locLabel_(lm, b); });
  return { code: code, approved: receivingApproved_(code), exp: exp, counts: m.counts, loc: loc, totals: sums_(m.exp, m.counts) };
}
function receivingScanBatch_(code, user, scans) {
  if (!code) throw apiErr_('BAD_INPUT', 'اختار كود الإذن الأول');
  return withLock_(function () {
    if (receivingApproved_(code)) throw apiErr_('APPROVED', 'الإذن ' + code + ' اتعتمد خلاص، مينفعش سكان عليه.');
    var m = receivingCounts_(code), counts = m.counts, lm = productLocMap_(), rows = [], results = [], t = now_();
    if (!Object.keys(m.exp).length) throw apiErr_('NO_CODE', 'الكود ' + code + ' مش موجود في Receiving_Data');
    scans.slice(0, 200).forEach(function (s) {
      var b = normBarcode_(s.upc);
      if (!okBarcode_(b)) { results.push({ id: s.id, upc: s.upc, status: 'INVALID' }); return; }
      if (seenScan_(s.id)) { results.push({ id: s.id, upc: b, status: 'DUP' }); return; }
      var e = m.exp[b] || 0, c = counts[b] || 0, st = e === 0 ? 'NOT_IN_LIST' : (c + 1 > e ? 'OVER' : 'OK'); counts[b] = c + 1;
      var lab = locLabel_(lm, b);
      rows.push({ UPC: b, Time: t, User: user, 'كود الإذن': code, Zone: '', Status: st, Location: lab });
      results.push({ id: s.id, upc: b, status: st, count: c + 1, expected: e, location: lab, desc: m.desc[b] || '' });
    });
    appendRows_('Receiving_Scan', rows);
    var tot = sums_(m.exp, counts);
    return { results: results, totals: tot };
  });
}
function receivingUndo_(code, upc, c) {
  return withLock_(function () {
    if (receivingApproved_(code)) throw apiErr_('APPROVED', 'الإذن اتعتمد.');
    var sh = sh_('Receiving_Scan'), last = sh.getLastRow(), me = uname_(c), canAny = c.perms.indexOf('receiving_approve') >= 0, hit = 0;
    if (last < 2) throw apiErr_('NOT_FOUND', 'مفيش سكان');
    var v = sh.getRange(2, 1, last - 1, 4).getValues();
    for (var i = v.length - 1; i >= 0; i--) if (normBarcode_(v[i][0]) === upc && trim_(v[i][3]) === code && (canAny || normUser_(v[i][2]) === me)) { hit = i + 2; break; }
    if (!hit) throw apiErr_('NOT_FOUND', 'مفيش سكان للصنف ده تقدر تتراجع عنه');
    sh.deleteRow(hit); audit_(me, 'receiving undo', code + ' ' + upc);
    var m = receivingCounts_(code); return { count: m.counts[upc] || 0, totals: sums_(m.exp, m.counts) };
  });
}

/** ---- المرتجعات ---- */
function returnsScanBatch_(user, scans) {
  return withLock_(function () {
    var lm = productLocMap_(), pm = productMap_(), rows = [], res = [], t = now_();
    scans.slice(0, 200).forEach(function (s) {
      var b = normBarcode_(s.upc);
      if (!okBarcode_(b)) { res.push({ id: s.id, upc: s.upc, status: 'INVALID' }); return; }
      if (seenScan_(s.id)) { res.push({ id: s.id, upc: b, status: 'DUP' }); return; }
      var lab = locLabel_(lm, b), p = pm[b] || {};
      rows.push({ UPC: b, Time: t, User: user, 'Order #': '', Match: '', Putaway: '', Location: lab, Condition: (['تالف', 'حجر'].indexOf(trim_(s.cond)) >= 0 ? trim_(s.cond) : 'سليم') });
      res.push({ id: s.id, upc: b, status: p.Barcode ? 'OK' : 'UNKNOWN', location: lab, title: trim_(p.Title), sku: trim_(p.SKU) });
    });
    appendRows_('Returns_Scan', rows);
    matchReturns_();
    var sh = sh_('Returns_Scan'), last = sh.getLastRow();
    if (rows.length && last >= 2) {
      var tail = sh.getRange(last - rows.length + 1, 1, rows.length, 5).getValues(), k = 0;
      res.forEach(function (r) { if (r.status === 'OK' || r.status === 'UNKNOWN') { var x = tail[k++]; r.order = trim_(x[3]); r.match = trim_(x[4]); } });
    }
    return { results: res };
  });
}
function returnsUndo_(upc, c) {
  return withLock_(function () {
    var sh = sh_('Returns_Scan'), last = sh.getLastRow(), me = uname_(c), canAny = c.perms.indexOf('putaway') >= 0, hit = 0;
    if (last < 2) throw apiErr_('NOT_FOUND', 'مفيش سكان');
    var v = sh.getRange(2, 1, last - 1, 6).getValues();
    for (var i = v.length - 1; i >= 0; i--) if (normBarcode_(v[i][0]) === upc && !trim_(v[i][5]) && (canAny || normUser_(v[i][2]) === me)) { hit = i + 2; break; }
    if (!hit) throw apiErr_('NOT_FOUND', 'مفيش سكان تقدر تتراجع عنه');
    sh.deleteRow(hit); matchReturns_(); audit_(me, 'returns undo', upc); return { ok: true };
  });
}
function putawayAgg_() {
  var sh = sh_('Returns_Scan'), last = sh.getLastRow(), agg = {}, order = [];
  if (last >= 2) sh.getRange(2, 1, last - 1, 6).getValues().forEach(function (r) { var b = normBarcode_(r[0]); if (!b || trim_(r[5])) return; if (!agg[b]) { agg[b] = 0; order.push(b); } agg[b]++; });
  if (!order.length) return [];
  var pm = productMap_();
  return order.map(function (b) { var p = pm[b] || {}; return { upc: b, sku: trim_(p.SKU), title: trim_(p.Title), qty: agg[b], loc: trim_(p.Location) || (p.Barcode ? LOC_NONE : '⚠ باركود غير معروف'), loc2: trim_(p['Location 2']) }; })
    .sort(function (a, b) { return natCmp_(a.loc, b.loc) || natCmp_(a.upc, b.upc); });
}
function putawayMark_(upc, done, user, qty) {
  return withLock_(function () {
    var rs = sh_('Returns_Scan'), last = rs.getLastRow(); if (last < 2) return { changed: 0 };
    var data = rs.getRange(2, 1, last - 1, 6).getValues(), t = now_(), n = 0;
    if (done) { for (var i = 0; i < data.length; i++) if (normBarcode_(data[i][0]) === upc && !trim_(data[i][5])) { data[i][5] = t; n++; } }
    else { for (var j = data.length - 1; j >= 0 && n < (qty || 1); j--) if (normBarcode_(data[j][0]) === upc && trim_(data[j][5])) { data[j][5] = ''; n++; } }
    rs.getRange(2, 6, data.length, 1).setValues(data.map(function (r) { return [r[5]]; }));
    audit_(user, done ? 'putaway' : 'putaway undo', upc + ' x' + n); CacheService.getScriptCache().remove('home_v1');
    return { changed: n };
  });
}

/** ---- التحضير ---- */
function pickKey_(r) { return [trim_(r['Order #']), normBarcode_(r.UPC), trim_(r.SKU)].join('|'); }
function apiPickingList_(a) {
  var rows = readTable_('Picking'), dom = normShopDomain_(PropertiesService.getScriptProperties().getProperty('SHOPIFY_DOMAIN') || ''), handle = dom.replace('.myshopify.com', '');
  var days = {}, cats = {}, q = trim_(a.q).toLowerCase(), from = trim_(a.from), to = trim_(a.to), cat = trim_(a.category), loc = trim_(a.location).toLowerCase(), st = a.status || 'open', rdy = a.ready || '';
  rows.forEach(function (r) { r._d = toDateStr_(r.Date); r._done = isTrue_(r.Done); });
  var oids = pickOrderIds_();   // رقم الأوردر -> معرّف Shopify (من فورمولا Order Link)
  rows.forEach(function (r) {
    var d = days[r._d] || (days[r._d] = { date: r._d, orders: {}, pieces: 0, open: 0 }); d.orders[r['Order #']] = 1; d.pieces += num_(r.Qty); if (!r._done) d.open += num_(r.Qty);
    cats[r.Category] = (cats[r.Category] || 0) + 1;
  });
  var f = rows.filter(function (r) {
    if (from && r._d < from) return false; if (to && r._d > to) return false; if (cat && r.Category !== cat) return false;
    if (loc && String(r.Location).toLowerCase().indexOf(loc) !== 0) return false;
    if (st === 'open' && r._done) return false; if (st === 'done' && !r._done) return false;
    if (rdy === 'ready' && trim_(r.Ready) === 'No') return false; if (rdy === 'short' && trim_(r.Ready) !== 'No') return false;
    if (q && (r['Order #'] + ' ' + r.SKU + ' ' + r.Product + ' ' + r.UPC + ' ' + r['Color/Size']).toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
  var off = Number(a.offset) || 0, lim = Math.min(Number(a.limit) || 300, 600), page = f.slice(off, off + lim);
  var ordSet = {}, pieces = 0, openPieces = 0, shortSet = {}; f.forEach(function (r) { ordSet[r['Order #']] = 1; if (trim_(r.Ready) === 'No') shortSet[r['Order #']] = 1; pieces += num_(r.Qty); if (!r._done) openPieces += num_(r.Qty); });
  return {
    total: f.length, offset: off, orders: Object.keys(ordSet).length, shortOrders: Object.keys(shortSet).length, pieces: pieces, openPieces: openPieces,
    days: Object.keys(days).sort().map(function (k) { var d = days[k]; return { date: d.date, orders: Object.keys(d.orders).length, pieces: d.pieces, open: d.open }; }),
    categories: Object.keys(cats).sort(), handle: handle,
    rows: page.map(function (r) { return { k: pickKey_(r), done: r._done, date: r._d, cat: r.Category, loc: r.Location, loc2: r['Location 2'], qty: num_(r.Qty), sku: trim_(r.SKU), cs: trim_(r['Color/Size']), title: trim_(r.Product), order: trim_(r['Order #']), upc: normBarcode_(r.UPC), flags: trim_(r.Flags), short: num_(r.Short), ready: trim_(r.Ready) !== 'No', cust: trim_(r.Customer), oid: oids[trim_(r['Order #'])] || '' }; })
  };
}
/** بيقرا فورمولات عمود Order Link ويطلع منها الـ id */
function pickOrderIds_() {
  var out = {}; try {
    var sh = sh_('Picking'), hdr = headers_(sh), last = sh.getLastRow(); if (last < 2) return out;
    var lc = hdr.indexOf('Order Link'), oc = hdr.indexOf('Order #'); if (lc < 0 || oc < 0) return out;
    var f = sh.getRange(2, lc + 1, last - 1, 1).getFormulas(), n = sh.getRange(2, oc + 1, last - 1, 1).getValues();
    for (var i = 0; i < f.length; i++) { var m = String(f[i][0] || '').match(/\/orders\/(\d+)/); if (m) out[trim_(n[i][0])] = m[1]; }
  } catch (e) {} return out;
}
function apiPickingDone_(keys, done, user) {
  return withLock_(function () {
    var sh = sh_('Picking'), hdr = headers_(sh), last = sh.getLastRow(); if (last < 2) return { changed: 0 };
    var dc = hdr.indexOf('Done'), oc = hdr.indexOf('Order #'), uc = hdr.indexOf('UPC'), kc = hdr.indexOf('SKU'), qc = hdr.indexOf('Qty');
    var data = sh.getRange(2, 1, last - 1, hdr.length).getValues(), want = {}, n = 0, log = [], touched = {}, t = now_(), d = dstr_(t); keys.forEach(function (k) { want[k] = 1; });
    var newDone = data.map(function (r) {
      var k = [trim_(r[oc]), normBarcode_(r[uc]), trim_(r[kc])].join('|');
      if (want[k] && isTrue_(r[dc]) !== done) { n++; touched[trim_(r[oc])] = 1; log.push({ Time: t, Date: d, User: user, Action: done ? 'done' : 'undone', 'Order #': trim_(r[oc]), UPC: normBarcode_(r[uc]), Qty: num_(r[qc]) }); return done; }
      return isTrue_(r[dc]);
    });
    if (n) {
      sh.getRange(2, dc + 1, newDone.length, 1).setValues(newDone.map(function (v) { return [v]; }));
      var lines = {}, dl = {}; data.forEach(function (r, i) { var o = trim_(r[oc]); if (!touched[o]) return; lines[o] = (lines[o] || 0) + 1; if (newDone[i]) dl[o] = (dl[o] || 0) + 1; });
      Object.keys(touched).forEach(function (o) { log.push({ Time: t, Date: d, User: user, Action: (dl[o] || 0) === lines[o] ? 'order_done' : 'order_open', 'Order #': o, UPC: '', Qty: lines[o] }); });
      appendRows_('Pick_Log', log); audit_(user, done ? 'pick done' : 'pick undone', n + ' lines');
    }
    return { changed: n };
  });
}
function apiHoldList_() {
  var rows = readTable_('Picking_Hold'), today = new Date();
  return { rows: rows.filter(function (r) { return trim_(r['Order #']); }).map(function (r) {
    var since = r['Held At'] ? new Date(r['Held At']) : null;
    return { order: trim_(r['Order #']), reason: trim_(r.Reason), heldAt: since && !isNaN(since) ? Utilities.formatDate(since, tz_(), 'yyyy-MM-dd HH:mm') : '', status: trim_(r.Status), age: since && !isNaN(since) ? Math.floor((today - since) / 86400000) : '', note: trim_(r.Note) };
  }) };
}
function apiRelease_(orders, user) {
  return withLock_(function () {
    var sh = sh_('Picking_Hold'), hdr = headers_(sh), last = sh.getLastRow(), n = 0; if (last < 2) return { released: 0 };
    var oc = hdr.indexOf('Order #'), sc = hdr.indexOf('Status'), v = sh.getRange(2, 1, last - 1, hdr.length).getValues();
    v.forEach(function (r, i) { if (orders.indexOf(trim_(r[oc])) >= 0 && trim_(r[sc]) === HOLD_ACTIVE) { sh.getRange(i + 2, sc + 1).setValue(HOLD_BACK); n++; } });
    if (n) {
      audit_(user, 'release orders', orders.join(','));
      ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'pickingContinue') ScriptApp.deleteTrigger(t); });
      ScriptApp.newTrigger('pickingContinue').timeBased().after(30 * 1000).create();
    }
    return { released: n };
  });
}

/** ---- الاستثناءات ---- */
function exceptionStatuses_() { return cfg_('Exceptions.Statuses', 'Open,تحت التحقيق,اتعمل تسوية,عجز كوريير,تالف,Closed').split(',').map(trim_).filter(Boolean); }
function apiExceptionsList_(a) {
  var rows = readTable_('Daily_Exceptions'), pm = productMap_(), st = trim_(a.status || 'active'), ty = trim_(a.type);
  var out = rows.map(function (r, i) {
    var p = pm[normBarcode_(r.Barcode)] || {};
    return { id: i + 2, date: toDateStr_(r.Date), type: trim_(r.Type), ref: trim_(r.Ref), upc: normBarcode_(r.Barcode), title: trim_(p.Title), sku: trim_(p.SKU), expected: num_(r.Expected), actual: num_(r.Actual), diff: num_(r.Diff),
      status: trim_(r.Status) || 'Open', by: trim_(r['Resolved By']), note: trim_(r.Note), assigned: trim_(r['Assigned To']), closedAt: r['Closed At'] ? toDateStr_(r['Closed At']) : '' };
  }).filter(function (x) { if (ty && x.type !== ty) return false; if (st === 'active') return x.status !== 'Closed'; if (st === 'all') return true; return x.status === st; });
  var types = {}; out.forEach(function (x) { types[x.type] = (types[x.type] || 0) + 1; });
  out.sort(function (x, y) { return String(y.date).localeCompare(String(x.date)) || y.id - x.id; });
  return { total: out.length, statuses: exceptionStatuses_(), types: Object.keys(types).sort(), rows: out.slice(0, 500) };
}
function apiExceptionUpdate_(a, c) {
  var id = Number(a.id), sts = exceptionStatuses_();
  if (a.status && sts.indexOf(a.status) < 0) throw apiErr_('BAD_INPUT', 'حالة غير معروفة');
  return withLock_(function () {
    var sh = sh_('Daily_Exceptions'), hdr = headers_(sh), last = sh.getLastRow();
    if (!id || id < 2 || id > last) throw apiErr_('NOT_FOUND', 'الاستثناء مش موجود');
    var row = sh.getRange(id, 1, 1, hdr.length).getValues()[0], g = function (k) { return row[hdr.indexOf(k)]; };
    if (a.ref !== undefined && (trim_(g('Ref')) !== trim_(a.ref) || normBarcode_(g('Barcode')) !== normBarcode_(a.upc))) throw apiErr_('STALE', 'الجدول اتغيّر، حدّث الصفحة');
    var set = function (k, v) { var ci = hdr.indexOf(k); if (ci >= 0) sh.getRange(id, ci + 1).setValue(v); };
    if (a.status) { set('Status', a.status); if (a.status === 'Closed') { set('Closed At', now_()); set('Resolved By', uname_(c)); } else set('Closed At', ''); }
    if (a.note !== undefined) set('Note', a.note);
    if (a.assigned !== undefined) set('Assigned To', a.assigned);
    audit_(uname_(c), 'exception update', id + ' ' + (a.status || '')); CacheService.getScriptCache().remove('home_v1');
    return { id: id };
  });
}

/** ---- تسوية ---- */
function apiAdjust_(a, c) {
  var upc = normBarcode_(a.upc), qty = num_(a.qty), why = trim_(a.reason);
  if (!upc || !qty || !why) throw apiErr_('BAD_INPUT', 'الباركود والكمية والسبب كلهم مطلوبين');
  var limit = Number(cfg_('Adjust.AutoLimit', '2')) || 0, boss = c.perms.indexOf('adjust_approve') >= 0, auto = boss || (limit > 0 && Math.abs(qty) <= limit);
  appendRows_('Adjustments', [{ Date: dstr_(), UPC: upc, Qty: qty, Reason: why + ' (' + uname_(c) + ')', Status: auto ? '' : 'بانتظار الموافقة', ID: uid_('A'), 'Requested By': uname_(c), 'Decided By': auto ? (boss ? uname_(c) : 'تلقائي') : '' }]);
  audit_(uname_(c), auto ? 'adjust add' : 'adjust request', upc + ' ' + qty);
  if (auto) { queueRebuild_(); return { message: 'اتسجلت التسوية وهتتطبق في تحديث المخزون القادم.' }; }
  return { pending: true, message: 'التسوية أكبر من الحد المسموح (' + limit + ' قطعة). اتبعتت للموافقة.' };
}
function apiAdjustPending_() {
  var T = {}; var rows = readTable_('Adjustments').filter(function (r) { return r.Status === 'بانتظار الموافقة'; });
  if (rows.length) readCols_('Products', ['Barcode', 'Title']).forEach(function (p) { T[normBarcode_(p.Barcode)] = trim_(p.Title); });
  return { rows: rows.map(function (r) { var u = normBarcode_(r.UPC); return { id: trim_(r.ID), date: toDateStr_(r.Date), upc: u, title: T[u] || '', qty: num_(r.Qty), reason: trim_(r.Reason), by: trim_(r['Requested By']) }; }) };
}
function apiAdjustDecide_(a, c) {
  return withLock_(function () {
    var ids = {}; (a.ids || []).forEach(function (i) { ids[trim_(i)] = 1; }); var ok = a.approve !== false, n = 0, rows = readTable_('Adjustments');
    rows.forEach(function (r) { if (r.Status === 'بانتظار الموافقة' && ids[trim_(r.ID)]) { r.Status = ok ? '' : 'مرفوض'; r['Decided By'] = uname_(c); n++; } });
    if (n) { writeTable_('Adjustments', rows); audit_(uname_(c), ok ? 'adjust approve' : 'adjust reject', n + ' rows'); if (ok) queueRebuild_(); }
    return { changed: n };
  });
}

/** ====== الأداء: سرعة التحضير لكل موظف (من Pick_Log) + سرعة النظام ====== */
function apiPerformance_(a) {
  var today = dstr_(), days = Math.max(1, Math.min(Number(a.days) || 7, 90)), from = trim_(a.from) || dstr_(new Date(Date.now() - (days - 1) * 86400000)), to = trim_(a.to) || today;
  var ev = readTable_('Pick_Log').filter(function (r) { var d = toDateStr_(r.Date); return d >= from && d <= to && r.Time; });
  ev.forEach(function (r) { r._t = new Date(r.Time).getTime(); r._d = toDateStr_(r.Date); r.User = trim_(r.User); r.Action = trim_(r.Action); }); ev.sort(function (x, y) { return x._t - y._t; });
  var net = {}, orderStart = {}, orderDone = {}, perUser = {}, perDay = {}, hourly = {}, i;
  function U(n) { return perUser[n] || (perUser[n] = { user: n, lines: 0, pieces: 0, orders: 0, durs: [], times: [] }); }
  ev.forEach(function (r) {
    var k = r['Order #'] + '|' + r.UPC;
    if (r.Action === 'done') { net[k] = r; if (orderStart[r['Order #']] === undefined) orderStart[r['Order #']] = r._t; }
    else if (r.Action === 'undone') delete net[k];
    else if (r.Action === 'order_done') orderDone[r['Order #']] = r; else if (r.Action === 'order_open') delete orderDone[r['Order #']];
    if (r.Action === 'done') U(r.User).times.push(r._t);
  });
  Object.keys(net).forEach(function (k) { var r = net[k], u = U(r.User), q = num_(r.Qty); u.lines++; u.pieces += q; var d = perDay[r._d] || (perDay[r._d] = { date: r._d, orders: 0, pieces: 0 }); d.pieces += q; var h = String(parseInt(Utilities.formatDate(new Date(r._t), tz_(), 'HH'), 10)); hourly[h] = (hourly[h] || 0) + q; });
  var allDur = [];
  Object.keys(orderDone).forEach(function (o) {
    var r = orderDone[o], u = U(r.User), st = orderStart[o], dur = st === undefined ? null : Math.round((r._t - st) / 1000);
    u.orders++; var d = perDay[r._d] || (perDay[r._d] = { date: r._d, orders: 0, pieces: 0 }); d.orders++;
    if (dur !== null && dur >= 0 && dur <= 4 * 3600) { u.durs.push(dur); allDur.push(dur); }
  });
  function avg(x) { return x.length ? Math.round(x.reduce(function (s, v) { return s + v; }, 0) / x.length) : null; }
  function med(x) { if (!x.length) return null; var y = x.slice().sort(function (p, q) { return p - q; }), m = Math.floor(y.length / 2); return y.length % 2 ? y[m] : Math.round((y[m - 1] + y[m]) / 2); }
  var users = Object.keys(perUser).map(function (n) {
    var u = perUser[n], act = 0; for (i = 1; i < u.times.length; i++) { var g = u.times[i] - u.times[i - 1]; if (g <= 10 * 60000) act += g; }   // وقت نشاط فعلي: فجوات أقل من 10 دقايق
    var mins = Math.round(act / 60000);
    return { user: n, lines: u.lines, pieces: u.pieces, orders: u.orders, avgOrderSec: avg(u.durs), activeMin: mins, piecesPerHour: mins > 0 ? Math.round(u.pieces / (mins / 60) * 10) / 10 : null };
  }).sort(function (x, y) { return y.pieces - x.pieces; });
  var hrs = []; for (i = 0; i < 24; i++) hrs.push({ hour: i, pieces: hourly[String(i)] || 0 });
  var totOrders = Object.keys(orderDone).length, totPieces = users.reduce(function (s, u) { return s + u.pieces; }, 0);
  return { from: from, to: to, hasData: ev.length > 0, totals: { orders: totOrders, pieces: totPieces, avgOrderSec: avg(allDur), medianOrderSec: med(allDur) },
    users: users, days: Object.keys(perDay).sort().map(function (k) { return perDay[k]; }), hours: hrs, speed: perfStats_() };
}
