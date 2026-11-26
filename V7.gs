/** ====== V7.gs : مقارنة الأصناف، تحديث Shopify من التطبيق، الجرد، تسليم الشحنات، إعادة الطلب، تليجرام، AI، تبسيط الشيتات ====== */

/** ---- مقارنة الأصناف بالقطعة: الفعلي / ERP / Shopify ---- */
function apiCompare_(a) {
  var opening = hasOpening_(), q = trim_(a.q).toLowerCase(), f = a.f || 'all', loc = trim_(a.location).toLowerCase();
  var rows = readTable_('Stock').map(function (s) {
    var e = num_(s['ERP Qty']), sh = s['Shopify Available'] === '' || s['Shopify Available'] === undefined ? null : num_(s['Shopify Available']), ac = num_(s.Actual);
    return { u: normBarcode_(s.Barcode), sku: trim_(s.SKU), t: trim_(s.Title), loc: trim_(s.Location), a: opening ? ac : null, e: e, s: sh, d1: opening ? ac - e : null, d2: sh === null ? null : e - sh };
  });
  var tot = { e: 0, s: 0, a: 0, items: 0, es: 0, ae: 0 };
  var out = rows.filter(function (r) {
    if (q && (r.u + ' ' + r.sku + ' ' + r.t).toLowerCase().indexOf(q) < 0) return false;
    if (loc && r.loc.toLowerCase().indexOf(loc) !== 0) return false;
    if (f === 'es' && !r.d2) return false;
    if (f === 'ae' && !r.d1) return false;
    if (f === 'gap' && !r.d1 && !r.d2) return false;
    if (f === 'noshop' && r.s !== null) return false;
    return true;
  });
  out.forEach(function (r) { tot.items++; tot.e += r.e; tot.s += r.s || 0; tot.a += r.a || 0; if (r.d2) tot.es++; if (r.d1) tot.ae++; });
  out.sort(function (x, y) { return Math.max(Math.abs(y.d1 || 0), Math.abs(y.d2 || 0)) - Math.max(Math.abs(x.d1 || 0), Math.abs(x.d2 || 0)) || natCmp_(x.sku, y.sku); });
  var off = Number(a.offset) || 0, lim = Math.min(Number(a.limit) || 100, 300);
  return { opening: opening, total: out.length, offset: off, totals: tot, rows: out.slice(off, off + lim) };
}
function apiBarcodeGaps_() {
  var rows = readTable_('Barcode_Gaps');
  return { rows: rows.slice(0, 300).map(function (g) { return { order: trim_(g['Order #']), sku: trim_(g.SKU), variant: trim_(g.Variant), bc: trim_(g['Shopify Barcode']), su: trim_(g['SKU UPC']), issue: trim_(g.Issue), used: trim_(g['Used UPC']) }; }), total: rows.length };
}
function apiReorderList_() {
  var rows = readTable_('Reorder');
  return { rows: rows.slice(0, 300).map(function (r) { return { u: normBarcode_(r.UPC), sku: trim_(r.SKU), t: trim_(r.Title), avail: num_(r.Available), sold: num_(r['Sold (window)']), perDay: num_(r['Per Day']), cover: r['Days Cover'], min: num_(r.Min), suggest: num_(r.Suggest), loc: trim_(r.Location) }; }), total: rows.length, days: Number(cfg_('Reorder.CoverDays', '7')) || 7 };
}

/** ---- تحديث Shopify من التطبيق ---- */
function apiShopifyStatus_() {
  var p = PropertiesService.getScriptProperties();
  return { configured: shopifyConfigured_(), running: !!p.getProperty('INV_ACTIVE'), count: Number(p.getProperty('INV_COUNT') || 0), last: p.getProperty('LAST_SYNC') || '' };
}
function apiShopifyRefresh_(c) {
  if (!shopifyConfigured_()) throw apiErr_('BAD_INPUT', 'Shopify مش متظبط. من القايمة في الشيت: ربط Shopify.');
  var r = syncShopifyInventory();
  if (r.partial) { audit_(uname_(c), 'shopifyRefresh', 'partial ' + r.rows); return { partial: true, rows: r.rows, message: 'اتسحب ' + r.rows + ' صنف لحد دلوقتي، والباقي هيكمّل لوحده كل دقيقة. ارجع حدّث بعد دقيقتين.' }; }
  rebuildAll(); try { CacheService.getScriptCache().remove('home_v1'); } catch (e) {}
  audit_(uname_(c), 'shopifyRefresh', r.rows + ' variants');
  return { partial: false, rows: r.rows, message: 'اتحدّث مخزون Shopify (' + r.rows + ' صنف) واتحسبت المقارنة.' };
}

