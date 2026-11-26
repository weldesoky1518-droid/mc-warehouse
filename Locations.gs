/** ====== Locations.gs : قواعد الأماكن (الأخص يغلب الأعم) ======
 * المفتاح (Key) في Location_Rules ممكن يكون:
 *   UPC (8-14 رقم)  |  SKU كامل 001/S26/M102655BE  |  موديل+لون M102655BE  |  موديل M102655
 *   قسم+سيزون 001/S26  |  قسم 001  |  سيزون S26
 */
function parseRuleKey_(key) {
  var k = trim_(key).toUpperCase(); if (!k) return null;
  var segs = k.split('/');
  if (/^\d{8,14}$/.test(k)) return { level: 'UPC', score: 6, key: k };
  if (segs.length >= 3) return { level: 'SKU', score: 5, key: k };
  if (segs.length === 2) return { level: 'قسم+سيزون', score: 2, key: k };
  if (/^[A-Z]{1,2}\d{3,}[A-Z]{2,3}$/.test(k)) return { level: 'موديل+لون', score: 4, key: k };
  if (/^[A-Z]{1,2}\d{3,}$/.test(k)) return { level: 'موديل', score: 3, key: k };
  if (/^\d{3}$/.test(k)) return { level: 'قسم', score: 1, key: k };
  if (/^S\d{2}$/.test(k)) return { level: 'سيزون', score: 1, key: k };
  return { level: '؟ مش مفهوم', score: 0, key: k };
}
function ruleMatches_(r, p) {
  switch (r.level) {
    case 'UPC': return p.upc === r.key;
    case 'SKU': return p.sku === r.key;
    case 'موديل+لون': return p.prod === r.key;
    case 'موديل': return p.model === r.key;
    case 'قسم+سيزون': return (p.cat + '/' + p.season) === r.key;
    case 'قسم': return p.cat === r.key;
    case 'سيزون': return p.season === r.key;
  }
  return false;
}
/** بيطبّق القواعد على كل الأصناف ويحسب عدد المطابقات لكل قاعدة */
/** القواعد المرتبة (الأدق الأول). بيرجّع { rules, rulesRows } */
/** جزء مكان (مخزن/رف/درج): بيتنضّف (مسافات وحروف كبيرة) علشان الكتابة اليدوية تفضل متسقة */
function normLocPart_(v) { return trim_(v).toUpperCase().replace(/\s+/g, ''); }
function loadRules_() {
  var rulesRows = readTable_('Location_Rules'), rules = [], blank = [];
  rulesRows.forEach(function (row, i) {
    var pk = parseRuleKey_(row.Key);
    row.Level = pk ? pk.level : ''; row.Matched = 0;
    if (!pk || pk.score === 0) return;
    var parts = [row.Zone, row.Rack, row.Shelf].map(normLocPart_).filter(Boolean);
    if (parts.length) row['Location 1'] = parts.join('-');   // الكود المجمّع بيتكتب لوحده
    var r = { idx: i, level: pk.level, score: pk.score, key: pk.key, l1: trim_(row['Location 1']), l2: trim_(row['Location 2']), l3: trim_(row['Location 3']) };
    if (r.l1) rules.push(r); else blank.push(r);
  });
  rules.sort(function (a, b) { return b.score - a.score || a.idx - b.idx; });
  return { rules: rules, blank: blank, rulesRows: rulesRows };
}
/** المكان من الـ SKU (أو القسم) من غير ما نحتاج صنف في Products */
function locFromRules_(rules, sku, catHint, seasonHint) {
  var s = parseSku_(sku), ctx = { upc: '', sku: s.sku, cat: s.cat || pad3_(catHint), season: s.season || trim_(seasonHint).toUpperCase(), prod: s.prod, model: s.model };
  for (var i = 0; i < rules.length; i++) if (ruleMatches_(rules[i], ctx)) return rules[i];
  return null;
}
/** بيطبّق القواعد على كل الأصناف ويحسب عدد المطابقات لكل قاعدة (القسم من الـ SKU، ولو مفيش SKU من قسم الـ ERP) */
function applyLocationRules() {
  var L = loadRules_(), rules = L.rules, rulesRows = L.rulesRows;
  var prods = readTable_('Products'), none = 0, cats = {};
  prods.forEach(function (p) {
    var s = parseSku_(p.SKU), cat = s.cat || pad3_(p.Category), season = s.season || trim_(p.Season).toUpperCase();
    p.Category = cat; p.Season = season; p.Model = s.model;
    if (cat) cats[cat] = (cats[cat] || 0) + 1;
    var ctx = { upc: normBarcode_(p.Barcode), sku: s.sku, cat: cat, season: season, prod: s.prod, model: s.model }, hit = null;
    for (var i = 0; i < rules.length; i++) if (ruleMatches_(rules[i], ctx)) { hit = rules[i]; break; }
    if (hit) { p.Location = hit.l1; p['Location 2'] = [hit.l2, hit.l3].filter(Boolean).join(' / '); p.Rule = hit.level + ': ' + hit.key; rulesRows[hit.idx].Matched++; }
    else { p.Location = ''; p['Location 2'] = ''; p.Rule = ''; none++; }
    L.blank.forEach(function (r) { if (ruleMatches_(r, ctx)) rulesRows[r.idx].Matched++; });
  });
  // أي قسم موجود في الأصناف ومالوش صف في Location_Rules: نضيفه فاضي علشان تحدد مكانه
  var have = {}; rulesRows.forEach(function (r) { have[trim_(r.Key).toUpperCase()] = 1; });
  var added = Object.keys(cats).sort().filter(function (c) { return !have[c]; });
  added.forEach(function (c) { rulesRows.push({ Key: c, Level: 'قسم', 'Location 1': '', Matched: cats[c], Note: 'قسم جديد — حدد المكان' }); });
  writeTable_('Products', prods); writeTable_('Location_Rules', rulesRows);
  registerLocations_(rules);
  audit_('', 'applyLocationRules', rules.length + ' rules, ' + none + ' without location' + (added.length ? ', +' + added.length + ' new categories' : ''));
  var msg = 'اتطبّقت ' + rules.length + ' قاعدة. أصناف من غير مكان: ' + none + (added.length ? '. أقسام جديدة اتضافت في Location_Rules: ' + added.join(', ') : ''); toast_(msg);
  return { rules: rules.length, noLocation: none, newCategories: added, message: msg };
}
/** أي مكان مكتوب في القواعد ومش في شيت Locations بيتسجل فيه لوحده */
function registerLocations_(rules) {
  var have = {}, add = []; readTable_('Locations').forEach(function (l) { have[trim_(l['Location Code'])] = 1; });
  rules.forEach(function (r) { [r.l1, r.l2, r.l3].forEach(function (v) { v = trim_(v); if (v && !have[v]) { have[v] = 1; add.push({ 'Location Code': v, Type: 'Shelf', Note: 'اتضاف تلقائي من Location_Rules' }); } }); });
  if (add.length) appendRows_('Locations', add);
  return add.length;
}
/** إعادة تسمية مكان في كل حتة (Locations + القواعد + الأصناف) */
function renameLocation_(oldName, newName) {
  oldName = trim_(oldName); newName = trim_(newName);
  if (!oldName || !newName) throw new Error('اكتب الاسم القديم والجديد');
  var locs = readTable_('Locations'), found = false;
  locs.forEach(function (l) { if (trim_(l['Location Code']) === oldName) { l['Location Code'] = newName; found = true; } });
  if (!found) throw new Error('المكان "' + oldName + '" مش موجود في Locations');
  if (locs.some(function (l) { return trim_(l['Location Code']) === newName && trim_(l['Location Code']) !== oldName; }) && oldName !== newName) {
    var cnt = locs.filter(function (l) { return trim_(l['Location Code']) === newName; }).length; if (cnt > 1) throw new Error('الاسم الجديد موجود قبل كده');
  }
  writeTable_('Locations', locs);
  var rules = readTable_('Location_Rules');
  rules.forEach(function (r) { ['Location 1', 'Location 2', 'Location 3'].forEach(function (c) { if (trim_(r[c]) === oldName) r[c] = newName; }); });
  writeTable_('Location_Rules', rules);
  applyLocationRules();
  audit_('', 'renameLocation', oldName + ' -> ' + newName);
  return { message: 'اتغيّر "' + oldName + '" لـ "' + newName + '" في كل الشيتات. حدّث قايمة التحضير لو محتاج.' };
}
function locationProblems_() {
  var out = [], locs = {};
  readTable_('Locations').forEach(function (l) { locs[trim_(l['Location Code'])] = 1; });
  readTable_('Location_Rules').forEach(function (r, i) {
    if (!trim_(r.Key)) return;
    var pk = parseRuleKey_(r.Key);
    if (pk && pk.score === 0) out.push('Location_Rules صف ' + (i + 2) + ': المفتاح "' + r.Key + '" مش مفهوم');
    if ((trim_(r.Rack) || trim_(r.Shelf)) && !trim_(r.Zone)) out.push('Location_Rules صف ' + (i + 2) + ': فيه رف/درج من غير مخزن (Zone)');
    if (trim_(r.Key) && !trim_(r['Location 1'])) out.push('Location_Rules صف ' + (i + 2) + ': مفيش Location 1');
  });
  return out;
}
