/** ====== Picking.gs : قايمة التحضير من أوردرات Shopify غير المجهزة (على دفعات + أوردرات واقفة) ====== */
var PICK_Q = 'status:open AND (fulfillment_status:unfulfilled OR fulfillment_status:partial)';
var PICK_BUDGET_MS = 230000;          // أقصى وقت للتشغيلة الواحدة (الحد 6 دقايق)
var PICK_SIZES = [10, 6, 3, 1];       // أحجام الدفعة (بينزل تلقائي لو Shopify رفض التكلفة)
var HOLD_ACTIVE = 'واقف', HOLD_BACK = 'رجع للتحضير', HOLD_FULFILLED = 'اتجهز', HOLD_CANCELLED = 'اتلغى';

function pickingQuery_(withCustomer, size) {
  return 'query($c:String,$q:String){ orders(first:' + size + ', after:$c, query:$q, sortKey:CREATED_AT){ pageInfo{hasNextPage endCursor} nodes{ id name createdAt tags cancelledAt ' +
    (withCustomer ? 'shippingAddress{ name } ' : '') +
    'lineItems(first:20){ nodes{ sku title variantTitle quantity unfulfilledQuantity variant{ barcode } product{ productType } } } } } }';
}
function pickingFilter_() {
  var days = Number(cfg_('Picking.DaysBack', '30')) || 0, q = PICK_Q;
  if (days > 0) q += ' AND created_at:>=' + Utilities.formatDate(new Date(Date.now() - days * 86400000), tz_(), 'yyyy-MM-dd');
  return q;
}
function pickProps_() { return PropertiesService.getScriptProperties(); }
function pickReset_() {
  var p = pickProps_();
  ['PICK_ACTIVE', 'PICK_CURSOR', 'PICK_COUNT', 'PICK_SIZE', 'PICK_RUNNING', 'PICK_STARTED', 'PICK_WARN', 'PICK_QUERY'].forEach(function (k) { p.deleteProperty(k); });
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'pickingContinue') ScriptApp.deleteTrigger(t); });
}
/** يسحب دفعات من Shopify لحد ما الوقت يخلص. بيرجّع {partial, count, warn} */
function fetchUnfulfilledChunk_() {
  var p = pickProps_(), t0 = Date.now(), warn = p.getProperty('PICK_WARN') || '';
  var withCustomer = cfg_('Picking.ShowCustomer', 'No').toLowerCase() === 'yes';
  var cursor = null, size = Number(p.getProperty('PICK_SIZE')) || PICK_SIZES[0], q;
  if (p.getProperty('PICK_ACTIVE') && Date.now() - Number(p.getProperty('PICK_STARTED') || 0) < 3 * 3600000) {
    cursor = p.getProperty('PICK_CURSOR') || null; q = p.getProperty('PICK_QUERY') || pickingFilter_();
  } else {
    writeTable_('Picking_Staging', []); q = pickingFilter_();
    p.setProperty('PICK_ACTIVE', '1'); p.setProperty('PICK_STARTED', String(Date.now())); p.setProperty('PICK_COUNT', '0'); p.setProperty('PICK_QUERY', q); p.deleteProperty('PICK_CURSOR'); p.deleteProperty('PICK_WARN'); warn = '';
  }
  var more = true, pages = 0;
  while (more) {
    var d;
    try { d = shopifyGql_(pickingQuery_(withCustomer, size), { c: cursor, q: q }).orders; }
    catch (e) {
      if (withCustomer && /ACCESS_DENIED|protected|customer/i.test(e.message)) {
        withCustomer = false; warn = 'اسم العميل مش متاح (محتاج موافقة Shopify على بيانات العملاء) — اتعمل التحضير من غيره.'; p.setProperty('PICK_WARN', warn); continue;
      }
      if (/cost|MAX_COST|exceed/i.test(e.message) && PICK_SIZES.indexOf(size) < PICK_SIZES.length - 1) {
        size = PICK_SIZES[PICK_SIZES.indexOf(size) + 1]; p.setProperty('PICK_SIZE', String(size)); continue;
      }
      throw e;
    }
    appendRows_('Picking_Staging', d.nodes.map(function (o) { return { 'Order #': String(o.name || '').replace('#', ''), 'Order JSON': JSON.stringify(o) }; }));
    p.setProperty('PICK_COUNT', String(Number(p.getProperty('PICK_COUNT') || 0) + d.nodes.length));
    pages++; cursor = d.pageInfo.hasNextPage ? d.pageInfo.endCursor : null; more = !!cursor;
    if (cursor) p.setProperty('PICK_CURSOR', cursor);
    if (more && Date.now() - t0 >= PICK_BUDGET_MS) break;
    if (pages > 400) break;
  }
  return { partial: more, count: Number(p.getProperty('PICK_COUNT') || 0), warn: warn };
}
/** الدخول الرئيسي: بيسحب (على دفعات) وبعدين يبني الشيت */
function buildPicking() {
  if (!shopifyConfigured_()) throw new Error('Shopify مش متظبط. من القايمة: ربط Shopify.');
  var p = pickProps_(), run = Number(p.getProperty('PICK_RUNNING') || 0);
  if (run && Date.now() - run < 7 * 60000) return { message: 'تحديث التحضير شغال بالفعل (اتسحب ' + (p.getProperty('PICK_COUNT') || 0) + ' أوردر لحد دلوقتي). استنى شوية.' };
  p.setProperty('PICK_RUNNING', String(Date.now()));
  var f;
  try {
    audit_('', 'buildPicking', 'بدأ/كمّل السحب');
    f = fetchUnfulfilledChunk_();
  } catch (e) {
    audit_('system', 'buildPicking error', e.message); pickReset_(); throw e;
  }
  p.deleteProperty('PICK_RUNNING');
  if (f.partial) {
    ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'pickingContinue') ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger('pickingContinue').timeBased().after(60 * 1000).create();
    var m = 'التحضير: اتسحب ' + f.count + ' أوردر لحد دلوقتي، وهيكمّل لوحده بعد دقيقة…';
    audit_('', 'buildPicking', m); toast_(m);
    return { partial: true, orders: f.count, message: m };
  }
  try { var r = assemblePicking_(f.warn); pickReset_(); return r; }
  catch (e2) { audit_('system', 'assemblePicking error', e2.message); pickReset_(); throw e2; }
}
function pickingContinue() {
  try {
    var r = buildPicking();
    if (!r.partial) { refreshDashboard_(); }
  } catch (e) { audit_('system', 'pickingContinue error', e.message); pickReset_(); }
}

