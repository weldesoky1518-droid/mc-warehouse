/** ====== Courier.gs : شركة الشحن (J&T) — استيراد التقرير + مقارنة المرتجعات ======
 * الصق تقرير الشحنات في Courier_Paste (من A1 بالعناوين) ← "استيراد تقرير J&T".
 * بيتخزّن في Courier_Shipments (بوليصة واحدة = صف، والتكرار بيحدّث الحالة). بيانات العملاء (اسم/تليفون/عنوان) عمرها ما بتتخزّن.
 * المقارنة (Returns_Reconciliation) بتقارن: اللي J&T بتقول إنه راجع ↔ المرتجعات المسجّلة (Sales_Log) ↔ اللي اتسكن (Returns_Scan).
 */
var COURIER_HDR = {   // اسم العمود في التقرير (حروف صغيرة) → اسم العمود عندنا
  'waybill': 'Waybill', 'waybill status': 'Status', 'prodcut type': 'Type', 'product type': 'Type', 'client order no.': 'Order #', 'order account name': 'Account', 'order source': 'Source',
  'collection time': 'Collected', 'sign time': 'Signed', 'delivery time': 'Last Scan', 'returning parcel sign-in time': 'Returned In', 'out for delivery times': 'Attempts',
  'abnormal parcel description': 'Reason', 'cod amount': 'COD', 'reference delivery fees': 'Fee', 'pickup information': 'Pickup', 'item name': 'Item Name'
};
function courierTime_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd HH:mm:ss');
  var s = trim_(v); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 19) : s;
}
/** الباركودات من نص "SKU - UPC" (القطع اللي جوه الشحنة) */
function courierUpcs_(text) {
  var out = [], re = /-\s*(\d{6,14})(?!\d)/g, m, s = String(text || '');
  while ((m = re.exec(s))) out.push(normBarcode_(m[1]));
  return out;
}
function courierAcct_(s) { s = trim_(s); var m = s.match(/^([^（(]+)/); return trim_(m ? m[1] : s); }
function courierDate_(s) { return trim_(s).slice(0, 10); }
function courierCfgList_(key, dflt) { return cfg_(key, dflt).split(',').map(trim_).filter(Boolean); }

function importCourier() {
  var res = withLock_(function () {
    var vals = readRaw_('Courier_Paste'), hr = -1, i, j;
    for (i = 0; i < Math.min(15, vals.length) && hr < 0; i++) for (j = 0; j < vals[i].length; j++) if (/^waybill$/i.test(trim_(vals[i][j]))) { hr = i; break; }
    if (hr < 0) throw new Error('Courier_Paste فاضي أو مفيهوش عمود Waybill. الصق تقرير J&T من A1 بالعناوين.');
    var col = {}; vals[hr].forEach(function (h, k) { var key = COURIER_HDR[trim_(h).toLowerCase()]; if (key && col[key] === undefined) col[key] = k; });   // أول ظهور للعمود بس (التقرير فيه أعمدة مكررة)
    if (col['Status'] === undefined) throw new Error('مش لاقي عمود Waybill status في التقرير.');
    var old = {}; readTable_('Courier_Shipments').forEach(function (r) { old[normWaybill_(r.Waybill)] = r; });
    var t = Utilities.formatDate(now_(), tz_(), 'yyyy-MM-dd HH:mm'), added = 0, changed = 0, same = 0, bad = 0;
    function g(r, k) { return col[k] === undefined ? '' : r[col[k]]; }
    for (i = hr + 1; i < vals.length; i++) {
      var r = vals[i], wb = normWaybill_(g(r, 'Waybill')); if (!wb) { if (r.some(function (c) { return trim_(c); })) bad++; continue; }
      var up = courierUpcs_(g(r, 'Pickup')), on = (String(g(r, 'Order #')).match(/\d{3,}/) || [''])[0], src = trim_(g(r, 'Source'));
      var row = { Waybill: wb, Status: trim_(g(r, 'Status')), Type: trim_(g(r, 'Type')) || 'Standard', 'Order #': on, Account: courierAcct_(g(r, 'Account')), VIP: /^vip$/i.test(src) ? 'Yes' : 'No',
        Collected: courierTime_(g(r, 'Collected')), Signed: courierTime_(g(r, 'Signed')), 'Last Scan': courierTime_(g(r, 'Last Scan')), 'Returned In': courierTime_(g(r, 'Returned In')),
        Attempts: num_(g(r, 'Attempts')), Reason: trim_(g(r, 'Reason')), COD: num_(g(r, 'COD')), Fee: num_(g(r, 'Fee')), Items: up.join(' '), Pieces: up.length, 'Item Name': trim_(g(r, 'Item Name')).slice(0, 80) };
      var o = old[wb];
      if (!o) { row['First Seen'] = t; row['Updated At'] = t; old[wb] = row; added++; }
      else {
        var diff = ['Status', 'Type', 'Order #', 'Signed', 'Last Scan', 'Returned In', 'Attempts', 'Reason', 'Items'].some(function (k) { return trim_(o[k]) !== trim_(row[k]); });
        row['First Seen'] = o['First Seen'] || t; row['Updated At'] = diff ? t : (o['Updated At'] || t);
        if (diff) changed++; else same++;
        old[wb] = row;
      }
    }
    writeTable_('Courier_Shipments', Object.keys(old).map(function (k) { return old[k]; }));
    var st = { added: added, changed: changed, same: same, skipped: bad, total: Object.keys(old).length };
    audit_('', 'importCourier', JSON.stringify(st));
    st.message = 'شحن J&T: جديد ' + added + ' | اتحدّثت حالتها ' + changed + ' | زي ما هي ' + same + (bad ? ' | تخطيت ' + bad + ' صف من غير Waybill' : '') + ' | الإجمالي ' + st.total;
    return st;
  });
  try { var rr = reconcileCourier_(); res.message += '\n' + rr.message; } catch (e) { audit_('system', 'reconcileCourier error', e.message); }
  toast_(res.message); return res;
}

/** ====== المقارنة (من غير كتابة — بترجّع صفوف) ====== */
function courierRecon_() {
  var days = Number(cfg_('Courier.DaysBack', '120')) || 0, from = days ? dstr_(new Date(Date.now() - days * 86400000)) : '';
  var retSt = courierCfgList_('Courier.ReturnStatuses', 'Returned,Returning'), exRetSt = courierCfgList_('Courier.ExReturnStatuses', 'Signed,Returned,Returning');
  var ships = readTable_('Courier_Shipments').filter(function (s) { var d = courierDate_(s.Collected) || courierDate_(s['Returned In']); return !from || !d || d >= from; });
  // اللي اتسكن: بالأوردر (المطابق) + باركودات غير مطابقة (للمطابقة بالباركود)
  var scanByOrder = {}, unmatched = {}; var sh = sh_('Returns_Scan'), lr = sh.getLastRow();
  if (lr >= 2) sh.getRange(2, 1, lr - 1, 5).getValues().forEach(function (r) { var u = normBarcode_(r[0]), o = trim_(r[3]); if (!u) return; if (o) scanByOrder[o] = (scanByOrder[o] || 0) + 1; else unmatched[u] = (unmatched[u] || 0) + 1; });
  var regOrder = {}, regAwb = {}; readTable_('Sales_Log').forEach(function (x) { if (x.Type !== 'Return') return; var q = Math.abs(num_(x.Qty)), o = trim_(x['Order #']), a = normWaybill_(x.AWB); if (o) regOrder[o] = (regOrder[o] || 0) + q; if (a) regAwb[a] = (regAwb[a] || 0) + q; });
  var today = Date.parse(dstr_() + 'T00:00:00Z');
  function age(d) { d = courierDate_(d); return d ? Math.max(0, Math.round((today - Date.parse(d + 'T00:00:00Z')) / 86400000)) : ''; }
  var byOrderShips = {}; ships.forEach(function (s) { var o = trim_(s['Order #']); if (o) (byOrderShips[o] = byOrderShips[o] || []).push(s); });
  var rows = [], pool = {}; Object.keys(scanByOrder).forEach(function (o) { pool[o] = scanByOrder[o]; });
  function groupOf(s) { var ty = trim_(s.Type); return ty === 'Ex' ? 'exchange' : (ty === 'Back' || ty === 'Delivered Return') ? 'exchange_return' : 'return'; }
  var cand = ships.filter(function (s) { var g = groupOf(s); return g !== 'return' || retSt.indexOf(trim_(s.Status)) >= 0 || g === 'return' && false; });
  cand.sort(function (a, b) { return String(a['Returned In'] || a.Collected).localeCompare(String(b['Returned In'] || b.Collected)); });
  var seenOrder = {}, lastOfOrder = {};
  cand.forEach(function (s) {
    var g = groupOf(s), st = trim_(s.Status), o = trim_(s['Order #']), exp = num_(s.Pieces), took = 0, note = '', result;
    var arrived = g === 'return' ? retSt.indexOf(st) >= 0 : g === 'exchange_return' ? exRetSt.indexOf(st) >= 0 : retSt.indexOf(st) >= 0;
    var upcs = trim_(s.Items) ? trim_(s.Items).split(/\s+/) : [];
    if (arrived) {
      var avail = o ? (pool[o] || 0) : 0; took = exp > 0 ? Math.min(avail, exp) : avail; if (o) pool[o] = avail - took;
      if (took === 0 && upcs.length) {   // مطابقة بالباركود لو الأوردر مش متربط
        upcs.forEach(function (u) { if (unmatched[u] > 0) { unmatched[u]--; took++; } }); if (took) note = 'مطابقة بالباركود';
      }
    } else if (o && pool[o]) { took = 0; }
    if (g === 'exchange' && !arrived) result = st === 'Signed' ? 'تم التسليم' : 'في الطريق';
    else if (!arrived) result = st === 'Signed' ? 'تم التسليم' : 'في الطريق';
    else if (took === 0) result = 'جاري المتابعة';
    else if (exp > 0 && took < exp) result = 'استلام ناقص';
    else result = 'مستلمة';
    rows.push({ waybill: s.Waybill, order: o, group: g, status: st, type: trim_(s.Type), result: result, reason: trim_(s.Reason), account: trim_(s.Account), vip: s.VIP === 'Yes', returnedAt: courierDate_(s['Returned In']) || courierDate_(s['Last Scan']),
      age: result === 'جاري المتابعة' || result === 'استلام ناقص' ? age(s['Returned In'] || s['Last Scan'] || s.Collected) : '', courierPcs: exp, registered: regAwb[normWaybill_(s.Waybill)] || regOrder[o] || 0, scanned: took, note: note, items: upcs.length });
    if (o) lastOfOrder[o] = rows[rows.length - 1];
  });
  // زيادة: اتسكن للأوردر أكتر من اللي J&T قالته
  Object.keys(pool).forEach(function (o) { if (pool[o] > 0 && lastOfOrder[o]) { var r = lastOfOrder[o]; if (r.result === 'مستلمة') { r.result = 'زيادة عن J&T'; r.note = (r.note ? r.note + ' | ' : '') + 'اتسكن ' + (r.scanned + pool[o]) + ' والشحنة ' + r.courierPcs; } } });
  // مسجّل مرتجع عندنا و J&T مش راجّعه
  var inRecon = {}; rows.forEach(function (r) { if (r.order && r.group !== 'exchange') inRecon[r.order] = 1; });
  ships.forEach(function (s) {
    if (groupOf(s) !== 'return' || retSt.indexOf(trim_(s.Status)) >= 0) return;
    var o = trim_(s['Order #']), a = normWaybill_(s.Waybill), reg = regAwb[a] || (!inRecon[o] && (byOrderShips[o] || []).length === 1 ? regOrder[o] || 0 : 0);
    if (reg > 0) rows.push({ waybill: s.Waybill, order: o, group: 'return', status: trim_(s.Status), type: trim_(s.Type), result: 'مسجّل مرتجع و J&T مش راجّعه', reason: trim_(s.Reason), account: trim_(s.Account), vip: s.VIP === 'Yes', returnedAt: courierDate_(s['Last Scan']), age: '', courierPcs: num_(s.Pieces), registered: reg, scanned: scanByOrder[o] || 0, note: 'J&T بتقول: ' + trim_(s.Status), items: num_(s.Pieces) });
  });
  // اتسكن من غير أي شحنة في التقرير
  Object.keys(scanByOrder).forEach(function (o) { if (!byOrderShips[o]) rows.push({ waybill: '', order: o, group: 'return', status: '', type: '', result: 'اتسكن وغير موجود في تقرير J&T', reason: '', account: '', vip: false, returnedAt: '', age: '', courierPcs: 0, registered: regOrder[o] || 0, scanned: scanByOrder[o], note: 'الأوردر مش في التقرير (ممكن التقرير أقدم من الفترة)', items: 0 }); });
  return rows;
}
var COURIER_RESULT_ORDER = ['جاري المتابعة', 'استلام ناقص', 'زيادة عن J&T', 'مسجّل مرتجع و J&T مش راجّعه', 'اتسكن وغير موجود في تقرير J&T', 'مستلمة', 'في الطريق', 'تم التسليم'];
var COURIER_GROUP_AR = { 'return': 'مرتجع', 'exchange_return': 'مرتجع استبدال', 'exchange': 'استبدال (Ex)' };
function reconcileCourier_() {
  var rows = courierRecon_(), cnt = {}; rows.forEach(function (r) { cnt[r.result] = (cnt[r.result] || 0) + 1; });
  rows.sort(function (a, b) { return COURIER_RESULT_ORDER.indexOf(a.result) - COURIER_RESULT_ORDER.indexOf(b.result) || (Number(b.age) || 0) - (Number(a.age) || 0); });
  writeTable_('Returns_Reconciliation', rows.map(function (r) { return { Waybill: r.waybill, 'Order #': r.order, Group: COURIER_GROUP_AR[r.group], 'Courier Status': r.status, Result: r.result, Reason: r.reason, Account: r.account, VIP: r.vip ? 'Yes' : 'No', 'Returned At': r.returnedAt, 'Age (days)': r.age, 'Courier Pcs': r.courierPcs, Registered: r.registered, Scanned: r.scanned, Note: r.note }; }));
  var msg = 'مقارنة J&T: ' + COURIER_RESULT_ORDER.filter(function (k) { return cnt[k]; }).map(function (k) { return k + ' ' + cnt[k]; }).join(' | ');
  audit_('', 'reconcileCourier', msg); return { counts: cnt, message: msg };
}

/** ====== API للتطبيق ====== */
function apiCourierSummary_(a) {
  var days = a.days === 0 || a.days === '0' ? 0 : (Math.max(1, Math.min(Number(a.days) || 30, 365))), from = days ? dstr_(new Date(Date.now() - (days - 1) * 86400000)) : '';
  var ships = readTable_('Courier_Shipments').filter(function (s) { var d = courierDate_(s.Collected); return !from || !d || d >= from; });
  var st = {}, ty = {}, rs = {}, ac = {}, vip = 0, last = '';
  ships.forEach(function (s) {
    var k = trim_(s.Status) || '—'; st[k] = (st[k] || 0) + 1; ty[trim_(s.Type) || 'Standard'] = (ty[trim_(s.Type) || 'Standard'] || 0) + 1;
    var a2 = trim_(s.Account) || '—', x = ac[a2] || (ac[a2] = { account: a2, vip: s.VIP === 'Yes', total: 0, signed: 0, returned: 0 }); x.total++; if (s.Status === 'Signed') x.signed++; if (s.Status === 'Returned' || s.Status === 'Returning') x.returned++;
    if (s.VIP === 'Yes') vip++;
    if ((s.Status === 'Returned' || s.Status === 'Returning') && trim_(s.Reason)) rs[trim_(s.Reason)] = (rs[trim_(s.Reason)] || 0) + 1;
    if (trim_(s['Updated At']) > last) last = trim_(s['Updated At']);
  });
  var done = (st['Signed'] || 0) + (st['Returned'] || 0) + (st['Returning'] || 0), recon = courierRecon_(), rc = {}, ag = { d0_3: 0, d4_7: 0, d8: 0 }, pendPcs = 0;
  recon.forEach(function (r) { rc[r.result] = (rc[r.result] || 0) + 1; if (r.result === 'جاري المتابعة') { var n = Number(r.age) || 0; if (n <= 3) ag.d0_3++; else if (n <= 7) ag.d4_7++; else ag.d8++; pendPcs += r.courierPcs; } });
  return { days: days, total: ships.length, status: st, types: ty, vip: vip, deliveryRate: done ? Math.round((st['Signed'] || 0) / done * 1000) / 10 : null, returnRate: done ? Math.round(((st['Returned'] || 0) + (st['Returning'] || 0)) / done * 1000) / 10 : null,
    reasons: Object.keys(rs).map(function (k) { return { reason: k, n: rs[k] }; }).sort(function (x, y) { return y.n - x.n; }).slice(0, 12),
    accounts: Object.keys(ac).map(function (k) { return ac[k]; }).sort(function (x, y) { return y.total - x.total; }).slice(0, 10),
    recon: rc, aging: ag, pendingPieces: pendPcs, results: COURIER_RESULT_ORDER, lastImport: last, hasData: ships.length > 0 };
}
function apiCourierList_(a) {
  var rows = courierRecon_(), res = trim_(a.result), grp = trim_(a.group), q = trim_(a.q).toLowerCase(), vip = a.vip === true || a.vip === 'yes';
  rows = rows.filter(function (r) {
    if (res && r.result !== res) return false; if (grp && r.group !== grp) return false; if (vip && !r.vip) return false;
    if (q && (r.waybill + ' ' + r.order + ' ' + r.account).toLowerCase().indexOf(q) < 0) return false; return true;
  });
  rows.sort(function (x, y) { return COURIER_RESULT_ORDER.indexOf(x.result) - COURIER_RESULT_ORDER.indexOf(y.result) || (Number(y.age) || 0) - (Number(x.age) || 0); });
  var off = Number(a.offset) || 0, lim = Math.min(Number(a.limit) || 100, 300), dom = normShopDomain_(PropertiesService.getScriptProperties().getProperty('SHOPIFY_DOMAIN') || '');
  return { total: rows.length, offset: off, handle: dom.replace('.myshopify.com', ''), rows: rows.slice(off, off + lim) };
}
