/* الرئيسية + الاستعلام + الإعدادات + المستخدمين */
function stat(label, value, sub, tone, href) {
  const el = h(href ? 'a' : 'div', { class: 'stat ' + (tone || ''), href: href || null }, h('div', { class: 'stat-l' }, label), h('div', { class: 'stat-v' }, value), sub ? h('div', { class: 'stat-s' }, sub) : null);
  return el;
}
function pageHead(title, ...right) { return h('div', { class: 'page-h' }, h('h2', null, title), h('div', { class: 'page-h-r' }, right)); }
function spinner(msg) { return h('div', { class: 'loading' }, h('div', { class: 'spin' }), h('span', null, msg || t('loading'))); }
function errorBox(e, retry) { return h('div', { class: 'card err-card' }, h('p', null, e.message), retry ? h('button', { class: 'btn', onclick: retry }, t('retry')) : null); }
function badge(text, tone) { return h('span', { class: 'badge ' + (tone || '') }, text); }

Routes.home = { icon: 'home', label: 'home', perm: 'home', view(main) {
  const shBox = h('div', { class: 'muted small sh-line' });
  async function shStatus() { try { const s = await api('shopifyStatus'); shBox.textContent = s.running ? t('hm_sh_running') + ' (' + fmt(s.count) + ')' : (s.last ? t('hm_sh_last') + ': ' + s.last : ''); } catch (e) {} }
  async function shRefresh(e) { await busy(e.currentTarget, async () => { toast(t('hm_sh_running'), '', 4000); const r = await api('shopifyRefresh', {}, { timeout: 290000 }); toast(r.message, r.partial ? 'warn' : 'ok', 7000); shStatus(); load(); }); }
  const box = h('div'); main.append(pageHead(t('home'), can('sync') ? h('button', { class: 'btn small', onclick: shRefresh }, icon('refresh', 16), ' ', t('hm_sh_refresh')) : null, can('sync') ? h('button', { class: 'btn small', onclick: async e => { await busy(e.currentTarget, () => api('refreshStock', {}, { timeout: 280000 })); toast(t('saved'), 'ok'); load(); } }, icon('refresh', 16), ' ', t('refresh_stock')) : null), shBox, box);
  shStatus();
  async function load() {
    const cached = store.get('cache:home', null); if (cached) draw(cached); else box.replaceChildren(spinner());   // نعرض آخر نسخة فورًا ونحدّث في الخلفية
    try { const m = await api('home'); store.set('cache:home', m); draw(m); } catch (e) { if (!cached) box.replaceChildren(errorBox(e, load)); }
  }
  function draw(m) {
    {
      box.replaceChildren();
      if (!m.opening) box.append(h('div', { class: 'banner warn' }, t('no_opening')));
      box.append(h('div', { class: 'grid stats' },
        stat(t('actual') + ' · ' + t('hm_pieces'), m.opening ? fmt(m.actual) : '—', m.opening && m.actualItems !== null ? fmt(m.actualItems) + ' ' + t('hm_items') : null, 'brand'),
        stat(t('erp') + ' · ' + t('hm_pieces'), fmt(m.erp), fmt(m.erpItems) + ' ' + t('hm_items'), '', can('compare') ? '#/compare' : null),
        stat(t('shopify') + ' · ' + t('hm_pieces'), fmt(m.shopifyAll), fmt(m.shopifyVariants) + ' ' + t('hm_variants') + ' · ' + t('hm_matched') + ': ' + fmt(m.shopify), '', can('compare') ? '#/compare' : null),
        stat(t('hm_ready'), fmt(m.readyOrders), null, m.readyOrders ? 'ok' : '', can('picking') ? '#/picking' : null), stat(t('hm_short'), fmt(m.shortOrders), null, m.shortOrders ? 'bad' : 'ok', can('picking') ? '#/picking' : null),
        stat(t('hm_reorder'), fmt(m.reorderCount), null, m.reorderCount ? 'warn' : '', can('compare') ? '#/compare/reorder' : null), m.accuracy !== null && m.accuracy !== undefined ? stat(t('hm_acc'), m.accuracy + '%', null, m.accuracy >= 98 ? 'ok' : 'warn') : null,
        stat(t('open_exc'), fmt(m.openExc), null, m.openExc ? 'warn' : 'ok', can('exceptions') ? '#/exceptions' : null),
        stat(t('picking'), fmt(m.orders) + ' ' + t('orders'), fmt(m.pickedPieces) + '/' + fmt(m.pieces) + ' ' + t('pieces') + ' ' + t('picked'), '', can('picking') ? '#/picking' : null),
        stat(t('held'), fmt(m.held), null, m.held ? 'warn' : '', can('picking') ? '#/picking/held' : null),
        stat(t('pend_returns'), fmt(m.pendPieces), fmt(m.pendOrders) + ' ' + t('orders')),
        stat(t('putaway_pieces'), fmt(m.putawayPieces), null, m.putawayPieces ? 'warn' : '', can('putaway') ? '#/returns/putaway' : null),
        stat(t('no_loc'), fmt(m.noLoc), t('hm_items'), m.noLoc ? 'warn' : 'ok'), stat(t('gap_es'), fmt(m.gapES), t('hm_items'), m.gapES ? 'warn' : 'ok', can('compare') ? '#/compare' : null), stat(t('alerts'), fmt(m.alerts), t('hm_items'), m.alerts ? 'bad' : 'ok')));
      box.append(h('div', { class: 'card' }, h('h3', null, t('today')), h('div', { class: 'row3' }, mini(t('received'), m.recvToday), mini(t('sold'), m.soldToday), mini(t('returned'), m.retToday))));
      if (m.catRows && m.catRows.length) {
        const mx = Math.max.apply(null, m.catRows.map(r => Math.max(r[1], r[2], r[3], 1)));
        box.append(h('div', { class: 'card' }, h('h3', null, t('by_category')), h('div', { class: 'legend' }, h('i', { class: 'k a' }), t('actual'), h('i', { class: 'k e' }), 'ERP', h('i', { class: 'k s' }), 'Shopify'),
          m.catRows.map(r => h('div', { class: 'bars' }, h('div', { class: 'bars-l' }, r[0]), h('div', { class: 'bars-b' }, bar('a', r[1], mx), bar('e', r[2], mx), bar('s', r[3], mx))))));
      }
      if (m.excRows && m.excRows.length) { const mx = Math.max.apply(null, m.excRows.map(r => r[1])); box.append(h('div', { class: 'card' }, h('h3', null, t('exc_by_type')), m.excRows.map(r => h('div', { class: 'bars' }, h('div', { class: 'bars-l' }, r[0]), h('div', { class: 'bars-b' }, bar('w', r[1], mx))))));}
      box.append(h('div', { class: 'foot-note' }, t('updated') + ': ' + m.updated), App.lookerUrl && can('dashboard') ? h('a', { class: 'btn primary', href: App.lookerUrl, target: '_blank', rel: 'noopener' }, icon('chart', 18), ' ', t('full_dash')) : null);
    }
  }
  function mini(l, v) { return h('div', { class: 'mini' }, h('div', { class: 'mini-v' }, fmt(v)), h('div', { class: 'mini-l' }, l)); }
  function bar(k, v, mx) { return h('div', { class: 'bar ' + k, style: { width: Math.max(2, v / mx * 100) + '%' }, title: fmt(v) }, h('span', null, fmt(v))); }
  load();
} };

