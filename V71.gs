/** ====== V71.gs : رفع الملفات من التطبيق، الإعدادات وقواعد الأماكن من التطبيق، بوت تليجرام تفاعلي، الاستعلام الشامل ====== */

/** ---- رفع الملفات من التطبيق (بيتبعت على دفعات، وآخر دفعة بتشغّل الاستيراد) ---- */
var IMPORT_KINDS = { onhand: { sheet: 'OnHand_Paste', run: function () { return importOnHand(); } }, sales: { sheet: 'Sales_Paste', run: function () { return importSales(); } }, courier: { sheet: 'Courier_Paste', run: function () { return importCourier(); } } };
function apiImportChunk_(a, c) {
  var k = IMPORT_KINDS[a.kind]; if (!k) throw apiErr_('BAD_INPUT', 'نوع الملف غير معروف');
  var rows = a.rows || [], seq = Number(a.seq) || 0; if (!rows.length && !a.last) throw apiErr_('BAD_INPUT', 'مفيش بيانات');
  if (rows.length > 3000) throw apiErr_('BAD_INPUT', 'الدفعة كبيرة');
  withLock_(function () {
    var s = sh_(k.sheet), w = 0; rows.forEach(function (r) { w = Math.max(w, r.length); });
    if (seq === 0) { s.clearContents(); }
    if (rows.length) {
      var start = seq === 0 ? 1 : s.getLastRow() + 1; ensureRows_(s, start + rows.length);
      var norm = rows.map(function (r) { var o = []; for (var i = 0; i < w; i++) o.push(r[i] === null || r[i] === undefined ? '' : r[i]); return o; });
      s.getRange(start, 1, norm.length, w).setValues(norm);
    }
  });
  if (!a.last) return { ok: true, seq: seq };
  var res = k.run(); rebuildAll(); try { CacheService.getScriptCache().remove('home_v1'); } catch (e) {}
  audit_(uname_(c), 'import ' + a.kind, (res && res.message) || 'done');
  return { done: true, message: (res && res.message) || 'تم الاستيراد' };
}

/** ---- الإعدادات من التطبيق ---- */
function apiConfigList_() { return { rows: readTable_('Config').map(function (r) { return { key: trim_(r.Key), value: String(r.Value === undefined ? '' : r.Value), note: trim_(r.Note) }; }).filter(function (r) { return r.key; }) }; }
function apiConfigSet_(a, c) {
  var key = trim_(a.key), rows = readTable_('Config'), hit = false;
  rows.forEach(function (r) { if (trim_(r.Key) === key) { r.Value = String(a.value === undefined ? '' : a.value).slice(0, 500); hit = true; } });
  if (!hit) throw apiErr_('BAD_INPUT', 'الإعداد ده مش موجود');
  writeTable_('Config', rows); audit_(uname_(c), 'config', key); try { CacheService.getScriptCache().remove('home_v1'); } catch (e) {}
  return { ok: true };
}
/** ---- قواعد الأماكن من التطبيق ---- */
function apiRulesList_(a) {
  var q = trim_(a.q).toLowerCase(), onlyEmpty = !!a.empty, rows = readTable_('Location_Rules'), out = [];
  rows.forEach(function (r) {
    var key = trim_(r.Key); if (!key) return;
    var pk = parseRuleKey_(key), parts = [r.Zone, r.Rack, r.Shelf].map(normLocPart_).filter(Boolean), l1 = parts.length ? parts.join('-') : trim_(r['Location 1']);
    if (q && key.toLowerCase().indexOf(q) < 0 && l1.toLowerCase().indexOf(q) < 0) return;
    if (onlyEmpty && l1) return;
    out.push({ key: key, level: pk ? pk.level : '', zone: trim_(r.Zone), rack: trim_(r.Rack), shelf: trim_(r.Shelf), loc: l1, matched: num_(r.Matched), note: trim_(r.Note) });
  });
  var empty = out.filter(function (x) { return !x.loc; }).length;
  out.sort(function (x, y) { return (x.loc ? 1 : 0) - (y.loc ? 1 : 0) || y.matched - x.matched; });
  return { total: out.length, empty: empty, rows: out.slice(0, 300) };
}
function apiRulesSave_(a, c) {
  var key = trim_(a.key), rows = readTable_('Location_Rules'), hit = false;
  rows.forEach(function (r) {
    if (trim_(r.Key) !== key) return; hit = true;
    r.Zone = normLocPart_(a.zone); r.Rack = normLocPart_(a.rack); r.Shelf = normLocPart_(a.shelf);
    if (!r.Zone && !r.Rack && !r.Shelf) r['Location 1'] = '';
  });
  if (!hit) throw apiErr_('BAD_INPUT', 'القاعدة مش موجودة'); writeTable_('Location_Rules', rows); audit_(uname_(c), 'rules save', key);
  return { ok: true };
}
function apiRulesApply_(c) {
  var r = applyLocationRules(); rebuildAll(); audit_(uname_(c), 'rules apply', ''); return { message: (r && r.message) || 'اتطبقت القواعد على الأصناف' };
}