/** الأوردرات الواقفة (الحالة "واقف") كـ set */
function heldSet_() {
  var s = {}; readTable_('Picking_Hold').forEach(function (r) { if (trim_(r['Order #']) && trim_(r.Status) === HOLD_ACTIVE) s[trim_(r['Order #'])] = 1; });
  return s;
}
/** يحدّث حالة الأوردرات الواقفة: عمرها، وهل اتجهزت/اتلغت، ويشيل اللي اتعمل لها "رجّع" */
function refreshHoldSheet_(seenNums, handle) {
  var rows = readTable_('Picking_Hold'); if (!rows.length) return { held: 0, resolved: 0 };
  var today = new Date(), unseen = [];
  rows = rows.filter(function (r) {
    if (trim_(r.Status) === HOLD_BACK) { audit_('', 'hold release', 'Order ' + r['Order #']); return false; }
    return !!trim_(r['Order #']);
  });
  rows.forEach(function (r) {
    var n = trim_(r['Order #']);
    if (trim_(r.Status) === HOLD_ACTIVE && !seenNums[n]) unseen.push(n);
  });
  var status = {};
  for (var i = 0; i < unseen.length && i < 60; i += 10) {
    try {
      var d = shopifyGql_('query($q:String){ orders(first:10, query:$q){ nodes{ name displayFulfillmentStatus cancelledAt closed } } }',
        { q: unseen.slice(i, i + 10).map(function (n) { return 'name:' + n; }).join(' OR ') }).orders;
      d.nodes.forEach(function (o) {
        var n = String(o.name || '').replace('#', '');
        if (o.cancelledAt) status[n] = HOLD_CANCELLED; else if (/^FULFILLED$/i.test(o.displayFulfillmentStatus || '')) status[n] = HOLD_FULFILLED;
      });
    } catch (e) { audit_('system', 'hold status check', e.message); break; }
  }
  var resolved = 0, held = 0;
  rows.forEach(function (r) {
    var n = trim_(r['Order #']);
    if (trim_(r.Status) === HOLD_ACTIVE && status[n]) { r.Status = status[n]; resolved++; }
    if (trim_(r.Status) === HOLD_ACTIVE) held++;
    var since = r['Held At'] ? new Date(r['Held At']) : null;
    r['Age (days)'] = since && !isNaN(since) ? Math.floor((today - since) / 86400000) : '';
    if (!r['Order Link'] && handle) r['Order Link'] = '';
    r.Release = false;
  });
  var sh = sh_('Picking_Hold'), hdr = headers_(sh), old = sh.getLastRow();
  writeTable_('Picking_Hold', rows);
  if (rows.length) sh.getRange(2, hdr.indexOf('Release') + 1, rows.length, 1).insertCheckboxes();
  if (old > rows.length + 1) sh.getRange(rows.length + 2, 1, old - rows.length - 1, hdr.length).clearDataValidations();
  return { held: held, resolved: resolved };
}

