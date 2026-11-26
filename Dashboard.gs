/** ====== Dashboard.gs : كروت + شارتس ====== */
var DASH_COLORS = { ok: '#1f9d55', warn: '#d98e04', bad: '#d6293e', neutral: '#1f3864', mute: '#6b7686' };

function computeDashboard_() {
  var today = dstr_(), opening = hasOpening_();
  var stock = readTable_('Stock'), prods = readTable_('Products'), exc = readTable_('Daily_Exceptions'), pick = readTable_('Picking'), summary = readTable_('Daily_Summary');
  var sum = function (a, f) { return a.reduce(function (s, x) { return s + num_(f(x)); }, 0); };
  var m = { opening: opening, onhand: onhandMode_() };
  m.actual = sum(stock, function (x) { return x.Actual; });
  m.erp = sum(prods, function (x) { return x['ERP Qty']; });
  m.shopify = sum(prods, function (x) { return x['Shopify Available']; });
  m.erpItems = prods.filter(function (x) { return num_(x['ERP Qty']) > 0; }).length;
  var inv = readTable_('Shopify_Inventory'); m.shopifyAll = sum(inv, function (x) { return x.Available; }); m.shopifyVariants = inv.length;
  m.shopifyMatched = m.shopify; m.actualItems = opening ? stock.filter(function (x) { return num_(x.Actual) !== 0; }).length : null;
  var po = {}, pr = {}; pick.forEach(function (r) { var n = trim_(r['Order #']); if (!n) return; po[n] = 1; if (trim_(r.Ready) === 'No') pr[n] = 1; });
  m.shortOrders = Object.keys(pr).length; m.readyOrders = Object.keys(po).length - m.shortOrders;
  m.reorderCount = readTable_('Reorder').length; m.accuracy = accuracyKpi_();
  m.gapAE = opening ? stock.filter(function (x) { return num_(x['Gap (Actual-ERP)']) !== 0; }).length : null;
  m.gapES = stock.filter(function (x) { return x['ERP-Shopify'] !== '' && num_(x['ERP-Shopify']) !== 0; }).length;
  m.negative = opening ? stock.filter(function (x) { return num_(x.Actual) < 0; }).length : null;
  m.noLoc = prods.filter(function (x) { return x['In ERP'] === 'Yes' && !trim_(x.Location); }).length;
  var open = exc.filter(function (e) { return e.Status === 'Open'; }), byType = {};
  open.forEach(function (e) { byType[e.Type] = (byType[e.Type] || 0) + 1; });
  m.openExc = open.length; m.byType = byType;
  var orders = {}; pick.forEach(function (r) { if (trim_(r['Order #'])) orders[r['Order #']] = 1; });
  m.orders = Object.keys(orders).length; m.pieces = sum(pick, function (x) { return x.Qty; });
  m.pickedPieces = sum(pick.filter(function (x) { return x.Done === true || String(x.Done).toUpperCase() === 'TRUE'; }), function (x) { return x.Qty; });
  m.alerts = readTable_('Low_Stock_Alerts').length;
  m.returnsArea = sum(stock, function (x) { return x['In Returns Area']; });
  var pend = readTable_('Pending_Returns'); m.pendOrders = pend.length; m.pendPieces = sum(pend, function (x) { return x.Remaining; });
  var td = summary.filter(function (x) { return toDateStr_(x.Date) === today; })[0] || {};
  m.recvToday = num_(td.Received); m.soldToday = num_(td.Sold); m.retToday = num_(td['Returned (scanned)']);
  m.updated = Utilities.formatDate(now_(), tz_(), 'yyyy-MM-dd HH:mm');
  // ---- جداول الشارتس ----
  var cat = {}; var sm = {}; stock.forEach(function (s) { sm[normBarcode_(s.Barcode)] = s; });
  prods.forEach(function (p) {
    if (p['In ERP'] !== 'Yes') return; var c = trim_(p.Category) || '—', s = sm[normBarcode_(p.Barcode)] || {};
    var o = cat[c] || (cat[c] = { a: 0, e: 0, s: 0 }); o.a += num_(s.Actual); o.e += num_(p['ERP Qty']); o.s += num_(p['Shopify Available']);
  });
  m.catRows = Object.keys(cat).sort(function (a, b) { return cat[b].e - cat[a].e; }).slice(0, 8).map(function (c) { return [c, opening ? cat[c].a : 0, cat[c].e, cat[c].s]; });
  m.dayRows = summary.slice(-14).map(function (x) { return [String(toDateStr_(x.Date)).slice(5), num_(x.Received), num_(x.Sold), num_(x['Returned (scanned)'])]; });
  var gaps = stock.map(function (s) { var g = opening ? num_(s['Gap (Actual-ERP)']) : (s['ERP-Shopify'] === '' ? 0 : num_(s['ERP-Shopify'])); return { n: (trim_(s.SKU) || s.Barcode) + ' ' + trim_(s.Title).slice(0, 14), g: g }; })
    .filter(function (x) { return x.g !== 0; }).sort(function (a, b) { return Math.abs(b.g) - Math.abs(a.g); }).slice(0, 10);
  m.gapTitle = opening ? 'أكبر 10 فروق (فعلي - ERP)' : 'أكبر 10 فروق (ERP - Shopify)'; m.gapRows = gaps.map(function (x) { return [x.n, x.g]; });
  var ty = Object.keys(byType).sort(function (a, b) { return byType[b] - byType[a]; }), top = ty.slice(0, 7).map(function (k) { return [k, byType[k]]; });
  var rest = ty.slice(7).reduce(function (s, k) { return s + byType[k]; }, 0); if (rest) top.push(['أخرى', rest]); m.excRows = top;
  var dem = {}; pick.forEach(function (r) { var u = normBarcode_(r.UPC); if (!u) return; var o = dem[u] || (dem[u] = { n: (trim_(r.SKU) || u) + ' ' + trim_(r.Product).slice(0, 12), q: 0 }); o.q += num_(r.Qty); });
  m.demRows = Object.keys(dem).sort(function (a, b) { return dem[b].q - dem[a].q; }).slice(0, 10).map(function (u) { return [dem[u].n, dem[u].q, opening && sm[u] ? num_(sm[u].Actual) : 0]; });
  return m;
}
function card_(sh, row, col, label, value, note, color) {
  sh.getRange(row, col, 3, 2).setBackground('#f4f6fa');
  sh.getRange(row, col, 1, 2).merge().setValue(label).setFontSize(11).setFontColor(DASH_COLORS.mute).setHorizontalAlignment('center');
  sh.getRange(row + 1, col, 1, 2).merge().setValue(value).setFontSize(26).setFontWeight('bold').setFontColor(DASH_COLORS[color] || color || DASH_COLORS.neutral).setHorizontalAlignment('center');
  sh.getRange(row + 2, col, 1, 2).merge().setValue(note || '').setFontSize(9).setFontColor(DASH_COLORS.mute).setHorizontalAlignment('center');
}
function lvl_(n) { return n === null ? 'mute' : (n === 0 ? 'ok' : (n < 20 ? 'warn' : 'bad')); }
function dv_(n) { return n === null ? '—' : n; }
function putTable_(sh, row, col, header, rows) {
  var vals = [header].concat(rows.length ? rows : []);
  sh.getRange(row, col, vals.length, header.length).setValues(vals);
  sh.getRange(row, col, 1, header.length).setFontWeight('bold').setBackground('#e6eaf1');
  return rows.length;
}
function addChart_(dash, data, type, title, dataCol, nCols, nRows, atRow, atCol, w, h) {
  if (!nRows) return;
  var ch = dash.newChart().setChartType(type).addRange(data.getRange(1, dataCol, nRows + 1, nCols)).setPosition(atRow, atCol, 8, 8)
    .setOption('title', title).setOption('width', w).setOption('height', h).setOption('legend', { position: 'bottom' }).build();
  dash.insertChart(ch);
}
function refreshDashboard_() {
  var m = computeDashboard_(), d = sh_('Dashboard'), data = sh_('Dashboard_Data');
  try { d.getRange(1, 1, d.getMaxRows(), d.getMaxColumns()).breakApart(); } catch (e) {}
  d.clear(); d.getCharts().forEach(function (c) { d.removeChart(c); }); data.clear();
  for (var c = 1; c <= 8; c++) d.setColumnWidth(c, 140);
  d.setHiddenGridlines(true);
  d.getRange(1, 1, 1, 8).merge().setValue('📦 داشبورد المخزن').setFontSize(20).setFontWeight('bold').setFontColor(DASH_COLORS.neutral);
  d.getRange(2, 1, 1, 8).merge().setValue('آخر تحديث: ' + m.updated + (m.opening || m.onhand ? '' : '   —   ⚠ رصيد البداية لسه مش متسجل، أرقام "الفعلي" مش دقيقة')).setFontSize(10).setFontColor(m.opening || m.onhand ? DASH_COLORS.mute : DASH_COLORS.warn);
  var r = 4;
  card_(d, r, 1, m.onhand ? 'On Hand = الفعلي (قطع)' : 'المخزون الفعلي (قطع)', m.onhand ? m.erp : (m.opening ? m.actual : '—'), m.onhand ? m.erpItems + ' صنف' : 'رصيد البداية + استلام - بيع + مرتجع', m.opening || m.onhand ? 'neutral' : 'mute');
  card_(d, r, 3, 'On Hand (ERP) — قطعة', m.erp, m.erpItems + ' صنف', 'neutral');
  card_(d, r, 5, 'Shopify المتاح — قطعة', m.shopifyAll, m.shopifyVariants + ' متغير | المطابق للأون هاند: ' + m.shopify, 'neutral');
  card_(d, r, 7, 'أصناف فيها فرق (فعلي ≠ ERP)', dv_(m.gapAE), '', lvl_(m.gapAE));
  r += 4;
  card_(d, r, 1, 'أصناف فيها فرق (ERP ≠ Shopify)', m.gapES, 'تتصلح يدوي', lvl_(m.gapES));
  card_(d, r, 3, 'مخزون سالب', dv_(m.negative), 'فعلي أقل من صفر', lvl_(m.negative));
  card_(d, r, 5, 'أصناف من غير مكان', m.noLoc, 'كمّل قواعد الأماكن', lvl_(m.noLoc));
  card_(d, r, 7, 'استثناءات مفتوحة', m.openExc, 'شيت Daily_Exceptions', lvl_(m.openExc));
  r += 4;
  card_(d, r, 1, 'أوردرات غير مجهزة', m.orders, m.pieces + ' قطعة (اتجهز ' + m.pickedPieces + ')', 'neutral');
  card_(d, r, 3, 'أصناف ناقصة للأوردرات', m.alerts, 'الفعلي أقل من المطلوب', lvl_(m.alerts));
  card_(d, r, 5, 'مرتجعات في منطقة المرتجعات', m.returnsArea, 'لسه ما اتوزعتش', m.returnsArea ? 'warn' : 'ok');
  card_(d, r, 7, 'مرتجعات مسجّلة لسه ما رجعتش', m.pendOrders, m.pendPieces + ' قطعة', m.pendOrders ? 'warn' : 'ok');
  r += 4;
  card_(d, r, 1, 'استلام النهارده', m.recvToday, 'قطعة', 'neutral'); card_(d, r, 3, 'بيع النهارده', m.soldToday, 'قطعة', 'neutral');
  card_(d, r, 5, 'مرتجع اتسكان النهارده', m.retToday, 'قطعة', 'neutral'); card_(d, r, 7, 'أوردرات اتجهزت', m.orders ? Math.round(m.pickedPieces / Math.max(m.pieces, 1) * 100) + '%' : '—', 'من قطع التحضير', 'neutral');
  // جداول الشارتس
  var n1 = putTable_(data, 1, 1, ['القسم', 'الفعلي', 'ERP', 'Shopify'], m.catRows);
  var n2 = putTable_(data, 1, 6, ['اليوم', 'استلام', 'بيع', 'مرتجع'], m.dayRows);
  var n3 = putTable_(data, 1, 11, ['الصنف', 'الفرق'], m.gapRows);
  var n4 = putTable_(data, 1, 14, ['الاستثناء', 'العدد'], m.excRows);
  var n5 = putTable_(data, 1, 17, ['الصنف', 'المطلوب', 'المتاح (فعلي)'], m.demRows);
  var CT = Charts.ChartType, top = 21;
  addChart_(d, data, CT.COLUMN, 'الفعلي مقابل ERP مقابل Shopify (حسب القسم)', 1, 4, n1, top, 1, 560, 300);
  addChart_(d, data, CT.LINE, 'حركة آخر 14 يوم', 6, 4, n2, top, 5, 560, 300);
  top += 16;
  addChart_(d, data, CT.BAR, m.gapTitle, 11, 2, n3, top, 1, 560, 320);
  addChart_(d, data, CT.PIE, 'الاستثناءات المفتوحة حسب النوع', 14, 2, n4, top, 5, 560, 320);
  top += 17;
  addChart_(d, data, CT.COLUMN, 'أكتر الأصناف طلبًا: المطلوب مقابل المتاح', 17, 3, n5, top, 1, 1120, 300);
  return m;
}
