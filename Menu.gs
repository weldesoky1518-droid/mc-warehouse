/** ====== Menu.gs : القايمة ====== */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('📦 المخزن')
    .addSubMenu(ui.createMenu('⏬ استيراد').addItem('On Hand (المفروض موجود)', 'menuImportOnHand').addItem('البيع والمرتجعات', 'menuImportSales').addItem('استيراد الكل + إعادة الحساب', 'importAll'))
    .addSubMenu(ui.createMenu('📥 الاستلام').addItem('تحديث بيانات الإذن', 'menuRefreshStation').addItem('✔ اعتماد الاستلام', 'menuApproveReceiving').addItem('إعادة عدّ الاستلام', 'menuRecount'))
    .addSubMenu(ui.createMenu('↩︎ المرتجعات').addItem('توزيع المرتجعات (قايمة التسكين)', 'menuReturnsPutaway').addItem('إعادة مطابقة المرتجعات', 'menuMatchReturns'))
    .addItem('🧾 تحديث قايمة التحضير', 'menuBuildPicking')
    .addSubMenu(ui.createMenu('🚚 الشحن (J&T)').addItem('استيراد تقرير J&T', 'menuImportCourier').addItem('تحديث المقارنة', 'menuReconcileCourier'))
    .addSubMenu(ui.createMenu('📍 الأماكن').addItem('تطبيق قواعد الأماكن', 'menuApplyRules').addItem('إعادة تسمية مكان', 'menuRenameLocation'))
    .addSubMenu(ui.createMenu('⚖️ التسويات ورصيد البداية').addItem('تطبيق التسويات اليدوية', 'menuApplyAdjustments').addItem('رصيد البداية من On Hand', 'openingFromOnHand').addItem('رصيد البداية من سكان المخزن', 'openingFromScan').addItem('رصيد البداية من الجرد', 'openingFromCount'))
    .addSubMenu(ui.createMenu('🤖 تليجرام و AI').addItem('ربط تليجرام', 'menuTelegramSetup').addItem('إعداد الذكاء الاصطناعي', 'menuAiSetup').addItem('إرسال التقرير الآن', 'menuSendReportNow').addItem('تفعيل بوت تليجرام التفاعلي', 'menuTelegramBot').addItem('إيقاف البوت التفاعلي', 'menuTelegramBotOff'))
    .addSeparator()
    .addItem('📊 تحديث المخزون والداشبورد', 'menuRebuild')
    .addSubMenu(ui.createMenu('🔗 Shopify').addItem('ربط Shopify (دومين + Client ID + Secret)', 'menuShopifyCredentials').addItem('اختبار الاتصال', 'menuShopifyTest').addItem('مزامنة الآن', 'menuSyncShopify').addItem('عدد طلبات اليوم', 'menuFetchCount').addItem('إيقاف المزامنة التلقائية', 'removeAutoSync'))
    .addSubMenu(ui.createMenu('👥 التطبيق والمستخدمين').addItem('إنشاء أدمن / تغيير PIN', 'menuCreateAdmin').addItem('رابط الـ API', 'menuAppUrl'))
    .addSubMenu(ui.createMenu('⚙️ إعداد').addItem('Setup (إنشاء/إصلاح الشيتات)', 'setup').addItem('فحص الصحة', 'healthCheck').addItem('نسخة احتياطية الآن', 'backupNow').addItem('تسخين التطبيق (أسرع)', 'menuKeepWarm').addItem('تبسيط الشيتات (إخفاء الفنية)', 'menuSimplifySheets').addItem('إظهار كل الشيتات', 'menuShowAllSheets'))
    .addToUi();
}
function wrap_(fn) { try { var r = fn(); if (r && r.message) alert_(r.message); } catch (e) { alert_('خطأ: ' + e.message); } }
function menuImportOnHand() { wrap_(function () { var r = importOnHand(); rebuildAll(); return r; }); }
function menuImportSales() { wrap_(function () { var r = importSales(); rebuildAll(); return r; }); }
function menuRefreshStation() { wrap_(refreshReceivingStation); }
function menuRecount() { wrap_(recountStation); }
function menuReturnsPutaway() { wrap_(buildReturnsPutaway); }
function menuMatchReturns() { wrap_(function () { var r = matchReturns_(); refreshDashboard_(); return r; }); }
function menuBuildPicking() { wrap_(function () { var r = buildPicking(); refreshDashboard_(); return r; }); }
function menuApplyRules() { wrap_(function () { var r = applyLocationRules(); rebuildAll(); return r; }); }
function menuRenameLocation() {
  var ui = SpreadsheetApp.getUi();
  var a = ui.prompt('اسم المكان الحالي (زي ما هو في Locations)'), b = ui.prompt('الاسم الجديد');
  wrap_(function () { return renameLocation_(a.getResponseText(), b.getResponseText()); });
}
function menuApplyAdjustments() { wrap_(function () { var n = applyAdjustments_(); rebuildAll(); return { message: 'اتطبّقت ' + n + ' تسوية.' }; }); }
function menuRebuild() { wrap_(function () { rebuildAll(); return { message: 'تم تحديث المخزون والداشبورد.' }; }); }
function menuSyncShopify() {
  wrap_(function () {
    var r = syncShopifyInventory();
    if (r.partial) return { message: 'اتسحب ' + r.rows + ' صنف لحد دلوقتي. المزامنة هتكمّل لوحدها كل دقيقة. متشغلهاش تاني.' };
    syncShopifyOrders(30); rebuildAll(); return { message: 'تمت مزامنة Shopify (' + r.rows + ' صنف).' };
  });
}
function menuFetchCount() { alert_('طلبات Shopify النهارده: ' + fetchesToday() + ' من حد الأمان ' + DAILY_FETCH_LIMIT + ' (حد جوجل 20,000)'); }

function menuKeepWarm() { wrap_(function () { installKeepWarm_(); return { message: 'اتفعّل التسخين: التطبيق هيفضل صاحي ومش هيبطّأ بعد فترة السكون.' }; }); }

function menuImportCourier() { wrap_(importCourier); }
function menuReconcileCourier() { wrap_(reconcileCourier_); }
