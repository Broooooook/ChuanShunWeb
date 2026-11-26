// 動畫版教學：真實操作畫面錄影（手指游標移動、點擊波紋、打字），無字幕
// 用法：node record2.js <配音長度 json>   輸出 partA.webm、partB.webm、timeline.json
const fs = require('fs');
const { open, setNow, sleep } = require('./lib');
const DUR = JSON.parse(fs.readFileSync(process.argv[2] || '/home/user/vidtool/durations.json', 'utf8'));
const OUTDIR = '/home/user/vidtool/anim';
fs.mkdirSync(OUTDIR, { recursive: true });
const ep = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / 86400000);
const hm = (h, m = 0) => h * 3600 + m * 60;

function fakeRecords() {
  const recs = []; let id = 100;
  const dests = ['MTTW 11A', 'GTC', 'UMC 8A', 'PSMC 8A', 'UMC 8C'];
  const acids = ['H2SO4', 'HF', 'NH4OH', 'IPA'];
  for (let d = ep(2026, 10, 26); d <= ep(2026, 11, 24); d++) {
    const dow = new Date(d * 86400000).getUTCDay();
    if (dow === 0) continue;
    const i = d % 7;
    const base = { id: id++, date: d, driverName: '範例搭檔', nightShiftCount: 0, is2xOvertime: false, is3xOvertime: false,
      specialLeaveHours: 0, isOffDay: false, isOfficialBusiness: false, trips: [], remarks: '', isNextDay: false, startTime: null, endTime: null };
    if (d === ep(2026, 11, 6)) { recs.push({ ...base, specialLeaveHours: 8 }); continue; }
    if (d === ep(2026, 11, 13)) { recs.push({ ...base, isOffDay: true }); continue; }
    const start = hm(6, (i * 7) % 40);
    const end = hm(16 + (i % 3), (i * 13) % 60);
    const n = 2 + (i % 2);
    const trips = [];
    for (let k = 0; k < n; k++) trips.push({ id: `t${id}-${k}`, destination: dests[(i + k) % dests.length], acidType: acids[(i + k) % acids.length],
      driverName: '範例搭檔', tripCount: k === 2 ? 1.5 : 1, specialCount: 0, overtimeCount: 0, isImportant: false, note: '' });
    recs.push({ ...base, startTime: start, endTime: end, trips, nightShiftCount: dow === 2 ? 1 : 0, is2xOvertime: d === ep(2026, 11, 21) });
  }
  return recs;
}