/** الأوردر ملغي في Shopify (cancelledAt) أو عليه تاج فيه كلمة من Picking.CancelTags */
function isCancelledOrder_(o) {
  if (o.cancelledAt) return true;
  var toks = cfg_('Picking.CancelTags', 'cancel,ملغي').toLowerCase().split(',').map(trim_).filter(Boolean), tags = (o.tags || []).map(function (x) { return String(x).toLowerCase(); });
  return tags.some(function (tg) { return toks.some(function (k) { return tg.indexOf(k) >= 0; }); });
}
/** UPC من آخر الـ SKU (الشكل: ... - 10200006795) */
function skuUpc_(sku) { var m = /-\s*(\d{6,14})\s*$/.exec(String(sku || '')); return m ? normBarcode_(m[1]) : ''; }
/** محرك مطابقة الباركود: باركود Shopify + UPC اللي في الـ SKU، والحَكَم هو On Hand (pset) */
function resolveUpc_(li, pset) {
  var bc = li.variant ? normBarcode_(li.variant.barcode) : '', su = skuUpc_(li.sku), r = { upc: bc, issue: '', bc: bc, su: su };
  if (bc && su && bc !== su) {
    if (pset[bc] && !pset[su]) r.issue = 'باركود Shopify مختلف عن اللي في الـ SKU (اتاخد باركود Shopify لأنه الموجود في On Hand)';
    else if (!pset[bc] && pset[su]) { r.upc = su; r.issue = 'باركود Shopify مش في On Hand — اتاخد UPC من الـ SKU'; }
    else r.issue = 'تعارض: باركود Shopify ≠ UPC في الـ SKU (اتاخد باركود Shopify) — راجعه';
  } else if (!bc && su) { r.upc = su; r.issue = 'Shopify من غير باركود — اتاخد UPC من الـ SKU' + (pset[su] ? '' : ' (وغير موجود في On Hand)'); }
  else if (bc && !pset[bc]) r.issue = 'الباركود مش في On Hand';
  return r;
}
/** توزيع المخزون المتاح على الأوردرات من الأقدم للأحدث: بيحسب الناقص لكل سطر وهل الأوردر جاهز كله */
function allocateOrders_(rows, created, basis) {
  var avail = {}; Object.keys(basis).forEach(function (k) { avail[k] = basis[k]; });
  var idx = rows.map(function (r, i) { return i; });
  idx.sort(function (a, b) { var x = rows[a], y = rows[b]; return (created[x['Order #']] || 0) - (created[y['Order #']] || 0) || natCmp_(x['Order #'], y['Order #']); });
  var bad = {};
  idx.forEach(function (i) {
    var r = rows[i], q = num_(r.Qty); r.Short = 0;
    if (!r.UPC) return;
    var a = Math.max(avail[r.UPC] === undefined ? 0 : avail[r.UPC], 0), give = Math.min(q, a);
    avail[r.UPC] = a - give; r.Short = q - give; if (r.Short > 0) bad[r['Order #']] = 1;
  });
  rows.forEach(function (r) { r.Ready = bad[r['Order #']] ? 'No' : 'Yes'; });
  return { shortOrders: Object.keys(bad).length };
}

