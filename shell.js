/* shell: router + layout + login + api setup + scan queue */
class ScanQueue {
  constructor(name, send, hooks) { this.name = name; this.send = send; this.hooks = hooks || {}; this.items = store.get('q:' + name, []); this.busy = false; this.timer = null; }
  save() { store.set('q:' + this.name, this.items); this.hooks.change && this.hooks.change(this.items.length); }
  add(it) { this.items.push(it); this.save(); this.kick(); }
  kick(ms) { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), ms === undefined ? 350 : ms); }
  async flush() {
    if (this.busy || !this.items.length) return; this.busy = true;
    const batch = this.items.slice(0, 40);
    try {
      const r = await this.send(batch); this.items = this.items.filter(x => batch.indexOf(x) < 0); this.save(); this.hooks.result && this.hooks.result(r, batch);
    } catch (e) {
      if (e.code === 'NET') { this.hooks.offline && this.hooks.offline(); this.busy = false; this.kick(6000); return; }
      this.items = this.items.filter(x => batch.indexOf(x) < 0); this.save(); this.hooks.fail && this.hooks.fail(e, batch);
    }
    this.busy = false; if (this.items.length) this.kick(100);
  }
  get pending() { return this.items.length; }
  async drain(maxMs) { const t0 = Date.now(); while ((this.items.length || this.busy) && Date.now() - t0 < (maxMs || 20000)) { this.kick(0); await new Promise(r => setTimeout(r, 250)); } return !this.items.length; }
}