/** ---- الجرد بالمكان ---- */
function locMatch_(loc, want) { loc = trim_(loc).toUpperCase(); want = trim_(want).toUpperCase(); return !!want && (loc === want || loc.indexOf(want + '-') === 0); }
function apiCountExpected_(a) {
  var want = trim_(a.location); if (!want) throw apiErr_('BAD_INPUT', 'اكتب المكان');
  var opening = hasOpening_(), act = {};
  if (opening) readTable_('Stock').forEach(function (s) { act[normBarcode_(s.Barcode)] = num_(s.Actual); });
  var rows = readTable_('Products').filter(function (p) { return locMatch_(p.Location, want); }).map(function (p) {
    var u = normBarcode_(p.Barcode); return { u: u, sku: trim_(p.SKU), t: trim_(p.Title), exp: opening ? (act[u] || 0) : num_(p['ERP Qty']) };
  });
  return { location: want, opening: opening, basis: opening ? 'الفعلي' : 'On Hand', rows: rows, pieces: rows.reduce(function (s, r) { return s + r.exp; }, 0) };
}
function apiCountSubmit_(a, c) {
  var want = trim_(a.location); if (!want) throw apiErr_('BAD_INPUT', 'اكتب المكان');
  var scans = a.scans || []; if (!scans.length) throw apiErr_('BAD_INPUT', 'مفيش سكان');
  return withLock_(function () {
    var opening = hasOpening_(), t = now_(), sess = uid_('C'), cnt = {}, user = uname_(c), seen = {};
    scans.slice(0, 3000).forEach(function (s) {
      var b = normBarcode_(s.upc); if (!okBarcode_(b)) return; if (s.id) { if (seen[s.id]) return; seen[s.id] = 1; }
      cnt[b] = (cnt[b] || 0) + 1;
    });
    var ups = Object.keys(cnt), act = {}, pm = productMap_();
    if (opening) readTable_('Stock').forEach(function (s) { act[normBarcode_(s.Barcode)] = num_(s.Actual); });
    var expected = {}; Object.keys(pm).forEach(function (u) { if (locMatch_(pm[u].Location, want)) expected[u] = opening ? (act[u] || 0) : num_(pm[u]['ERP Qty']); });
    var all = {}; Object.keys(expected).forEach(function (u) { all[u] = 1; }); ups.forEach(function (u) { all[u] = 1; });
    appendRows_('Count_Scan', ups.map(function (u) { return { Time: t, User: user, Location: want, UPC: u, Session: sess }; }));
    var limit = Number(cfg_('Count.AutoLimit', '2')) || 0, boss = c.perms.indexOf('adjust_approve') >= 0;
    var res = [], adj = [], diffs = 0, ok = 0, pend = 0, auto = 0, tc = 0;
    Object.keys(all).forEach(function (u) {
      var ex = expected[u] || 0, ct = cnt[u] || 0, d = ct - ex, st = d === 0 ? 'مظبوط' : (opening ? '' : 'فرق (جرد أولي)');
      tc += ct;
      if (d === 0) ok++;
      else {
        diffs++;
        if (opening) {
          var isAuto = boss || (limit > 0 && Math.abs(d) <= limit); st = isAuto ? 'اتسوّى تلقائي' : 'بانتظار الموافقة'; if (isAuto) auto++; else pend++;
          adj.push({ Date: dstr_(t), UPC: u, Qty: d, Reason: 'جرد ' + want + ' (' + user + ')', Status: isAuto ? '' : 'بانتظار الموافقة', ID: uid_('A'), 'Requested By': user, 'Decided By': isAuto ? (boss ? user : 'تلقائي') : '' });
        }
      }
      if (!expected[u] && ct) st = (st ? st + ' — ' : '') + 'مش مسجّل في المكان ده';
      res.push({ Session: sess, Time: t, User: user, Location: want, UPC: u, Title: trim_((pm[u] || {}).Title), Expected: ex, Counted: ct, Diff: d, Status: st });
    });
    appendRows_('Count_Results', res);
    if (adj.length) appendRows_('Adjustments', adj);
    audit_(user, 'count', want + ' counted=' + tc + ' diffs=' + diffs);
    if (auto) queueRebuild_();
    var n = Object.keys(all).length;
    return { session: sess, opening: opening, items: n, ok: ok, diffs: diffs, auto: auto, pending: pend, counted: tc, accuracy: n ? Math.round(ok / n * 100) : 100,
      rows: res.filter(function (r) { return r.Diff !== 0; }).sort(function (x, y) { return Math.abs(y.Diff) - Math.abs(x.Diff); }).slice(0, 60).map(function (r) { return { u: r.UPC, t: r.Title, exp: r.Expected, cnt: r.Counted, diff: r.Diff, st: r.Status }; }),
      message: opening ? (diffs ? 'اتسجّل الجرد: ' + diffs + ' صنف فيهم فرق (' + auto + ' اتسوّوا تلقائي، ' + pend + ' بانتظار الموافقة).' : 'الجرد مظبوط 100% ✔') : (onhandMode_() ? 'اتسجّل الجرد. الفرق ده بين اللي عديته وبين On Hand: لو العد صح، صلّح الرقم في الـ ERP.' : 'اتسجّل الجرد الأولي. لما تخلص كل الأماكن: من القايمة "رصيد البداية من الجرد".') };
  });
}
/** رصيد البداية = نتيجة الجرد (آخر جرد لكل مكان) */
function openingFromCount() {
  var ui = ui_();
  if (ui && ui.alert('ده هيسجّل رصيد البداية = نتيجة الجرد (آخر جرد لكل مكان). مرة واحدة. متأكد؟', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  var n = withLock_(function () {
    if (hasOpening_()) throw new Error('فيه رصيد بداية متسجل قبل كده.');
    var res = readTable_('Count_Results'), last = {}, q = {}, t = now_(), out = [];
    res.forEach(function (r) { var l = trim_(r.Location).toUpperCase(), tt = toTs_(r.Time); if (!last[l] || tt >= last[l].t) last[l] = { s: r.Session, t: tt }; });
    res.forEach(function (r) { var l = trim_(r.Location).toUpperCase(); if (last[l] && last[l].s === r.Session) { var u = normBarcode_(r.UPC); q[u] = (q[u] || 0) + num_(r.Counted); } });
    Object.keys(q).forEach(function (u) { if (q[u] > 0) out.push({ 'Move ID': uid_('M'), Time: t, Type: 'Opening', Barcode: u, Qty: q[u], Zone: '', Ref: 'OPENING', 'Order #': '', Source: 'count', User: 'system', Reason: 'رصيد بداية من الجرد' }); });
    if (!out.length) throw new Error('مفيش جرد متسجل.');
    appendRows_('Movements', out); audit_('system', 'opening count', out.length + ' items'); return out.length;
  });
  rebuildAll(); alert_('تم تسجيل رصيد البداية من الجرد (' + n + ' صنف).'); return { items: n };
}
function toTs_(v) { var d = v instanceof Date ? v : new Date(v); return isNaN(d) ? 0 : d.getTime(); }
function accuracyKpi_() {
  var rows = readTable_('Count_Results'), since = Date.now() - 30 * 86400000, n = 0, ok = 0;
  rows.forEach(function (r) { if (toTs_(r.Time) >= since) { n++; if (num_(r.Diff) === 0) ok++; } });
  return n ? Math.round(ok / n * 1000) / 10 : null;
}

/** ---- تسليم الشحنات للكوريير بسكان البوليصة ---- */
function apiHandoverScan_(a, c) {
  var wb = normWaybill_(a.waybill); if (wb.length < 8) throw apiErr_('BAD_INPUT', 'رقم البوليصة غير صالح');
  return withLock_(function () {
    var ho = readCol_('Handover', 'Waybill').map(normWaybill_);
    if (ho.indexOf(wb) >= 0) return { dup: true, waybill: wb, message: 'البوليصة دي اتسلّمت قبل كده.' };
    var order = '', known = false;
    var sh = readTable_('Shopify_Orders').filter(function (o) { return String(o.Tracking || '').split(',').map(normWaybill_).indexOf(wb) >= 0; })[0];
    if (sh) { order = trim_(sh['Order #']); known = true; }
    var cs = readTable_('Courier_Shipments').filter(function (r) { return normWaybill_(r.Waybill) === wb; })[0];
    if (cs) { known = true; if (!order) order = trim_(cs['Order #']); }
    appendRows_('Handover', [{ Time: now_(), User: uname_(c), Waybill: wb, 'Order #': order, Status: known ? 'تم التسليم' : 'تم التسليم (بوليصة غير معروفة)', Note: '' }]);
    return { ok: true, waybill: wb, order: order, known: known, message: known ? 'اتسجّلت ✔' + (order ? ' (أوردر ' + order + ')' : '') : 'اتسجّلت، لكن البوليصة مش موجودة في Shopify ولا في تقرير J&T.' };
  });
}
function apiHandoverSummary_() {
  var today = dstr_(), rows = readTable_('Handover'), mine = rows.filter(function (r) { return toDateStr_(r.Time) === today; });
  var done = {}; rows.forEach(function (r) { done[normWaybill_(r.Waybill)] = 1; });
  var since = Date.now() - 3 * 86400000, missing = [];
  readTable_('Shopify_Orders').forEach(function (o) {
    if (toTs_(o.Created) < since) return;
    String(o.Tracking || '').split(',').forEach(function (w) { w = normWaybill_(w); if (w && !done[w]) missing.push({ w: w, order: trim_(o['Order #']) }); });
  });
  return { today: mine.length, total: rows.length, missing: missing.slice(0, 80), missingCount: missing.length, recent: mine.slice(-10).reverse().map(function (r) { return { w: normWaybill_(r.Waybill), order: trim_(r['Order #']), st: trim_(r.Status) }; }) };
}

/** ---- تنبيه نقص المخزون حسب سرعة البيع ---- */
function rebuildReorder_() {
  var win = Number(cfg_('Reorder.Window', '30')) || 30, cover = Number(cfg_('Reorder.CoverDays', '7')) || 7, since = Date.now() - win * 86400000, sold = {};
  readTable_('Movements').forEach(function (m) {
    if (m.Type !== 'Sale' && m.Type !== 'Exchange Out') return; if (toTs_(m.Time) < since) return;
    var b = normBarcode_(m.Barcode); sold[b] = (sold[b] || 0) - num_(m.Qty);
  });
  var opening = hasOpening_(), out = [];
  readTable_('Stock').forEach(function (s) {
    var b = normBarcode_(s.Barcode), sd = sold[b] || 0; if (sd <= 0) return;
    var avail = s['Shopify Available'] !== '' && s['Shopify Available'] !== undefined ? num_(s['Shopify Available']) : (opening ? num_(s.Actual) : num_(s['ERP Qty']));
    var pd = sd / win, dc = pd > 0 ? Math.round(Math.max(avail, 0) / pd * 10) / 10 : '';
    if (dc !== '' && dc < cover) out.push({ UPC: b, SKU: s.SKU, Title: s.Title, Available: avail, 'Sold (window)': sd, 'Per Day': Math.round(pd * 100) / 100, 'Days Cover': dc, Min: Math.ceil(pd * cover), Suggest: Math.max(Math.ceil(pd * cover * 2 - avail), 1), Location: s.Location });
  });
  out.sort(function (x, y) { return num_(x['Days Cover']) - num_(y['Days Cover']); });
  writeTable_('Reorder', out.slice(0, 1000)); return out.length;
}

/** ---- تليجرام ---- */
function tgOn_() {
  var p = PropertiesService.getScriptProperties();
  return cfg_('Telegram.Enabled', 'No').toLowerCase() === 'yes' && !!p.getProperty('TG_TOKEN') && !!p.getProperty('TG_CHAT');
}
function tgSend_(text) {
  if (!tgOn_()) return false;
  var p = PropertiesService.getScriptProperties();
  try {
    var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + p.getProperty('TG_TOKEN') + '/sendMessage', { method: 'post', muteHttpExceptions: true, payload: { chat_id: p.getProperty('TG_CHAT'), text: String(text).slice(0, 4000) } });
    if (r.getResponseCode() !== 200) { audit_('system', 'telegram error', 'HTTP ' + r.getResponseCode()); return false; }
    return true;
  } catch (e) { audit_('system', 'telegram error', String(e.message).replace(/bot[0-9]+:[A-Za-z0-9_-]+/g, 'bot***')); return false; }
}
function menuTelegramSetup() {
  var ui = SpreadsheetApp.getUi(), p = PropertiesService.getScriptProperties();
  var tk = ui.prompt('Telegram Bot Token (من BotFather)').getResponseText().trim(); if (!tk) { ui.alert('اتلغى'); return; }
  var ch = ui.prompt('Chat ID (رقم الشات أو الجروب)').getResponseText().trim(); if (!ch) { ui.alert('اتلغى'); return; }
  p.setProperty('TG_TOKEN', tk); p.setProperty('TG_CHAT', ch); setConfigValue_('Telegram.Enabled', 'Yes');
  ui.alert(tgSend_('✅ تليجرام اتربط بنظام المخزن') ? 'اتبعتت رسالة تجربة. شوف تليجرام.' : 'الإعدادات اتحفظت لكن الرسالة فشلت — راجع التوكن وChat ID (وابعت /start للبوت الأول).');
}

/** ---- الذكاء الاصطناعي (اختياري — مقفول لحد ما تحط مفتاح) ---- */
function aiOn_() { return cfg_('AI.Enabled', 'No').toLowerCase() === 'yes' && !!PropertiesService.getScriptProperties().getProperty('AI_KEY'); }
function menuAiSetup() {
  var ui = SpreadsheetApp.getUi(), p = PropertiesService.getScriptProperties();
  var prov = ui.prompt('المزود: اكتب gemini أو claude').getResponseText().trim().toLowerCase(); if (prov !== 'gemini' && prov !== 'claude') { ui.alert('اتلغى'); return; }
  var key = ui.prompt('API Key (بيتخزن مخفي ومش بيظهر في الشيت)').getResponseText().trim(); if (!key) { ui.alert('اتلغى'); return; }
  p.setProperty('AI_KEY', key); setConfigValue_('AI.Provider', prov); setConfigValue_('AI.Enabled', 'Yes');
  setConfigValue_('AI.Model', prov === 'gemini' ? 'gemini-2.5-flash' : 'claude-haiku-5-5');
  ui.alert('اتفعّل الـ AI (' + prov + '). لو الموديل اتغيّر اسمه عدّله من شيت Config (AI.Model).');
}
function aiCall_(system, prompt) {
  var p = PropertiesService.getScriptProperties(), key = p.getProperty('AI_KEY'), prov = cfg_('AI.Provider', 'gemini').toLowerCase(), model = cfg_('AI.Model', 'gemini-2.5-flash'), res, j;
  if (prov === 'claude') {
    res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', { method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({ model: model, max_tokens: 1200, system: system, messages: [{ role: 'user', content: prompt }] }) });
    j = JSON.parse(res.getContentText() || '{}');
    if (res.getResponseCode() !== 200) throw new Error('AI: ' + ((j.error && j.error.message) || 'HTTP ' + res.getResponseCode()));
    return (j.content || []).map(function (x) { return x.text || ''; }).join('').trim();
  }
  var callG = function (mdl) { return UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(mdl) + ':generateContent', { method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { 'x-goog-api-key': key },
    payload: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 1200, temperature: 0.3 } }) }); };
  res = callG(model); j = JSON.parse(res.getContentText() || '{}');
  if (res.getResponseCode() !== 200 && /no longer available|not found|not supported|deprecated/i.test((j.error && j.error.message) || '')) {
    var nm = geminiAutoModel_();   // الموديل اتقفل: نختار أحدث Flash متاح لمفتاحك ونحفظه في Config
    if (nm && nm !== model) { setConfigValue_('AI.Model', nm); audit_('system', 'ai model auto', model + ' -> ' + nm); res = callG(nm); j = JSON.parse(res.getContentText() || '{}'); }
  }
  if (res.getResponseCode() !== 200) throw new Error('AI: ' + ((j.error && j.error.message) || 'HTTP ' + res.getResponseCode()));
  var parts = ((j.candidates || [])[0] || {}).content; parts = (parts && parts.parts) || [];
  return parts.map(function (x) { return x.text || ''; }).join('').trim();
}
/** ملخص أرقام فقط (من غير أي بيانات عملاء) بيتبعت للـ AI */
function aiContext_() {
  var m = computeDashboard_(), L = [];
  L.push('تاريخ: ' + dstr_() + (m.onhand ? ' | أرقام On Hand هي الفعلي، والمقارنة بينها وبين Shopify' : ' | رصيد البداية متسجل: ' + (m.opening ? 'نعم' : 'لا')));
  L.push('On Hand: ' + m.erp + ' قطعة (' + m.erpItems + ' صنف) | Shopify: ' + m.shopifyAll + ' قطعة (' + m.shopifyVariants + ' متغير) | الفعلي: ' + (m.opening ? m.actual + ' قطعة' : 'غير متاح'));
  L.push('أصناف فيها فرق ERP≠Shopify: ' + m.gapES + (m.gapAE === null ? '' : ' | فعلي≠ERP: ' + m.gapAE) + ' | أصناف بدون مكان: ' + m.noLoc + ' | استثناءات مفتوحة: ' + m.openExc);
  L.push('التحضير: ' + m.orders + ' أوردر (' + m.pieces + ' قطعة، اتجهز ' + m.pickedPieces + ') | أوردرات جاهزة كلها: ' + m.readyOrders + ' | فيها نقص: ' + m.shortOrders);
  L.push('اليوم: استلام ' + m.recvToday + ' | بيع ' + m.soldToday + ' | مرتجع اتسكان ' + m.retToday + ' | مرتجعات لسه ما رجعتش: ' + m.pendOrders + ' أوردر');
  if (m.accuracy !== null) L.push('دقة المخزون (جرد 30 يوم): ' + m.accuracy + '%');
  var ro = readTable_('Reorder').slice(0, 10); if (ro.length) L.push('أصناف هتخلص قريب: ' + ro.map(function (r) { return trim_(r.SKU) + ' (متاح ' + r.Available + '، يكفي ' + r['Days Cover'] + ' يوم)'; }).join(' ; '));
  if (m.gapRows && m.gapRows.length) L.push('أكبر فروق: ' + m.gapRows.slice(0, 8).map(function (x) { return x[0] + ' = ' + x[1]; }).join(' ; '));
  var rc = {}; readTable_('Returns_Reconciliation').forEach(function (r) { rc[r.Result] = (rc[r.Result] || 0) + 1; });
  if (Object.keys(rc).length) L.push('مرتجعات J&T: ' + Object.keys(rc).map(function (k) { return k + ' ' + rc[k]; }).join(' | '));
  return L.join('\n');
}
var AI_SYSTEM = 'أنت محلل مخزون لمتجر أونلاين. جاوب بالعربي المصري، باختصار وبنقاط. اعتمد على الأرقام المرفقة فقط، ولو المعلومة مش موجودة قول ده صراحة ومتخمنش. متطلبش بيانات عملاء.';
function aiTodayCount_(add) {
  var p = PropertiesService.getScriptProperties(), k = 'AI_' + dstr_(), c = Number(p.getProperty(k) || 0);
  if (add) p.setProperty(k, String(c + 1)); return c;
}
function apiAsk_(a, c) {
  if (!aiOn_()) throw apiErr_('BAD_INPUT', 'الـ AI مش مفعّل. من القايمة في الشيت: تليجرام و AI ← إعداد الذكاء الاصطناعي.');
  var q = trim_(a.q).slice(0, 500); if (!q) throw apiErr_('BAD_INPUT', 'اكتب سؤالك');
  var lim = Number(cfg_('AI.DailyLimit', '40')) || 40, used = aiTodayCount_();
  if (used >= lim) throw apiErr_('LIMIT', 'وصلت الحد اليومي لأسئلة الـ AI (' + lim + '). جرّب بكرة.');
  aiTodayCount_(true);
  var ans = aiCall_(AI_SYSTEM, 'بيانات المخزن الحالية:\n' + aiContext_() + '\n\nالسؤال: ' + q);
  audit_(uname_(c), 'ask', q.slice(0, 80));
  return { answer: ans, remaining: lim - used - 1 };
}
/** التقرير اليومي على تليجرام (بيشتغل حتى من غير AI) */
function job_dailyReport() {
  try {
    if (!tgOn_()) return;
    var m = computeDashboard_(), L = ['📦 تقرير المخزن — ' + dstr_()];
    L.push('On Hand: ' + m.erp + ' قطعة | Shopify: ' + m.shopifyAll + ' قطعة' + (m.opening ? ' | الفعلي: ' + m.actual : ''));
    L.push('أوردرات للتحضير: ' + m.orders + ' (جاهزة كلها: ' + m.readyOrders + ' | فيها نقص: ' + m.shortOrders + ')');
    L.push('أصناف فيها فرق ERP/Shopify: ' + m.gapES + ' | بدون مكان: ' + m.noLoc + ' | استثناءات مفتوحة: ' + m.openExc);
    var ro = readTable_('Reorder'); if (ro.length) L.push('⚠ أصناف هتخلص قريب: ' + ro.length);
    var txt = L.join('\n');
    if (aiOn_() && aiTodayCount_() < (Number(cfg_('AI.DailyLimit', '40')) || 40)) {
      try { aiTodayCount_(true); txt += '\n\n🤖 ملخص وأولويات:\n' + aiCall_(AI_SYSTEM, 'اكتب ملخص يومي قصير (5 نقاط كحد أقصى) وأهم 3 أولويات للنهارده من الأرقام دي:\n' + aiContext_()); }
      catch (e) { audit_('system', 'ai report error', e.message); }
    }
    tgSend_(txt); audit_('system', 'daily report', 'sent');
  } catch (e) { audit_('system', 'job_dailyReport error', e.message); }
}
function menuSendReportNow() { wrap_(function () { if (!tgOn_()) return { message: 'تليجرام مش متفعّل. من القايمة: تليجرام و AI ← ربط تليجرام.' }; job_dailyReport(); return { message: 'اتبعت التقرير.' }; }); }

