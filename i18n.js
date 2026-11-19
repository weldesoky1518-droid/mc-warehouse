/* i18n: عربي (افتراضي) / English. المفتاح → نص. الاستخدام: t('key', {n:3}) */
const I18N = {
  ar: {
    app: 'مخزن MC', login: 'تسجيل الدخول', username: 'اسم المستخدم', pin: 'الـ PIN', signin: 'دخول', logout: 'خروج', language: 'اللغة', arabic: 'العربية', english: 'English',
    home: 'الرئيسية', lookup: 'استعلام', receiving: 'الاستلام', returns: 'المرتجعات', picking: 'التحضير', exceptions: 'الاستثناءات', dashboard: 'الداشبورد', users: 'المستخدمين', settings: 'الإعدادات',
    loading: 'جاري التحميل…', retry: 'إعادة المحاولة', cancel: 'إلغاء', save: 'حفظ', close: 'إغلاق', confirm: 'تأكيد', back: 'رجوع', refresh: 'تحديث', more: 'تحميل المزيد', none: 'مفيش بيانات', yes: 'نعم', no: 'لا',
    offline: 'مفيش نت — المسح بيتخزن ويتبعت لما النت يرجع', pending: 'في الانتظار', sent: 'اتبعت', error: 'خطأ',
    api_setup: 'ربط التطبيق بالسيستم', api_url: 'رابط الـ API (Web app URL)', api_hint: 'الصق الرابط اللي بيطلع من Apps Script بعد Deploy', test_save: 'اختبار وحفظ', api_bad: 'الرابط ده مش شغال',
    scan_ph: 'امسح أو اكتب الباركود', camera: 'الكاميرا', stop_camera: 'قفل الكاميرا', torch: 'فلاش', cam_fail: 'الكاميرا مش متاحة. اسمح بالوصول أو استخدم السكانر.',
    // home
    actual: 'الفعلي', erp: 'On Hand (ERP)', shopify: 'Shopify', open_exc: 'استثناءات مفتوحة', orders: 'أوردرات', pieces: 'قطعة', picked: 'اتجهّز', held: 'واقفة', pend_returns: 'مرتجعات لسه مجتش',
    putaway_pieces: 'مرتجعات محتاجة توزيع', today: 'النهارده', received: 'استلام', sold: 'بيع', returned: 'مرتجع', no_loc: 'بدون مكان', gap_es: 'فروق ERP/Shopify', alerts: 'أصناف ناقصة للأوردرات',
    by_category: 'حسب القسم', exc_by_type: 'الاستثناءات حسب النوع', full_dash: 'الداشبورد الكامل', updated: 'آخر تحديث', no_opening: 'رصيد البداية لسه مش متسجل — أرقام "الفعلي" مش دقيقة', refresh_stock: 'تحديث المخزون',
    // lookup
    lk_ph: 'باركود / كود / اسم الصنف', lk_not_found: 'الصنف مش موجود', lk_results: 'نتيجة', location: 'المكان', location2: 'مكان تاني', category: 'القسم', season: 'السيزون', model: 'الموديل',
    pend_demand: 'مطلوب في أوردرات', returns_area: 'في منطقة المرتجعات', moves: 'آخر الحركات', adjust: 'تسوية', adj_qty: 'الكمية (+/-)', adj_reason: 'السبب', adj_done: 'اتسجلت التسوية',
    opening: 'رصيد البداية', gap_ae: 'فعلي − ERP', erp_shopify: 'ERP − Shopify',
    // receiving
    rc_pick: 'اختار إذن الاستلام', rc_code: 'كود الإذن', rc_lines: 'صنف', rc_expected: 'المتوقع', rc_scanned: 'اتسكان', rc_approved: 'معتمد', rc_open: 'مفتوح', rc_missing: 'ناقص', rc_over: 'زيادة', rc_extra: 'خارج الإذن',
    rc_all: 'الكل', rc_approve: 'اعتماد الاستلام', rc_approve_q: 'تعتمد الإذن؟ هتتسجل الحركات والفروق.', rc_done: 'اتعتمد الإذن', rc_locked: 'الإذن معتمد — مينفعش سكان', rc_no_codes: 'مفيش أذونات. الصق بيانات الإذن في الشيت.',
    st_OK: 'تمام', st_OVER: 'زيادة', st_NOT_IN_LIST: 'مش في الإذن', st_INVALID: 'باركود غلط', st_DUP: 'مكرر', st_UNKNOWN: 'باركود غير معروف', undo: 'تراجع', put_in: 'حطها في', matched: 'مرتبطة بأوردر', unmatched: 'مرتجع مش مسجّل',
    // returns
    rt_scan: 'مسح', rt_putaway: 'توزيع', rt_session: 'اتسكان في الجلسة', rt_none_put: 'مفيش حاجة محتاجة توزيع', rt_done: 'تم', rt_undo_done: 'تراجع عن التوزيع',
    // picking
    pk_all_days: 'كل الأيام', pk_open: 'لسه', pk_done: 'اتجهّز', pk_all: 'الكل', pk_filters: 'فلاتر', pk_search: 'بحث (أوردر / كود / منتج)', pk_from: 'من', pk_to: 'إلى', pk_cat: 'القسم', pk_loc: 'المكان يبدأ بـ',
    pk_status: 'الحالة', pk_hold: 'وقف الأوردر', pk_hold_reason: 'سبب الوقف', pk_hold_ok: 'اتوقف الأوردر', pk_held_tab: 'واقفة', pk_list_tab: 'القايمة', pk_release: 'رجّع للتحضير', pk_released: 'هيرجع للتحضير خلال دقيقة',
    pk_refresh: 'تحديث من Shopify', pk_refreshing: 'جاري السحب من Shopify…', pk_open_shopify: 'فتح في Shopify', pk_since: 'من', pk_days: 'يوم', pk_lines: 'سطر', pk_flags: 'تنبيه', pk_status_hold: 'واقف', pk_status_back: 'رجع للتحضير', pk_status_fulfilled: 'اتجهز', pk_status_cancelled: 'اتلغى',
    // exceptions
    ex_status: 'الحالة', ex_type: 'النوع', ex_active: 'المفتوحة', ex_all: 'الكل', ex_assigned: 'مسؤول', ex_note: 'ملاحظة', ex_expected: 'متوقع', ex_actual: 'فعلي', ex_diff: 'فرق', ex_edit: 'تعديل الاستثناء',
    // users
    us_add: 'مستخدم جديد', us_name: 'الاسم', us_role: 'الدور', us_extra: 'صلاحيات إضافية', us_active: 'شغال', us_newpin: 'PIN جديد (اتركه فاضي لو مش هتغيّره)', us_last: 'آخر دخول', us_locked: 'مقفول', us_inactive: 'موقوف',
    old_pin: 'الـ PIN الحالي', new_pin: 'الـ PIN الجديد', change_pin: 'تغيير الـ PIN', pin_changed: 'اتغيّر الـ PIN', saved: 'اتحفظ', session_end: 'الجلسة انتهت، سجّل دخول تاني',
    install: 'تثبيت التطبيق', install_hint: 'من قايمة المتصفح اختار "تثبيت التطبيق" أو "إضافة للشاشة الرئيسية".',
    no_access: 'مفيش صلاحية للشاشة دي', net_err: 'مشكلة في الاتصال بالسيستم', server_slow: 'السيستم بيرد ببطء…'
  },
  en: {
    app: 'MC Warehouse', login: 'Sign in', username: 'Username', pin: 'PIN', signin: 'Sign in', logout: 'Sign out', language: 'Language', arabic: 'العربية', english: 'English',
    home: 'Home', lookup: 'Lookup', receiving: 'Receiving', returns: 'Returns', picking: 'Picking', exceptions: 'Exceptions', dashboard: 'Dashboard', users: 'Users', settings: 'Settings',
    loading: 'Loading…', retry: 'Retry', cancel: 'Cancel', save: 'Save', close: 'Close', confirm: 'Confirm', back: 'Back', refresh: 'Refresh', more: 'Load more', none: 'No data', yes: 'Yes', no: 'No',
    offline: 'Offline — scans are stored and sent when back online', pending: 'Pending', sent: 'Sent', error: 'Error',
    api_setup: 'Connect the app', api_url: 'API URL (Web app URL)', api_hint: 'Paste the URL from Apps Script after Deploy', test_save: 'Test & save', api_bad: 'This URL does not work',
    scan_ph: 'Scan or type barcode', camera: 'Camera', stop_camera: 'Stop camera', torch: 'Torch', cam_fail: 'Camera unavailable. Allow access or use the scanner.',
    actual: 'Actual', erp: 'On Hand (ERP)', shopify: 'Shopify', open_exc: 'Open exceptions', orders: 'orders', pieces: 'pcs', picked: 'picked', held: 'On hold', pend_returns: 'Returns not yet arrived',
    putaway_pieces: 'Returns to put away', today: 'Today', received: 'Received', sold: 'Sold', returned: 'Returned', no_loc: 'No location', gap_es: 'ERP/Shopify gaps', alerts: 'Short items for orders',
    by_category: 'By category', exc_by_type: 'Exceptions by type', full_dash: 'Full dashboard', updated: 'Updated', no_opening: 'Opening balance not set yet — "Actual" is not accurate', refresh_stock: 'Refresh stock',
    lk_ph: 'Barcode / SKU / name', lk_not_found: 'Item not found', lk_results: 'results', location: 'Location', location2: 'Alt. location', category: 'Category', season: 'Season', model: 'Model',
    pend_demand: 'Needed in orders', returns_area: 'In returns area', moves: 'Recent movements', adjust: 'Adjust', adj_qty: 'Qty (+/-)', adj_reason: 'Reason', adj_done: 'Adjustment saved',
    opening: 'Opening', gap_ae: 'Actual − ERP', erp_shopify: 'ERP − Shopify',
    rc_pick: 'Choose a receiving document', rc_code: 'Document code', rc_lines: 'items', rc_expected: 'Expected', rc_scanned: 'Scanned', rc_approved: 'Approved', rc_open: 'Open', rc_missing: 'Missing', rc_over: 'Over', rc_extra: 'Not on document',
    rc_all: 'All', rc_approve: 'Approve receiving', rc_approve_q: 'Approve this document? Movements and differences will be recorded.', rc_done: 'Document approved', rc_locked: 'Approved — scanning locked', rc_no_codes: 'No documents. Paste the receiving data in the sheet.',
    st_OK: 'OK', st_OVER: 'Over', st_NOT_IN_LIST: 'Not on list', st_INVALID: 'Bad barcode', st_DUP: 'Duplicate', st_UNKNOWN: 'Unknown barcode', undo: 'Undo', put_in: 'Put in', matched: 'Linked to order', unmatched: 'Unregistered return',
    rt_scan: 'Scan', rt_putaway: 'Put away', rt_session: 'Scanned this session', rt_none_put: 'Nothing to put away', rt_done: 'Done', rt_undo_done: 'Undo put-away',
    pk_all_days: 'All days', pk_open: 'Open', pk_done: 'Picked', pk_all: 'All', pk_filters: 'Filters', pk_search: 'Search (order / code / product)', pk_from: 'From', pk_to: 'To', pk_cat: 'Category', pk_loc: 'Location starts with',
    pk_status: 'Status', pk_hold: 'Hold order', pk_hold_reason: 'Hold reason', pk_hold_ok: 'Order put on hold', pk_held_tab: 'On hold', pk_list_tab: 'List', pk_release: 'Release to picking', pk_released: 'Will return to picking within a minute',
    pk_refresh: 'Refresh from Shopify', pk_refreshing: 'Pulling from Shopify…', pk_open_shopify: 'Open in Shopify', pk_since: 'since', pk_days: 'd', pk_lines: 'lines', pk_flags: 'Flag', pk_status_hold: 'On hold', pk_status_back: 'Released', pk_status_fulfilled: 'Fulfilled', pk_status_cancelled: 'Cancelled',
    ex_status: 'Status', ex_type: 'Type', ex_active: 'Open', ex_all: 'All', ex_assigned: 'Assigned to', ex_note: 'Note', ex_expected: 'Expected', ex_actual: 'Actual', ex_diff: 'Diff', ex_edit: 'Edit exception',
    us_add: 'New user', us_name: 'Name', us_role: 'Role', us_extra: 'Extra permissions', us_active: 'Active', us_newpin: 'New PIN (leave empty to keep)', us_last: 'Last login', us_locked: 'Locked', us_inactive: 'Disabled',
    old_pin: 'Current PIN', new_pin: 'New PIN', change_pin: 'Change PIN', pin_changed: 'PIN changed', saved: 'Saved', session_end: 'Session expired, please sign in again',
    install: 'Install app', install_hint: 'From the browser menu choose "Install app" or "Add to Home screen".',
    no_access: 'No access to this screen', net_err: 'Cannot reach the system', server_slow: 'The system is slow…'
  }
};
let LANG = 'ar';
function setLang(l) { LANG = I18N[l] ? l : 'ar'; document.documentElement.lang = LANG; document.documentElement.dir = LANG === 'ar' ? 'rtl' : 'ltr'; try { localStorage.setItem('mcw:lang', LANG); } catch (e) {} }
function t(k, vars) { let s = (I18N[LANG] && I18N[LANG][k]) || I18N.ar[k] || k; if (vars) for (const x in vars) s = s.replace('{' + x + '}', vars[x]); return s; }
