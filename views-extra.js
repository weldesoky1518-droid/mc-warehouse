/* v7: مقارنة الأصناف + الجرد + تسليم الشحنات + اسأل (AI) */
const BCX = /^[0-9A-Za-z\-]{5,24}$/;
const sgn = n => (n === null || n === undefined) ? '—' : (n > 0 ? '+' : '') + fmt(n);

/* ---- مقارنة الأصناف (قطع) ---- */
Routes.compare = { icon: 'scale', label: 'compare', perm: 'compare', view(main, tab) {
  const tabs = h('div', { class: 'seg tabs' }, [['', 'cmp_tab'], ['reorder', 'cmp_reorder'], ['gaps', 'cmp_gaps']].map(x => h('a', { class: (tab || '') === x[0] ? 'on' : '', href: '#/compare' + (x[0] ? '/' + x[0] : '') }, t(x[1]))));
  const box = h('div'); main.append(pageHead(t('compare')), tabs, box);
  return tab === 'reorder' ? cmpReorder(box) : tab === 'gaps' ? cmpGaps(box) : cmpMain(box);
} };
function cmpMain(box) {
  const F = store.get('cmp:f', { q: '', f: 'gap' }); let data = null, offset = 0;
  const sum = h('div'), list = h('div');
  const q = h('input', { class: 'inp', type: 'search', placeholder: t('cmp_search'), value: F.q, 'aria-label': t('cmp_search'), onchange: e => { F.q = e.target.value; store.set('cmp:f', F); load(); } });
  const chips = h('div', { class: 'chips' });
  const drawChips = () => chips.replaceChildren([['gap', t('cmp_f_gap')], ['es', t('cmp_f_es')], ['ae', t('cmp_f_ae')], ['noshop', t('cmp_f_noshop')], ['all', t('pk_all')]].map(x => h('button', { class: 'chip-b' + (F.f === x[0] ? ' on' : ''), onclick: () => { F.f = x[0]; store.set('cmp:f', F); drawChips(); load(); } }, x[1])));
  box.append(q, chips, sum, list);
  async function load(more) {
    if (!more) { offset = 0; list.replaceChildren(spinner()); }
    try {
      const d = await api('compare', { q: F.q, f: F.f, offset, limit: 100 });
      if (more && data) { data.rows = data.rows.concat(d.rows); data.total = d.total; } else data = d; offset = data.rows.length; draw();
    } catch (e) { list.replaceChildren(errorBox(e, () => load())); }
  }
  function draw() {
    const tt = data.totals, mini = (l, v, sub) => h('div', { class: 'mini' }, h('div', { class: 'mini-v' }, fmt(v)), h('div', { class: 'mini-l' }, l), sub ? h('small', { class: 'muted' }, sub) : null);
    sum.replaceChildren(h('div', { class: 'row3 sum' }, mini('ERP · ' + t('pieces'), tt.e), mini('Shopify · ' + t('pieces'), tt.s), data.opening ? mini(t('actual') + ' · ' + t('pieces'), tt.a) : mini(t('items'), tt.items)),
      h('div', { class: 'muted small' }, fmt(data.total) + ' ' + t('items') + (data.opening ? '' : ' · ' + t('no_opening'))));
    if (!data.rows.length) return list.replaceChildren(h('div', { class: 'card empty' }, t('none')));
    list.replaceChildren(h('div', { class: 'list card' }, data.rows.map(r => h('div', { class: 'li static cmp' },
      h('div', { class: 'li-main' }, h('b', null, r.t || r.sku || r.u), h('div', { class: 'muted small ltr' }, (r.sku ? r.sku + ' · ' : '') + r.u + (r.loc ? ' · ' + r.loc : ''))),
      h('div', { class: 'cmp-n' }, data.opening ? h('div', null, h('small', { class: 'muted' }, t('actual')), h('b', null, fmt(r.a))) : null,
        h('div', null, h('small', { class: 'muted' }, 'ERP'), h('b', null, fmt(r.e))),
        h('div', null, h('small', { class: 'muted' }, 'Shopify'), h('b', null, r.s === null ? '—' : fmt(r.s))),
        h('div', { class: 'cmp-d' }, r.d2 ? h('span', { class: 'badge warn' }, 'ERP−Shopify ' + sgn(r.d2)) : null, r.d1 ? h('span', { class: 'badge bad' }, t('actual') + '−ERP ' + sgn(r.d1)) : null))))),
      data.rows.length < data.total ? h('button', { class: 'btn block', onclick: () => load(true) }, t('more') + ' (' + data.rows.length + '/' + data.total + ')') : null);
  }
  drawChips(); load();
}
function cmpReorder(box) {
  box.append(spinner());
  api('reorderList').then(d => {
    if (!d.rows.length) return box.replaceChildren(h('div', { class: 'card empty' }, t('ro_none')));
    box.replaceChildren(h('div', { class: 'muted small' }, t('ro_hint', { n: d.days })), h('div', { class: 'list card' }, d.rows.map(r => h('div', { class: 'li static' },
      h('div', { class: 'li-main' }, h('b', null, r.t || r.sku || r.u), h('div', { class: 'muted small ltr' }, r.sku + ' · ' + r.u + (r.loc ? ' · ' + r.loc : ''))),
      h('div', { class: 'li-side' }, h('span', { class: 'badge ' + (r.cover < 2 ? 'bad' : 'warn') }, t('ro_cover', { n: r.cover })), h('small', { class: 'muted' }, t('ro_avail') + ' ' + fmt(r.avail) + ' · ' + r.perDay + '/' + t('day')), h('small', null, t('ro_suggest') + ' ' + fmt(r.suggest)))))));
  }).catch(e => box.replaceChildren(errorBox(e, () => location.reload())));
}
function cmpGaps(box) {
  box.append(spinner());
  api('barcodeGaps').then(d => {
    if (!d.rows.length) return box.replaceChildren(h('div', { class: 'card empty' }, t('bg_none')));
    box.replaceChildren(h('div', { class: 'muted small' }, t('bg_hint')), h('div', { class: 'list card' }, d.rows.map(r => h('div', { class: 'li static' },
      h('div', { class: 'li-main' }, h('b', { class: 'ltr' }, r.sku), h('div', { class: 'flag-t' }, r.issue), h('div', { class: 'muted small ltr' }, 'Shopify: ' + (r.bc || '—') + ' · SKU: ' + (r.su || '—') + ' · #' + r.order + (r.variant ? ' · ' + r.variant : '')))))));
  }).catch(e => box.replaceChildren(errorBox(e, () => location.reload())));
}