/** بناء شيت التحضير من الأوردرات المسحوبة في Picking_Staging */
function assemblePicking_(warn) {
  var dom = normShopDomain_(pickProps_().getProperty('SHOPIFY_DOMAIN')), handle = dom.replace('.myshopify.com', '');
  var staged = readTable_('Picking_Staging'), all = [];
  staged.forEach(function (r) { try { all.push(JSON.parse(r['Order JSON'])); } catch (e) {} });
  var seen = {}; all.forEach(function (o) { seen[String(o.name || '').replace('#', '')] = 1; });
  var holdInfo = refreshHoldSheet_(seen, handle);
  var held = heldSet_();
  var cancelled = 0, orders = all.filter(function (o) { if (isCancelledOrder_(o)) { cancelled++; return false; } return !held[String(o.name || '').replace('#', '')]; });
  return withLock_(function () {
    var locMap = productLocMap_(), RL = loadRules_().rules, checkStock = cfg_('Picking.StockCheck', 'Yes').toLowerCase() === 'yes' && hasOpening_();
    var stockOn = cfg_('Picking.StockCheck', 'Yes').toLowerCase() === 'yes', basisName = checkStock ? 'الفعلي' : 'On Hand';
    var actual = {}, pset = {};
    readTable_('Products').forEach(function (p) { var b = normBarcode_(p.Barcode); pset[b] = 1; if (!checkStock) actual[b] = num_(p['ERP Qty']); });
    if (checkStock) readTable_('Stock').forEach(function (s) { actual[normBarcode_(s.Barcode)] = num_(s.Actual); });
    var created = {}, gaps = [], seenGap = {};
    var retArea = returnsAreaCounts_();
    var ticks = {}; readTable_('Picking').forEach(function (r) { if (r.Done === true || String(r.Done).toUpperCase() === 'TRUE') ticks[trim_(r['Order #']) + '|' + normBarcode_(r.UPC)] = true; });
    var merged = {}, order = [], demand = {};
    orders.forEach(function (o) {
      var num = String(o.name || '').replace('#', ''); created[num] = o.createdAt ? new Date(o.createdAt).getTime() : 0;
      var localDate = o.createdAt ? Utilities.formatDate(new Date(o.createdAt), tz_(), 'yyyy-MM-dd') : '';
      o.lineItems.nodes.forEach(function (li) {
        var q = num_(li.unfulfilledQuantity); if (q <= 0) return;
        var rs = resolveUpc_(li, pset), upc = rs.upc;
        if (rs.issue && /تعارض|مختلف|مش في On Hand — |من غير باركود/.test(rs.issue)) { var gk = trim_(li.sku) + '|' + rs.issue; if (!seenGap[gk]) { seenGap[gk] = 1; gaps.push({ 'Order #': num, SKU: trim_(li.sku), Variant: li.variantTitle || '', 'Shopify Barcode': rs.bc, 'SKU UPC': rs.su, Issue: rs.issue, 'Used UPC': upc, 'Seen At': now_() }); } }
        var key = num + '|' + upc + '|' + (upc ? '' : trim_(li.sku) + trim_(li.variantTitle));
        if (merged[key]) { merged[key].Qty += q; }
        else {
          order.push(key);
          merged[key] = { Done: !!ticks[num + '|' + upc], Date: localDate, Category: (li.product && li.product.productType) || parseSku_(li.sku).cat || '—', Qty: q, SKU: trim_(li.sku),
            'Color/Size': li.variantTitle || '', Product: li.title || '', 'Order #': num,
            'Order Link': '=HYPERLINK("https://admin.shopify.com/store/' + handle + '/orders/' + String(o.id).replace(/\D/g, '') + '","فتح ' + num + '")',
            UPC: upc, _issue: rs.issue, Customer: o.shippingAddress ? o.shippingAddress.name : '', Hold: false, 'Hold Reason': '' };
        }
        if (upc) demand[upc] = (demand[upc] || 0) + q;
      });
    });
    var rows = order.map(function (k) { return merged[k]; });
    rows.forEach(function (r) {
      var m = locMap[r.UPC], flags = [], loc = m && m.loc ? m.loc : '', loc2 = m ? m.loc2 : '';
      if (!loc) {   // مفيش صنف/مكان بالباركود: نحدد المكان من الـ SKU أو القسم بالقواعد
        var hit = locFromRules_(RL, r.SKU, r.Category, '');
        if (hit) { loc = hit.l1; loc2 = [hit.l2, hit.l3].filter(Boolean).join(' / '); }
      }
      r.Location = loc || (m ? LOC_NONE : (r.UPC ? '⚠ بدون مكان' : '⚠ بدون مكان')); r['Location 2'] = loc2;
      if (!loc) flags.push('القسم ' + (parseSku_(r.SKU).cat || pad3_(r.Category) || '؟') + ' مالوش مكان في Location_Rules');
      if (!r.UPC) flags.push('الصنف في Shopify من غير باركود'); else if (r._issue) flags.push(r._issue);
      if (stockOn && r.UPC && (actual[r.UPC] === undefined ? 0 : actual[r.UPC]) < demand[r.UPC]) flags.push('ناقص: ' + basisName + ' ' + (actual[r.UPC] || 0) + ' والمطلوب ' + demand[r.UPC]);
      if (retArea[r.UPC]) flags.push('منها ' + retArea[r.UPC] + ' في ' + 'المرتجعات');
      r.Flags = flags.join(' | ');
    });
    var alloc = stockOn ? allocateOrders_(rows, created, actual) : { shortOrders: 0 };
    if (!stockOn) rows.forEach(function (r) { r.Short = 0; r.Ready = 'Yes'; });
    rows.forEach(function (r) { if (r.Short > 0) r.Flags = (r.Flags ? r.Flags + ' | ' : '') + 'ناقص ' + r.Short + ' من ' + r.Qty; delete r._issue; });
    writeTable_('Barcode_Gaps', gaps);
    // الأقدم أولًا (باليوم) ثم القسم ثم المكان ثم رقم الأوردر
    rows.sort(function (a, b) { return natCmp_(a.Date, b.Date) || natCmp_(a.Category, b.Category) || natCmp_(a.Location, b.Location) || natCmp_(a['Order #'], b['Order #']); });
    var sh = sh_('Picking'), hdr = headers_(sh), old = sh.getLastRow();
    writeTable_('Picking', rows);
    if (rows.length) {
      sh.getRange(2, 1, rows.length, 1).insertCheckboxes();
      var hc = hdr.indexOf('Hold'); if (hc >= 0) sh.getRange(2, hc + 1, rows.length, 1).insertCheckboxes();
      sh.getRange(2, 1, rows.length, hdr.length).setBackgrounds(rows.map(function (r) { return hdr.map(function () { return r.Done ? '#e2e6ec' : (r.Flags ? '#fff1d0' : '#ffffff'); }); }));
    }
    if (old > rows.length + 1) { sh.getRange(rows.length + 2, 1, old - rows.length - 1, hdr.length).clearDataValidations().setBackground('#ffffff'); }
    try { var fl = sh.getFilter(); if (fl) fl.remove(); sh.getRange(1, 1, Math.max(rows.length + 1, 2), hdr.length).createFilter(); } catch (e) {}
    var alerts = [];
    if (stockOn) Object.keys(demand).forEach(function (u) {
      var a = actual[u] || 0; if (a >= demand[u]) return;
      var one = rows.filter(function (r) { return r.UPC === u; })[0] || {};
      alerts.push({ UPC: u, SKU: one.SKU || '', Title: one.Product || '', Actual: a, 'Needed (unfulfilled)': demand[u], Shortfall: demand[u] - a, Location: one.Location || '' });
    });
    alerts.sort(function (a, b) { return b.Shortfall - a.Shortfall; });
    writeTable_('Low_Stock_Alerts', alerts);
    var ord = {}; rows.forEach(function (r) { ord[r['Order #']] = 1; });
    var pieces = rows.reduce(function (s, r) { return s + r.Qty; }, 0);
    var msg = 'التحضير: ' + Object.keys(ord).length + ' أوردر | ' + pieces + ' قطعة (آخر ' + (Number(cfg_('Picking.DaysBack', '30')) || 'كل') + ' يوم)' +
      (holdInfo.held ? ' | واقف: ' + holdInfo.held : '') + (holdInfo.resolved ? ' | اتحل من الواقفين: ' + holdInfo.resolved : '') +
      (alerts.length ? ' | ⚠ أصناف ناقصة: ' + alerts.length : '') + (alloc.shortOrders ? ' | أوردرات فيها نقص: ' + alloc.shortOrders : '') + (gaps.length ? ' | مشاكل باركود: ' + gaps.length : '') + (cancelled ? ' | ملغي (اتشال): ' + cancelled : '') + (warn ? '\n' + warn : '');
    audit_('', 'buildPicking', msg); toast_(msg);
    return { orders: Object.keys(ord).length, lines: rows.length, pieces: pieces, alerts: alerts.length, shortOrders: alloc.shortOrders, cancelled: cancelled, gaps: gaps.length, held: holdInfo.held, message: msg };
  });
}

