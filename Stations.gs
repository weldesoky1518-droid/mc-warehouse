/** ====== Stations.gs : السكان جوه الشيت (استلام / مرتجعات / رصيد البداية) + توزيع المرتجعات ======
 * Receiving_Control: B1 = كود الإذن الحالي، B2 = اسم اللي ماسك السكانر.
 * كل سكان في عمود UPC بيملّي لوحده: الوقت، الاسم، الحالة، والمكان المقترح. للتراجع: امسح الصف.
 */
var CTRL = 'Receiving_Control';
var LOC_NONE = '⚠ بدون مكان';

function setupStation_() {
  var s = ss_().getSheetByName(CTRL) || ss_().insertSheet(CTRL);
  if (!trim_(s.getRange('A1').getValue())) {
    s.getRange('A1:A9').setValues([['كود الإذن الحالي'], ['اسم اللي ماسك السكانر'], ['(اكتب الكود في B1 قبل سكان الاستلام. المرتجعات مش محتاجة كود)'], ['المتوقع'], ['اتسكان'], ['ناقص'], ['زيادة'], ['خارج الإذن'], ['الحالة']]);
    s.getRange('A1:A2').setFontWeight('bold'); s.getRange('B1:B2').setBackground('#fff2cc');
    s.getRange('D1').setValue('أكواد الإذن في Receiving_Data'); s.getRange('D1').setFontWeight('bold');
    s.setColumnWidth(1, 220); s.setColumnWidth(2, 180); s.setColumnWidth(4, 220);
  }
  s.getRange('B1:B2').setNumberFormat('@');
}
function stationCode_() { return trim_(sh_(CTRL).getRange('B1').getValue()); }
function stationUser_() { return trim_(sh_(CTRL).getRange('B2').getValue()) || 'scanner'; }

function refreshReceivingStation() {
  var codes = {}, order = [];
  readTable_('Receiving_Data').forEach(function (r) { var c = trim_(r['كود الإذن']); if (c && !codes[c]) { codes[c] = 1; order.push(c); } });
  var s = sh_(CTRL), n = Math.max(s.getLastRow(), 10);
  s.getRange(2, 4, n, 1).clearContent();
  if (order.length) s.getRange(2, 4, order.length, 1).setValues(order.map(function (c) { return [c]; }));
  order.forEach(function (c) { CacheService.getScriptCache().remove('exp:' + c); });
  if (order.length === 1 && !stationCode_()) s.getRange('B1').setValue(order[0]);
  var msg = 'لقيت ' + order.length + ' كود إذن في Receiving_Data.'; toast_(msg); return { codes: order.length, message: msg };
}
function expectedForCode_(code) {
  var cache = CacheService.getScriptCache(), v = cache.get('exp:' + code);
  if (v) return JSON.parse(v);
  var exp = {}, desc = {};
  readTable_('Receiving_Data').forEach(function (r) {
    if (trim_(r['كود الإذن']) !== code) return;
    var b = normBarcode_(r['Local UPC']); if (!b) return;
    exp[b] = (exp[b] || 0) + num_(r['Orig Qty']);
    desc[b] = [r.Desc1, r.Desc2, r.Size].map(trim_).filter(Boolean).join(' ');
  });
  var out = { exp: exp, desc: desc };
  try { cache.put('exp:' + code, JSON.stringify(out), 21600); } catch (e) {}
  return out;
}