/* ---- الجرد بالمكان ---- */
Routes.count = { icon: 'clip', label: 'count', perm: 'count', view(main) {
  const box = h('div'); main.append(pageHead(t('count')), box);
  let loc = '', scans = [], exp = null;
  const fb = h('div', { class: 'fb-box' }), prog = h('div', { class: 'muted' });
  function step1() {
    const inp = h('input', { class: 'inp', dir: 'ltr', placeholder: t('cnt_loc_ph'), autocapitalize: 'characters', 'aria-label': t('cnt_loc_ph') });
    const go = async e => { const v = inp.value.trim(); if (!v) return; await busy(e && e.currentTarget, async () => { exp = await api('countExpected', { location: v }); loc = exp.location; scans = []; step2(); }); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    box.replaceChildren(h('div', { class: 'card' }, h('p', { class: 'muted' }, t('cnt_hint')), inp, h('button', { class: 'btn primary block', onclick: go }, t('cnt_start'))));
    inp.focus();
  }
  function step2() {
    const counted = () => { const m = {}; scans.forEach(s => m[s.upc] = (m[s.upc] || 0) + 1); return m; };
    const list = h('div', { class: 'list card' });
    const sp = scanPanel({ onScan: raw => { const upc = raw.trim(); if (!BCX.test(upc)) { beep('bad'); fb.replaceChildren(feedback('bad', t('st_INVALID'), upc)); return; }
      scans.push({ id: uid(), upc }); const known = exp.rows.some(r => r.u === upc); beep(known ? 'ok' : 'warn'); fb.replaceChildren(feedback(known ? 'ok' : 'warn', (exp.rows.find(r => r.u === upc) || {}).t || upc, known ? '' : t('cnt_unknown'))); draw(); } });
    const undo = () => { scans.pop(); draw(); };
    function draw() {
      const c = counted(), keys = Object.keys(c); prog.textContent = t('cnt_progress', { n: scans.length, e: fmt(exp.pieces) });
      const items = exp.rows.map(r => ({ u: r.u, t: r.t || r.sku, exp: r.exp, c: c[r.u] || 0 })).concat(keys.filter(u => !exp.rows.some(r => r.u === u)).map(u => ({ u, t: u, exp: 0, c: c[u], extra: true })));
      items.sort((a, b) => (b.c !== a.c ? (b.c ? 1 : -1) : 0) || b.exp - a.exp);
      list.replaceChildren(...items.slice(0, 150).map(r => h('div', { class: 'li static ' + (r.c === r.exp ? 'ok' : (r.c ? 'warn' : '')) }, h('div', { class: 'li-main' }, h('b', null, r.t), h('div', { class: 'muted small ltr' }, r.u + (r.extra ? ' · ' + t('cnt_unknown') : ''))), h('div', { class: 'li-side' }, h('span', { class: 'qty big' }, r.c + (exp.opening || true ? ' / ' + r.exp : ''))))));
    }
    const finish = async e => {
      if (!scans.length) return toast(t('cnt_none'), 'warn');
      if (!(await confirmBox(t('cnt_confirm', { n: scans.length, l: loc })))) return;
      await busy(e.currentTarget, async () => { const r = await api('countSubmit', { location: loc, scans }, { timeout: 120000 }); sp.destroy(); result(r); });
    };
    box.replaceChildren(h('div', { class: 'row' }, h('h3', { class: 'loc-h ltr' }, loc), h('span', { class: 'muted small' }, t('cnt_basis') + ': ' + exp.basis)), sp.el, fb, prog, list,
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: undo }, icon('undo', 16), ' ', t('undo')), h('button', { class: 'btn primary', onclick: finish }, icon('check', 16), ' ', t('cnt_finish'))));
    draw(); sp.focus();
  }
  function result(r) {
    box.replaceChildren(h('div', { class: 'card' }, h('h3', null, r.message), h('div', { class: 'row3 sum' }, [[t('cnt_items'), r.items], [t('cnt_ok'), r.ok], [t('cnt_diffs'), r.diffs]].map(x => h('div', { class: 'mini' }, h('div', { class: 'mini-v' }, fmt(x[1])), h('div', { class: 'mini-l' }, x[0])))), h('div', { class: 'muted' }, t('cnt_acc') + ': ' + r.accuracy + '%')),
      r.rows.length ? h('div', { class: 'list card' }, r.rows.map(x => h('div', { class: 'li static' }, h('div', { class: 'li-main' }, h('b', null, x.t || x.u), h('div', { class: 'muted small ltr' }, x.u + ' · ' + x.st)), h('div', { class: 'li-side' }, h('span', { class: 'qty big ' + (x.diff < 0 ? 'neg' : 'pos') }, sgn(x.diff)), h('small', { class: 'muted' }, x.cnt + ' / ' + x.exp))))) : null,
      h('button', { class: 'btn primary block', onclick: step1 }, t('cnt_next')));
  }
  step1();
} };