const NAV_ORDER = ['home', 'lookup', 'compare', 'receiving', 'returns', 'picking', 'handover', 'courier', 'count', 'exceptions', 'adjustments', 'performance', 'ask', 'users', 'settings'];
const Routes = {};   // name -> { perm, icon, label, view(main, param) -> cleanup? }
const Shell = {
  cleanup: null, main: null,
  route() { const m = (location.hash || '#/home').replace(/^#\/?/, '').split('/'); return { name: m[0] || 'home', param: decodeURIComponent(m.slice(1).join('/') || '') }; },
  go(path) { location.hash = '#/' + path; },
  render() {
    if (this.cleanup) { try { this.cleanup(); } catch (e) {} this.cleanup = null; }
    const root = $('#app'); root.replaceChildren();
    if (!App.apiUrl) return root.append(ApiSetup());
    if (!App.token || !App.user) return root.append(Login());
    const r = this.route(), def = Routes[r.name] || Routes.home;
    if (def.perm && !can(def.perm)) { this.go('home'); return; }
    const nav = h('nav', { class: 'nav', 'aria-label': 'main' }, NAV_ORDER.filter(k => Routes[k]).filter(k => Routes[k].nav !== false && (!Routes[k].perm || can(Routes[k].perm))).map(k => {
      const d = Routes[k]; return h('a', { href: '#/' + k, class: 'nav-i' + (k === (Routes[r.name] ? r.name : 'home') ? ' on' : '') }, icon(d.icon, 22), h('span', null, t(d.label || k)));
    }), App.lookerUrl && can('dashboard') ? h('a', { href: App.lookerUrl, target: '_blank', rel: 'noopener', class: 'nav-i' }, icon('chart', 22), h('span', null, t('dashboard'))) : null);
    const main = h('main', { class: 'main', id: 'main' }); this.main = main;
    const online = h('span', { class: 'dot', id: 'net-dot', title: '' });
    const top = h('header', { class: 'top' }, h('div', { class: 'brand' }, h('span', { class: 'logo' }, icon('box', 20)), h('b', null, t('app'))),
      h('div', { class: 'top-r' }, online, h('a', { class: 'chip', href: '#/settings' }, App.user.name)));
    root.append(h('div', { class: 'shell' }, top, nav, main));
    document.title = t(def.label || r.name) + ' · ' + t('app');
    const c = def.view(main, r.param); if (typeof c === 'function') this.cleanup = c;
    Shell.netDot();
  },
  netDot() { const d = $('#net-dot'); if (d) { d.className = 'dot ' + (navigator.onLine ? 'on' : 'off'); d.title = navigator.onLine ? '' : t('offline'); } }
};
window.addEventListener('hashchange', () => { if (App.token) Shell.render(); else Shell.render(); });
window.addEventListener('online', () => { toast('✓ online', 'ok', 1500); Shell.netDot(); }); window.addEventListener('offline', () => { toast(t('offline'), 'warn', 4500); Shell.netDot(); });

function ApiSetup() {
  const inp = h('input', { class: 'inp', type: 'url', placeholder: 'https://script.google.com/macros/s/…/exec', dir: 'ltr', value: App.apiUrl, autocomplete: 'off' });
  const btn = h('button', { class: 'btn primary block' }, t('test_save'));
  btn.onclick = () => busy(btn, async () => {
    const u = inp.value.trim(); if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(u)) throw new Error(t('api_bad'));
    const old = App.apiUrl; App.apiUrl = u; try { await api('ping', {}, { noAuth: true, timeout: 30000 }); } catch (e) { App.apiUrl = old; throw new Error(t('api_bad')); }
    store.set('api', u); Shell.render();
  });
  return h('div', { class: 'auth' }, h('div', { class: 'card auth-card' }, h('div', { class: 'logo big' }, icon('box', 34)), h('h1', null, t('api_setup')), h('p', { class: 'muted' }, t('api_hint')), inp, btn, LangSwitch()));
}
function LangSwitch() {
  return h('div', { class: 'seg lang' }, ['ar', 'en'].map(l => h('button', { class: LANG === l ? 'on' : '', type: 'button', onclick: () => { setLang(l); store.set('lang', l); if (App.token) api('setLang', { lang: l }).catch(() => {}); Shell.render(); } }, l === 'ar' ? 'العربية' : 'English')));
}
function Login() {
  const u = h('input', { class: 'inp', autocomplete: 'username', autocapitalize: 'off', autocorrect: 'off', placeholder: t('username'), 'aria-label': t('username'), value: store.get('lastUser', ''), dir: 'ltr' });
  const p = h('input', { class: 'inp', type: 'password', inputmode: 'numeric', autocomplete: 'current-password', placeholder: t('pin'), 'aria-label': t('pin'), maxlength: 8, dir: 'ltr' });
  const err = h('div', { class: 'err', role: 'alert' });
  const btn = h('button', { class: 'btn primary block', type: 'submit' }, t('signin'));
  const form = h('form', { onsubmit: e => { e.preventDefault(); err.textContent = '';
    btn.disabled = true; btn.classList.add('busy');
    (async () => {
      const d = await api('login', { username: u.value, pin: p.value }, { noAuth: true }); store.set('lastUser', u.value.trim().toLowerCase()); saveSession(d);
      if (d.user.lang) { setLang(d.user.lang); store.set('lang', d.user.lang); }
      const me = await api('me').catch(() => null); if (me) App.lookerUrl = me.lookerUrl || '';
      location.hash = '#/home'; Shell.render();
    })().catch(ex => { err.textContent = ex.message; p.value = ''; p.focus(); btn.disabled = false; btn.classList.remove('busy'); });
  } }, u, p, err, btn);
  setTimeout(() => (u.value ? p : u).focus(), 50);
  return h('div', { class: 'auth' }, h('div', { class: 'card auth-card' }, h('div', { class: 'logo big' }, icon('box', 34)), h('h1', null, t('app')), form, LangSwitch()));
}
async function boot() {
  setLang(store.get('lang', 'ar'));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (App.token && App.user) { try { const me = await api('me'); App.user = me.user; store.set('user', me.user); App.lookerUrl = me.lookerUrl || ''; if (me.user.lang) setLang(me.user.lang); } catch (e) { if (e.code !== 'NET') { App.token = ''; } } }
  Shell.render();
}
