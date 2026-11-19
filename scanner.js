/* مسح الباركود: (1) سكانر USB/بلوتوث = كيبورد في خانة الإدخال، (2) الكاميرا: BarcodeDetector أو ZXing */
const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
let _zx;
function loadZXing() {
  if (window.ZXing) return Promise.resolve();
  return _zx || (_zx = new Promise((res, rej) => { const s = document.createElement('script'); s.src = ZXING_URL; s.onload = res; s.onerror = () => rej(new Error('zxing')); document.head.append(s); }));
}
class CameraScanner {
  constructor(video, onCode) { this.video = video; this.onCode = onCode; this.stream = null; this.stopped = true; this.last = ''; this.lastAt = 0; }
  accept(code) { const now = Date.now(); if (code === this.last && now - this.lastAt < 1800) return; this.last = code; this.lastAt = now; this.onCode(code); }
  async start() {
    this.stopped = false;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    this.video.srcObject = this.stream; this.video.setAttribute('playsinline', ''); await this.video.play();
    if ('BarcodeDetector' in window) {
      let formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];
      try { const sup = await BarcodeDetector.getSupportedFormats(); formats = formats.filter(f => sup.indexOf(f) >= 0); } catch (e) {}
      this.det = new BarcodeDetector({ formats }); this.loopNative();
    } else {
      await loadZXing();
      const hints = new Map(); hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E, ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.CODE_39, ZXing.BarcodeFormat.ITF]);
      this.reader = new ZXing.BrowserMultiFormatReader(hints, 250);
      this.loopZx();
    }
  }
  loopNative() {
    const tick = async () => {
      if (this.stopped) return;
      try { if (this.video.readyState >= 2) { const r = await this.det.detect(this.video); if (r && r[0] && r[0].rawValue) this.accept(r[0].rawValue); } } catch (e) {}
      setTimeout(tick, 120);
    }; tick();
  }
  loopZx() {
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
    const tick = () => {
      if (this.stopped) return;
      try {
        if (this.video.readyState >= 2) {
          canvas.width = this.video.videoWidth; canvas.height = this.video.videoHeight; ctx.drawImage(this.video, 0, 0);
          const lum = new ZXing.HTMLCanvasElementLuminanceSource(canvas), bmp = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(lum));
          const r = this.reader.decodeBitmap(bmp); if (r) this.accept(r.getText());
        }
      } catch (e) { /* NotFoundException = مفيش باركود في الفريم */ }
      setTimeout(tick, 150);
    }; tick();
  }
  async torch(on) { try { const tr = this.stream.getVideoTracks()[0]; await tr.applyConstraints({ advanced: [{ torch: !!on }] }); return true; } catch (e) { return false; } }
  stop() { this.stopped = true; if (this.stream) this.stream.getTracks().forEach(t => t.stop()); this.stream = null; try { this.video.srcObject = null; } catch (e) {} }
}
/** لوحة المسح: خانة إدخال (للسكانر) + زرار كاميرا. بترجّع { el, focus, destroy } */
function scanPanel(opts) {
  let cam = null, torchOn = false;
  const input = h('input', { class: 'scan-input', type: 'text', inputmode: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done', placeholder: opts.placeholder || t('scan_ph'), 'aria-label': t('scan_ph') });
  const video = h('video', { class: 'cam-video', muted: true, playsinline: true });
  const camBox = h('div', { class: 'cam-box', hidden: true }, video, h('div', { class: 'cam-guide' }));
  const torchBtn = h('button', { class: 'btn small', type: 'button', onclick: async () => { torchOn = !torchOn; if (!(await cam.torch(torchOn))) toast(t('cam_fail'), 'warn'); } }, icon('bolt', 16), ' ', t('torch'));
  const camBtn = h('button', { class: 'btn icon-text', type: 'button' }, icon('camera'), h('span', null, t('camera')));
  const submit = v => { v = String(v || '').trim(); if (v) opts.onScan(v); };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(input.value); input.value = ''; } });
  async function startCam() {
    try { cam = new CameraScanner(video, c => { submit(c); }); camBox.hidden = false; await cam.start(); camBtn.lastChild.textContent = t('stop_camera'); camBtn.classList.add('active'); camBox.append(h('div', { class: 'cam-tools' }, torchBtn)); }
    catch (e) { stopCam(); toast(t('cam_fail'), 'bad', 5000); }
  }
  function stopCam() { if (cam) cam.stop(); cam = null; camBox.hidden = true; const tl = camBox.querySelector('.cam-tools'); if (tl) tl.remove(); camBtn.lastChild.textContent = t('camera'); camBtn.classList.remove('active'); }
  camBtn.addEventListener('click', () => { cam ? stopCam() : startCam(); });
  const el = h('div', { class: 'scan-panel' }, h('div', { class: 'scan-row' }, input, camBtn), camBox);
  // إعادة التركيز على الخانة بعد أي ضغطة (علشان السكانر يفضل شغال) — إلا لو المستخدم بيكتب في خانة تانية
  const refocus = e => { if (!document.body.contains(el)) { document.removeEventListener('click', refocus); return; } const tg = e.target; if (tg && /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) && tg !== input) return; if (!document.querySelector('.modal-back') && matchMedia('(pointer:fine)').matches) setTimeout(() => input.focus(), 30); };
  document.addEventListener('click', refocus);
  return { el, input, focus() { if (matchMedia('(pointer:fine)').matches) input.focus(); }, destroy() { stopCam(); document.removeEventListener('click', refocus); } };
}
