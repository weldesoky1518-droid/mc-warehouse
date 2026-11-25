/* الاستلام + المرتجعات (مسح بالكاميرا/السكانر، طابور ذكي بيشتغل مع النت الضعيف) */
const BC_OK = /^[0-9A-Za-z\-]{5,24}$/;
function feedback(kind, title, sub) { return h('div', { class: 'fb ' + kind, role: 'status' }, h('div', { class: 'fb-t' }, title), sub ? h('div', { class: 'fb-s' }, sub) : null); }
const stTone = s => ({ OK: 'ok', OVER: 'warn', NOT_IN_LIST: 'bad', INVALID: 'bad', UNKNOWN: 'bad', DUP: 'warn' }[s] || '');

Routes.receiving = { icon: 'inbox', label: 'receiving', perm: 'receiving', view(main, code) { return code ? receivingSession(main, code) : receivingCodes(main); } };

function receivingCodes(main) {
  const box = h('div'); main.append(pageHead(t('receiving'), h('button', { class: 'btn small', onclick: load }, icon('refresh', 16))), box);
  async function load() {
    box.replaceChildren(spinner());
    try {
      const r = await api('receivingCodes');
      if (!r.codes.length) return box.replaceChildren(h('div', { class: 'card empty' }, t('rc_no_codes')));
      box.replaceChildren(h('p', { class: 'muted' }, t('rc_pick')), h('div', { class: 'grid cards' }, r.codes.map(c => {
        const pct = c.expected ? Math.min(100, Math.round(c.scanned / c.expected * 100)) : 0;
        return h('a', { class: 'card code-card', href: '#/receiving/' + encodeURIComponent(c.code) },
          h('div', { class: 'code-h' }, h('b', { class: 'ltr' }, c.code), badge(c.approved ? t('rc_approved') : t('rc_open'), c.approved ? 'ok' : 'brand')),
          h('div', { class: 'muted' }, c.lines + ' ' + t('rc_lines') + ' · ' + t('rc_expected') + ' ' + fmt(c.expected)),
          h('div', { class: 'prog' }, h('i', { style: { width: pct + '%' } })), h('div', { class: 'muted small' }, t('rc_scanned') + ' ' + fmt(c.scanned) + ' (' + pct + '%)'));
      })));
    } catch (e) { box.replaceChildren(errorBox(e, load)); }
  }
  load();
}