/** ---- بوت تليجرام التفاعلي ---- */
function tgToken_() { return PropertiesService.getScriptProperties().getProperty('TG_TOKEN'); }
function tgSendTo_(chat, text) {
  var tk = tgToken_(); if (!tk) return false;
  try { var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + tk + '/sendMessage', { method: 'post', muteHttpExceptions: true, payload: { chat_id: String(chat), text: String(text).slice(0, 4000) } }); return r.getResponseCode() === 200; }
  catch (e) { audit_('system', 'telegram error', String(e.message).replace(/bot[0-9]+:[A-Za-z0-9_-]+/g, 'bot***')); return false; }
}
function tgAllowed_(chat) {
  var ok = [String(PropertiesService.getScriptProperties().getProperty('TG_CHAT') || '')].concat(cfg_('Telegram.AllowedChats', '').split(',').map(trim_));
  return !!chat && ok.indexOf(String(chat)) >= 0;
}
function tgWebhook_(upd, e) {
  var ok = ContentService.createTextOutput('ok'), p = PropertiesService.getScriptProperties();
  try {
    var key = e && e.parameter && e.parameter.k; if (!p.getProperty('TG_HOOK') || key !== p.getProperty('TG_HOOK')) return ok;
    var cache = CacheService.getScriptCache(), uk = 'tgu_' + upd.update_id; if (cache.get(uk)) return ok; cache.put(uk, '1', 21600);   // تليجرام بيعيد المحاولة: نتجاهل المكرر
    var msg = upd.message || upd.edited_message; if (!msg || !msg.chat) return ok;
    var chat = msg.chat.id, text = trim_(msg.text || '');
    if (/^\/(id|start)\b/i.test(text) && !tgAllowed_(chat)) { tgSendTo_(chat, 'رقم الشات بتاعك: ' + chat + '\nادّيه لمدير المخزن عشان يضيفك.'); return ok; }
    if (!tgAllowed_(chat)) return ok;
    tgSendTo_(chat, tgAnswer_(text));
  } catch (err) { audit_('system', 'tg webhook error', err.message); }
  return ok;
}
function tgHelp_() { return 'الأوامر:\n/today ملخص النهارده\n/orders حالة الأوردرات\n/low الأصناف اللي هتخلص\n/plan أعمل إيه دلوقتي؟\n/id رقم الشات\nأو اكتب أي سؤال عادي.'; }
function tgAnswer_(text) {
  var cmd = (text.split(/\s+/)[0] || '').toLowerCase().replace(/@\w+$/, ''), m;
  if (cmd === '/help' || cmd === '/start' || !text) return tgHelp_();
  if (cmd === '/today') { m = computeDashboard_(); return 'ملخص ' + dstr_() + '\nOn Hand: ' + m.erp + ' قطعة (' + m.erpItems + ' صنف)\nShopify: ' + m.shopifyAll + ' قطعة\n' + (m.opening ? 'الفعلي: ' + m.actual + ' قطعة\n' : '') + 'أوردرات للتحضير: ' + m.orders + ' (جاهزة ' + m.readyOrders + '، فيها نقص ' + m.shortOrders + ')\nأصناف فيها فرق ERP/Shopify: ' + m.gapES + '\nبدون مكان: ' + m.noLoc; }
  if (cmd === '/orders') { m = computeDashboard_(); return 'أوردرات للتحضير: ' + m.orders + '\nجاهزة كلها: ' + m.readyOrders + '\nفيها نقص: ' + m.shortOrders + '\nالقطع: ' + m.pieces + ' (اتجهز ' + m.pickedPieces + ')'; }
  if (cmd === '/low') { var ro = readTable_('Reorder').slice(0, 10); return ro.length ? 'هيخلص قريب:\n' + ro.map(function (r) { return trim_(r.SKU) + ' — متاح ' + r.Available + '، يكفي ' + r['Days Cover'] + ' يوم، اطلب ' + r.Suggest; }).join('\n') : 'مفيش أصناف قربت تخلص.'; }
  var q = cmd === '/plan' ? 'أعمل إيه دلوقتي؟ رتّب لي أهم 3 أولويات للنهارده.' : text;
  if (!aiOn_()) return 'الذكاء الاصطناعي مش مفعّل. الأوامر المتاحة:\n' + tgHelp_();
  var lim = Number(cfg_('AI.DailyLimit', '40')) || 40; if (aiTodayCount_() >= lim) return 'وصلنا الحد اليومي لأسئلة الذكاء الاصطناعي (' + lim + ').';
  aiTodayCount_(true);
  try { return aiCall_(AI_SYSTEM, 'بيانات المخزن الحالية:\n' + aiContext_() + '\n\nالسؤال: ' + q.slice(0, 500)); } catch (e) { return 'حصلت مشكلة في الذكاء الاصطناعي: ' + e.message; }
}
function menuTelegramBot() {
  var ui = SpreadsheetApp.getUi(), p = PropertiesService.getScriptProperties();
  if (!tgToken_()) { ui.alert('اربط تليجرام الأول من: ربط تليجرام.'); return; }
  var def = ''; try { def = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  var url = ui.prompt('رابط الـ Web app (ينتهي بـ exec). لو ظاهر صح سيبه واضغط OK', def).getResponseText().trim() || def;
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) { ui.alert('الرابط لازم يكون رابط النشر وينتهي بـ exec'); return; }
  var secret = Utilities.getUuid().replace(/-/g, ''); p.setProperty('TG_HOOK', secret);
  var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + tgToken_() + '/setWebhook', { method: 'post', muteHttpExceptions: true, payload: { url: url + '?k=' + secret, drop_pending_updates: 'true' } });
  ui.alert(r.getResponseCode() === 200 ? 'البوت التفاعلي اشتغل. ابعت له /help على تليجرام.' : 'فشل التفعيل (HTTP ' + r.getResponseCode() + '). راجع رابط النشر.');
}
function menuTelegramBotOff() {
  var ui = SpreadsheetApp.getUi(), p = PropertiesService.getScriptProperties();
  if (tgToken_()) UrlFetchApp.fetch('https://api.telegram.org/bot' + tgToken_() + '/deleteWebhook', { method: 'post', muteHttpExceptions: true });
  p.deleteProperty('TG_HOOK'); ui.alert('اتوقف البوت التفاعلي. التقرير اليومي لسه شغال.');
}

