/** ====== Import.gs : استيراد On Hand + البيع/المرتجعات من شيتات اللصق ====== */
var RX = {
  ohBarcode: [/upc/i, /bar\s*code/i, /باركود/],
  ohSku: [/desc(ription)?\s*2/i, /sku\s*2/i, /^sku$/i, /sku/i],
  ohDept: [/^dept/i, /department/i, /^قسم/],
  ohSeason: [/^season$/i, /سيزون/],
  ohColor: [/^colou?r$/i, /لون/],
  ohSize: [/^size$/i, /مقاس/],
  ohDesc: [/desc/i, /name/i, /وصف/, /اسم/],
  ohQty: [/on\s*hand/i, /qty/i, /quantity/i, /كمية/, /رصيد/],
  slDate: [/create\s*dt/i, /date/i, /تاريخ/],
  slOrder: [/order\s*num/i, /order/i, /أوردر/],
  slAwb: [/awb/i, /waybill/i, /بوليصة/],
  slReceipt: [/rcpt\s*#/i, /receipt\s*(no|#|num)/i, /rcpt/i, /إيصال/],
  slQty: [/total\s*qty/i, /qty\s*sold/i, /qty/i, /quantity/i, /كمية/]
};
function need_(idx, label, headers) {
  if (idx < 0) throw new Error('مش لاقي عمود "' + label + '". العناوين الموجودة: ' + headers.filter(String).join(' | ') + '\nاكتب اسم العمود الصح في شيت Config.');
  return idx;
}

/** ---- On Hand (المفروض موجود) ---- */
function importOnHand() {
  var res = withLock_(function () {
    var vals = readRaw_('OnHand_Paste');
    var hr = findHeaderRow_(vals, RX.ohBarcode.concat(RX.ohSku));
    if (hr < 0) throw new Error('OnHand_Paste فاضي أو مفيهوش عناوين. الصق التقرير من A1 بالعناوين.');
    var h = vals[hr].map(trim_);
    var cB = findCol_(h, cfg_('OnHand.Barcode header'), RX.ohBarcode);
    var cS = findCol_(h, cfg_('OnHand.SKU header'), RX.ohSku);
    var cD = findCol_(h, cfg_('OnHand.Desc header'), RX.ohDesc);
    var cQ = need_(findCol_(h, cfg_('OnHand.Qty header'), RX.ohQty), 'الكمية', h);
    var cDept = findCol_(h, cfg_('OnHand.Dept header'), RX.ohDept), cSeas = findCol_(h, cfg_('OnHand.Season header'), RX.ohSeason), cCol = findCol_(h, cfg_('OnHand.Color header'), RX.ohColor), cSz = findCol_(h, cfg_('OnHand.Size header'), RX.ohSize);
    if (cB < 0) need_(-1, 'UPC / الباركود', h);
    var items = {}, stats = { rows: 0, grandTotal: 0, blank: 0, negative: 0, dupBarcode: 0 };
    for (var i = hr + 1; i < vals.length; i++) {
      var r = vals[i];
      if (/grand\s*total/i.test(r.join(' '))) { stats.grandTotal++; continue; }
      var bc = normBarcode_(r[cB]), sku = cS >= 0 ? trim_(r[cS]) : '';
      if (!bc) { stats.blank++; continue; }
      var q = num_(r[cQ]); if (q < 0) stats.negative++;
      if (items[bc]) { stats.dupBarcode++; items[bc].qty += q; continue; }
      var dm = cDept >= 0 ? /^\s*(\d{1,3})\b/.exec(trim_(r[cDept])) : null, ttl = cD >= 0 ? trim_(r[cD]) : '';
      var cs = [cCol >= 0 ? trim_(r[cCol]) : '', cSz >= 0 ? trim_(r[cSz]) : ''].filter(Boolean).join(' / ');
      items[bc] = { barcode: bc, sku: sku, title: (ttl + (cs ? ' ' + cs : '')).trim(), qty: q, cat: dm ? ('000' + dm[1]).slice(-3) : '', season: cSeas >= 0 ? trim_(r[cSeas]).toUpperCase() : '' }; stats.rows++;
    }
    var prods = readTable_('Products'), idx = {}, logs = [], nowD = now_(), ds = dstr_(nowD), added = 0, changed = 0, gone = 0, seen = {};
    prods.forEach(function (p, i) { p.Barcode = normBarcode_(p.Barcode); idx[p.Barcode] = i; });
    Object.keys(items).forEach(function (k) {
      var it = items[k], pi = idx[it.barcode], p; seen[it.barcode] = 1;
      if (pi === undefined) {
        prods.push({ Barcode: it.barcode, SKU: it.sku, Title: it.title, Category: it.cat, Season: it.season, 'ERP Qty': it.qty, 'In ERP': 'Yes' }); idx[it.barcode] = prods.length - 1; added++;
        logs.push({ 'Snapshot Date': ds, Time: nowD, Barcode: it.barcode, SKU: it.sku, Qty: it.qty, 'Prev Qty': '' });
      } else {
        p = prods[pi]; var prev = num_(p['ERP Qty']);
        if (prev !== it.qty || p['In ERP'] !== 'Yes') { changed++; logs.push({ 'Snapshot Date': ds, Time: nowD, Barcode: it.barcode, SKU: it.sku, Qty: it.qty, 'Prev Qty': prev }); }
        p['ERP Qty'] = it.qty; p['In ERP'] = 'Yes'; if (it.sku) p.SKU = it.sku; if (it.title) p.Title = it.title; if (it.cat) p.Category = it.cat; if (it.season) p.Season = it.season;
      }
    });
    prods.forEach(function (p) { if (!seen[p.Barcode] && p['In ERP'] === 'Yes') { p['In ERP'] = 'No'; p['ERP Qty'] = 0; gone++; } });
    writeTable_('Products', prods); appendRows_('OnHand_Log', logs);
    stats.added = added; stats.changed = changed; stats.gone = gone; audit_('', 'importOnHand', JSON.stringify(stats));
    stats.message = 'On Hand: ' + stats.rows + ' صنف | جديد ' + added + ' | اتغيّر ' + changed + ' | اختفى ' + gone +
      '\nاستبعدت: إجمالي ' + stats.grandTotal + ' | فاضي ' + stats.blank + ' | باركود مكرر اتجمّع ' + stats.dupBarcode + ' | سالب ' + stats.negative;
    return stats;
  });
  applyLocationRules(); linkShopify_();
  toast_(res.message); return res;
}

/** ---- البيع والمرتجعات ---- */
function parseSalesDate_(v) {
  if (v instanceof Date) return dstr_(v);
  var s = String(v === null || v === undefined ? '' : v).replace(/["']/g, '').trim();
  var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (!m) return toDateStr_(s);
  var dmy = cfg_('Sales.DateFormat', 'MDY').toUpperCase() === 'DMY';
  var d = dmy ? m[1] : m[2], mo = dmy ? m[2] : m[1];
  return m[3] + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
}
function ensureOrderLines_(nums) {
  var have = {}; readTable_('Order_Lines').forEach(function (l) { have[String(l['Order #'])] = 1; });
  var missing = nums.filter(function (n) { return !have[n]; });
  if (!missing.length) return 0;
  try { return fetchOrdersByNumbers_(missing); } catch (e) { audit_('system', 'fetchOrders error', e.message); return 0; }
}
/** الكمية الموجبة = بيع (بيتخصم من الفعلي). السالبة = مرتجع مسجّل (مجرد تسجيل، الفعلي بيتحرك لما تسكانه) */
function importSales() {
  var res = withLock_(function () {
    var vals = readRaw_('Sales_Paste');
    var hr = findHeaderRow_(vals, RX.slOrder);
    if (hr < 0) throw new Error('Sales_Paste فاضي أو مفيهوش عمود Order Num. الصق ملف البيع/المرتجعات من A1 بالعناوين.');
    var h = vals[hr].map(trim_);
    var cD = findCol_(h, cfg_('Sales.Date header'), RX.slDate);
    var cO = need_(findCol_(h, cfg_('Sales.Order header'), RX.slOrder), 'Order Num', h);
    var cA = findCol_(h, cfg_('Sales.AWB header'), RX.slAwb);
    var cR = need_(findCol_(h, cfg_('Sales.Receipt header'), RX.slReceipt), 'Rcpt #', h);
    var cQ = need_(findCol_(h, cfg_('Sales.Qty header'), RX.slQty), 'Total Qty Sold', h);
    var done = {}; readTable_('Sales_Log').forEach(function (x) { done[trim_(x.Receipt) + '|' + x.Type] = 1; });
    var rows = [], nums = {};
    for (var i = hr + 1; i < vals.length; i++) {
      var r = vals[i], rc = trim_(r[cR]), q = num_(r[cQ]);
      if (!rc || !q) continue;
      var type = q > 0 ? 'Sale' : 'Return';
      if (done[rc + '|' + type]) continue;
      var on = (String(r[cO]).match(/\d{4,}/) || [''])[0];
      rows.push({ date: cD >= 0 ? parseSalesDate_(r[cD]) : '', receipt: rc, type: type, order: on, awb: cA >= 0 ? normWaybill_(r[cA]) : '', qty: q });
      if (on) nums[on] = 1;
    }
    var fetched = ensureOrderLines_(Object.keys(nums));
    var lines = {}; readTable_('Order_Lines').forEach(function (l) { (lines[String(l['Order #'])] = lines[String(l['Order #'])] || []).push(l); });
    var pm = productLocMap_(), mov = [], log = [], exc = [], t = now_();
    var st = { sale: 0, ret: 0, ok: 0, issues: 0, fetchedOrders: fetched };
    rows.forEach(function (x) {
      var ls = (lines[x.order] || []).map(function (l) { return { b: normBarcode_(l.Barcode), q: num_(l.Qty) }; });
      var status = 'OK', note = '', tot = ls.reduce(function (s, l) { return s + l.q; }, 0), aq = Math.abs(x.qty);
      if (!x.order) { status = 'NO_ORDER_NUM'; note = 'مفيش رقم أوردر'; }
      else if (!ls.length) { status = 'NO_ORDER'; note = 'الأوردر ' + x.order + ' مش موجود في Shopify'; }
      else if (ls.some(function (l) { return !l.b; })) { status = 'UNKNOWN_ITEM'; note = 'صنف في الأوردر من غير UPC في Shopify'; }
      else if (x.type === 'Sale' && aq !== tot) { status = 'QTY_MISMATCH'; note = 'الإيصال ' + aq + ' قطعة والأوردر ' + tot; }
      else if (x.type === 'Return' && aq > tot) { status = 'QTY_MISMATCH'; note = 'مرتجع ' + aq + ' أكتر من قطع الأوردر ' + tot; }
      if (status === 'OK') {
        if (x.type === 'Sale') {
          ls.forEach(function (l) { mov.push({ 'Move ID': uid_('M'), Time: t, Type: 'Sale', Barcode: l.b, Qty: -l.q, Zone: '', Ref: x.awb || x.receipt, 'Order #': x.order, Source: 'sales', User: 'import', Reason: 'بيع إيصال ' + x.receipt }); });
          st.sale += aq;
        } else { status = 'REGISTERED'; st.ret += aq; }
        st.ok++;
      } else {
        st.issues++;
        exc.push({ Date: x.date || dstr_(), Type: (x.type === 'Sale' ? 'بيع: ' : 'مرتجع: ') + note.split(' ')[0] + ' ' + status, Ref: x.receipt, Barcode: '', Expected: x.qty, Actual: 0, Diff: -x.qty, Status: 'Open', Note: note + ' | أوردر ' + x.order });
      }
      log.push({ Date: x.date, Receipt: x.receipt, Type: x.type, 'Order #': x.order, AWB: x.awb, Qty: x.qty, Status: status, Note: note });
    });
    appendRows_('Movements', mov); appendRows_('Sales_Log', log); appendExceptionsDedup_(exc);
    st.total = rows.length; audit_('', 'importSales', JSON.stringify(st));
    st.message = 'بيع/مرتجع: ' + rows.length + ' إيصال جديد | بيع اتسجل ' + st.sale + ' قطعة | مرتجع مسجّل ' + st.ret + ' قطعة | محتاج مراجعة ' + st.issues + (fetched ? ' | جبت ' + fetched + ' أوردر من Shopify' : '');
    return st;
  });
  try { matchReturns_(); } catch (e) { audit_('system', 'matchReturns error', e.message); }
  toast_(res.message); return res;
}
function pasteHasData_(name) { try { return readRaw_(name).length > 1; } catch (e) { return false; } }
function importAll() {
  var out = [];
  [['OnHand_Paste', importOnHand], ['Sales_Paste', importSales], ['Courier_Paste', importCourier]].forEach(function (x) {
    if (!pasteHasData_(x[0])) { out.push('(تخطيت ' + x[0] + ' — فاضي)'); return; }
    try { out.push(x[1]().message); } catch (e) { out.push('✖ ' + x[1].name + ': ' + e.message); }
  });
  try { rebuildAll(); out.push('اتحدّث المخزون والداشبورد.'); } catch (e) { out.push('✖ rebuild: ' + e.message); }
  alert_(out.join('\n\n'));
}
