/* التحضير (فلتر بالأيام) + الأوردرات الواقفة + الاستثناءات */
Routes.picking = { icon: 'list', label: 'picking', perm: 'picking', view(main, tab) { return tab === 'held' ? pickingHeld(main) : pickingList(main); } };

function pickingList(main) {
  const F = store.get('pk:f', { from: '', to: '', category: '', location: '', status: 'open', q: '' }); let offset = 0, data = null, showF = false;
  const sumBox = h('div'), dayBox = h('div', { class: 'chips days' }), fBox = h('div'), listBox = h('div');
  const tabs = h('div', { class: 'seg tabs' }, h('a', { class: 'on', href: '#/picking' }, t('pk_list_tab')), can('hold') ? h('a', { href: '#/picking/held' }, t('pk_held_tab')) : null);
  main.append(pageHead(t('picking'), can('sync') ? h('button', { class: 'btn small', id: 'pk-refresh', onclick: refreshShopify }, icon('refresh', 16), ' ', t('pk_refresh')) : null), tabs, sumBox, dayBox, fBox, listBox);
  const pendingDone = {}; let flushT;
  async function load(more) {
    if (!more) { offset = 0; listBox.replaceChildren(spinner()); }
    try {
      const d = await api('pickingList', Object.assign({}, F, { offset, limit: 300 })); if (more && data) { data.rows = data.rows.concat(d.rows); Object.assign(data, { total: d.total }); } else data = d; offset = data.rows.length; draw();
    } catch (e) { listBox.replaceChildren(errorBox(e, () => load())); }
  }
  async function refreshShopify(ev) {
    const btn = ev.currentTarget; await busy(btn, async () => { toast(t('pk_refreshing'), '', 4000); const r = await api('pickingRefresh', {}, { timeout: 280000 }); toast(r.message, r.partial ? 'warn' : 'ok', 7000); load(); });
  }
  function setF(p) { Object.assign(F, p); store.set('pk:f', F); load(); }
  function draw() {
    sumBox.replaceChildren(h('div', { class: 'row3 sum' }, mini2(t('orders'), data.orders), mini2(t('pieces'), data.pieces), mini2(t('pk_open'), data.openPieces)));
    const single = F.from && F.from === F.to;
    dayBox.replaceChildren(h('button', { class: 'chip-b' + (!F.from && !F.to ? ' on' : ''), onclick: () => setF({ from: '', to: '' }) }, t('pk_all_days')),
      data.days.map(d => h('button', { class: 'chip-b' + (single && F.from === d.date ? ' on' : ''), onclick: () => setF({ from: d.date, to: d.date }) }, d.date.slice(5), h('small', null, ' ' + d.open + '/' + d.pieces))));
    fBox.replaceChildren(h('div', { class: 'filters' }, h('input', { class: 'inp', type: 'search', placeholder: t('pk_search'), value: F.q, onchange: e => setF({ q: e.target.value }), 'aria-label': t('pk_search') }),
      h('select', { class: 'inp sm', onchange: e => setF({ status: e.target.value }), 'aria-label': t('pk_status') }, [['open', t('pk_open')], ['done', t('pk_done')], ['all', t('pk_all')]].map(o => h('option', { value: o[0], selected: F.status === o[0] }, o[1]))),
      ),
      h('div', { class: 'filters row2' }, h('button', { class: 'btn small', onclick: () => { showF = !showF; draw(); } }, icon('filter', 16), ' ', t('pk_filters')),
        h('div', { class: 'seg mini-seg' }, ['cards', 'route'].map(m => h('button', { class: store.get('pk:mode', 'cards') === m ? 'on' : '', onclick: () => { store.set('pk:mode', m); draw(); } }, t('pk_view_' + m))))),
      showF ? h('div', { class: 'filters adv' }, lab(t('pk_from'), h('input', { class: 'inp', type: 'date', value: F.from, onchange: e => setF({ from: e.target.value }) })), lab(t('pk_to'), h('input', { class: 'inp', type: 'date', value: F.to, onchange: e => setF({ to: e.target.value }) })),
        lab(t('pk_cat'), h('select', { class: 'inp', onchange: e => setF({ category: e.target.value }) }, h('option', { value: '' }, t('pk_all')), data.categories.map(c => h('option', { value: c, selected: F.category === c }, c)))),
        lab(t('pk_loc'), h('input', { class: 'inp', value: F.location, dir: 'ltr', onchange: e => setF({ location: e.target.value }) }))) : null);
    if (!data.rows.length) return listBox.replaceChildren(h('div', { class: 'card empty' }, t('none')));
    const mode = store.get('pk:mode', 'cards'), pageEl = [];
    if (mode === 'route') {
      let lastDay = '';
      data.rows.forEach(r => { if (r.date !== lastDay) { pageEl.push(h('div', { class: 'day-h' }, r.date)); lastDay = r.date; } pageEl.push(lineRow(r, true)); });
      listBox.replaceChildren(h('div', { class: 'pk-list card' }, pageEl), moreBtn());
    } else {
      const groups = [], idx = {};
      data.rows.forEach(r => { const k = r.date + '|' + r.order; if (idx[k] === undefined) { idx[k] = groups.length; groups.push({ date: r.date, order: r.order, oid: r.oid, cust: r.cust, rows: [] }); } groups[idx[k]].rows.push(r); });
      let lastDay = '';
      groups.forEach(g => { if (g.date !== lastDay) { pageEl.push(h('div', { class: 'day-h' }, g.date)); lastDay = g.date; } pageEl.push(orderCard(g)); });
      listBox.replaceChildren(h('div', { class: 'pk-cards' }, pageEl), moreBtn());
    }
  }
  const moreBtn = () => data.rows.length < data.total ? h('button', { class: 'btn block', onclick: () => load(true) }, t('more') + ' (' + data.rows.length + '/' + data.total + ')') : null;
  const shopUrl = (oid, num) => data.handle ? 'https://admin.shopify.com/store/' + data.handle + '/orders' + (oid ? '/' + oid : '?query=' + encodeURIComponent(num)) : '';
  function lineRow(r, showOrder) {
    return h('div', { class: 'pk' + (r.done ? ' done' : '') + (r.flags ? ' flag' : ''), 'data-k': r.k },
      h('button', { class: 'chk' + (r.done ? ' on' : ''), role: 'checkbox', 'aria-checked': String(r.done), 'aria-label': r.title, onclick: e => toggle(r, e.currentTarget) }, r.done ? icon('check', 22) : null),
      h('div', { class: 'pk-main' }, h('div', { class: 'pk-t' }, h('b', null, r.title), ' ', h('span', { class: 'muted' }, r.cs)),
        h('div', { class: 'muted small ltr' }, r.sku + ' · ' + r.upc + (showOrder ? '' : '')),
        showOrder ? h('div', { class: 'ord-tag ltr' }, '#' + r.order, ' ', h('small', { class: 'muted' }, r.cust)) : null, r.flags ? h('div', { class: 'flag-t' }, r.flags) : null),
      h('div', { class: 'pk-side' }, h('span', { class: 'qty big' + (r.qty > 1 ? ' multi' : '') }, '×' + r.qty), h('span', { class: 'loc' }, r.loc), h('span', { class: 'muted small' }, r.cat)),
      h('button', { class: 'icon-btn', 'aria-label': 'more', onclick: () => rowMenu(r) }, icon('more', 18)));
  }
  function orderCard(g) {
    const rows = g.rows.slice().sort((x, y) => String(x.loc).localeCompare(String(y.loc), 'en', { numeric: true }));
    const card = h('section', { class: 'ocard' }), bar = h('i'), cnt = h('span', { class: 'o-cnt' }), allBtn = h('button', { class: 'btn small primary', onclick: e => markAll(e.currentTarget) });
    const url = shopUrl(g.oid, g.order);
    const head = h('header', { class: 'o-head' },
      h('div', { class: 'o-title' }, h('b', { class: 'o-num ltr' }, '#' + g.order), g.cust ? h('span', { class: 'muted o-cust' }, g.cust) : null),
      h('div', { class: 'o-acts' }, url ? h('a', { class: 'btn small', target: '_blank', rel: 'noopener', href: url, 'aria-label': t('pk_open_shopify') }, icon('ext', 16), ' Shopify') : null,
        h('button', { class: 'icon-btn', 'aria-label': 'more', onclick: () => rowMenu(rows[0], true) }, icon('more', 18))),
      h('div', { class: 'o-prog' }, h('div', { class: 'o-bar' }, bar), cnt, allBtn));
    const body = h('div', { class: 'o-body' }, rows.map(r => lineRow(r, false)));
    card.append(head, body);
    function refresh() {
      const done = rows.filter(r => r.done).length, tot = rows.length, pcs = rows.reduce((a, r) => a + r.qty, 0);
      bar.style.width = Math.round(done / tot * 100) + '%'; cnt.textContent = done + '/' + tot + ' · ' + pcs + ' ' + t('pieces');
      card.classList.toggle('all-done', done === tot); allBtn.textContent = done === tot ? t('pk_undo_order') : t('pk_done_order');
    }
    g.refresh = refresh; rows.forEach(r => r._card = g); refresh();
    function markAll(btn) {
      const want = !rows.every(r => r.done);
      rows.forEach((r, i) => { if (r.done !== want) { r.done = want; pendingDone[r.k] = want; } });
      body.replaceChildren(...rows.map(r => lineRow(r, false))); refresh(); beep('ok'); clearTimeout(flushT); flushT = setTimeout(flush, 700);
    }
    return card;
  }
  const lab = (l, el) => h('label', { class: 'f' }, h('span', null, l), el);
  const mini2 = (l, v) => h('div', { class: 'mini' }, h('div', { class: 'mini-v' }, fmt(v)), h('div', { class: 'mini-l' }, l));
  function toggle(r, btn) {
    r.done = !r.done; btn.classList.toggle('on', r.done); btn.replaceChildren(...(r.done ? [icon('check', 22)] : [])); btn.parentNode.classList.toggle('done', r.done); beep('ok');
    pendingDone[r.k] = r.done; if (r._card) r._card.refresh(); clearTimeout(flushT); flushT = setTimeout(flush, 700);
  }
  async function flush() {
    const ks = Object.keys(pendingDone); if (!ks.length) return; const yes = ks.filter(k => pendingDone[k]), no = ks.filter(k => !pendingDone[k]); ks.forEach(k => delete pendingDone[k]);
    try { if (yes.length) await api('pickingDone', { keys: yes, done: true }); if (no.length) await api('pickingDone', { keys: no, done: false }); }
    catch (e) { yes.forEach(k => pendingDone[k] = true); no.forEach(k => pendingDone[k] = false); toast(e.message, 'bad'); flushT = setTimeout(flush, 5000); }
  }
  function rowMenu(r, orderOnly) {
    const reason = h('textarea', { class: 'inp', rows: 2, placeholder: t('pk_hold_reason') });
    const shop = data.handle ? h('a', { class: 'btn', target: '_blank', rel: 'noopener', href: shopUrl(r.oid, r.order) }, icon('ext', 16), ' ', t('pk_open_shopify')) : null;
    modal('#' + r.order, h('div', { class: 'form' }, orderOnly ? null : h('div', null, h('b', null, r.title), ' ', r.cs), orderOnly ? null : h('div', { class: 'muted ltr' }, r.sku + ' · ' + r.upc), orderOnly ? null : h('div', null, h('span', { class: 'loc' }, r.loc), r.loc2 ? ' ' + r.loc2 : ''), shop, orderOnly ? null : h('a', { class: 'btn', href: '#/lookup/' + r.upc, onclick: () => { document.querySelector('.modal-back').remove(); } }, icon('search', 16), ' ', t('lookup')),
      can('hold') ? h('div', { class: 'form' }, h('h4', null, t('pk_hold')), reason) : null),
      close => can('hold') ? [h('button', { class: 'btn', onclick: close }, t('close')), h('button', { class: 'btn danger', onclick: e => busy(e.currentTarget, async () => { await api('holdOrders', { orders: [r.order], reason: reason.value }); toast(t('pk_hold_ok'), 'ok'); close(); load(); }) }, icon('pause', 16), ' ', t('pk_hold'))] : [h('button', { class: 'btn', onclick: close }, t('close'))]);
  }
  load();
  return () => { clearTimeout(flushT); flush(); };
}