/* ---- تسليم الشحنات للكوريير ---- */
Routes.handover = { icon: 'truck', label: 'handover', perm: 'handover', view(main) {
  const fb = h('div', { class: 'fb-box' }), sumBox = h('div'), listBox = h('div');
  const sp = scanPanel({ placeholder: t('ho_ph'), onScan: async raw => {
    const w = raw.trim(); if (w.length < 8) { beep('bad'); fb.replaceChildren(feedback('bad', t('st_INVALID'), w)); return; }
    try { const r = await api('handoverScan', { waybill: w }); beep(r.dup ? 'warn' : (r.known ? 'ok' : 'warn')); fb.replaceChildren(feedback(r.dup ? 'warn' : (r.known ? 'ok' : 'warn'), r.waybill + (r.order ? ' · #' + r.order : ''), r.message)); loadSum(); }
    catch (e) { beep('bad'); fb.replaceChildren(feedback('bad', e.message, w)); } } });
  main.append(pageHead(t('handover')), sp.el, fb, sumBox, listBox);
  async function loadSum() {
    try {
      const d = await api('handoverSummary');
      sumBox.replaceChildren(h('div', { class: 'row3 sum' }, h('div', { class: 'mini' }, h('div', { class: 'mini-v' }, fmt(d.today)), h('div', { class: 'mini-l' }, t('ho_today'))), h('div', { class: 'mini t-' + (d.missingCount ? 'warn' : 'ok') }, h('div', { class: 'mini-v' }, fmt(d.missingCount)), h('div', { class: 'mini-l' }, t('ho_missing')))));
      listBox.replaceChildren(d.missing.length ? h('div', { class: 'card' }, h('h4', null, t('ho_missing_h')), h('div', { class: 'muted small' }, t('ho_missing_hint')), d.missing.map(m => h('div', { class: 'li static' }, h('div', { class: 'li-main ltr' }, m.w), h('small', { class: 'muted' }, '#' + m.order)))) : null,
        d.recent.length ? h('div', { class: 'card' }, h('h4', null, t('ho_recent')), d.recent.map(m => h('div', { class: 'li static' }, h('div', { class: 'li-main ltr' }, m.w), h('small', { class: 'muted' }, (m.order ? '#' + m.order + ' · ' : '') + m.st)))) : null);
    } catch (e) { sumBox.replaceChildren(errorBox(e, loadSum)); }
  }
  loadSum(); sp.focus(); return () => sp.destroy();
} };