/** ---- تبسيط الشيتات ---- */
var SHEETS_MAIN = ['Dashboard', 'Fix_List', 'Picking', 'Picking_Hold', 'Stock', 'Reorder', 'Barcode_Gaps', 'Returns_Reconciliation', 'Daily_Exceptions', 'Adjustments', 'Count_Results',
  'OnHand_Paste', 'Sales_Paste', 'Courier_Paste', 'Receiving_Data', 'Receiving_Control', 'Products', 'Location_Rules', 'Locations', 'Config', 'Users', 'Roles'];
var SHEETS_PASTE = ['OnHand_Paste', 'Sales_Paste', 'Courier_Paste', 'Receiving_Data'];
function menuSimplifySheets() {
  wrap_(function () {
    var ss = ss_(), hid = 0;
    ss.getSheets().forEach(function (s) {
      var n = s.getName();
      try {
        if (SHEETS_MAIN.indexOf(n) >= 0) { s.setTabColor(SHEETS_PASTE.indexOf(n) >= 0 ? '#1a73e8' : (['Config', 'Users', 'Roles', 'Location_Rules', 'Locations', 'Products'].indexOf(n) >= 0 ? '#f9ab00' : '#188038')); if (s.isSheetHidden()) s.showSheet(); }
        else if (!s.isSheetHidden() && ss.getActiveSheet().getName() !== n) { s.setTabColor('#9aa0a6'); s.hideSheet(); hid++; }
      } catch (e) {}
    });
    return { message: 'اتخبّى ' + hid + ' شيت فني. الشيتات المهمة ظاهرة بالألوان (أزرق = لصق بيانات، أخضر = تقارير، أصفر = إعدادات). لإظهارها كلها: 📦 المخزن ← ⚙️ إعداد ← إظهار كل الشيتات.' };
  });
}
function menuShowAllSheets() { wrap_(function () { var n = 0; ss_().getSheets().forEach(function (s) { try { if (s.isSheetHidden()) { s.showSheet(); n++; } } catch (e) {} }); return { message: 'اتظهر ' + n + ' شيت.' }; }); }