Routes.lookup = { icon: 'search', label: 'lookup', perm: 'lookup', view(main, param) {
  const out = h('div'); const sp = scanPanel({ placeholder: t('lk_ph'), onScan: q => run(q) });
  main.append(pageHead(t('lookup')), sp.el, out);
  async function run(q) {
    out.replaceChildren(spinner());
    try {
      const r = await api('lookup', { q });
      if (r.notFound) { beep('bad'); out.replaceChildren(h('div', { class: 'card empty' }, t('lk_not_found') + ': ' + q)); return; }
      beep('ok'); out.replaceChildren();
      if (r.detail) out.append(detail(r.detail));
      if (!r.detail || r.total > 1) out.append(h('div', { class: 'card' }, h('div', { class: 'muted' }, r.total + ' ' + t('lk_results')), h('div', { class: 'list' }, r.matches.map(m => h('button', { class: 'li', onclick: () => run(m.upc) },
        h('div', { class: 'li-main' }, h('b', null, m.title || m.sku), h('div', { class: 'muted ltr' }, m.sku + ' · ' + m.upc)), h('div', { class: 'li-side' }, h('span', { class: 'loc' }, m.location || '—'), h('small', null, 'ERP ' + fmt(m.erp))))))));
    } catch (e) { out.replaceChildren(errorBox(e)); }
  }
  function detail(d) {
    const kv = (k, v, tone) => h('div', { class: 'kv ' + (tone || '') }, h('div', { class: 'kv-k' }, k), h('div', { class: 'kv-v' }, v));
    const gap = d.gapActualErp;
    return h('div', { class: 'card detail' }, d.notInErp ? h('div', { class: 'banner warn' }, t('not_in_erp')) : null, h('div', { class: 'detail-h' }, h('div', null, h('h3', null, d.title || d.sku), h('div', { class: 'muted ltr' }, d.sku + ' · ' + d.upc)),
      h('div', { class: 'bigloc' }, h('small', null, t('location')), h('b', null, d.location || '—'), d.location2 ? h('small', null, t('location2') + ': ' + d.location2) : null)),
      h('div', { class: 'grid kvs' }, kv(t('actual'), d.hasOpening ? fmt(d.actual) : '—', 'brand'), kv(t('erp'), fmt(d.erp)), kv(t('shopify'), fmt(d.shopify)),
        kv(t('pend_demand'), fmt(d.pendingDemand), d.pendingDemand > (d.actual || 0) && d.hasOpening ? 'bad' : ''), kv(t('returns_area'), fmt(d.returnsArea)),
        kv(t('gap_ae'), d.hasOpening && gap !== null ? fmt(gap) : '—', d.hasOpening && gap ? 'warn' : ''), kv(t('erp_shopify'), fmt(d.erpShopify), d.erpShopify ? 'warn' : '')),
      h('div', { class: 'muted small' }, [d.category && t('category') + ': ' + d.category, d.season && t('season') + ': ' + d.season, d.model && t('model') + ': ' + d.model, d.rule && '(' + d.rule + ')'].filter(Boolean).join('  ·  ')),
      h('div', { class: 'muted small' }, [t('opening') + ' ' + fmt(d.opening), '+' + fmt(d.received) + ' ' + t('received'), '−' + fmt(d.sold) + ' ' + t('sold'), '+' + fmt(d.returned) + ' ' + t('returned'), fmt(d.adjust) + ' adj'].join('  ·  ')),
      can('adjust') ? h('button', { class: 'btn small', onclick: () => adjust(d) }, t('adjust')) : null,
      d.movements.length ? h('div', null, h('h4', null, t('moves')), h('div', { class: 'tbl' }, d.movements.map(m => h('div', { class: 'tr' }, h('span', { class: 'ltr' }, m.time), h('b', null, m.type), h('span', { class: m.qty < 0 ? 'neg' : 'pos' }, (m.qty > 0 ? '+' : '') + m.qty), h('span', { class: 'muted' }, m.reason || m.ref))))) : null);
  }
  function adjust(d) {
    const q = h('input', { class: 'inp', type: 'number', inputmode: 'numeric', placeholder: t('adj_qty'), dir: 'ltr' }), r = h('input', { class: 'inp', placeholder: t('adj_reason') });
    modal(t('adjust') + ' · ' + (d.sku || d.upc), h('div', { class: 'form' }, q, r), close => [h('button', { class: 'btn', onclick: close }, t('cancel')), h('button', { class: 'btn primary', onclick: async e => { await busy(e.currentTarget, async () => { const x = await api('adjustAdd', { upc: d.upc, qty: Number(q.value), reason: r.value }); toast(x.message || t('adj_done'), x.pending ? 'warn' : 'ok'); close(); }); } }, t('save'))]);
  }
  if (param) run(param); else sp.focus();
  return () => sp.destroy();
} };