function pickingHeld(main) {
  const box = h('div'); main.append(pageHead(t('picking')), h('div', { class: 'seg tabs' }, h('a', { href: '#/picking' }, t('pk_list_tab')), h('a', { class: 'on', href: '#/picking/held' }, t('pk_held_tab'))), box);
  const sTone = { 'واقف': 'warn', 'رجع للتحضير': 'brand', 'اتجهز': 'ok', 'اتلغى': 'bad' }, sKey = { 'واقف': 'pk_status_hold', 'رجع للتحضير': 'pk_status_back', 'اتجهز': 'pk_status_fulfilled', 'اتلغى': 'pk_status_cancelled' };
  async function load() {
    box.replaceChildren(spinner());
    try {
      const r = await api('holdList'); if (!r.rows.length) return box.replaceChildren(h('div', { class: 'card empty' }, t('none')));
      box.replaceChildren(h('div', { class: 'list card' }, r.rows.map(x => h('div', { class: 'li static' }, h('div', { class: 'li-main' }, h('b', { class: 'ltr' }, '#' + x.order), h('div', null, x.reason || '—'), h('div', { class: 'muted small' }, t('pk_since') + ' ' + x.heldAt + (x.age !== '' ? ' · ' + x.age + ' ' + t('pk_days') : ''))),
        h('div', { class: 'li-side' }, badge(t(sKey[x.status] || 'pk_status_hold'), sTone[x.status] || ''), x.status === 'واقف' ? h('button', { class: 'btn small', onclick: e => busy(e.currentTarget, async () => { await api('releaseOrders', { orders: [x.order] }); toast(t('pk_released'), 'ok'); load(); }) }, t('pk_release')) : null)))));
    } catch (e) { box.replaceChildren(errorBox(e, load)); }
  }
  load();
}