/** ---- أوردرات واقفة: تعليم "Hold" في Picking / "Release" في Picking_Hold ---- */
function handleHoldEdit_(sh, range) {
  var name = sh.getName(), hdr = headers_(sh), col = range.getColumn();
  if (name === 'Picking') {
    if (hdr[col - 1] !== 'Hold') return;
    var vals = range.getValues(), r0 = range.getRow(), nums = [];
    for (var i = 0; i < vals.length; i++) if (vals[i][0] === true) { var n = trim_(sh.getRange(r0 + i, hdr.indexOf('Order #') + 1).getValue()); if (n && nums.indexOf(n) < 0) nums.push(n); }
    if (nums.length) holdOrders_(nums);
  } else {
    if (hdr[col - 1] !== 'Release') return;
    var v2 = range.getValues(), r1 = range.getRow(), sc = hdr.indexOf('Status') + 1;
    for (var j = 0; j < v2.length; j++) {
      var cur = trim_(sh.getRange(r1 + j, sc).getValue());
      if (v2[j][0] === true && cur === HOLD_ACTIVE) sh.getRange(r1 + j, sc).setValue(HOLD_BACK);
      else if (v2[j][0] !== true && cur === HOLD_BACK) sh.getRange(r1 + j, sc).setValue(HOLD_ACTIVE);
    }
    toast_('هيرجع للتحضير في التحديث الجاي (🧾 تحديث قايمة التحضير)');
  }
}
/** يوقف أوردرات: يضيفها لـ Picking_Hold ويشيل صفوفها من Picking فورًا */
function holdOrders_(nums, reasonMap, by) {
  return withLock_(function () {
    var sh = sh_('Picking'), hdr = headers_(sh), last = sh.getLastRow(); if (last < 2) return 0;
    var oc = hdr.indexOf('Order #'), rc = hdr.indexOf('Hold Reason'), data = sh.getRange(2, 1, last - 1, hdr.length).getValues();
    var existing = {}; readTable_('Picking_Hold').forEach(function (r) { if (trim_(r.Status) === HOLD_ACTIVE) existing[trim_(r['Order #'])] = 1; });
    var reasons = {}, linkCol = hdr.indexOf('Order Link'), links = {}, delRows = [], forms = linkCol >= 0 ? sh.getRange(2, linkCol + 1, last - 1, 1).getFormulas() : [];
    for (var i = 0; i < data.length; i++) {
      var n = trim_(data[i][oc]); if (nums.indexOf(n) < 0) continue;
      delRows.push(i + 2); if (forms[i] && forms[i][0] && !links[n]) links[n] = forms[i][0];
      if (rc >= 0 && trim_(data[i][rc]) && !reasons[n]) reasons[n] = trim_(data[i][rc]);
    }
    if (reasonMap) Object.keys(reasonMap).forEach(function (k) { if (trim_(reasonMap[k])) reasons[k] = trim_(reasonMap[k]); });
    var add = nums.filter(function (n) { return !existing[n]; }).map(function (n) {
      return { Release: false, 'Order #': n, Reason: reasons[n] || 'بدون سبب', 'Held At': now_(), Status: HOLD_ACTIVE, 'Age (days)': 0, 'Order Link': links[n] || '', Note: '' };
    });
    appendRows_('Picking_Hold', add);
    var ph = sh_('Picking_Hold'), phh = headers_(ph), pl = ph.getLastRow();
    if (add.length) ph.getRange(pl - add.length + 1, phh.indexOf('Release') + 1, add.length, 1).insertCheckboxes();
    for (var k = delRows.length - 1; k >= 0; k--) sh.deleteRow(delRows[k]);
    audit_(by || '', 'hold orders', nums.join(','));
    toast_('اتوقف ' + nums.length + ' أوردر → شيت Picking_Hold');
    return nums.length;
  });
}
/** كام قطعة لكل UPC لسه في منطقة المرتجعات (ما اتوزعتش) */
function returnsAreaCounts_() {
  var sh = sh_('Returns_Scan'), last = sh.getLastRow(), c = {};
  if (last >= 2) sh.getRange(2, 1, last - 1, 6).getValues().forEach(function (r) { var b = normBarcode_(r[0]); if (b && !trim_(r[5])) c[b] = (c[b] || 0) + 1; });
  return c;
}
