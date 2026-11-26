/** ====== Engine.gs : المخزون (فعلي/ERP/Shopify)، التسويات، الفروق، جودة البيانات، الملخص اليومي ====== */
function rebuildAll() {
  return withLock_(function () {
    var o = {};
    applyAdjustments_(); linkShopify_(); matchReturns_();
    try { if (readCol_('Courier_Shipments', 'Waybill').length) reconcileCourier_(); } catch (e) { audit_('system', 'courier recon error', e.message); }
    o.stock = rebuildStock_(); try { rebuildReorder_(); } catch (x) { audit_('system', 'reorder error', x.message); } o.dq = rebuildDataQuality_(); rebuildDailySummary_(); rebuildFixList_(); refreshDashboard_();
    return o;
  });
}
/** التسويات اليدوية: صف في Adjustments (UPC + كمية +/- + سبب) بيتحوّل لحركة Adjust */
function applyAdjustments_() {
  var rows = readTable_('Adjustments'), mov = [], changed = 0, t = now_(), applied = 0;
  rows.forEach(function (r) {
    if (trim_(r.Status) && !/^ناقص/.test(r.Status)) return;
    var u = normBarcode_(r.UPC), q = num_(r.Qty), why = trim_(r.Reason);
    if (!u && !q && !why) return;
    if (!u || !q || !why) { r.Status = 'ناقص: UPC + كمية + سبب كلهم مطلوبين'; changed++; return; }
    mov.push({ 'Move ID': uid_('M'), Time: t, Type: 'Adjust', Barcode: u, Qty: q, Zone: '', Ref: '', 'Order #': '', Source: 'manual', User: 'adjustments', Reason: why });
    r.Status = 'Applied'; r['Applied At'] = t; if (!trim_(r.Date)) r.Date = dstr_(t); changed++; applied++;
  });
  if (changed) { appendRows_('Movements', mov); writeTable_('Adjustments', rows); }
  if (applied) audit_('', 'applyAdjustments', applied + ' rows');
  return applied;
}
function rebuildStock_() {
  var agg = {};
  function A(b) { return agg[b] || (agg[b] = { Opening: 0, Received: 0, Sold: 0, Returned: 0, Adjust: 0, area: 0 }); }
  readTable_('Movements').forEach(function (m) {
    var b = normBarcode_(m.Barcode); if (!b) return;
    var q = num_(m.Qty), a = A(b);
    switch (m.Type) {
      case 'Opening': a.Opening += q; break;
      case 'Receive': a.Received += q; break;
      case 'Sale': case 'Exchange Out': a.Sold += -q; break;
      case 'Return': case 'Exchange In': a.Returned += q; break;
      default: a.Adjust += q;
    }
  });
  var rs = sh_('Returns_Scan'), rl = rs.getLastRow();
  if (rl >= 2) rs.getRange(2, 1, rl - 1, Math.min(8, rs.getLastColumn())).getValues().forEach(function (r) {
    var b = normBarcode_(r[0]); if (!b) return; var a = A(b), cond = trim_(r[7]);
    if (cond === 'تالف' || cond === 'حجر') return;   // مش بيدخل المخزون القابل للبيع
    a.Returned++; if (!trim_(r[5])) a.area++;
  });
  var prods = {}; readTable_('Products').forEach(function (p) { var b = normBarcode_(p.Barcode); prods[b] = p; A(b); });
  var opening = hasOpening_(), rows = [];
  Object.keys(agg).sort().forEach(function (b) {
    var a = agg[b], p = prods[b] || {}, actual = a.Opening + a.Received - a.Sold + a.Returned + a.Adjust;
    var erp = num_(p['ERP Qty']), sh = p['Shopify Available'], hasSh = !(sh === '' || sh === undefined);
    rows.push({ Barcode: b, SKU: p.SKU || '', Title: p.Title || '', Location: p.Location || '', Opening: a.Opening, Received: a.Received, Sold: a.Sold, Returned: a.Returned, Adjust: a.Adjust,
      Actual: actual, 'ERP Qty': erp, 'Shopify Available': hasSh ? sh : '', 'Gap (Actual-ERP)': actual - erp, 'ERP-Shopify': hasSh ? erp - num_(sh) : '', 'Sellable Gap': hasSh ? actual - num_(sh) : '', 'In Returns Area': a.area });
  });
  writeTable_('Stock', rows);
  // أصناف من غير مكان
  var nl = Object.keys(prods).filter(function (b) { var p = prods[b]; return p['In ERP'] === 'Yes' && !trim_(p.Location); }).map(function (b) {
    return { UPC: b, SKU: prods[b].SKU, Title: prods[b].Title, Actual: agg[b] ? agg[b].Opening + agg[b].Received - agg[b].Sold + agg[b].Returned + agg[b].Adjust : 0, 'ERP Qty': prods[b]['ERP Qty'] };
  }).sort(function (x, y) { return num_(y['ERP Qty']) - num_(x['ERP Qty']); });
  writeTable_('No_Location', nl);
  if (opening) {
    appendExceptionsDedup_(rows.filter(function (r) { return r.Actual < 0; }).map(function (r) {
      return { Date: dstr_(), Type: 'مخزون سالب', Ref: '', Barcode: r.Barcode, Expected: 0, Actual: r.Actual, Diff: r.Actual, Status: 'Open', Note: '' };
    }));
  }
  return { rows: rows.length, opening: opening, noLocation: nl.length };
}
function rebuildFixList_() {
  var opening = hasOpening_(), out = [];
  readTable_('Stock').forEach(function (s) {
    var ae = opening ? num_(s['Gap (Actual-ERP)']) : 0, es = s['ERP-Shopify'] === '' ? 0 : num_(s['ERP-Shopify']), as = (opening && s['Sellable Gap'] !== '') ? num_(s['Sellable Gap']) : 0, note = [];
    if (ae) note.push('الفعلي ' + (ae < 0 ? 'أقل' : 'أكتر') + ' من ERP بـ ' + Math.abs(ae));
    if (es) note.push('ERP ' + (es > 0 ? 'أكتر' : 'أقل') + ' من Shopify بـ ' + Math.abs(es));
    if (as) note.push('الفعلي ' + (as < 0 ? 'أقل' : 'أكتر') + ' من Shopify بـ ' + Math.abs(as));
    if (!note.length) return;
    out.push({ UPC: s.Barcode, SKU: s.SKU, Title: s.Title, Actual: opening ? s.Actual : '', ERP: s['ERP Qty'], Shopify: s['Shopify Available'], 'Actual-ERP': opening ? ae : '', 'ERP-Shopify': s['ERP-Shopify'], 'Actual-Shopify': opening ? s['Sellable Gap'] : '', Note: note.join(' | '), _m: Math.max(Math.abs(ae), Math.abs(es), Math.abs(as)) });
  });
  out.sort(function (a, b) { return b._m - a._m; });
  writeTable_('Fix_List', out.slice(0, 3000)); return out.length;
}
function rebuildDailySummary_() {
  var days = [], today = now_(), idx = {};
  for (var i = 29; i >= 0; i--) { var d = dstr_(new Date(today.getTime() - i * 86400000)); idx[d] = { Date: d, Received: 0, Sold: 0, 'Returned (scanned)': 0, Adjust: 0, 'New Exceptions': 0 }; days.push(d); }
  readTable_('Movements').forEach(function (m) {
    var d = toDateStr_(m.Time), x = idx[d]; if (!x) return; var q = num_(m.Qty);
    if (m.Type === 'Receive') x.Received += q; else if (m.Type === 'Sale' || m.Type === 'Exchange Out') x.Sold += -q; else if (m.Type === 'Adjust') x.Adjust += q;
  });
  var rs = sh_('Returns_Scan'), rl = rs.getLastRow();
  if (rl >= 2) rs.getRange(2, 1, rl - 1, 2).getValues().forEach(function (r) { if (normBarcode_(r[0])) { var x = idx[toDateStr_(r[1])]; if (x) x['Returned (scanned)']++; } });
  readTable_('Daily_Exceptions').forEach(function (e) { var x = idx[toDateStr_(e.Date)]; if (x) x['New Exceptions']++; });
  writeTable_('Daily_Summary', days.map(function (d) { return idx[d]; }));
}
function rebuildDataQuality_() {
  var p = readTable_('Products'), rows = [];
  function add(check, list, fmt) { rows.push({ Check: check, Count: list.length, Details: list.slice(0, 15).map(fmt || String).join(', ') }); }
  add('كميات سالبة في ERP', p.filter(function (x) { return num_(x['ERP Qty']) < 0; }), function (x) { return x.Barcode + '(' + x['ERP Qty'] + ')'; });
  add('صنف في ERP من غير SKU', p.filter(function (x) { return x['In ERP'] === 'Yes' && !trim_(x.SKU); }), function (x) { return x.Barcode; });
  add('صنف في ERP وليس في Shopify (مبيعات ضايعة محتملة)', p.filter(function (x) { return x['In ERP'] === 'Yes' && x['In Shopify'] === 'No'; }), function (x) { return x.Barcode; });
  var pk = {}; p.forEach(function (x) { pk[normBarcode_(x.Barcode)] = 1; });
  var inv = readTable_('Shopify_Inventory');
  add('صنف في Shopify وليس في ERP', inv.filter(function (v) { var b = normBarcode_(v.Barcode); return b && !pk[b]; }), function (v) { return v.Barcode; });
  add('متغيرات Shopify من غير باركود', inv.filter(function (v) { return !normBarcode_(v.Barcode); }), function (v) { return v.SKU || v.Title; });
  add('أصناف من غير مكان', p.filter(function (x) { return x['In ERP'] === 'Yes' && !trim_(x.Location); }), function (x) { return x.Barcode; });
  var lp = locationProblems_(); add('مشاكل في قواعد الأماكن', lp, String);
  add('قواعد مش مطابقة لأي صنف', readTable_('Location_Rules').filter(function (r) { return trim_(r.Key) && num_(r.Matched) === 0 && trim_(r['Location 1']); }), function (r) { return r.Key; });
  add('إيصالات بيع/مرتجع محتاجة مراجعة', readTable_('Sales_Log').filter(function (x) { return x.Status !== 'OK' && x.Status !== 'REGISTERED'; }), function (x) { return x.Receipt + ':' + x.Status; });
  var rs = sh_('Returns_Scan'), rl = rs.getLastRow(), un = [];
  if (rl >= 2) rs.getRange(2, 1, rl - 1, 5).getValues().forEach(function (r) { if (normBarcode_(r[0]) && r[4] === 'UNMATCHED') un.push(normBarcode_(r[0])); });
  add('قطع مرتجعة مش مسجّلة في ملف المرتجعات', un, String);
  var rs2 = sh_('Returns_Scan'), rl2 = rs2.getLastRow(), dmg = [];
  if (rl2 >= 2 && rs2.getLastColumn() >= 8) rs2.getRange(2, 1, rl2 - 1, 8).getValues().forEach(function (r) { var c = trim_(r[7]); if (normBarcode_(r[0]) && (c === 'تالف' || c === 'حجر')) dmg.push(normBarcode_(r[0]) + ':' + c); });
  add('مرتجعات تالفة / في الحجر (مش في المخزون القابل للبيع)', dmg, String);
  add('أصناف Shopify باركودها مشكوك فيه (شوف Barcode_Gaps)', readTable_('Barcode_Gaps'), function (g) { return g.SKU; });
  add('أوردرات فيها نقص (مش جاهزة كلها)', readTable_('Picking').filter(function (x) { return trim_(x.Ready) === 'No'; }), function (x) { return x['Order #']; });
  add('أوردرات مرتجعة لسه ما رجعتش', readTable_('Pending_Returns'), function (x) { return x['Order #'] + '(' + x.Remaining + ')'; });
  writeTable_('Data_Quality', rows); return rows.length;
}