Routes.exceptions = { icon: 'alert', label: 'exceptions', perm: 'exceptions', view(main) {
  const F = { status: 'active', type: '' }, box = h('div'), fBox = h('div'); main.append(pageHead(t('exceptions')), fBox, box); let data;
  const tone = s => s === 'Closed' ? 'ok' : s === 'Open' ? 'bad' : 'warn';
  async function load() { box.replaceChildren(spinner()); try { data = await api('exceptionsList', F); draw(); } catch (e) { box.replaceChildren(errorBox(e, load)); } }
  function draw() {
    fBox.replaceChildren(h('div', { class: 'filters' }, h('select', { class: 'inp sm', onchange: e => { F.status = e.target.value; load(); } }, h('option', { value: 'active', selected: F.status === 'active' }, t('ex_active')), h('option', { value: 'all', selected: F.status === 'all' }, t('ex_all')), data.statuses.map(s => h('option', { value: s, selected: F.status === s }, s))),
      h('select', { class: 'inp sm', onchange: e => { F.type = e.target.value; load(); } }, h('option', { value: '' }, t('ex_type') + ': ' + t('ex_all')), data.types.map(s => h('option', { value: s, selected: F.type === s }, s)))));
    if (!data.rows.length) return box.replaceChildren(h('div', { class: 'card empty' }, t('none')));
    box.replaceChildren(h('div', { class: 'list card' }, data.rows.map(x => h('button', { class: 'li', onclick: () => edit(x) }, h('div', { class: 'li-main' }, h('b', null, x.type), h('div', { class: 'muted small' }, (x.title || x.upc) + ' · ' + x.ref + ' · ' + x.date), x.note ? h('div', { class: 'small' }, x.note) : null),
      h('div', { class: 'li-side' }, badge(x.status, tone(x.status)), h('small', { class: 'ltr' }, x.expected + ' → ' + x.actual + ' (' + (x.diff > 0 ? '+' : '') + x.diff + ')'), x.assigned ? h('small', { class: 'muted' }, '@' + x.assigned) : null)))));
  }
  function edit(x) {
    const st = h('select', { class: 'inp' }, data.statuses.map(s => h('option', { value: s, selected: x.status === s }, s))), as = h('input', { class: 'inp', placeholder: t('ex_assigned'), value: x.assigned, dir: 'ltr' }), nt = h('textarea', { class: 'inp', rows: 3, placeholder: t('ex_note') }, x.note);
    modal(t('ex_edit'), h('div', { class: 'form' }, h('div', null, h('b', null, x.type), ' · ', x.title || x.upc), h('div', { class: 'muted ltr small' }, x.upc + ' · ' + x.ref + ' · ' + x.date), h('div', { class: 'row3' }, ['ex_expected', x.expected, 'ex_actual', x.actual, 'ex_diff', x.diff].reduce((a, v, i, arr) => i % 2 ? a : a.concat([h('div', { class: 'mini' }, h('div', { class: 'mini-v' }, fmt(arr[i + 1])), h('div', { class: 'mini-l' }, t(v)))]), [])), st, as, nt),
      close => [h('button', { class: 'btn', onclick: close }, t('cancel')), h('button', { class: 'btn primary', onclick: e => busy(e.currentTarget, async () => { await api('exceptionUpdate', { id: x.id, ref: x.ref, upc: x.upc, status: st.value, assigned: as.value, note: nt.value }); toast(t('saved'), 'ok'); close(); load(); }) }, t('save'))]);
  }
  load();
} };