/** Installable onEdit trigger — بيوجّه حسب الشيت */
function onSheetEdit(e) {
  try {
    if (!e || !e.range) return;
    var sh = e.range.getSheet(), name = sh.getName(), col = e.range.getColumn();
    if (name === 'Location_Rules') { if (e.range.getRow() >= 2) applyLocationRules(); return; }
    if (name === 'Picking' || name === 'Picking_Hold') { if (e.range.getRow() >= 2) handleHoldEdit_(sh, e.range); return; }
    if (name === 'Returns_Putaway') { if (col === 1 && e.range.getRow() >= 2) handlePutawayTick_(sh, e.range); return; }
    if (col !== 1 || ['Receiving_Scan', 'Returns_Scan', 'Opening_Scan'].indexOf(name) < 0) return;
    var r0 = e.range.getRow(), n = e.range.getNumRows(), vals = e.range.getValues(), rows = [];
    for (var i = 0; i < n; i++) { var b = normBarcode_(vals[i][0]); if (r0 + i >= 2 && b) rows.push({ row: r0 + i, barcode: b }); }
    if (!rows.length) return;
    if (name === 'Receiving_Scan') processReceivingRows_(sh, rows);
    else if (name === 'Returns_Scan') processReturnRows_(sh, rows);
    else processOpeningRows_(sh, rows);
  } catch (err) { audit_('system', 'onSheetEdit error', err.message); }
}
function locLabel_(map, b) { var m = map[b]; if (!m) return '⚠ باركود غير معروف'; return m.loc ? m.loc + (m.loc2 ? ' (أو ' + m.loc2 + ')' : '') : LOC_NONE; }

