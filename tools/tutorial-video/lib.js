const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function open(profile, scale = 2) {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], userDataDir: profile, env: { ...process.env, TZ: 'Asia/Taipei' } });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: scale, isMobile: true, hasTouch: true });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.evaluateOnNewDocument(() => {
    const Real = Date; const base = Real.now();
    const off = () => { const t = localStorage.getItem('__fakeNow'); return t ? Number(t) - base : 0; };
    class F extends Real { constructor(...a) { if (a.length === 0) super(Real.now() + off()); else super(...a); } static now() { return Real.now() + off(); } }
    window.Date = F;
  });
  return { b, p };
}
const setNow = (p, iso) => p.evaluate((t) => localStorage.setItem('__fakeNow', String(new Date(t).getTime())), iso);
async function clickText(p, t, sel = 'button,a,[role=button],summary,label,.chip,div[onclick]') {
  const box = await p.evaluate((t, sel) => {
    const els = [...document.querySelectorAll(sel)].filter(e => e.offsetParent !== null);
    const el = els.find(e => e.innerText.trim() === t) || els.find(e => e.innerText.trim().startsWith(t)) || els.find(e => e.innerText.includes(t));
    if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, t, sel);
  if (!box) throw new Error('not found: ' + t);
  return box;
}
module.exports = { open, setNow, clickText, sleep };
