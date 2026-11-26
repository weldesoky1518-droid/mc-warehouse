/** ====== Auth.gs : المستخدمين والأدوار (PIN) + توكن الجلسة ======
 * Users: Username, Name, Role, Extra Permissions, Active, PIN Hash, Salt, Failed, Locked Until, Last Login, Lang
 * Roles: Role, Permissions (مفصولة بفاصلة، * = الكل)
 * الـ PIN بيتخزن Hash بس. التوكن موقّع (HMAC) ومربوط بالـ PIN الحالي: تغيير الـ PIN أو إيقاف الحساب بيفصل المستخدم.
 */
var PERMS = {
  home: 'الرئيسية', lookup: 'الاستعلام عن صنف', receiving: 'مسح الاستلام', receiving_approve: 'اعتماد الاستلام', returns: 'مسح المرتجعات',
  putaway: 'توزيع المرتجعات', picking: 'قايمة التحضير', hold: 'إيقاف/إرجاع الأوردرات', exceptions: 'الاستثناءات', dashboard: 'الداشبورد',
  adjust: 'التسويات', adjust_approve: 'اعتماد التسويات', performance: 'الأداء والسرعة', courier: 'الشحن (J&T)', count: 'الجرد', handover: 'تسليم الشحنات للكوريير', compare: 'مقارنة الأصناف', ask: 'اسأل (AI)', import: 'رفع الملفات من التطبيق', config: 'الإعدادات وقواعد الأماكن', users: 'إدارة المستخدمين', sync: 'تحديث البيانات'
};
var DEFAULT_ROLES = [
  ['admin', '*', 'كل الصلاحيات'],
  ['supervisor', 'home,lookup,receiving,receiving_approve,returns,putaway,picking,hold,exceptions,dashboard,sync,adjust,adjust_approve,performance,courier,count,handover,compare,ask', 'مشرف مخزن'],
  ['receiving', 'home,lookup,receiving', 'استلام'],
  ['picking', 'home,lookup,picking,hold', 'تحضير'],
  ['returns', 'home,lookup,returns,putaway', 'مرتجعات'],
  ['viewer', 'home,lookup,dashboard', 'مشاهدة فقط']
];
function seedRoles_() {
  var have = {}; readTable_('Roles').forEach(function (r) { have[trim_(r.Role)] = 1; });
  appendRows_('Roles', DEFAULT_ROLES.filter(function (r) { return !have[r[0]]; }).map(function (r) { return { Role: r[0], Permissions: r[1], Note: r[2] }; }));
}
function usersTable_(fresh) {
  var c = CacheService.getScriptCache(), v = fresh ? null : c.get('users_v1');
  if (v) { try { return JSON.parse(v); } catch (e) {} }
  var t = readTable_('Users').map(function (u) { u._row = 0; return u; });
  try { c.put('users_v1', JSON.stringify(t), 120); } catch (e) {}
  return t;
}
function bustUsers_() { CacheService.getScriptCache().remove('users_v1'); CacheService.getScriptCache().remove('roles_v1'); }
function rolesMap_() {
  var c = CacheService.getScriptCache(), v = c.get('roles_v1'), m;
  if (v) { try { return JSON.parse(v); } catch (e) {} }
  m = {}; readTable_('Roles').forEach(function (r) { if (trim_(r.Role)) m[trim_(r.Role).toLowerCase()] = trim_(r.Permissions); });
  try { c.put('roles_v1', JSON.stringify(m), 120); } catch (e) {}
  return m;
}
function userPerms_(u) {
  var rp = rolesMap_()[trim_(u.Role).toLowerCase()] || '', all = (rp + ',' + trim_(u['Extra Permissions'])).split(/[,;\s]+/).filter(Boolean);
  if (all.indexOf('*') >= 0) return Object.keys(PERMS);
  var out = {}; all.forEach(function (p) { if (PERMS[p]) out[p] = 1; }); return Object.keys(out);
}
function normUser_(s) { return trim_(s).toLowerCase(); }
function validUsername_(s) { return /^[a-z0-9_\-]{2,24}$/.test(s); }
function validPin_(p) { return /^\d{4,8}$/.test(String(p)); }
function hashPin_(pin, salt) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pin);
  return Utilities.base64Encode(b);
}
function hex_(bytes) { return bytes.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join(''); }
function secret_() {
  var p = PropertiesService.getScriptProperties(), s = p.getProperty('SESSION_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('SESSION_SECRET', s); }
  return s;
}
function sign_(txt) { return hex_(Utilities.computeHmacSha256Signature(txt, secret_())); }
function makeToken_(u) {
  var exp = Date.now() + (Number(cfg_('Auth.SessionHours', '24')) || 24) * 3600000, body = [normUser_(u.Username), exp, String(u['PIN Hash']).slice(0, 8).replace(/[^A-Za-z0-9]/g, 'x')].join('.');
  return { token: body + '.' + sign_(body), exp: exp };
}
/** بيرجّع صف المستخدم لو التوكن سليم وغير منتهي والحساب شغال */
function checkToken_(token) {
  var parts = String(token || '').split('.'); if (parts.length !== 4) return null;
  var body = parts.slice(0, 3).join('.'); if (sign_(body) !== parts[3]) return null;
  if (Number(parts[1]) < Date.now()) return null;
  var u = usersTable_().filter(function (x) { return normUser_(x.Username) === parts[0]; })[0];
  if (!u || String(u.Active).toLowerCase() === 'no' || String(u.Active) === 'false') return null;
  if (String(u['PIN Hash']).slice(0, 8).replace(/[^A-Za-z0-9]/g, 'x') !== parts[2]) return null;
  return u;
}
function publicUser_(u) {
  return { username: normUser_(u.Username), name: trim_(u.Name) || normUser_(u.Username), role: trim_(u.Role), perms: userPerms_(u), lang: trim_(u.Lang) || 'ar' };
}
function userRowIndex_(username) {
  var sh = sh_('Users'), h = headers_(sh), last = sh.getLastRow(), c = h.indexOf('Username') + 1;
  if (last < 2 || !c) return 0;
  var v = sh.getRange(2, c, last - 1, 1).getValues();
  for (var i = 0; i < v.length; i++) if (normUser_(v[i][0]) === username) return i + 2;
  return 0;
}
function setUserFields_(row, fields) {
  var sh = sh_('Users'), h = headers_(sh);
  Object.keys(fields).forEach(function (k) { var c = h.indexOf(k); if (c >= 0) sh.getRange(row, c + 1).setValue(fields[k]); });
  bustUsers_();
}
function apiLogin_(args) {
  var un = normUser_(args.username), pin = String(args.pin || '');
  if (!un || !pin) throw apiErr_('BAD_LOGIN', 'اكتب اسم المستخدم والـ PIN');
  return withLock_(function () {
    var row = userRowIndex_(un), bad = apiErr_('BAD_LOGIN', 'اسم المستخدم أو الـ PIN غلط');
    if (!row) { Utilities.sleep(400); throw bad; }
    var u = readTable_('Users')[row - 2];
    if (String(u.Active).toLowerCase() === 'no' || String(u.Active) === 'false') throw apiErr_('DISABLED', 'الحساب موقوف. كلّم الأدمن.');
    var lockedUntil = u['Locked Until'] ? new Date(u['Locked Until']).getTime() : 0;
    if (lockedUntil && lockedUntil > Date.now()) throw apiErr_('LOCKED', 'الحساب مقفول مؤقتًا بسبب محاولات غلط. جرّب بعد ' + Math.ceil((lockedUntil - Date.now()) / 60000) + ' دقيقة.');
    if (!u['PIN Hash'] || hashPin_(pin, String(u.Salt)) !== String(u['PIN Hash'])) {
      var f = num_(u.Failed) + 1, max = Number(cfg_('Auth.MaxFails', '5')) || 5, upd = { Failed: f };
      if (f >= max) { upd.Failed = 0; upd['Locked Until'] = new Date(Date.now() + (Number(cfg_('Auth.LockMinutes', '10')) || 10) * 60000); audit_(un, 'login locked', 'محاولات غلط'); }
      setUserFields_(row, upd); throw bad;
    }
    setUserFields_(row, { Failed: 0, 'Locked Until': '', 'Last Login': now_() });
    var tk = makeToken_(u); audit_(un, 'login', '');
    return { token: tk.token, exp: tk.exp, user: publicUser_(u) };
  });
}
/** إنشاء/تعديل مستخدم. newPin اختياري (reset). بيرجّع الصف الجديد */
function saveUser_(by, a) {
  var un = normUser_(a.username); if (!validUsername_(un)) throw apiErr_('BAD_INPUT', 'اسم المستخدم حروف إنجليزي صغيرة وأرقام (2–24)');
  if (a.role && !rolesMap_()[trim_(a.role).toLowerCase()]) throw apiErr_('BAD_INPUT', 'الدور "' + a.role + '" مش موجود في شيت Roles');
  if (a.newPin !== undefined && a.newPin !== '' && !validPin_(a.newPin)) throw apiErr_('BAD_INPUT', 'الـ PIN لازم 4 لـ 8 أرقام');
  return withLock_(function () {
    var row = userRowIndex_(un), isNew = !row;
    if (isNew) {
      if (!a.newPin) throw apiErr_('BAD_INPUT', 'المستخدم الجديد محتاج PIN');
      appendRows_('Users', [{ Username: un, Name: a.name || un, Role: a.role || 'viewer', 'Extra Permissions': a.extra || '', Active: 'Yes', 'PIN Hash': '', Salt: '', Failed: 0, Lang: a.lang || 'ar' }]);
      row = userRowIndex_(un);
    }
    var f = {};
    if (a.name !== undefined) f.Name = a.name; if (a.role) f.Role = a.role; if (a.extra !== undefined) f['Extra Permissions'] = a.extra;
    if (a.active !== undefined) f.Active = a.active ? 'Yes' : 'No';
    if (a.lang) f.Lang = a.lang;
    if (a.newPin) { var salt = Utilities.getUuid().slice(0, 12); f.Salt = salt; f['PIN Hash'] = hashPin_(a.newPin, salt); f.Failed = 0; f['Locked Until'] = ''; }
    // ما تسيبش النظام من غير أدمن شغال
    if ((f.Role && f.Role !== 'admin') || f.Active === 'No') {
      var cur = readTable_('Users')[row - 2], others = readTable_('Users').filter(function (x, i) { return i !== row - 2 && trim_(x.Role) === 'admin' && String(x.Active).toLowerCase() !== 'no'; });
      if (trim_(cur.Role) === 'admin' && !others.length) throw apiErr_('LAST_ADMIN', 'لازم يفضل أدمن واحد شغال على الأقل');
    }
    setUserFields_(row, f); audit_(by, isNew ? 'user create' : 'user update', un + (a.newPin ? ' (PIN reset)' : ''));
    return { username: un, created: isNew };
  });
}
function listUsers_() {
  return readTable_('Users').map(function (u) {
    return { username: normUser_(u.Username), name: trim_(u.Name), role: trim_(u.Role), extra: trim_(u['Extra Permissions']), active: !(String(u.Active).toLowerCase() === 'no' || String(u.Active) === 'false'),
      lastLogin: u['Last Login'] ? Utilities.formatDate(new Date(u['Last Login']), tz_(), 'yyyy-MM-dd HH:mm') : '', lang: trim_(u.Lang) || 'ar', locked: !!(u['Locked Until'] && new Date(u['Locked Until']).getTime() > Date.now()) };
  });
}
/** من القايمة: إنشاء/إعادة تعيين الأدمن (أول مرة) */
function menuCreateAdmin() {
  var ui = ui_(); if (!ui) return;
  var a = ui.prompt('اسم المستخدم (إنجليزي صغير، مثال: admin)', 'اكتب الاسم', ui.ButtonSet.OK_CANCEL); if (a.getSelectedButton() !== ui.Button.OK) return;
  var b = ui.prompt('PIN جديد (4 لـ 8 أرقام)', '', ui.ButtonSet.OK_CANCEL); if (b.getSelectedButton() !== ui.Button.OK) return;
  wrap_(function () {
    seedRoles_();
    var un = normUser_(a.getResponseText()), exists = userRowIndex_(un) > 0;
    saveUser_('menu', { username: un, name: un, role: exists ? undefined : 'admin', active: true, newPin: b.getResponseText().trim() });
    return { message: 'تم. المستخدم ' + un + (exists ? ' (اتغيّر الـ PIN)' : ' (أدمن جديد)') + '.' };
  });
}
function menuAppUrl() {
  var url = ''; try { url = ScriptApp.getService().getUrl(); } catch (e) {}
  alert_(url ? 'رابط الـ API (الصقه في التطبيق):\n' + url : 'لسه ما اتعملش Deploy كـ Web app. من Apps Script: Deploy ← New deployment ← Web app.');
}
