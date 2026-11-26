/** ====== Util.gs : أدوات عامة وطبقة قراءة/كتابة الشيتات ====== */
function ss_() {
  var a = null;
  try { a = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
  if (a) { try { PropertiesService.getScriptProperties().setProperty('SS_ID', a.getId()); } catch (e) {} return a; }
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SS_ID'));
}
function sh_(name) {
  var s = ss_().getSheetByName(name);
  if (!s) throw new Error('الشيت مش موجود: ' + name + ' — شغّل Setup الأول.');
  return s;
}
function tz_() { return Session.getScriptTimeZone() || 'Africa/Cairo'; }
function now_() { return new Date(); }
function dstr_(d) { return Utilities.formatDate(d || now_(), tz_(), 'yyyy-MM-dd'); }
function toDateStr_(v) {
  if (v instanceof Date) return dstr_(v);
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (!s) return '';
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);          // dd/mm/yyyy
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return s;
}
function trim_(v) { return String(v === null || v === undefined ? '' : v).trim(); }
function num_(v) { var n = Number(String(v === null || v === undefined ? '' : v).replace(/,/g, '')); return isNaN(n) ? 0 : n; }

/** الباركود دايمًا نص (بيشيل .0 والـ e+) */
function normBarcode_(v) {
  if (v === null || v === undefined) return '';
  var s = String(v).trim().replace(/^'/, '');
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  if (/^\d+(\.\d+)?e\+\d+$/i.test(s)) s = Number(s).toFixed(0);
  return s;
}
/** رقم البوليصة: حروف وأرقام بس بحروف كبيرة */
function normWaybill_(v) { return trim_(v).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
/** أرقام الأوردرات من نص زي "#68257+#67785 دمج" */
function orderNums_(s) { return (String(s || '').match(/\d{4,}/g) || []); }

function headers_(s) {
  var lc = s.getLastColumn();
  if (lc < 1) return [];
  return s.getRange(1, 1, 1, lc).getValues()[0].map(function (h) { return trim_(h); });
}
function ensureRows_(s, need) {
  var mr = s.getMaxRows();
  if (need > mr) s.insertRowsAfter(mr, need - mr + 500);
}
function readTable_(name) {
  var s = sh_(name), lr = s.getLastRow(), h = headers_(s);
  if (lr < 2 || !h.length) return [];
  var v = s.getRange(2, 1, lr - 1, h.length).getValues(), out = new Array(v.length);
  for (var i = 0; i < v.length; i++) {
    var o = {};
    for (var j = 0; j < h.length; j++) o[h[j]] = v[i][j];
    out[i] = o;
  }
  return out;
}
function toRows_(objs, h) {
  return objs.map(function (o) {
    return h.map(function (k) { var x = o[k]; return (x === undefined || x === null) ? '' : x; });
  });
}
function appendRows_(name, objs) {
  if (!objs || !objs.length) return;
  var s = sh_(name), h = headers_(s), rows = toRows_(objs, h), start = Math.max(s.getLastRow(), 1) + 1;
  ensureRows_(s, start + rows.length - 1);
  s.getRange(start, 1, rows.length, h.length).setValues(rows);
}
function writeTable_(name, objs) {
  var s = sh_(name), h = headers_(s), lr = s.getLastRow();
  if (lr > 1) s.getRange(2, 1, lr - 1, h.length).clearContent();
  if (!objs.length) return;
  ensureRows_(s, objs.length + 1);
  s.getRange(2, 1, objs.length, h.length).setValues(toRows_(objs, h));
}
function readRaw_(name) {
  var s = sh_(name);
  if (s.getLastRow() < 1 || s.getLastColumn() < 1) return [];
  return s.getRange(1, 1, s.getLastRow(), s.getLastColumn()).getValues();
}
/** يلاقي صف العناوين (من أول 15 صف) */
function findHeaderRow_(vals, regexes) {
  for (var i = 0; i < Math.min(15, vals.length); i++) {
    for (var j = 0; j < vals[i].length; j++) {
      var c = trim_(vals[i][j]);
      for (var k = 0; k < regexes.length; k++) if (c && regexes[k].test(c)) return i;
    }
  }
  return -1;
}
/** يلاقي عمود: override بالاسم، وإلا أول regex (بالأولوية) بيطابق */
function findCol_(headers, override, regexes) {
  var ov = trim_(override).toLowerCase();
  if (ov) { for (var i = 0; i < headers.length; i++) if (trim_(headers[i]).toLowerCase() === ov) return i; }
  for (var k = 0; k < regexes.length; k++)
    for (var j = 0; j < headers.length; j++) if (trim_(headers[j]) && regexes[k].test(trim_(headers[j]))) return j;
  return -1;
}
function cfg_(key, dflt) {
  try {
    var rows = readTable_('Config');
    for (var i = 0; i < rows.length; i++) if (rows[i].Key === key) { var v = trim_(rows[i].Value); return v === '' ? (dflt === undefined ? '' : dflt) : v; }
  } catch (e) {}
  return dflt === undefined ? '' : dflt;
}
function uid_(p) { return (p || '') + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase(); }
var _lockDepth = 0;   // بيمنع الـ deadlock لو دالة بتقفل اتندهت من جوه دالة بتقفل
function withLock_(fn) {
  if (_lockDepth > 0) return fn();
  var lock = LockService.getScriptLock();
  lock.waitLock(25000); _lockDepth++;
  try { return fn(); } finally { _lockDepth--; lock.releaseLock(); }
}
function audit_(user, action, details) {
  try { appendRows_('Audit_Log', [{ Time: now_(), User: user || 'system', Action: action, Details: String(details || '').slice(0, 500) }]); } catch (e) {}
}
function ui_() { try { return SpreadsheetApp.getUi(); } catch (e) { return null; } }
function alert_(msg) { var u = ui_(); if (u) u.alert(msg); else Logger.log(msg); }
function toast_(msg) { try { ss_().toast(msg, 'Inventory', 8); } catch (e) {} }

/** ====== أدوات إضافية (v4) ====== */
function parseSku_(sku) {
  var s = trim_(sku).toUpperCase(), p = s.split('/');
  var cat = trim_(p[0] || ''), season = trim_(p[1] || ''), prod = trim_(p[2] || '');
  return { sku: s, cat: cat, season: season, prod: prod, model: prod.replace(/[A-Z]{2,3}$/, '') };
}
function pad3_(v) { var s = trim_(v), m = /^(\d{1,3})(\s|$)/.exec(s); return m ? ('000' + m[1]).slice(-3) : s.toUpperCase(); }
function natCmp_(a, b) { return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' }); }
function readCol_(name, header) {
  var s = sh_(name), i = headers_(s).indexOf(header), lr = s.getLastRow();
  if (i < 0 || lr < 2) return [];
  return s.getRange(2, i + 1, lr - 1, 1).getValues().map(function (r) { return r[0]; });
}
/** UPC → {loc, loc2} (بيقرا 3 أعمدة بس من Products علشان السرعة) */
function productLocMap_() {
  var b = readCol_('Products', 'Barcode'), l = readCol_('Products', 'Location'), l2 = readCol_('Products', 'Location 2'), m = {};
  for (var i = 0; i < b.length; i++) { var k = normBarcode_(b[i]); if (k) m[k] = { loc: trim_(l[i]), loc2: trim_(l2[i]) }; }
  return m;
}
function productMap_() { var m = {}; readTable_('Products').forEach(function (p) { m[normBarcode_(p.Barcode)] = p; }); return m; }
/** On Hand هو الفعلي (الافتراضي): مفيش رصيد بداية ولا حساب فعلي منفصل. 'ledger' = النظام القديم */
function onhandMode_() { return cfg_('Stock.Mode', 'onhand').toLowerCase() !== 'ledger'; }
function hasOpening_() {
  if (onhandMode_()) return false;
  var c = null; try { c = CacheService.getScriptCache(); if (c.get('has_opening') === 'Y') return true; } catch (e) {}
  var r = readCol_('Movements', 'Type').some(function (t) { return t === 'Opening'; });
  if (r && c) { try { c.put('has_opening', 'Y', 300); } catch (e) {} }
  return r;
}
/** بيضيف استثناءات من غير تكرار (Date|Type|Ref|Barcode) */
function appendExceptionsDedup_(list) {
  if (!list.length) return 0;
  var have = {}; readTable_('Daily_Exceptions').forEach(function (e) { have[[toDateStr_(e.Date), e.Type, e.Ref, normBarcode_(e.Barcode)].join('|')] = 1; });
  var add = list.filter(function (x) { var k = [x.Date, x.Type, x.Ref, normBarcode_(x.Barcode)].join('|'); if (have[k]) return false; have[k] = 1; return true; });
  appendRows_('Daily_Exceptions', add); return add.length;
}
function setConfigValue_(key, value) {
  var rows = readTable_('Config'), hit = false;
  rows.forEach(function (r) { if (r.Key === key) { r.Value = value; hit = true; } });
  if (!hit) rows.push({ Key: key, Value: value, Note: '' });
  writeTable_('Config', rows);
}

/** ====== أدوات سرعة: قراءة صفوف معيّنة بدل الشيت كله ====== */
/** بيرجّع أرقام الصفوف (0-based بعد الهيدر) اللي عمود header فيها = value (بعد التطبيع كباركود) */
function findIdx_(name, header, value, asBarcode) {
  var col = readCol_(name, header), want = asBarcode === false ? trim_(value) : normBarcode_(value), out = [];
  for (var i = 0; i < col.length; i++) if ((asBarcode === false ? trim_(col[i]) : normBarcode_(col[i])) === want) out.push(i);
  return out;
}
/** بيقرا الصفوف دي بس كـ objects */
function readRowsAt_(name, idxs) {
  var s = sh_(name), h = headers_(s), out = [];
  idxs.forEach(function (i) {
    var v = s.getRange(i + 2, 1, 1, h.length).getValues()[0], o = {}; for (var j = 0; j < h.length; j++) o[h[j]] = v[j]; out.push(o);
  });
  return out;
}
/** أعمدة معيّنة بس كـ objects (أسرع من readTable_ لما الشيت عريض) */
function readCols_(name, cols) {
  var arrs = cols.map(function (c) { return readCol_(name, c); }), n = arrs.length ? arrs[0].length : 0, out = new Array(n);
  for (var i = 0; i < n; i++) { var o = {}; for (var j = 0; j < cols.length; j++) o[cols[j]] = arrs[j][i]; out[i] = o; }
  return out;
}
/** إحصائيات سرعة الطلبات (كاش 6 ساعات): { action: {n, ms, max, last} } */
function perfRecord_(action, ms) {
  try {
    var c = CacheService.getScriptCache(), raw = c.get('perf_v1'), p = raw ? JSON.parse(raw) : {};
    var a = p[action] || (p[action] = { n: 0, ms: 0, max: 0, last: 0 });
    a.n++; a.ms += ms; a.last = ms; if (ms > a.max) a.max = ms;
    c.put('perf_v1', JSON.stringify(p), 21600);
  } catch (e) {}
}
function perfStats_() {
  var raw = null; try { raw = CacheService.getScriptCache().get('perf_v1'); } catch (e) {}
  var p = raw ? JSON.parse(raw) : {};
  return Object.keys(p).map(function (k) { var a = p[k]; return { action: k, n: a.n, avg: Math.round(a.ms / a.n), max: a.max, last: a.last }; }).sort(function (x, y) { return y.avg - x.avg; });
}
/** تسخين: بيمنع بطء أول طلب بعد فترة سكون */
function job_keepWarm() { try { CacheService.getScriptCache().put('warm', String(Date.now()), 600); } catch (e) {} }
function installKeepWarm_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'job_keepWarm') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('job_keepWarm').timeBased().everyMinutes(5).create();
}