/* ---- اسأل (AI) ---- */
Routes.ask = { icon: 'chat', label: 'ask', perm: 'ask', view(main) {
  const log = h('div', { class: 'ask-log' }), inp = h('textarea', { class: 'inp', rows: 2, maxlength: 500, placeholder: t('ask_ph'), 'aria-label': t('ask_ph') });
  const chips = h('div', { class: 'chips' }, ['ask_q1', 'ask_q2', 'ask_q3'].map(k => h('button', { class: 'chip-b', onclick: () => { inp.value = t(k); send(); } }, t(k))));
  const btn = h('button', { class: 'btn primary', onclick: () => send() }, t('ask_send'));
  main.append(pageHead(t('ask')), h('div', { class: 'banner' }, t('ask_note')), chips, log, h('div', { class: 'ask-in' }, inp, btn));
  async function send() {
    const q = inp.value.trim(); if (!q) return; inp.value = '';
    log.append(h('div', { class: 'ask-q' }, q)); const wait = h('div', { class: 'ask-a muted' }, '…'); log.append(wait); wait.scrollIntoView({ block: 'nearest' });
    try { const r = await busy(btn, () => api('ask', { q }, { timeout: 60000 })); wait.className = 'ask-a'; wait.textContent = r.answer; wait.append(h('div', { class: 'muted small' }, t('ask_left', { n: r.remaining }))); }
    catch (e) { wait.className = 'ask-a err'; wait.textContent = e.message; }
  }
} };
