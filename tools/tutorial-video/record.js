// 用假資料錄製網頁版教學畫面：輸出 /home/user/vidtool/frames/NN.png 與 scenes.json
const fs = require('fs');
const { open, setNow, clickText, sleep } = require('./lib');
const OUT = '/home/user/vidtool/frames';
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const scenes = [];
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
    const start = i === 3 ? hm(4, 30) : hm(6, 0 + (i * 7) % 40);
    const end = hm(16 + (i % 3), (i * 13) % 60);
    const n = 2 + (i % 2);
    const trips = [];
    for (let k = 0; k < n; k++) trips.push({ id: `t${id}-${k}`, destination: dests[(i + k) % dests.length], acidType: acids[(i + k) % acids.length],
      driverName: '範例搭檔', tripCount: k === 2 ? 1.5 : 1, specialCount: 0, overtimeCount: 0, isImportant: false, note: '' });
    recs.push({ ...base, startTime: start, endTime: end, trips, nightShiftCount: i === 3 ? 1 : 0, is2xOvertime: dow === 6 && d === ep(2026, 11, 21) });
  }
  return recs;
}

(async () => {
  const { b, p } = await open('/tmp/vp_rec_' + Date.now(), 2);
  await p.goto('http://localhost:8765/', { waitUntil: 'networkidle0' });
  await setNow(p, '2026-11-25T06:02:10+08:00');
  await p.reload({ waitUntil: 'networkidle0' });

  const ring = async (x, y) => p.evaluate((x, y) => {
    const d = document.createElement('div'); d.id = '__ring';
    Object.assign(d.style, { position: 'fixed', left: (x - 26) + 'px', top: (y - 26) + 'px', width: '52px', height: '52px', borderRadius: '50%',
      border: '5px solid #ff3b30', background: 'rgba(255,59,48,.18)', zIndex: 99999, pointerEvents: 'none', boxSizing: 'border-box' });
    (document.querySelector('dialog[open]') || document.body).appendChild(d);
  }, x, y);
  const unring = () => p.evaluate(() => document.getElementById('__ring')?.remove());
  const shot = async (caption, secs = 4) => {
    await sleep(350);
    const f = `${OUT}/${String(scenes.length).padStart(2, '0')}.png`;
    await p.screenshot({ path: f }); scenes.push({ file: f, caption, secs });
  };
  // 先標出要按的地方拍一張，再真的按下去
  const tapAt = async (c, caption, secs = 4) => { await ring(c.x, c.y); if (caption) await shot(caption, secs); await unring(); await p.mouse.click(c.x, c.y); await sleep(800); };
  const tap = async (t, caption, secs, sel) => tapAt(await clickText(p, t, sel), caption, secs);
  const tab = async (label, caption, secs) => tap(label, caption, secs, 'nav.tabbar button');
  const comboPick = async (idx, value, caption) => {
    const c = await p.evaluate((idx) => { const a = [...document.querySelectorAll('.combo-arrow')].filter(e => e.offsetParent)[idx]; const r = a.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, idx);
    await tapAt(c, null);
    const it = await clickText(p, value, '.combo-item');
    await tapAt(it, caption, 4);
  };

  // 1. 第一次打開
  await shot('用手機的瀏覽器打開網址，第一次會看到這個畫面。\n按「開始使用」。', 5);
  await tap('開始使用', null);
  await shot('接著會跳出安裝說明。照著做，把它裝到手機主畫面，\n以後從「全順工時」圖示打開就好。', 6);
  await tap('我知道了', null);

  // 偷偷放入假資料（上個月的紀錄、薪資）
  await p.evaluate((recs) => new Promise((res) => {
    const r = indexedDB.open('chuanshun-tracker', 1);
    r.onsuccess = () => {
      const db = r.result; const q = db.transaction('kv').objectStore('kv').get('state');
      q.onsuccess = () => {
        const s = q.result; s.workRecords = recs;
        s.settings.totalSpecialLeave = 56; s.settings.salaryInfo.totalSpecialLeave = 56;
        s.settings.drivers =[{ id: 'drv1', name: '範例搭檔', colorHex: '#000000', order: 0 }];
        Object.assign(s.settings.salaryInfo, { baseSalary: 30000, foodAllowance: 2400, attendanceBonus: 1000, laborInsurance: 750, healthInsurance: 480 });
        const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(s, 'state');
        tx.oncomplete = () => { localStorage.setItem('chuanshun-state-copy', JSON.stringify(s)); res(); };
      };
    };
  }), fakeRecords());
  await p.reload({ waitUntil: 'networkidle0' }); await sleep(800);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '我知道了')?.click());
  await sleep(400);

  // 2. 上班
  await tap('開始上班', '【上班】到公司時按「開始上班」。', 4);
  await shot('上班時間會自動記下來，右邊開始計算工作時間。', 4);
  await tap('＋', '有夜點就按「＋」。\n被叫回來加班勾「2X」，年假、颱風假出勤勾「3X」。', 6);
  await tap('－', null).catch(() => p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '−')?.click()));
  await sleep(400);

  // 3. 車趟
  await tap('輸入第一趟', '【車趟】每跑一趟，按「輸入第一趟」記下來。', 4);
  await comboPick(0, 'UMC 8A', '選「目的地」：按右邊的小箭頭從清單挑，也可以直接打字。');
  await comboPick(1, 'H2SO4', '再選「主要酸別」。');
  await comboPick(2, '範例搭檔', '選「搭檔」。第一次用時直接打字輸入搭檔名字就好。');
  await shot('「車趟區域」照這趟的地區勾選（北部 1 趟、林口 1.5 趟…）。\n有特殊趟、超時趟就按「＋」。', 6);
  await tap('確認', '都填好後按「確認」。', 3);
  await shot('這趟就記好了。點一下列表裡的項目可以修改或刪除。', 5);
  await tap('新增排程項目', '第二趟以後按「新增排程項目」。', 4);
  await shot('會自動帶入上一趟的內容，只要改不一樣的地方，再按「確認」。', 5);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '確認' && b.offsetParent)?.click());
  await sleep(800);
  await p.evaluate(() => window.scrollTo(0, 0));

  // 4. 下班
  await setNow(p, '2026-11-25T17:42:00+08:00'); await p.reload({ waitUntil: 'networkidle0' }); await sleep(800);
  await tap('結束班次', '【下班】下班時按「結束班次」。', 4);
  await tap('確認下班', '會再讓你確認一次時間和趟數，沒問題就按「確認下班」。', 5);
  await p.evaluate(() => window.scrollTo(0, 0)); await sleep(300);
  await shot('今天的上下班時間、工時、趟數就都記好了。\n萬一忘了打卡，之後到「記錄」裡改時間就好。', 6);
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => b.innerText.includes('未出荷')); b?.scrollIntoView({ block: 'center' }); });
  await tap('未出荷', '沒有出車的日子（特休、輪空、其它）按這裡記錄。', 5);
  await shot('選擇狀態後按確認。今天示範先不用，按取消。', 4);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '取消' && b.offsetParent)?.click());
  await sleep(500);

  // 5. 記錄
  await tab('記錄', '【記錄】下面的「記錄」可以看每一天。', 3);
  await shot('每一天一張卡片，顏色代表特休、輪空、加班。\n點一下卡片就能修改時間或車趟。', 6);

  // 6. 統計
  await tab('統計', '【統計】「統計」會自動算這個月的工時、趟數和薪資。', 4);
  await shot('上面是這個計薪月份的摘要。', 4);
  await p.evaluate(() => { const el = [...document.querySelectorAll('.card-title')].find(e => e.innerText.includes('薪資明細')); el?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); });
  await shot('往下滑是「薪資明細」。第一次用請點「本薪」等項目，\n填入自己的金額，薪資才算得準。', 6);
  await tap('本薪', null);
  await shot('輸入金額後按儲存。這些資料只存在你自己的手機，別人看不到。', 5);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '取消' && b.offsetParent)?.click());
  await sleep(500);
  await p.evaluate(() => { const el = [...document.querySelectorAll('.card-title')].find(e => e.innerText.includes('勞基法')); el?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); });
  await shot('最下面是「勞基法加班費試算」，只供參考，不算進薪資。', 5);

  // 7. 備份
  await p.evaluate(() => window.scrollTo(0, 0));
  await tab('設定', '【備份，很重要】資料只存在你的手機裡。\n換手機或清掉瀏覽器資料就會不見。', 5);
  await tap('資料管理與備份', '到「設定」→「資料管理與備份」。', 4, 'summary');
  await p.evaluate(() => { const el = [...document.querySelectorAll('button')].find(e => e.offsetParent && e.innerText.includes('匯出備份檔案')); el.scrollIntoView({ block: 'center' }); });
  await sleep(300);
  const c = await clickText(p, '⬆ 匯出備份檔案'); await ring(c.x, c.y);
  await shot('每個月至少按一次「匯出備份檔案」，\n把檔案用 LINE 傳給自己，或存到雲端。', 7);
  await unring();
  await tap('❓ 備份怎麼做', '不知道怎麼存？按「備份怎麼做？」有 iPhone、Android、電腦的步驟。', 5);
  await shot('換新手機時，用「匯入備份檔案」就能把資料搬回來。', 6);
  fs.writeFileSync('/home/user/vidtool/scenes.json', JSON.stringify(scenes, null, 1));
  console.log('scenes', scenes.length);
  await b.close();
})().catch((e) => { console.error(e); fs.writeFileSync('/home/user/vidtool/scenes.json', JSON.stringify(scenes, null, 1)); process.exit(1); });
