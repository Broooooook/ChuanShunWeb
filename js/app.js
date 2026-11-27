import { h, toast, openDialog } from './ui/dom.js';
import { loadState, saveState, requestPersist } from './store.js';
import { defaultSettings, parseBackup, applyDefaultRates } from './core/backup.js';
import { DEFAULT_OPTIONS } from './defaults.js';
import { purgeStaleDrafts } from './core/actions.js';
import { renderHome } from './ui/home.js';
import { renderHistory } from './ui/history.js';
import { renderStats } from './ui/stats.js';
import { renderSettings, exportBackup, pickBackupFile } from './ui/settings.js';

export const APP_VERSION = '1.4.5';

const TABS = [
  { id: 'home', label: '本日工作', icon: '🏠', render: renderHome },
  { id: 'history', label: '記錄', icon: '📋', render: renderHistory },
  { id: 'stats', label: '統計', icon: '📊', render: renderStats },
  { id: 'settings', label: '設定', icon: '⚙️', render: renderSettings },
];

const ctx = {
  state: null,
  tab: 'home',
  view: {}, // 各畫面的暫存狀態（例如目前看的月份）
  async mutate(fn) { const r = fn(this.state); await saveState(this.state); this.render(); return r; },
  async save() { await saveState(this.state); },
  render() { render(); },
  go(tab) { this.tab = tab; render(); window.scrollTo(0, 0); },
};
window.__ctx = ctx; // 方便除錯

// ── 環境判斷
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

function applyTheme() {
  const t = ctx.state?.settings?.theme || 'LIGHT';
  const dark = t === 'DARK' || (t === 'SYSTEM' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1d1b20' : '#e8def8');
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

function render() {
  applyTheme();
  const root = document.getElementById('app');
  root.replaceChildren();
  if (!ctx.state) { root.append(renderWelcome()); return; }
  const tab = TABS.find((t) => t.id === ctx.tab) || TABS[0];
  const main = h('main', { class: 'page' });
  try { main.append(tab.render(ctx)); } catch (e) { console.error(e); main.append(h('div', { class: 'card error' }, '畫面發生錯誤：' + e.message)); }
  root.append(
    banners(),
    main,
    h('nav', { class: 'tabbar' }, TABS.map((t) => h('button', {
      class: 'tab' + (t.id === ctx.tab ? ' active' : ''), type: 'button', onclick: () => ctx.go(t.id),
    }, h('span', { class: 'tab-icon' }, t.icon), h('span', {}, t.label)))),
  );
}

// ── 上方提醒：iPhone 未加入主畫面、太久沒備份
function banners() {
  const box = h('div', { class: 'banners' });
  if (isIOS() && !isStandalone()) {
    box.append(h('button', { class: 'banner warn', type: 'button', onclick: showInstallGuide },
      '⚠️ 你現在是用 Safari 打開，資料可能會不見。點這裡看如何「加入主畫面」'));
  }
  const s = ctx.state;
  const hasData = s.workRecords.length > 0;
  const last = s.meta?.lastBackupAt;
  const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
  if (hasData && (days == null || days >= 7)) {
    box.append(h('button', { class: 'banner info', type: 'button', onclick: () => exportBackup(ctx) },
      days == null ? '💾 你還沒有備份過資料，點這裡備份（約 10 秒）' : `💾 已經 ${days} 天沒有備份了，點這裡備份`));
  }
  return box;
}

export function showInstallGuide() {
  const step = (n, text) => h('li', {}, text);
  const body = isIOS()
    ? h('div', {},
      h('p', {}, '在 iPhone 上一定要「加入主畫面」，從桌面圖示打開，資料才會一直保存。'),
      h('ol', { class: 'steps' },
        step(1, '用 Safari 打開這個網址（不要用 LINE 裡面的瀏覽器）'),
        step(2, '按畫面下方中間的「分享」按鈕（方框加向上箭頭 ⬆️）'),
        step(3, '往下滑，點「加入主畫面」'),
        step(4, '按右上角「新增」'),
        step(5, '回到手機桌面，以後都從「全順工時」圖示打開')),
      h('p', { class: 'muted' }, '注意：Safari 裡的資料和桌面圖示裡的資料是分開的。如果已經在 Safari 裡記了資料，請先到「設定 → 匯出備份」，加入主畫面後再「匯入備份」。'))
    : h('div', {},
      h('p', {}, '把這個網頁安裝成 App，以後從桌面圖示打開最方便。'),
      h('ol', { class: 'steps' },
        step(1, 'Android：用 Chrome 打開，按右上角「⋮」→「安裝應用程式」或「加到主畫面」'),
        step(2, 'Windows 電腦：用 Edge 或 Chrome 打開，按網址列右邊的「安裝」圖示'),
        step(3, '安裝好之後，從桌面或手機主畫面的「全順工時」圖示打開')));
  openDialog({ title: '安裝到手機／電腦', body, buttons: [{ label: '我知道了', kind: 'primary' }] });
}

// ── 第一次開啟
function renderWelcome() {
  const start = async () => {
    const st = { workRecords: [], monthlySalaries: [], settings: { ...defaultSettings(), ...JSON.parse(JSON.stringify(DEFAULT_OPTIONS)) }, meta: { createdAt: Date.now() } };
    ctx.state = st; await saveState(st); requestPersist(); render();
    if (!isStandalone()) showInstallGuide();
  };
  const restore = async () => {
    const text = await pickBackupFile();
    if (text == null) return;
    try {
      const st = parseBackup(text);
      applyDefaultRates(st.settings);
      st.meta = { createdAt: Date.now(), lastBackupAt: Date.now() };
      ctx.state = st; await saveState(st); requestPersist(); render();
      toast(`已匯入 ${st.workRecords.length} 筆紀錄`);
    } catch (e) { toast(e.message, 4000); }
  };
  return h('div', { class: 'welcome' },
    h('img', { src: 'icons/icon-192.png', alt: '', class: 'welcome-logo' }),
    h('h1', {}, '全順工時記錄'),
    h('p', { class: 'muted' }, '記錄每天的上下班、車趟，自動算出工時和薪資。資料只存在你自己的手機或電腦裡，別人看不到。'),
    h('button', { class: 'btn primary big', type: 'button', onclick: start }, '開始使用'),
    h('button', { class: 'btn big', type: 'button', onclick: restore }, '我有備份檔，要匯入舊資料'),
    h('p', { class: 'muted small' }, '舊的 Android App：在 App 的「設定 → 匯出備份檔案」存出 .json 檔，再用這個按鈕匯入。'),
    isIOS() && !isStandalone() ? h('button', { class: 'banner warn', type: 'button', onclick: showInstallGuide }, '⚠️ iPhone 請先「加入主畫面」再開始使用，點這裡看步驟') : null);
}

// ── 啟動
async function boot() {
  ctx.state = await loadState();
  if (ctx.state) {
    ctx.state.settings = applyDefaultRates({ ...defaultSettings(), ...ctx.state.settings });
    ctx.state.meta = ctx.state.meta || {};
    if (purgeStaleDrafts(ctx.state)) await saveState(ctx.state);
    requestPersist();
  }
  render();
  // 每分鐘更新一次（上班計時、跨日）
  setInterval(() => { if (ctx.tab === 'home' && !document.querySelector('dialog[open]')) render(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !document.querySelector('dialog[open]')) render(); });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW 註冊失敗', e));
  }
}
boot();