function receivingSession(main, code) {
  let S = null, filter = 'all', recent = {}, sp, queue;
  const head = h('div'), fbBox = h('div', { class: 'fb-box' }), listBox = h('div'), pendEl = h('span', { class: 'badge warn', hidden: true });
  main.append(h('div', { class: 'crumbs' }, h('a', { href: '#/receiving' }, icon('undo', 16), ' ', t('rc_pick'))), head, h('div', { class: 'scan-area' }), fbBox, listBox);
  queue = new ScanQueue('rc:' + code, items => api('receivingScan', { code, scans: items.map(x => ({ id: x.id, upc: x.upc })) }), {
    change: n => { pendEl.hidden = !n; pendEl.textContent = t('pending') + ': ' + n; },
    offline: () => { toast(t('offline'), 'warn', 2500); },
    result: r => { r.results.forEach(x => { if (x.location) S.loc[x.upc] = x.location; if (x.desc && S.exp[x.upc] && !S.exp[x.upc][1]) S.exp[x.upc][1] = x.desc; });
      const bad = r.results.filter(x => x.status === 'INVALID'); if (bad.length) toast(t('st_INVALID') + ': ' + bad.map(x => x.upc).join(', '), 'bad', 5000); draw(); },
    fail: e => { if (e.code === 'APPROVED') { S.approved = true; draw(); } toast(e.message, 'bad', 6000); }
  });
  async function load() {
    head.replaceChildren(spinner());
    try { S = await api('receivingOpen', { code }); draw(); const area = main.querySelector('.scan-area'); if (!S.approved) { sp = scanPanel({ onScan: onScan }); area.replaceChildren(sp.el); sp.focus(); if (queue.pending) queue.kick(0); } else area.replaceChildren(h('div', { class: 'banner warn' }, t('rc_locked'))); }
    catch (e) { head.replaceChildren(errorBox(e, load)); }
  }
  function totals() { let e = 0, s = 0, miss = 0, over = 0, extra = 0; const keys = Object.assign({}, S.exp, S.counts); for (const b in keys) { const ex = S.exp[b] ? S.exp[b][0] : 0, c = S.counts[b] || 0; e += ex; s += c; if (!ex) extra += c; else if (c < ex) miss += ex - c; else over += c - ex; } return { e, s, miss, over, extra }; }
  function onScan(raw) {
    if (S.approved) { beep('bad'); return; }
    const upc = raw.trim(); if (!BC_OK.test(upc)) { beep('bad'); fbBox.replaceChildren(feedback('bad', t('st_INVALID'), upc)); return; }
    const ex = S.exp[upc] ? S.exp[upc][0] : 0, c = (S.counts[upc] || 0) + 1; S.counts[upc] = c; recent[upc] = Date.now();
    const st = ex === 0 ? 'NOT_IN_LIST' : (c > ex ? 'OVER' : 'OK'); beep(stTone(st) || 'ok');
    fbBox.replaceChildren(feedback(stTone(st), t('st_' + st) + ' · ' + c + '/' + (ex || '—'), (S.exp[upc] && S.exp[upc][1] ? S.exp[upc][1] + ' · ' : '') + (S.loc[upc] ? t('put_in') + ' ' + S.loc[upc] : upc)));
    queue.add({ id: uid(), upc }); draw();
  }
  function draw() {
    const T = totals(), pct = T.e ? Math.min(100, Math.round(T.s / T.e * 100)) : 0;
    head.replaceChildren(h('div', { class: 'card' }, h('div', { class: 'code-h' }, h('h2', { class: 'ltr' }, code), S.approved ? badge(t('rc_approved'), 'ok') : badge(t('rc_open'), 'brand'), pendEl),
      h('div', { class: 'prog big' }, h('i', { style: { width: pct + '%' } })), h('div', { class: 'row3' }, mini(t('rc_expected'), T.e), mini(t('rc_scanned'), T.s), mini(t('rc_missing'), T.miss, T.miss ? 'warn' : 'ok')),
      h('div', { class: 'row3' }, mini(t('rc_over'), T.over, T.over ? 'warn' : ''), mini(t('rc_extra'), T.extra, T.extra ? 'bad' : ''), h('div')),
      can('receiving_approve') && !S.approved ? h('button', { class: 'btn primary block', onclick: approve }, icon('check', 18), ' ', t('rc_approve')) : null));
    const rows = Object.keys(Object.assign({}, S.exp, S.counts)).map(b => { const ex = S.exp[b] ? S.exp[b][0] : 0, c = S.counts[b] || 0; return { b, ex, c, d: S.exp[b] ? S.exp[b][1] : '', st: !ex ? 'extra' : c < ex ? 'missing' : c > ex ? 'over' : 'ok' }; });
    const fl = rows.filter(r => filter === 'all' || r.st === filter || (filter === 'missing' && r.st === 'missing'));
    fl.sort((a, b) => (recent[b.b] || 0) - (recent[a.b] || 0) || ({ extra: 0, over: 1, missing: 2, ok: 3 }[a.st] - { extra: 0, over: 1, missing: 2, ok: 3 }[b.st]));
    const chips = [['all', t('rc_all'), rows.length], ['missing', t('rc_missing'), rows.filter(r => r.st === 'missing').length], ['over', t('rc_over'), rows.filter(r => r.st === 'over').length], ['extra', t('rc_extra'), rows.filter(r => r.st === 'extra').length]];
    listBox.replaceChildren(h('div', { class: 'chips' }, chips.map(c => h('button', { class: 'chip-b' + (filter === c[0] ? ' on' : ''), onclick: () => { filter = c[0]; draw(); } }, c[1] + ' ' + c[2]))),
      h('div', { class: 'list card' }, fl.slice(0, 400).map(r => h('div', { class: 'li static ' + r.st },
        h('div', { class: 'li-main' }, h('b', null, r.d || r.b), h('div', { class: 'muted ltr small' }, r.b + (S.loc[r.b] ? '  ·  ' + S.loc[r.b] : ''))),
        h('div', { class: 'li-side' }, h('span', { class: 'qty ' + r.st }, r.c + ' / ' + (r.ex || '—')), !S.approved && r.c > 0 ? h('button', { class: 'icon-btn', title: t('undo'), 'aria-label': t('undo'), onclick: () => undo(r.b) }, icon('minus', 16)) : null)))));
  }
  function mini(l, v, tone) { return h('div', { class: 'mini ' + (tone || '') }, h('div', { class: 'mini-v' }, fmt(v)), h('div', { class: 'mini-l' }, l)); }
  async function undo(upc) { await queue.drain(); try { const r = await api('receivingUndo', { code, upc }); S.counts[upc] = r.count; if (!r.count) delete S.counts[upc]; draw(); } catch (e) { toast(e.message, 'bad'); } }
  async function approve(ev) {
    const btn = ev.currentTarget; await busy(btn, async () => {
      if (!(await queue.drain())) throw new Error(t('offline'));
      const T = totals(); if (!(await confirmBox(t('rc_approve_q') + '\n' + t('rc_expected') + ' ' + T.e + ' · ' + t('rc_scanned') + ' ' + T.s + ' · ' + t('rc_missing') + ' ' + T.miss + ' · ' + t('rc_over') + ' ' + T.over + ' · ' + t('rc_extra') + ' ' + T.extra, t('rc_approve')))) return;
      const r = await api('receivingApprove', { code }, { timeout: 120000 }); S.approved = true; toast(r.note || t('rc_done'), 'ok', 6000); if (sp) sp.destroy(); load();
    });
  }
  load();
  return () => { if (sp) sp.destroy(); };
}