/** ---- الاستلام ---- */
function processReceivingRows_(sh, newRows) {
  var code = stationCode_(), user = stationUser_();
  withLock_(function () {
    var ex = code ? expectedForCode_(code) : { exp: {}, desc: {} }, locMap = productLocMap_();
    var last = sh.getLastRow(), colA = last >= 2 ? sh.getRange(2, 1, last - 1, 1).getValues() : [], colD = last >= 2 ? sh.getRange(2, 4, last - 1, 1).getValues() : [];
    var isNew = {}; newRows.forEach(function (r) { isNew[r.row] = 1; });
    var counts = {}, results = {};
    for (var i = 0; i < colA.length; i++) {
      var row = i + 2, b = normBarcode_(colA[i][0]); if (!b) continue;
      if (isNew[row]) {
        if (!code) { results[row] = 'NO_CODE'; continue; }
        var e = ex.exp[b] || 0, c = counts[b] || 0;
        results[row] = e === 0 ? 'NOT_IN_LIST' : (c + 1 > e ? 'OVER' : 'OK'); counts[b] = c + 1;
      } else if (code && trim_(colD[i][0]) === code) counts[b] = (counts[b] || 0) + 1;
    }
    var t = now_();
    newRows.forEach(function (r) {
      var st = results[r.row] || 'NO_CODE';
      sh.getRange(r.row, 2, 1, 6).setValues([[t, user, code, '', st, locLabel_(locMap, r.barcode)]]);
      sh.getRange(r.row, 1, 1, 7).setBackground(st === 'OK' ? '#d9f3e4' : '#fde0e3');
    });
    if (code) writeStationSummary_(ex.exp, counts);
  });
}
function sums_(exp, counts) {
  var tE = 0, tS = 0, short = 0, over = 0, extra = 0, keys = {};
  Object.keys(exp).concat(Object.keys(counts)).forEach(function (k) { keys[k] = 1; });
  Object.keys(keys).forEach(function (b) { var e = exp[b] || 0, c = counts[b] || 0; tE += e; tS += c; if (!e) extra += c; else if (c < e) short += e - c; else over += c - e; });
  return { expected: tE, scanned: tS, short: short, over: over, extra: extra };
}
function writeStationSummary_(exp, counts) {
  var m = sums_(exp, counts);
  sh_(CTRL).getRange('B4:B9').setValues([[m.expected], [m.scanned], [m.short], [m.over], [m.extra], [m.short + m.over + m.extra === 0 ? 'مطابق ✔' : 'فيه فروق']]);
}
function receivingCounts_(code) {
  var ex = expectedForCode_(code), sh = sh_('Receiving_Scan'), last = sh.getLastRow(), counts = {};
  if (last >= 2) {
    var a = sh.getRange(2, 1, last - 1, 1).getValues(), d = sh.getRange(2, 4, last - 1, 1).getValues();
    for (var i = 0; i < a.length; i++) { var b = normBarcode_(a[i][0]); if (b && trim_(d[i][0]) === code) counts[b] = (counts[b] || 0) + 1; }
  }
  return { exp: ex.exp, desc: ex.desc, counts: counts };
}
function recountStation() {
  var code = stationCode_(); if (!code) throw new Error('اكتب كود الإذن في Receiving_Control!B1');
  var m = receivingCounts_(code); writeStationSummary_(m.exp, m.counts);
  var t = sums_(m.exp, m.counts), msg = 'المتوقع ' + t.expected + ' | اتسكان ' + t.scanned + ' | ناقص ' + t.short + ' | زيادة ' + t.over; toast_(msg); return { message: msg };
}
/** اعتماد الاستلام: حركات Receive + الفروق. مرة واحدة لكل كود إذن */
function approveReceiving_(code, user) {
  return withLock_(function () {
    if (!code) throw new Error('اكتب كود الإذن في Receiving_Control!B1');
    var done = readTable_('Sessions').filter(function (x) { return x.Mode === 'receive' && trim_(x.Ref) === code && x.Status === 'Closed'; })[0];
    if (done) throw new Error('كود الإذن ' + code + ' اتعتمد قبل كده.');
    var m = receivingCounts_(code);
    if (!Object.keys(m.exp).length) throw new Error('الكود ' + code + ' مش موجود في Receiving_Data (الصق بيانات الإذن الأول).');
    var pm = productLocMap_(), t = now_(), ds = dstr_(t), mov = [], exc = [], moved = 0, shortQ = 0, overQ = 0, extraQ = 0, keys = {};
    Object.keys(m.exp).concat(Object.keys(m.counts)).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (b) {
      var e = m.exp[b] || 0, c = m.counts[b] || 0, d = c - e;
      if (!pm[b] && c > 0) exc.push({ Date: ds, Type: 'باركود غير معروف', Ref: code, Barcode: b, Expected: e, Actual: c, Diff: d, Status: 'Open', Note: 'استلام' });
      if (e === 0 && c > 0) { extraQ += c; exc.push({ Date: ds, Type: 'خارج إذن الاستلام', Ref: code, Barcode: b, Expected: 0, Actual: c, Diff: d, Status: 'Open', Note: '' }); }
      else if (d < 0) { shortQ += -d; exc.push({ Date: ds, Type: 'نقص استلام', Ref: code, Barcode: b, Expected: e, Actual: c, Diff: d, Status: 'Open', Note: '' }); }
      else if (d > 0) { overQ += d; exc.push({ Date: ds, Type: 'زيادة استلام', Ref: code, Barcode: b, Expected: e, Actual: c, Diff: d, Status: 'Open', Note: '' }); }
      if (c > 0) { mov.push({ 'Move ID': uid_('M'), Time: t, Type: 'Receive', Barcode: b, Qty: c, Zone: '', Ref: code, 'Order #': '', Source: 'scan', User: user, Reason: 'استلام إذن ' + code }); moved += c; }
    });
    var note = 'قطع ' + moved + ' | نقص ' + shortQ + ' | زيادة ' + overQ + ' | خارج الإذن ' + extraQ;
    appendRows_('Movements', mov); appendExceptionsDedup_(exc);
    appendRows_('Sessions', [{ 'Session ID': uid_('S'), Mode: 'receive', Ref: code, User: user, Opened: t, Closed: t, Status: 'Closed', Note: note }]);
    audit_(user, 'approveReceiving', code + ' ' + note);
    return { moved: moved, shortQty: shortQ, overQty: overQ, extraQty: extraQ, note: note, message: 'اتعتمد الإذن ' + code + '\n' + note };
  });
}
function menuApproveReceiving() {
  var ui = ui_(), code = stationCode_();
  if (!code) { alert_('اكتب كود الإذن في شيت Receiving_Control خانة B1'); return; }
  var m = receivingCounts_(code), t = sums_(m.exp, m.counts);
  var q = 'إذن ' + code + '\nالمتوقع: ' + t.expected + ' | اتسكان: ' + t.scanned + '\nناقص: ' + t.short + ' | زيادة: ' + t.over + ' | خارج الإذن: ' + t.extra + '\n\nاعتماد الاستلام وتسجيل الحركات؟';
  if (ui && ui.alert(q, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  wrap_(function () { var r = approveReceiving_(code, stationUser_()); rebuildAll(); return r; });
}

/** ---- المرتجعات (سكان بس، متاحة للبيع على طول) ---- */
function processReturnRows_(sh, newRows) {
  var user = stationUser_();
  withLock_(function () {
    var locMap = productLocMap_(), t = now_();
    newRows.forEach(function (r) { sh.getRange(r.row, 2, 1, 2).setValues([[t, user]]); sh.getRange(r.row, 7).setValue(locLabel_(locMap, r.barcode)); });
  });
  matchReturns_();
}
/** بيطابق كل قطعة مسكّنة مع أوردرات المرتجعات المسجّلة (من ملف البيع) بالـ UPC — الأقدم الأول */
function matchReturns_() {
  var logs = readTable_('Sales_Log').filter(function (x) { return x.Type === 'Return' && x.Status === 'REGISTERED'; });
  logs.sort(function (a, b) { return String(a.Date).localeCompare(String(b.Date)) || natCmp_(a.Receipt, b.Receipt); });
  var ol = {}; readTable_('Order_Lines').forEach(function (l) { (ol[String(l['Order #'])] = ol[String(l['Order #'])] || []).push(l); });
  var pools = logs.map(function (x) {
    var lines = {}; (ol[String(x['Order #'])] || []).forEach(function (l) { var b = normBarcode_(l.Barcode); if (b) lines[b] = (lines[b] || 0) + num_(l.Qty); });
    return { order: String(x['Order #']), receipt: x.Receipt, date: x.Date, total: Math.abs(num_(x.Qty)), rem: Math.abs(num_(x.Qty)), lines: lines };
  });
  var sh = sh_('Returns_Scan'), last = sh.getLastRow(), matched = 0, unmatched = 0, out = [];
  if (last >= 2) {
    var upcs = sh.getRange(2, 1, last - 1, 1).getValues();
    upcs.forEach(function (r) {
      var b = normBarcode_(r[0]); if (!b) { out.push(['', '']); return; }
      var hit = null;
      for (var i = 0; i < pools.length; i++) if (pools[i].rem > 0 && (pools[i].lines[b] || 0) > 0) { hit = pools[i]; break; }
      if (hit) { hit.rem--; hit.lines[b]--; out.push([hit.order, 'MATCHED']); matched++; } else { out.push(['', 'UNMATCHED']); unmatched++; }
    });
    sh.getRange(2, 4, out.length, 2).setValues(out);
  }
  var pend = pools.filter(function (p) { return p.rem > 0; }).map(function (p) { return { 'Order #': p.order, Receipt: p.receipt, Date: p.date, 'Registered Qty': p.total, Scanned: p.total - p.rem, Remaining: p.rem }; });
  writeTable_('Pending_Returns', pend);
  return { matched: matched, unmatched: unmatched, pendingOrders: pend.length, message: 'مرتجعات: مطابق ' + matched + ' | غير مسجّل ' + unmatched + ' | أوردرات لسه ما رجعتش ' + pend.length };
}
/** زرار "توزيع المرتجعات": قايمة بالمكان المفروض لكل قطعة، مرتبة بالمكان */
function buildReturnsPutaway() {
  return withLock_(function () {
    var sh = sh_('Returns_Scan'), last = sh.getLastRow(), agg = {}, order = [];
    if (last >= 2) sh.getRange(2, 1, last - 1, 6).getValues().forEach(function (r) {
      var b = normBarcode_(r[0]); if (!b || trim_(r[5])) return;
      if (!agg[b]) { agg[b] = 0; order.push(b); } agg[b]++;
    });
    var pm = productMap_(), rows = order.map(function (b) {
      var p = pm[b] || {};
      return { Done: false, Location: trim_(p.Location) || (p.Barcode ? LOC_NONE : '⚠ باركود غير معروف'), UPC: b, SKU: p.SKU || '', Title: p.Title || '', Qty: agg[b], 'Location 2': p['Location 2'] || '' };
    });
    rows.sort(function (a, b) { return natCmp_(a.Location, b.Location) || natCmp_(a.UPC, b.UPC); });
    writeTable_('Returns_Putaway', rows);
    var s = sh_('Returns_Putaway');
    if (rows.length) { s.getRange(2, 1, rows.length, 1).insertCheckboxes(); s.getRange(2, 1, rows.length, 7).setBackground('#ffffff'); }
    var msg = 'قايمة التوزيع: ' + rows.length + ' صنف | ' + order.reduce(function (s2, b) { return s2 + agg[b]; }, 0) + ' قطعة. علّم ✓ بعد ما تحط كل صنف في مكانه.';
    toast_(msg); return { rows: rows.length, message: msg };
  });
}
function handlePutawayTick_(sh, range) {
  withLock_(function () {
    var row = range.getRow(), v = sh.getRange(row, 1, 1, 7).getValues()[0], ticked = v[0] === true || String(v[0]).toUpperCase() === 'TRUE';
    var upc = normBarcode_(v[2]), qty = num_(v[5]); if (!upc || !qty) return;
    var rs = sh_('Returns_Scan'), last = rs.getLastRow(); if (last < 2) return;
    var data = rs.getRange(2, 1, last - 1, 6).getValues(), left = qty, t = now_();
    if (ticked) { for (var i = 0; i < data.length && left > 0; i++) if (normBarcode_(data[i][0]) === upc && !trim_(data[i][5])) { data[i][5] = t; left--; } }
    else { for (var j = data.length - 1; j >= 0 && left > 0; j--) if (normBarcode_(data[j][0]) === upc && trim_(data[j][5])) { data[j][5] = ''; left--; } }
    rs.getRange(2, 6, data.length, 1).setValues(data.map(function (r) { return [r[5]]; }));
    sh.getRange(row, 1, 1, 7).setBackground(ticked ? '#e2e6ec' : '#ffffff');
  });
}

/** ---- رصيد البداية ---- */
function processOpeningRows_(sh, newRows) {
  var user = stationUser_(), t = now_();
  withLock_(function () { newRows.forEach(function (r) { sh.getRange(r.row, 2, 1, 2).setValues([[t, user]]); }); });
}
function openingFromOnHand() {
  var ui = ui_();
  if (ui && ui.alert('ده هيسجّل رصيد البداية = كميات On Hand الحالية لكل الأصناف (مرة واحدة). متأكد؟', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  var n = withLock_(function () {
    if (hasOpening_()) throw new Error('فيه رصيد بداية متسجل قبل كده.');
    var t = now_(), rows = [];
    readTable_('Products').forEach(function (p) {
      var q = num_(p['ERP Qty']); if (!q) return;
      rows.push({ 'Move ID': uid_('M'), Time: t, Type: 'Opening', Barcode: normBarcode_(p.Barcode), Qty: q, Zone: '', Ref: 'OPENING', 'Order #': '', Source: 'onhand', User: 'system', Reason: 'رصيد بداية من On Hand' });
    });
    appendRows_('Movements', rows); audit_('system', 'opening onhand', rows.length + ' items'); return rows.length;
  });
  rebuildAll(); alert_('تم تسجيل رصيد البداية (' + n + ' صنف).'); return { items: n };
}
function openingFromScan() {
  var ui = ui_();
  if (ui && ui.alert('ده هيسجّل رصيد البداية من اللي اتسكان في Opening_Scan (مرة واحدة). متأكد؟', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  var n = withLock_(function () {
    if (hasOpening_()) throw new Error('فيه رصيد بداية متسجل قبل كده.');
    var sh = sh_('Opening_Scan'), last = sh.getLastRow(), cnt = {};
    if (last >= 2) sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) { var b = normBarcode_(r[0]); if (b) cnt[b] = (cnt[b] || 0) + 1; });
    var t = now_(), rows = Object.keys(cnt).map(function (b) { return { 'Move ID': uid_('M'), Time: t, Type: 'Opening', Barcode: b, Qty: cnt[b], Zone: '', Ref: 'OPENING', 'Order #': '', Source: 'scan', User: 'system', Reason: 'رصيد بداية من سكان المخزن' }; });
    if (!rows.length) throw new Error('Opening_Scan فاضي.');
    appendRows_('Movements', rows); audit_('system', 'opening scan', rows.length + ' items'); return rows.length;
  });
  rebuildAll(); alert_('تم تسجيل رصيد البداية من السكان (' + n + ' صنف).'); return { items: n };
}
