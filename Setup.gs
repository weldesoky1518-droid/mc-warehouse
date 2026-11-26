/** ====== Setup.gs : إنشاء/إصلاح الشيتات (آمن: مبيمسحش بيانات أبدًا) ====== */
function setup() {
  var ss = ss_(), report = [];
  Object.keys(SCHEMA).forEach(function (name) {
    var s = ss.getSheetByName(name);
    if (!s) { s = ss.insertSheet(name); report.push('أنشأت: ' + name); }
    var want = SCHEMA[name], have = headers_(s);
    if (!have.length || have.every(function (h) { return h === ''; })) s.getRange(1, 1, 1, want.length).setValues([want]);
    else {
      var missing = want.filter(function (h) { return have.indexOf(h) < 0; });
      if (missing.length) { s.getRange(1, have.length + 1, 1, missing.length).setValues([missing]); report.push(name + ': أضفت أعمدة: ' + missing.join(', ')); }
    }
    styleHeader_(s);
    (TEXT_COLS[name] || []).forEach(function (col) {
      var idx = headers_(s).indexOf(col);
      if (idx >= 0) s.getRange(2, idx + 1, Math.max(s.getMaxRows() - 1, 1), 1).setNumberFormat('@');
    });
  });
  FREE_SHEETS.forEach(function (name) { if (!ss.getSheetByName(name)) { ss.insertSheet(name); report.push('أنشأت: ' + name); } });
  setupStation_(); seedConfig_(); seedRoles_(); seedLocations_(); applyValidation_(); applyProtection_(); try { installKeepWarm_(); } catch (eW) {}
  try { var d = ss.getSheetByName('Dashboard'); ss.setActiveSheet(d); ss.moveActiveSheet(1); } catch (e) {}
  try { installTriggers(); } catch (e) { report.push('التريجرز: ' + e.message); }
  try { refreshDashboard_(); } catch (e) { report.push('الداشبورد: ' + e.message); }
  PropertiesService.getScriptProperties().setProperty('SETUP_DONE', dstr_());
  audit_('system', 'setup', report.join(' | '));
  var msg = 'تم الإعداد.\n' + (report.join('\n') || 'كل الشيتات موجودة.');
  alert_(msg);
  return { report: report };
}
function styleHeader_(s) {
  var lc = Math.max(s.getLastColumn(), 1);
  s.getRange(1, 1, 1, lc).setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff');
  s.setFrozenRows(1);
}
function seedConfig_() {
  var have = {}; readTable_('Config').forEach(function (r) { have[r.Key] = 1; });
  appendRows_('Config', DEFAULT_CONFIG.filter(function (r) { return !have[r[0]]; }).map(function (r) { return { Key: r[0], Value: r[1], Note: r[2] }; }));
}
function seedLocations_() {
  if (readTable_('Locations').length) return;
  var rows = [];
  for (var z = 1; z <= 3; z++) for (var r = 1; r <= 4; r++) rows.push({ 'Location Code': 'Z0' + z + '-R0' + r, Type: 'Shelf', Note: 'مكان تجريبي — غيّره براحتك' });
  rows.push({ 'Location Code': 'المرتجعات', Type: 'Returns', Note: 'مكان المرتجعات العام' });
  rows.push({ 'Location Code': 'الاستلام', Type: 'Receiving', Note: 'منطقة الاستلام' });
  appendRows_('Locations', rows);
}
function applyValidation_() {
  try {
    try { var rules = sh_('Location_Rules'), rh = headers_(rules), n = Math.max(rules.getMaxRows() - 1, 1);   // المكان بيتكتب بإيدك: نشيل أي قايمة اختيارات قديمة
      ['Zone', 'Rack', 'Shelf', 'Location 1', 'Location 2', 'Location 3'].forEach(function (c) { var i = rh.indexOf(c); if (i >= 0) rules.getRange(2, i + 1, n, 1).clearDataValidations(); }); } catch (e3) {}
    var e = sh_('Daily_Exceptions'), eh = headers_(e), en = Math.max(e.getMaxRows() - 1, 1);
    e.getRange(2, eh.indexOf('Status') + 1, en, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Open', 'Resolved', 'Ignored'], true).build());
    var l = sh_('Locations'), lh = headers_(l), ln = Math.max(l.getMaxRows() - 1, 1);
    l.getRange(2, lh.indexOf('Type') + 1, ln, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Shelf', 'Returns', 'Receiving', 'Other'], true).build());
  } catch (e2) { Logger.log('validation: ' + e2); }
}
function applyProtection_() {   // تحذير فقط (علشان الأزرار تشتغل لأي مستخدم)
  try {
    WARN_SHEETS.forEach(function (n) {
      var s = ss_().getSheetByName(n); if (!s) return;
      var ps = s.getProtections(SpreadsheetApp.ProtectionType.SHEET), p = ps.length ? ps[0] : s.protect();
      p.setDescription('جدول محسوب — متعدّلوش يدوي').setWarningOnly(true);
    });
  } catch (e) { Logger.log('protection: ' + e); }
}

/** ====== التريجرز ====== */
function installTriggers() {
  var mine = ['onSheetEdit', 'job_sync', 'job_picking', 'job_nightly', 'job_dailyReport'];
  ScriptApp.getProjectTriggers().forEach(function (t) { if (mine.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(ss_()).onEdit().create();
  ScriptApp.newTrigger('job_sync').timeBased().everyHours(3).create();
  ScriptApp.newTrigger('job_picking').timeBased().everyMinutes(30).create();
  ScriptApp.newTrigger('job_nightly').timeBased().atHour(2).everyDays(1).create();
  ScriptApp.newTrigger('job_dailyReport').timeBased().atHour(Number(cfg_('AI.ReportHour', '9')) || 9).everyDays(1).create();
}
function removeAutoSync() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (['job_sync', 'job_picking', 'job_nightly', 'job_dailyReport'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  alert_('اتوقفت المزامنة التلقائية. شغّل Setup تاني لو عايزها ترجع.');
}
function job_sync() {
  try { if (shopifyConfigured_()) { var r = syncShopifyInventory(); if (!r.partial) syncShopifyOrders(3); } } catch (e) { audit_('system', 'job_sync error', e.message); }
}
function job_picking() {
  try {
    var h = Number(Utilities.formatDate(now_(), tz_(), 'HH')), a = Number(cfg_('Picking.StartHour', '8')), b = Number(cfg_('Picking.EndHour', '23'));
    if (h < a || h >= b) return;
    if (shopifyConfigured_()) {
      var r = buildPicking(), pp = PropertiesService.getScriptProperties(), prev = Number(pp.getProperty('LAST_SHORT') || 0);
      if (r && !r.partial && r.shortOrders !== undefined) { if (r.shortOrders > prev && r.shortOrders >= 5) tgSend_('⚠ أوردرات فيها نقص: ' + r.shortOrders + ' (كان ' + prev + ')'); pp.setProperty('LAST_SHORT', String(r.shortOrders)); }
    }
  } catch (e) { audit_('system', 'job_picking error', e.message); }
}
function job_nightly() {
  try { backupNow(); } catch (e) { audit_('system', 'backup error', e.message); }
  try { rebuildAll(); } catch (e) { audit_('system', 'rebuild error', e.message); }
}
function backupNow() {
  var f = DriveApp.getFileById(ss_().getId()), name = cfg_('BackupFolder', 'Inventory_Backups');
  var it = DriveApp.getFoldersByName(name), folder = it.hasNext() ? it.next() : DriveApp.createFolder(name);
  f.makeCopy(ss_().getName() + ' — backup ' + Utilities.formatDate(now_(), tz_(), 'yyyy-MM-dd HHmm'), folder);
  var keep = parseInt(cfg_('BackupKeep', '14'), 10) || 14, files = [], fi = folder.getFiles();
  while (fi.hasNext()) files.push(fi.next());
  files.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  files.slice(keep).forEach(function (x) { x.setTrashed(true); });
  audit_('system', 'backup', name); toast_('تم عمل نسخة احتياطية');
}
function healthCheck() {
  var problems = [];
  Object.keys(SCHEMA).concat(FREE_SHEETS, ['Receiving_Control']).forEach(function (n) {
    var s = ss_().getSheetByName(n);
    if (!s) { problems.push('شيت ناقص: ' + n); return; }
    if (SCHEMA[n]) { var h = headers_(s); SCHEMA[n].forEach(function (c) { if (h.indexOf(c) < 0) problems.push(n + ': عمود ناقص "' + c + '"'); }); }
  });
  problems = problems.concat(locationProblems_());
  alert_(problems.length ? 'مشاكل (' + problems.length + '):\n' + problems.slice(0, 25).join('\n') : 'كله سليم ✔');
  return problems;
}