/** ---- اختيار موديل Gemini متاح لوحده لو الموديل الحالي اتقفل ---- */
function geminiAutoModel_() {
  var key = PropertiesService.getScriptProperties().getProperty('AI_KEY');
  var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { muteHttpExceptions: true, headers: { 'x-goog-api-key': key } });
  if (res.getResponseCode() !== 200) return '';
  var list = (JSON.parse(res.getContentText() || '{}').models || []).filter(function (m) { return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0; }).map(function (m) { return String(m.name || '').replace(/^models\//, ''); });
  var score = function (n) { var m = /^gemini-(\d+(?:\.\d+)?)-flash$/.exec(n); return m ? parseFloat(m[1]) : -1; };
  var best = list.filter(function (n) { return score(n) > 0; }).sort(function (a, b) { return score(b) - score(a); })[0];
  return best || list.filter(function (n) { return /flash/.test(n) && !/lite|image|tts|live|audio|preview|exp/.test(n); }).sort().reverse()[0] || '';
}

/** ---- الاستعلام الشامل: Shopify (لايف) + الفعلي + المكان + تقرير ---- */
function shopifyLiveByBarcode_(barcodes) {
  var out = {}; if (!shopifyConfigured_() || !barcodes.length) return out;
  try {
    var q = barcodes.map(function (b) { return 'barcode:' + b; }).join(' OR ');
    var d = shopifyGql_('query($q:String){ productVariants(first:20, query:$q){ nodes{ sku barcode inventoryQuantity title product{ title } } } }', { q: q });
    d.productVariants.nodes.forEach(function (v) { out[normBarcode_(v.barcode)] = { qty: v.inventoryQuantity, sku: v.sku, title: (v.product ? v.product.title : '') + (v.title && v.title !== 'Default Title' ? ' / ' + v.title : '') }; });
  } catch (e) { audit_('system', 'lookupAll shopify', e.message); }
  return out;
}
function itemReport_(it) {
  var L = [], basisName = it.hasOpening ? 'الفعلي' : 'On Hand', basis = it.hasOpening ? it.actual : it.erp, sh = it.shopifyLive !== null ? it.shopifyLive : it.shopify, live = it.shopifyLive !== null;
  L.push('المكان: ' + (it.location || 'مفيش مكان متحدد') + (it.location2 ? ' (' + it.location2 + ')' : ''));
  L.push('الأرقام بالقطعة: ' + (it.hasOpening ? 'الفعلي ' + it.actual + ' | ' : '') + 'On Hand ' + it.erp + ' | Shopify ' + (sh === null ? 'غير معروف' : sh + (live ? ' (لحظي)' : ' (من آخر سحب)')));
  if (it.hasOpening && it.actual !== it.erp) L.push('الفعلي ' + (it.actual < it.erp ? 'أقل' : 'أكتر') + ' من On Hand بـ ' + Math.abs(it.actual - it.erp) + ' قطعة. اعمل جرد للمكان.');
  if (sh !== null) { if (sh > basis) L.push('تنبيه: Shopify بيعرض ' + (sh - basis) + ' قطعة أكتر من ' + basisName + '. فيه خطر بيع زيادة، قلّل الكمية في Shopify.'); else if (sh < basis) L.push('Shopify بيعرض أقل من ' + basisName + ' بـ ' + (basis - sh) + ' قطعة. ممكن تزوّدها لو القطع موجودة فعلا.'); else L.push('Shopify متطابق مع ' + basisName + '.'); }
  else L.push('الصنف مش موجود في Shopify (أو لسه ما اتسحبش).');
  if (it.pendingDemand) L.push('مطلوب في أوردرات مفتوحة: ' + it.pendingDemand + ' قطعة' + (it.pendingDemand > basis ? '، وده أكتر من المتاح (' + basis + '): الأوردرات الأحدث هتبقى ناقصة.' : '.'));
  if (!it.location) L.push('الصنف مالوش مكان: حدد مكانه في قواعد الأماكن.');
  if (it.low) L.push('بيتباع بسرعة: المخزون يكفي ' + it.low.cover + ' يوم تقريبا، والمقترح تطلب ' + it.low.suggest + ' قطعة.');
  if (!it.hasOpening && !onhandMode_()) L.push('رصيد البداية لسه ما اتسجلش، فالحساب على On Hand.');
  return L;
}
function apiLookupAll_(a) {
  var q = trim_(a.q); if (!q) throw apiErr_('BAD_INPUT', 'اكتب باركود أو كود أو اسم أو رقم أوردر');
  var bc = normBarcode_(q), isProduct = false;
  if (bc) readCol_('Products', 'Barcode').some(function (b) { if (normBarcode_(b) === bc) { isProduct = true; return true; } return false; });
  if (!isProduct && /^#?\d{4,7}$/.test(q)) return lookupOrderReport_(q.replace('#', ''));
  var base = apiLookup_({ q: q }), ids = (base.matches || []).slice(0, 5).map(function (m) { return m.upc; });
  if (!ids.length) return { kind: 'items', query: q, items: [], total: 0 };
  var live = shopifyLiveByBarcode_(ids), ro = {}; readTable_('Reorder').forEach(function (r) { ro[normBarcode_(r.UPC)] = { cover: r['Days Cover'], suggest: num_(r.Suggest) }; });
  var items = ids.map(function (u) {
    var m = base.matches.filter(function (x) { return x.upc === u; })[0] || {}, det = (base.detail && base.detail.upc === u) ? base.detail : null;
    if (!det) { var pi = findIdx_('Products', 'Barcode', u); if (pi.length) det = lookupDetail_(readRowsAt_('Products', [pi[0]])[0]); }
    det = det || { upc: u, sku: m.sku, title: m.title, location: m.location, location2: '', erp: m.erp || 0, shopify: null, actual: 0, pendingDemand: 0, hasOpening: hasOpening_() };
    var lv = live[u], it = { upc: u, sku: det.sku, title: det.title || (lv && lv.title) || '', location: det.location, location2: det.location2, erp: det.erp, actual: det.actual || 0, hasOpening: det.hasOpening, shopify: det.shopify === undefined ? null : det.shopify, shopifyLive: lv ? num_(lv.qty) : null, pendingDemand: det.pendingDemand || 0, low: ro[u] || null };
    it.report = itemReport_(it); return it;
  });
  return { kind: 'items', query: q, total: base.total, items: items };
}
function lookupOrderReport_(num) {
  var out = { kind: 'order', order: num, found: false, lines: [], report: [] };
  var pickRows = readTable_('Picking').filter(function (r) { return trim_(r['Order #']) === num; });
  var live = null;
  if (shopifyConfigured_()) {
    try { var d = shopifyGql_('query($q:String){ orders(first:1, query:$q){ nodes{ name createdAt cancelledAt tags displayFinancialStatus displayFulfillmentStatus lineItems(first:30){ nodes{ sku title variantTitle quantity variant{ barcode } } } } } }', { q: 'name:' + num }); live = d.orders.nodes[0] || null; }
    catch (e) { audit_('system', 'lookupAll order', e.message); }
  }
  if (!live && !pickRows.length) return out;
  out.found = true;
  if (live) { out.status = live.displayFulfillmentStatus; out.payment = live.displayFinancialStatus; out.tags = live.tags || []; out.cancelled = isCancelledOrder_(live); out.created = live.createdAt; }
  var prods = {}; readTable_('Products').forEach(function (p) { prods[normBarcode_(p.Barcode)] = p; }); var stock = {}; readTable_('Stock').forEach(function (s) { stock[normBarcode_(s.Barcode)] = s; });
  var lines = live ? live.lineItems.nodes.map(function (li) { var r = resolveUpc_(li, prods); return { upc: r.upc, sku: li.sku, title: li.title + (li.variantTitle && li.variantTitle !== 'Default Title' ? ' / ' + li.variantTitle : ''), qty: li.quantity }; })
    : pickRows.map(function (r) { return { upc: normBarcode_(r.UPC), sku: r.SKU, title: r.Title, qty: num_(r.Qty) }; });
  var opening = hasOpening_(), inPick = pickRows.length > 0, shortN = 0;
  out.lines = lines.map(function (l) { var p = prods[l.upc], s = stock[l.upc], av = opening ? (s ? num_(s.Actual) : 0) : (p ? num_(p['ERP Qty']) : 0); if (av < l.qty) shortN++; return { upc: l.upc, sku: l.sku, title: l.title, qty: l.qty, location: p ? trim_(p.Location) : '', avail: av, ok: av >= l.qty }; });
  out.report.push('الأوردر ' + (out.cancelled ? 'ملغي، ومش هيظهر في التحضير.' : (inPick ? 'موجود في قايمة التحضير.' : 'مش في قايمة التحضير (ممكن اتجهز، أو متحجوز، أو اتشحن).')));
  if (out.status) out.report.push('حالة التنفيذ في Shopify: ' + out.status + ' | الدفع: ' + out.payment);
  if (out.tags && out.tags.length) out.report.push('التاجات: ' + out.tags.join(' ، '));
  out.report.push(shortN ? shortN + ' صنف من الأوردر مخزونه ' + (opening ? 'الفعلي' : 'On Hand') + ' أقل من المطلوب.' : 'كل الأصناف متاحة حسب ' + (opening ? 'الفعلي' : 'On Hand') + '.');
  if (!live) out.report.push('Shopify مش متاح دلوقتي، الأرقام من قايمة التحضير.');
  return out;
}