Routes.settings = { icon: 'cog', label: 'settings', view(main) {
  const old = h('input', { class: 'inp', type: 'password', inputmode: 'numeric', placeholder: t('old_pin'), maxlength: 8, dir: 'ltr', autocomplete: 'current-password' }), nw = h('input', { class: 'inp', type: 'password', inputmode: 'numeric', placeholder: t('new_pin'), maxlength: 8, dir: 'ltr', autocomplete: 'new-password' });
  const snd = h('input', { type: 'checkbox', checked: store.get('sound', true), onchange: e => store.set('sound', e.target.checked) });
  main.append(pageHead(t('settings')), h('div', { class: 'card' }, h('h3', null, App.user.name), h('div', { class: 'muted' }, '@' + App.user.username + ' · ' + App.user.role),
    h('div', { class: 'perm-list' }, App.user.perms.map(p => badge(p)))),
    h('div', { class: 'card' }, h('h3', null, t('language')), LangSwitch(), h('label', { class: 'check' }, snd, h('span', null, 'Sound / صوت'))),
    h('div', { class: 'card form' }, h('h3', null, t('change_pin')), old, nw, h('button', { class: 'btn', onclick: e => busy(e.currentTarget, async () => { const d = await api('changePin', { oldPin: old.value, newPin: nw.value }); saveSession(d); old.value = nw.value = ''; toast(t('pin_changed'), 'ok'); }) }, t('save'))),
    h('div', { class: 'card' }, h('p', { class: 'muted small' }, t('install_hint')), h('div', { class: 'ltr muted small' }, App.apiUrl.slice(0, 60) + '…'), h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { store.del('api'); App.apiUrl = App.cfg.API_URL || ''; signOut(); } }, 'API URL'), h('button', { class: 'btn danger', onclick: () => signOut() }, t('logout')))));
} };