/* ---- الأداء والسرعة ---- */
const fmtDur = sec => sec === null || sec === undefined ? '—' : sec < 60 ? sec + ' ' + t('u_sec') : Math.floor(sec / 60) + ' ' + t('u_min') + (sec % 60 ? ' ' + (sec % 60) + ' ' + t('u_sec') : '');
Routes.performance = { icon: 'chart', label: 'performance', perm: 'performance', view(main) {
  let days = store.get('perf:days', 7); const box = h('div'), chips = h('div', { class: 'chips' });
  main.append(pageHead(t('performance')), chips, box);
  const drawChips = () => chips.replaceChildren(...[[1, t('today')], [7, t('d7')], [30, t('d30')]].map(x => h('button', { class: 'chip-b' + (days === x[0] ? ' on' : ''), onclick: () => { days = x[0]; store.set('perf:days', days); drawChips(); load(); } }, x[1])));
  const mini = (l, v) => h('div', { class: 'mini' }, h('div', { class: 'mini-v' }, v), h('div', { class: 'mini-l' }, l));
  const hbar = (label, v, mx, extra) => h('div', { class: 'bars' }, h('div', { class: 'bars-l' }, label), h('div', { class: 'bars-b' }, h('div', { class: 'bar a' + (extra || ''), style: { width: Math.max(2, v / mx * 100) + '%' } }, h('span', null, fmt(v)))));
  async function load() {
    box.replaceChildren(spinner());
    try {
      const d = await api('performance', { days }); box.replaceChildren();
      if (!d.hasData) box.append(h('div', { class: 'banner warn' }, t('perf_nodata')));
      else {
        box.append(h('div', { class: 'row3 sum' }, mini(t('orders'), fmt(d.totals.orders)), mini(t('pieces'), fmt(d.totals.pieces)), mini(t('avg_order'), fmtDur(d.totals.avgOrderSec))));
        box.append(h('div', { class: 'card' }, h('h3', null, t('per_picker')), h('div', { class: 'ptbl' },
          h('div', { class: 'ptr head' }, h('span', null, t('picker')), h('span', null, t('orders')), h('span', null, t('pieces')), h('span', null, t('avg_order')), h('span', null, t('pcs_hr'))),
          d.users.map(u => h('div', { class: 'ptr' }, h('b', { class: 'ltr' }, u.user), h('span', null, fmt(u.orders)), h('span', null, fmt(u.pieces)), h('span', null, fmtDur(u.avgOrderSec)), h('span', null, u.piecesPerHour === null ? '—' : u.piecesPerHour)))), h('div', { class: 'muted small' }, t('perf_note'))));
        const mxd = Math.max.apply(null, d.days.map(x => x.pieces).concat([1])); if (d.days.length) box.append(h('div', { class: 'card' }, h('h3', null, t('per_day')), d.days.map(x => hbar(x.date.slice(5) + ' · ' + x.orders + ' ' + t('orders'), x.pieces, mxd))));
        const hs = d.hours.filter(x => x.pieces > 0), mxh = Math.max.apply(null, d.hours.map(x => x.pieces).concat([1])); if (hs.length) box.append(h('div', { class: 'card' }, h('h3', null, t('per_hour')), hs.map(x => hbar(String(x.hour).padStart(2, '0') + ':00', x.pieces, mxh))));
      }
      const sp = d.speed || []; box.append(h('div', { class: 'card' }, h('h3', null, t('sys_speed')), sp.length ? sp.map(x => h('div', { class: 'ptr' + (x.avg > 3000 ? ' slow' : '') }, h('b', { class: 'ltr' }, x.action), h('span', null, x.n + '×'), h('span', null, x.avg + ' ms'), h('span', { class: 'muted' }, 'max ' + x.max))) : h('div', { class: 'muted' }, t('none')), h('div', { class: 'muted small' }, t('speed_note'))));
    } catch (e) { box.replaceChildren(errorBox(e, load)); }
  }
  drawChips(); load();
} };

