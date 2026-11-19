/* core: DOM helper, storage, API client, toast/modal, sounds, icons */
const $ = (s, r) => (r || document).querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const k in (attrs || {})) {
    const v = attrs[k]; if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v; else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  kids.flat(Infinity).forEach(c => { if (c === null || c === undefined || c === false) return; el.append(c.nodeType ? c : document.createTextNode(String(c))); });
  return el;
}
/* replaceChildren بيقبل مصفوفات/null/false زي h() */
(function () {
  const orig = Element.prototype.replaceChildren;
  const clean = kids => kids.flat(Infinity).filter(k => k !== null && k !== undefined && k !== false).map(k => (k && k.nodeType) ? k : document.createTextNode(String(k)));
  Element.prototype.replaceChildren = function (...kids) { return orig.apply(this, clean(kids)); };
  const oa = Element.prototype.append; Element.prototype.append = function (...kids) { return oa.apply(this, clean(kids)); };
})();
const store = {
  get(k, d) { try { const v = localStorage.getItem('mcw:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('mcw:' + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem('mcw:' + k); } catch (e) {} }
};
const App = { cfg: window.APP_CONFIG || {}, token: store.get('token', ''), exp: store.get('exp', 0), user: store.get('user', null), lookerUrl: '', apiUrl: '' };
App.apiUrl = store.get('api', '') || App.cfg.API_URL || '';
const can = p => !!(App.user && App.user.perms.indexOf(p) >= 0);

/* ---------- API ---------- */
class ApiError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
async function api(action, args, opts) {
  opts = opts || {};
  if (!App.apiUrl) throw new ApiError('NO_API', t('api_setup'));
  let res;
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), opts.timeout || 90000);
  try {
    res = await fetch(App.apiUrl, { method: 'POST', body: JSON.stringify({ action, token: opts.noAuth ? '' : App.token, args: args || {} }), redirect: 'follow', signal: ctl.signal });
  } catch (e) { throw new ApiError('NET', t('net_err')); } finally { clearTimeout(to); }
  let j; try { j = await res.json(); } catch (e) { throw new ApiError('NET', t('net_err')); }
  if (!j.ok) {
    if (j.code === 'AUTH' && !opts.noAuth) { signOut(true); }
    throw new ApiError(j.code || 'ERROR', j.error || t('error'));
  }
  return j.data;
}
function saveSession(d) { App.token = d.token; App.exp = d.exp; store.set('token', d.token); store.set('exp', d.exp); if (d.user) { App.user = d.user; store.set('user', d.user); } }
function signOut(expired) {
  App.token = ''; App.user = null; store.del('token'); store.del('user'); store.del('exp');
  if (expired) toast(t('session_end'), 'warn');
  location.hash = '#/login'; Shell.render();
}

/* ---------- feedback ---------- */
function toast(msg, kind, ms) {
  let box = $('#toasts'); if (!box) { box = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(box); }
  const el = h('div', { class: 'toast ' + (kind || '') }, msg); box.append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms || 3200);
}
let _ac;
function beep(kind) {
  try {
    if (!store.get('sound', true)) return;
    _ac = _ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = _ac.createOscillator(), g = _ac.createGain(); o.connect(g); g.connect(_ac.destination);
    const f = { ok: [880, 0.09], warn: [520, 0.18], bad: [200, 0.35] }[kind] || [660, 0.08]; o.frequency.value = f[0]; o.type = kind === 'bad' ? 'sawtooth' : 'sine';
    g.gain.value = 0.08; o.start(); o.stop(_ac.currentTime + f[1]);
    if (navigator.vibrate) navigator.vibrate(kind === 'bad' ? [120, 60, 120] : 40);
  } catch (e) {}
}
function modal(title, body, actions) {
  const back = h('div', { class: 'modal-back', onclick: e => { if (e.target === back) close(); } });
  const close = () => { back.remove(); document.removeEventListener('keydown', esc); };
  const esc = e => { if (e.key === 'Escape') close(); }; document.addEventListener('keydown', esc);
  const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'modal-h' }, h('h3', null, title), h('button', { class: 'icon-btn', 'aria-label': t('close'), onclick: close }, icon('x'))),
    h('div', { class: 'modal-b' }, body), actions ? h('div', { class: 'modal-f' }, actions(close)) : null);
  back.append(box); document.body.append(back);
  const first = box.querySelector('input,textarea,select'); if (first) first.focus();
  return close;
}
function confirmBox(msg, okLabel) {
  return new Promise(res => {
    let done = false; const fin = v => { if (!done) { done = true; res(v); } };
    const close = modal(t('confirm'), h('p', null, msg), c => [h('button', { class: 'btn', onclick: () => { c(); fin(false); } }, t('cancel')), h('button', { class: 'btn primary', onclick: () => { c(); fin(true); } }, okLabel || t('confirm'))]);
  });
}
async function busy(btn, fn) {
  const old = btn && btn.textContent; if (btn) { btn.disabled = true; btn.classList.add('busy'); }
  try { return await fn(); } catch (e) { toast(e.message, 'bad', 5000); throw e; } finally { if (btn) { btn.disabled = false; btn.classList.remove('busy'); } }
}

/* ---------- icons (stroke) ---------- */
const ICONS = {
  home: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z', search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16l-4-4',
  inbox: 'M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zm0 0h5l1 3h6l1-3h5', undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', alert: 'M12 3l10 18H2zM12 10v5M12 18h.01', chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8', cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  x: 'M6 6l12 12M18 6L6 18', camera: 'M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  check: 'M5 12l5 5L20 7', pause: 'M8 5v14M16 5v14', refresh: 'M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5', ext: 'M14 3h7v7M21 3l-9 9M10 5H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-5',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8', more: 'M5 12h.01M12 12h.01M19 12h.01', bolt: 'M13 2L4 14h7l-1 8 9-12h-7z', filter: 'M3 5h18l-7 8v6l-4 2v-8z', plus: 'M12 5v14M5 12h14', minus: 'M5 12h14'
};
function icon(n, size) {
  const s = size || 20, ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', s); svg.setAttribute('height', s); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path'); p.setAttribute('d', ICONS[n] || ICONS.box); svg.append(p); return svg;
}
const fmt = n => (n === null || n === undefined || n === '') ? '—' : Number(n).toLocaleString('en-US');
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/-/g, '').slice(0, 20);
const debounce = (fn, ms) => { let to; return (...a) => { clearTimeout(to); to = setTimeout(() => fn(...a), ms); }; };