Routes.returns = { icon: 'undo', label: 'returns', perm: 'returns', view(main, tab) {
  const isPut = tab === 'putaway', box = h('div');
  const tabs = h('div', { class: 'seg tabs' }, can('returns') ? h('a', { class: isPut ? '' : 'on', href: '#/returns' }, t('rt_scan')) : null, can('putaway') ? h('a', { class: isPut ? 'on' : '', href: '#/returns/putaway' }, t('rt_putaway')) : null);
  main.append(pageHead(t('returns')), tabs, box);
  return isPut ? returnsPutaway(box) : returnsScan(box);
} };
function returnsScan(box) {
  let log = store.get('rt:log', []).slice(0, 40); const fbBox = h('div', { class: 'fb-box' }), list = h('div', { class: 'list card' }), pendEl = h('span', { class: 'badge warn', hidden: true });
  const queue = new ScanQueue('returns', items => api('returnsScan', { scans: items.map(x => ({ id: x.id, upc: x.upc, cond: x.cond })) }), {
    change: n => { pendEl.hidden = !n; pendEl.textContent = t('pending') + ': ' + n; }, offline: () => toast(t('offline'), 'warn', 2500),
    result: r => { r.results.forEach(x => { const it = log.find(l => l.id === x.id); if (!it) return; Object.assign(it, { pending: false, status: x.status, location: x.location, title: x.title, sku: x.sku, order: x.order, match: x.match });
        if (x.status !== 'DUP') { fbBox.replaceChildren(feedback(x.status === 'OK' ? (x.match === 'MATCHED' ? 'ok' : 'warn') : 'bad', (x.title || x.upc) + (x.location ? ' → ' + t('put_in') + ' ' + x.location : ''), x.status === 'UNKNOWN' ? t('st_UNKNOWN') : (x.match === 'MATCHED' ? t('matched') + ' ' + x.order : t('unmatched')))); beep(x.status === 'OK' ? 'ok' : 'warn'); } }); store.set('rt:log', log); draw(); },
    fail: e => toast(e.message, 'bad', 6000)
  });
  let cond = store.get('rt:cond', 'سليم');
  const condBox = h('div', { class: 'seg cond' }); const drawCond = () => condBox.replaceChildren(...[['سليم', 'rt_c_ok'], ['تالف', 'rt_c_bad'], ['حجر', 'rt_c_hold']].map(x => h('button', { class: cond === x[0] ? 'on' : '', onclick: () => { cond = x[0]; store.set('rt:cond', cond); drawCond(); } }, t(x[1])))); drawCond();
  const sp = scanPanel({ onScan: raw => { const upc = raw.trim(); if (!BC_OK.test(upc)) { beep('bad'); fbBox.replaceChildren(feedback('bad', t('st_INVALID'), upc)); return; }
    const it = { id: uid(), upc, cond, pending: true, time: new Date().toTimeString().slice(0, 5) }; log.unshift(it); log = log.slice(0, 40); beep('ok'); queue.add({ id: it.id, upc, cond }); draw(); } });
  function logRow(l) {
    const tone = l.pending ? '' : stTone(l.status === 'OK' ? (l.match === 'MATCHED' ? 'OK' : 'DUP') : l.status);
    return h('div', { class: 'li static ' + tone },
      h('div', { class: 'li-main' }, h('b', null, l.title || l.upc), h('div', { class: 'muted small ltr' }, l.upc + (l.sku ? ' · ' + l.sku : '') + (l.order ? ' · #' + l.order : ''))),
      h('div', { class: 'li-side' }, l.pending ? badge('…', 'warn') : h('span', { class: 'loc' }, l.location || '—'), h('small', { class: 'muted' }, l.time || '')));
  }
  function draw() { list.replaceChildren(...(log.length ? log.map(logRow) : [h('div', { class: 'empty' }, t('none'))])); }
  box.append(h('div', { class: 'muted small' }, t('rt_cond')), condBox, sp.el, h('div', { class: 'row' }, h('h4', null, t('rt_session')), pendEl), fbBox, list); draw(); sp.focus(); if (queue.pending) queue.kick(0);
  return () => sp.destroy();
}
function returnsPutaway(box) {
  const out = h('div'); box.append(out); let rows = [], done = [];
  async function load() { out.replaceChildren(spinner()); try { rows = (await api('putawayList')).rows; draw(); } catch (e) { out.replaceChildren(errorBox(e, load)); } }
  function draw() {
    if (!rows.length && !done.length) return out.replaceChildren(h('div', { class: 'card empty' }, t('rt_none_put')));
    const groups = {}; rows.forEach(r => (groups[r.loc] = groups[r.loc] || []).push(r));
    out.replaceChildren(h('div', { class: 'row' }, h('span', { class: 'muted' }, rows.reduce((s, r) => s + r.qty, 0) + ' ' + t('pieces')), h('button', { class: 'btn small', onclick: load }, icon('refresh', 16))),
      Object.keys(groups).map(loc => h('div', { class: 'card group' }, h('h3', { class: 'loc-h' }, loc), h('div', { class: 'list' }, groups[loc].map(r => h('div', { class: 'li static' },
        h('div', { class: 'li-main' }, h('b', null, r.title || r.sku || r.upc), h('div', { class: 'muted small ltr' }, r.upc + (r.sku ? ' · ' + r.sku : '') + (r.loc2 ? ' · ' + r.loc2 : ''))),
        h('div', { class: 'li-side' }, h('span', { class: 'qty big' }, '×' + r.qty), h('button', { class: 'btn ok', onclick: e => mark(r, true, e.currentTarget) }, icon('check', 16), ' ', t('rt_done')))))))),
      done.length ? h('div', { class: 'card' }, h('h4', null, t('rt_done')), done.map(r => h('div', { class: 'li static done' }, h('div', { class: 'li-main' }, r.title || r.upc), h('button', { class: 'btn small', onclick: e => mark(r, false, e.currentTarget) }, t('rt_undo_done'))))) : null);
  }
  async function mark(r, ok, btn) { await busy(btn, async () => { await api('putawayDone', { upc: r.upc, done: ok, qty: r.qty }); if (ok) { rows = rows.filter(x => x !== r); done.unshift(r); } else { done = done.filter(x => x !== r); load(); return; } draw(); }); }
  load();
}