Routes.users = { icon: 'users', label: 'users', perm: 'users', view(main) {
  const box = h('div'); main.append(pageHead(t('users'), h('button', { class: 'btn primary small', onclick: () => edit(null) }, icon('plus', 16), ' ', t('us_add'))), box);
  let data;
  async function load() { box.replaceChildren(spinner()); try { data = await api('usersList'); draw(); } catch (e) { box.replaceChildren(errorBox(e, load)); } }
  function draw() {
    box.replaceChildren(h('div', { class: 'list card' }, data.users.map(u => h('button', { class: 'li', onclick: () => edit(u) },
      h('div', { class: 'li-main' }, h('b', null, u.name || u.username), h('div', { class: 'muted ltr' }, '@' + u.username + (u.lastLogin ? ' · ' + u.lastLogin : ''))),
      h('div', { class: 'li-side' }, badge(u.role, 'brand'), u.extra ? badge('+' + u.extra.split(',').length) : null, !u.active ? badge(t('us_inactive'), 'bad') : null, u.locked ? badge(t('us_locked'), 'warn') : null)))));
  }
  function edit(u) {
    if (!data) return;
    const isNew = !u, un = h('input', { class: 'inp', placeholder: t('username'), value: u ? u.username : '', disabled: !isNew, dir: 'ltr', autocapitalize: 'off' }), nm = h('input', { class: 'inp', placeholder: t('us_name'), value: u ? u.name : '' });
    const role = h('select', { class: 'inp' }, Object.keys(data.roles).map(r => h('option', { value: r, selected: u ? u.role === r : r === 'receiving' }, r)));
    const ex = (u ? u.extra : '').split(',').map(s => s.trim()).filter(Boolean), boxes = Object.keys(data.perms).map(p => h('label', { class: 'check' }, h('input', { type: 'checkbox', value: p, checked: ex.indexOf(p) >= 0 }), h('span', null, data.perms[p])));
    const act = h('input', { type: 'checkbox', checked: u ? u.active : true }), pin = h('input', { class: 'inp', type: 'text', inputmode: 'numeric', placeholder: isNew ? t('pin') + ' (4-8)' : t('us_newpin'), maxlength: 8, dir: 'ltr', autocomplete: 'off' });
    modal(isNew ? t('us_add') : u.username, h('div', { class: 'form' }, un, nm, h('label', null, t('us_role')), role, h('label', null, t('us_extra')), h('div', { class: 'checks' }, boxes), h('label', { class: 'check' }, act, h('span', null, t('us_active'))), pin),
      close => [h('button', { class: 'btn', onclick: close }, t('cancel')), h('button', { class: 'btn primary', onclick: e => busy(e.currentTarget, async () => {
        await api('userSave', { username: un.value, name: nm.value, role: role.value, extra: boxes.filter(b => b.firstChild.checked).map(b => b.firstChild.value).join(','), active: act.checked, newPin: pin.value || undefined });
        toast(t('saved'), 'ok'); close(); load();
      }) }, t('save'))]);
  }
  load();
} };
