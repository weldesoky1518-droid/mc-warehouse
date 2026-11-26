/** ====== Api.gs : نقطة الدخول للتطبيق (Web App) — راوتر + صلاحيات ======
 * الطلب: POST نص JSON  { action, token, args }  (Content-Type: text/plain علشان مفيش preflight)
 * الرد:  { ok:true, data } أو { ok:false, error, code }
 */
function apiErr_(code, msg) { var e = new Error(msg); e.apiCode = code; return e; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet() { return json_({ ok: true, app: 'MC Warehouse API', version: 7, time: new Date().toISOString() }); }
function doPost(e) {
  var req, t0 = Date.now();
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) { return json_({ ok: false, code: 'BAD_JSON', error: 'طلب غير صالح' }); }
  if (req && req.update_id !== undefined && !req.action) return tgWebhook_(req, e);
  try { var data = dispatch_(req.action, req.token, req.args || {}); perfRecord_(req.action, Date.now() - t0); return json_({ ok: true, data: data, ms: Date.now() - t0 }); }
  catch (err) {
    var code = err.apiCode || 'ERROR';
    if (code === 'ERROR') audit_('api', 'api error ' + req.action, err.message);
    return json_({ ok: false, code: code, error: err.message });
  }
}
/** action → { perm, fn(args, ctx) }.  perm: null = أي مستخدم داخل، false = من غير دخول */
var API_ROUTES = {
  login: { perm: false, fn: function (a) { return apiLogin_(a); } },
  ping: { perm: false, fn: function () { return { time: new Date().toISOString() }; } },
  me: { perm: null, fn: function (a, c) { return { user: publicUser_(c.user), lookerUrl: cfg_('Looker.Url', ''), perms: PERMS }; } },
  setLang: { perm: null, fn: function (a, c) { var r = userRowIndex_(normUser_(c.user.Username)); setUserFields_(r, { Lang: a.lang === 'en' ? 'en' : 'ar' }); return {}; } },
  changePin: { perm: null, fn: function (a, c) { return apiChangePin_(a, c); } },
  home: { perm: 'home', fn: function () { return apiHome_(); } },
  lookup: { perm: 'lookup', fn: function (a) { return apiLookup_(a); } },
  receivingCodes: { perm: 'receiving', fn: function () { return apiReceivingCodes_(); } },
  receivingOpen: { perm: 'receiving', fn: function (a) { return apiReceivingOpen_(a.code); } },
  receivingScan: { perm: 'receiving', fn: function (a, c) { return receivingScanBatch_(trim_(a.code), uname_(c), a.scans || []); } },
  receivingUndo: { perm: 'receiving', fn: function (a, c) { return receivingUndo_(trim_(a.code), normBarcode_(a.upc), c); } },
  receivingApprove: { perm: 'receiving_approve', fn: function (a, c) { var r = approveReceiving_(trim_(a.code), uname_(c)); queueRebuild_(); return r; } },
  returnsScan: { perm: 'returns', fn: function (a, c) { return returnsScanBatch_(uname_(c), a.scans || []); } },
  returnsUndo: { perm: 'returns', fn: function (a, c) { return returnsUndo_(normBarcode_(a.upc), c); } },
  putawayList: { perm: 'putaway', fn: function () { return { rows: putawayAgg_() }; } },
  putawayDone: { perm: 'putaway', fn: function (a, c) { return putawayMark_(normBarcode_(a.upc), a.done !== false, uname_(c), Number(a.qty) || 1); } },
  pickingList: { perm: 'picking', fn: function (a) { return apiPickingList_(a); } },
  pickingDone: { perm: 'picking', fn: function (a, c) { return apiPickingDone_(a.keys || [], a.done !== false, uname_(c)); } },
  pickingRefresh: { perm: 'sync', fn: function (a, c) { PICK_BUDGET_MS = 120000; var r = buildPicking(); audit_(uname_(c), 'pickingRefresh', r.message); return { message: r.message, partial: !!r.partial }; } },
  holdOrders: { perm: 'hold', fn: function (a, c) { var rm = {}; (a.orders || []).forEach(function (n) { rm[trim_(n)] = a.reason || ''; }); var n = holdOrders_((a.orders || []).map(trim_), rm, uname_(c)); return { held: n }; } },
  holdList: { perm: 'hold', fn: function () { return apiHoldList_(); } },
  releaseOrders: { perm: 'hold', fn: function (a, c) { return apiRelease_((a.orders || []).map(trim_), uname_(c)); } },
  exceptionsList: { perm: 'exceptions', fn: function (a) { return apiExceptionsList_(a); } },
  exceptionUpdate: { perm: 'exceptions', fn: function (a, c) { return apiExceptionUpdate_(a, c); } },
  adjustAdd: { perm: 'adjust', fn: function (a, c) { return apiAdjust_(a, c); } },
  adjustPending: { perm: 'adjust_approve', fn: function () { return apiAdjustPending_(); } },
  adjustDecide: { perm: 'adjust_approve', fn: function (a, c) { return apiAdjustDecide_(a, c); } },
  courierSummary: { perm: 'courier', fn: function (a) { return apiCourierSummary_(a); } },
  courierList: { perm: 'courier', fn: function (a) { return apiCourierList_(a); } },
  performance: { perm: 'performance', fn: function (a) { return apiPerformance_(a); } },
  compare: { perm: 'compare', fn: function (a) { return apiCompare_(a); } },
  barcodeGaps: { perm: 'compare', fn: function () { return apiBarcodeGaps_(); } },
  reorderList: { perm: 'compare', fn: function () { return apiReorderList_(); } },
  shopifyStatus: { perm: 'home', fn: function () { return apiShopifyStatus_(); } },
  shopifyRefresh: { perm: 'sync', fn: function (a, c) { return apiShopifyRefresh_(c); } },
  countExpected: { perm: 'count', fn: function (a) { return apiCountExpected_(a); } },
  countSubmit: { perm: 'count', fn: function (a, c) { return apiCountSubmit_(a, c); } },
  handoverScan: { perm: 'handover', fn: function (a, c) { return apiHandoverScan_(a, c); } },
  handoverSummary: { perm: 'handover', fn: function () { return apiHandoverSummary_(); } },
  ask: { perm: 'ask', fn: function (a, c) { return apiAsk_(a, c); } },
  importChunk: { perm: 'import', fn: function (a, c) { return apiImportChunk_(a, c); } },
  configList: { perm: 'config', fn: function () { return apiConfigList_(); } },
  configSet: { perm: 'config', fn: function (a, c) { return apiConfigSet_(a, c); } },
  rulesList: { perm: 'config', fn: function (a) { return apiRulesList_(a); } },
  rulesSave: { perm: 'config', fn: function (a, c) { return apiRulesSave_(a, c); } },
  rulesApply: { perm: 'config', fn: function (a, c) { return apiRulesApply_(c); } },
  lookupAll: { perm: 'lookup', fn: function (a) { return apiLookupAll_(a); } },
  refreshStock: { perm: 'sync', fn: function (a, c) { audit_(uname_(c), 'refreshStock', ''); rebuildAll(); CacheService.getScriptCache().remove('home_v1'); return { message: 'اتحدّث المخزون' }; } },
  usersList: { perm: 'users', fn: function () { return { users: listUsers_(), roles: rolesMap_(), perms: PERMS }; } },
  userSave: { perm: 'users', fn: function (a, c) { return saveUser_(uname_(c), a); } }
};
function uname_(c) { return normUser_(c.user.Username); }
function dispatch_(action, token, args) {
  var r = API_ROUTES[action]; if (!r) throw apiErr_('NO_ACTION', 'عملية غير معروفة: ' + action);
  var ctx = {};
  if (r.perm !== false) {
    var u = checkToken_(token); if (!u) throw apiErr_('AUTH', 'الجلسة انتهت، سجّل دخول تاني');
    ctx.user = u; ctx.perms = userPerms_(u);
    if (r.perm && ctx.perms.indexOf(r.perm) < 0) throw apiErr_('FORBIDDEN', 'مش مسموحلك بالعملية دي (' + (PERMS[r.perm] || r.perm) + ')');
  }
  return r.fn(args, ctx);
}
function apiChangePin_(a, c) {
  if (!validPin_(a.newPin)) throw apiErr_('BAD_INPUT', 'الـ PIN الجديد لازم 4 لـ 8 أرقام');
  if (hashPin_(String(a.oldPin || ''), String(c.user.Salt)) !== String(c.user['PIN Hash'])) throw apiErr_('BAD_LOGIN', 'الـ PIN القديم غلط');
  saveUser_(uname_(c), { username: uname_(c), newPin: String(a.newPin) });
  var u = readTable_('Users')[userRowIndex_(uname_(c)) - 2], tk = makeToken_(u);
  return { token: tk.token, exp: tk.exp };
}
/** تحديث المخزون بعد دقيقة بدل ما المستخدم يستنى (بيتجمّع لو اتطلب كذا مرة) */
function queueRebuild_() {
  var p = PropertiesService.getScriptProperties(), last = Number(p.getProperty('REBUILD_QUEUED') || 0);
  if (Date.now() - last < 120000) return;
  p.setProperty('REBUILD_QUEUED', String(Date.now()));
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'job_rebuildQueued') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('job_rebuildQueued').timeBased().after(60 * 1000).create();
}
function job_rebuildQueued() {
  try { rebuildAll(); CacheService.getScriptCache().remove('home_v1'); } catch (e) { audit_('system', 'job_rebuildQueued error', e.message); }
  PropertiesService.getScriptProperties().deleteProperty('REBUILD_QUEUED');
}