(async () => {
  const Z = 1080 / 405;
  const { b, p } = await open('/tmp/vp_anim_' + Date.now(), 1);
  await p.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await p.evaluateOnNewDocument((Z) => { document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.zoom = String(Z);
    const st = document.createElement('style');
    st.textContent = `.dlg{width:min(calc(94vw / ${Z}),480px)!important;max-height:calc(92vh / ${Z})!important}.dlg-body{max-height:calc(92vh / ${Z} - 130px)!important}`;
    document.head.appendChild(st); }); }, Z);
  await p.goto('http://localhost:8765/', { waitUntil: 'networkidle0' });
  await setNow(p, '2026-11-25T06:02:10+08:00');
  await p.reload({ waitUntil: 'networkidle0' });

  // ── 手指游標
  const ensureCursor = () => p.evaluate(() => {
    let c = document.getElementById('__finger');
    if (!c) {
      const st = document.createElement('style');
      st.textContent = `#__finger{position:fixed;left:0;top:0;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;
        background:rgba(255,255,255,.55);border:3px solid rgba(40,40,60,.75);box-shadow:0 4px 14px rgba(0,0,0,.35);
        z-index:2147483647;pointer-events:none;transition:transform .75s cubic-bezier(.45,.05,.25,1), opacity .3s;}
        #__finger.press{width:38px;height:38px;margin:-19px 0 0 -19px;background:rgba(103,80,164,.45)}
        .__ripple{position:fixed;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;border:4px solid rgba(103,80,164,.9);
        z-index:2147483646;pointer-events:none;animation:__rp .6s ease-out forwards}
        @keyframes __rp{to{transform:scale(4.5);opacity:0}}`;
      document.head.appendChild(st);
      c = document.createElement('div'); c.id = '__finger'; c.style.transform = 'translate(330px,640px)';
      document.body.appendChild(c); window.__fx = 330; window.__fy = 640; window.__Z = parseFloat(document.documentElement.style.zoom) || 1;
    }
    const host = document.querySelector('dialog[open]') || document.body;
    if (c.parentElement !== host) host.appendChild(c);
    return true;
  });
  const moveCss = (x, y, ms) => moveTo(x * Z, y * Z, ms);
  const moveTo = async (x, y, ms = 750) => {
    await ensureCursor();
    await p.evaluate((x, y, ms) => { const c = document.getElementById('__finger'); c.style.transition = `transform ${ms}ms cubic-bezier(.45,.05,.25,1)`; x /= window.__Z; y /= window.__Z; c.style.transform = `translate(${x}px,${y}px)`; window.__fx = x; window.__fy = y; }, x, y, ms);
    await sleep(ms + 80);
  };
  const press = async () => {
    await p.evaluate(() => {
      const c = document.getElementById('__finger'); c.classList.add('press');
      const r = document.createElement('div'); r.className = '__ripple'; r.style.left = window.__fx + 'px'; r.style.top = window.__fy + 'px';
      (document.querySelector('dialog[open]') || document.body).appendChild(r); setTimeout(() => r.remove(), 700);
      setTimeout(() => c.classList.remove('press'), 180);
    });
    await sleep(200);
  };
  const find = (t, sel = 'button,a,summary,label,input') => p.evaluate((t, sel) => {
    const els = [...document.querySelectorAll(sel)].filter(e => e.offsetParent !== null && !e.closest('#__finger'));
    const txt = (e) => (e.innerText || e.value || e.placeholder || '').trim();
    const el = els.find(e => txt(e) === t) || els.find(e => txt(e).startsWith(t)) || els.find(e => txt(e).includes(t));
    if (!el) return null;
    const r0 = el.getBoundingClientRect();
    if (r0.top < 170 || r0.bottom > innerHeight - 200) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    return true;
  }, t, sel);
  const rect = (t, sel = 'button,a,summary,label,input') => p.evaluate((t, sel) => {
    const els = [...document.querySelectorAll(sel)].filter(e => e.offsetParent !== null && !e.closest('#__finger'));
    const txt = (e) => (e.innerText || e.value || e.placeholder || '').trim();
    const el = els.find(e => txt(e) === t) || els.find(e => txt(e).startsWith(t)) || els.find(e => txt(e).includes(t));
    if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, t, sel);
  const point = async (t, sel) => { if (!(await find(t, sel))) { await p.screenshot({ path: '/tmp/fail.png' }); throw new Error('not found ' + t); } await sleep(500); const c = await rect(t, sel); await moveTo(c.x, c.y); return c; };
  const tap = async (t, sel) => { const c = await point(t, sel); await press(); await p.mouse.click(c.x, c.y); await sleep(650); };
  const tapEl = async (fnSrc, ...args) => { const c = await p.evaluate(fnSrc, ...args); await moveTo(c.x, c.y); await press(); await p.mouse.click(c.x, c.y); await sleep(650); };
  const scrollTo = (js) => p.evaluate(js).then(() => sleep(900));

  // ── 時間軸
  let rec = null, t0 = 0; const timeline = [];
  const cdp = await p.createCDPSession();
  let frames = [], fdir = '';
  cdp.on('Page.screencastFrame', (f) => {
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    if (!fdir) return;
    const n = frames.length; const file = `${fdir}/${String(n).padStart(5, '0')}.jpg`;
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, t: Date.now() - t0 });
  });
  const startRec = async (name) => {
    fdir = `${OUTDIR}/${name}`; fs.rmSync(fdir, { recursive: true, force: true }); fs.mkdirSync(fdir, { recursive: true });
    frames = []; t0 = Date.now(); timeline.push({ part: name, events: [] });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });
    await sleep(300);
  };
  const stopRec = async () => {
    await sleep(400); await cdp.send('Page.stopScreencast');
    const cur = timeline[timeline.length - 1]; cur.length = (Date.now() - t0) / 1000; cur.frames = frames.map(f => [f.file, f.t / 1000]); fdir = '';
  };
  const step = async (id, fn) => {
    const s = Date.now();
    timeline[timeline.length - 1].events.push({ id, t: (s - t0) / 1000 });
    await fn();
    const need = (DUR[id] || 3) * 1000 + 500;
    const left = need - (Date.now() - s);
    if (left > 0) await sleep(left);
  };

  // ===== Part A：第一次打開＋安裝說明
  await ensureCursor();
  await startRec('partA');
  await step('00', async () => { await sleep(1800); await tap('開始使用'); });
  await step('01', async () => { await sleep(1500); await point('我知道了'); await sleep(DUR['01'] * 1000 - 3000); await press(); await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '我知道了')?.click()); });
  await stopRec();

  // 放入假資料（不錄）
  await p.evaluate((recs) => new Promise((res) => {
    const r = indexedDB.open('chuanshun-tracker', 1);
    r.onsuccess = () => {
      const db = r.result; const q = db.transaction('kv').objectStore('kv').get('state');
      q.onsuccess = () => {
        const s = q.result; s.workRecords = recs;
        s.settings.totalSpecialLeave = 56; s.settings.salaryInfo.totalSpecialLeave = 56;
        s.settings.drivers = [];
        Object.assign(s.settings.salaryInfo, { baseSalary: 30000, foodAllowance: 2400, attendanceBonus: 1000, laborInsurance: 750, healthInsurance: 480 });
        const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(s, 'state');
        tx.oncomplete = () => { localStorage.setItem('chuanshun-state-copy', JSON.stringify(s)); res(); };
      };
    };
  }), fakeRecords());
  await p.reload({ waitUntil: 'networkidle0' }); await sleep(800);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '我知道了')?.click());
  await sleep(500);
  await ensureCursor();

  // ===== Part B：上班到備份
  await startRec('partB');
  await step('02', async () => { await sleep(600); await tap('開始上班'); });
  await step('03', async () => { const c = await rect('上班時間', 'div'); await moveCss(90, 190); await sleep(1500); await moveCss(330, 190); });
  await step('04', async () => {
    await tap('＋'); await sleep(500);
    await point('2X 加班', 'label'); await sleep(1300); await point('3X 加班', 'label'); await sleep(1200);
    await tapEl(() => { const b = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '−' && b.offsetParent); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  });
  await step('05', async () => { await tap('輸入第一趟'); });
  const arrowFn = (i) => { const a = [...document.querySelectorAll('.combo-arrow')].filter(e => e.offsetParent)[i]; const r = a.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
  await step('06', async () => { await sleep(300); await tapEl(arrowFn, 0); await sleep(600); await tap('UMC 8A', '.combo-item'); });
  await step('07', async () => { await tapEl(arrowFn, 1); await sleep(500); await tap('H2SO4', '.combo-item'); });
  await step('08', async () => {
    await tapEl(() => { const a = [...document.querySelectorAll('.combo-input')].filter(e => e.offsetParent)[2]; const r = a.getBoundingClientRect(); return { x: r.x + 60, y: r.y + r.height / 2 }; });
    await p.keyboard.type('範例搭檔', { delay: 260 }); await sleep(500);
    await p.evaluate(() => document.activeElement?.blur()); await sleep(400);
    await p.evaluate(() => { const l = document.querySelector('.combo-list'); if (l) l.style.display = 'none'; });
  });
  await step('09', async () => { await point('北部', 'label'); await sleep(900); await point('林口', 'label'); await sleep(900); await tapEl(() => { const b = [...document.querySelectorAll('dialog[open] button')].filter(b => b.innerText.trim() === '+')[0]; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }); await sleep(500); await tapEl(() => { const b = [...document.querySelectorAll('dialog[open] button')].filter(b => b.innerText.trim() === '−')[0]; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }); });
  await step('10', async () => { await tap('確認', 'dialog[open] button'); });
  await step('11', async () => { await point('1. UMC 8A', 'div,li,button'); });
  await step('12', async () => { await tap('新增排程項目'); });
  await step('13', async () => { await sleep(1500); { const c = await p.evaluate(() => { const a = [...document.querySelectorAll('dialog[open] .combo-input')][0]; const r = a.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }); await moveTo(c.x, c.y); } await sleep(DUR['13'] * 1000 - 3800); await tap('確認', 'dialog[open] button'); });
  await setNow(p, '2026-11-25T17:41:50+08:00');
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await sleep(700);
  await step('14', async () => { await tap('結束班次'); });
  await step('15', async () => { await sleep(1800); await tap('確認下班'); });
  await step('16', async () => { await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await sleep(600); await moveCss(200, 200); await sleep(1200); await moveCss(200, 560); });
  await step('17', async () => { await tap('未出荷'); });
  await step('18', async () => { await sleep(1200); await point('輪空', 'div,label'); await sleep(1500); await tap('取消'); });
  await step('19', async () => { await tap('記錄', 'nav.tabbar button'); });
  await step('20', async () => { await moveCss(200, 230); await sleep(800); await p.evaluate(() => window.scrollBy({ top: 330, behavior: 'smooth' })); await sleep(1200); await moveCss(200, 330); });
  await step('21', async () => { await tap('統計', 'nav.tabbar button'); });
  await step('22', async () => { await moveCss(200, 330); });
  await step('23', async () => {
    await scrollTo(() => { const el = [...document.querySelectorAll('.card-title')].find(e => e.innerText.includes('薪資明細')); window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 70, behavior: 'smooth' }); });
    await sleep(800); await tap('本薪');
  });
  await step('24', async () => {
    await tapEl(() => { const i = document.querySelector('dialog[open] input'); const r = i.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await p.evaluate(() => { const i = document.querySelector('dialog[open] input'); i.select(); });
    await p.keyboard.type('30000', { delay: 220 }); await sleep(500); await tap('確定', 'dialog[open] button');
  });
  await step('25', async () => { await scrollTo(() => { const el = [...document.querySelectorAll('.card-title')].find(e => e.innerText.includes('勞基法')); window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 70, behavior: 'smooth' }); }); await moveCss(200, 300); });
  await step('26', async () => { await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await sleep(600); await moveCss(200, 25); });
  await step('27', async () => { await tap('設定', 'nav.tabbar button'); await sleep(500); await tap('資料管理與備份', 'summary'); });
  await step('28', async () => { await point('⬆ 匯出備份檔案'); await sleep(1200); await press(); });
  await step('29', async () => { await tap('❓ 備份怎麼做'); await sleep(1500); await p.evaluate(() => { const d = document.querySelector('dialog[open] .dlg-body, dialog[open]'); d.scrollBy({ top: 250, behavior: 'smooth' }); }); });
  await step('30', async () => { await p.evaluate(() => [...document.querySelectorAll('dialog[open] button')].find(b => /我知道了|關閉|✕/.test(b.innerText.trim()))?.click()); await sleep(600); await point('⬇ 匯入備份檔案'); });
  await stopRec();
  fs.writeFileSync(`${OUTDIR}/timeline.json`, JSON.stringify(timeline, null, 1));
  console.log(JSON.stringify(timeline.map(x => [x.part, x.length])));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