/* ---- اعتماد التسويات ---- */
Routes.adjustments = { icon: 'check', label: 'adjustments', perm: 'adjust_approve', view(main) {
  const box = h('div'); main.append(pageHead(t('adjustments')), box);
  async function load() {
    box.replaceChildren(spinner());
    try {
      const d = await api('adjustPending'); if (!d.rows.length) return box.replaceChildren(h('div', { class: 'card empty' }, t('adj_none')));
      const decide = (r, ok, btn) => busy(btn, async () => { await api('adjustDecide', { ids: [r.id], approve: ok }); toast(ok ? t('adj_approved') : t('adj_rejected'), ok ? 'ok' : 'warn'); load(); });
      box.replaceChildren(h('div', { class: 'list card' }, d.rows.map(r => h('div', { class: 'li static adj' }, h('div', { class: 'li-main' }, h('b', null, r.title || r.upc), h('div', { class: 'muted small ltr' }, r.upc + ' · ' + r.date), h('div', null, r.reason), h('div', { class: 'muted small' }, t('adj_by') + ' @' + r.by)),
        h('div', { class: 'li-side' }, h('span', { class: 'qty big ' + (r.qty < 0 ? 'neg' : 'pos') }, (r.qty > 0 ? '+' : '') + r.qty), h('button', { class: 'btn small primary', onclick: e => decide(r, true, e.currentTarget) }, t('approve')), h('button', { class: 'btn small danger', onclick: e => decide(r, false, e.currentTarget) }, t('reject')))))));
    } catch (e) { box.replaceChildren(errorBox(e, load)); }
  }
  load();
} };

/* ---- تشغيل ---- */
boot();
