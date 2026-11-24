// 設定：資料備份（含說明）、預設值、清單管理、外觀
import { h, toast, openDialog, confirmDialog, promptDialog, selectWithAdd } from './dom.js';
import { buildBackup, parseBackup, uuid } from '../core/backup.js';
import { saveFile, pickTextFile } from './files.js';
import { fmtDate, todayEpochDay } from '../core/date.js';
import { addOption } from './tripDialog.js';

export async function exportBackup(ctx) {
  const d = new Date();
  const name = `全順記錄備份_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
  const ok = await saveFile(name, buildBackup(ctx.state), 'application/json');
  if (ok) {
    await ctx.mutate((s) => { s.meta = { ...s.meta, lastBackupAt: Date.now() }; });
    toast('備份完成，請確認檔案已存到安全的地方');
  }
}
export const pickBackupFile = () => pickTextFile();

async function importBackup(ctx) {
  const text = await pickBackupFile();
  if (text == null) return;
  let st;
  try { st = parseBackup(text); } catch (e) { toast(e.message, 4000); return; }
  const ok = await confirmDialog('匯入備份？', [
    `備份檔裡有 ${st.workRecords.length} 筆紀錄。`,
    `匯入後，這台裝置目前的 ${ctx.state.workRecords.length} 筆紀錄和設定會被「完全取代」。`,
    '如果不確定，請先按「取消」，到上面「匯出備份」存一份目前的資料。'], { okLabel: '確定匯入', danger: true });
  if (!ok) return;
  await ctx.mutate((s) => { const meta = s.meta; Object.assign(s, st); s.meta = { ...meta, lastBackupAt: Date.now() }; });
  toast(`已匯入 ${st.workRecords.length} 筆紀錄`);
}

function backupHelp() {
  const sec = (title, steps) => h('div', { class: 'help-sec' }, h('h3', {}, title), h('ol', { class: 'steps' }, steps.map((s) => h('li', {}, s))));
  openDialog({
    title: '備份怎麼做？', wide: true,
    body: h('div', {},
      h('p', {}, '資料只存在這台手機／電腦裡。手機壞掉、遺失、換新手機，或不小心刪掉 App 圖示，資料就會不見。所以請「每週備份一次」，把備份檔存到手機以外的地方。'),
      sec('📱 iPhone', ['按「匯出備份」', '跳出分享畫面後，選「儲存到檔案」→ 選「iCloud 雲碟」→ 按「儲存」', '或是選 LINE，傳給自己（LINE 的「Keep 筆記」或只有自己的群組）']),
      sec('📱 Android 手機', ['按「匯出備份」', '跳出分享畫面後，選「LINE」傳給自己，或選「雲端硬碟」上傳', '沒有出現分享畫面的話，檔案會直接存在手機的「下載」資料夾']),
      sec('💻 Windows 電腦', ['按「匯出備份」', '檔案會存到「下載」資料夾，檔名像「全順記錄備份_20261124.json」', '可以再複製到隨身碟，或用 LINE 傳給自己']),
      sec('🔄 換手機／資料不見時怎麼還原', ['在新手機打開網址，並「加入主畫面」', '先把備份檔存到新手機（例如從 LINE 下載）', '打開 App → 設定 → 「匯入備份」→ 選那個 .json 檔', '看到「已匯入 N 筆紀錄」就完成了']),
      h('p', { class: 'muted small' }, '小提醒：最新的那份備份最重要，舊的可以刪掉。超過 7 天沒備份時，App 最上面會出現提醒。')),
    buttons: [{ label: '我知道了', kind: 'primary' }],
  });
}

function optionList(ctx, key, title) {
  const list = [...(ctx.state.settings[key] || [])].sort((a, b) => a.order - b.order);
  const save = (fn) => ctx.mutate((s) => { const l = [...(s.settings[key] || [])].sort((a, b) => a.order - b.order); fn(l); s.settings[key] = l.map((o, i) => ({ ...o, order: i })); });
  return h('details', { class: 'opt-list' }, h('summary', {}, `${title}（${list.length}）`),
    list.map((o, i) => h('div', { class: 'opt-row' },
      h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(o.colorHex) ? o.colorHex : '#000000', title: '顏色', onchange: (e) => save((l) => { l[i] = { ...l[i], colorHex: e.target.value.toUpperCase() }; }) }),
      h('span', { class: 'opt-name' }, o.name),
      h('button', { class: 'icon-btn small', type: 'button', title: '上移', disabled: i === 0, onclick: () => save((l) => { [l[i - 1], l[i]] = [l[i], l[i - 1]]; }) }, '↑'),
      h('button', { class: 'icon-btn small', type: 'button', title: '下移', disabled: i === list.length - 1, onclick: () => save((l) => { [l[i + 1], l[i]] = [l[i], l[i + 1]]; }) }, '↓'),
      h('button', { class: 'icon-btn small', type: 'button', title: '改名', onclick: async () => {
        const n = (await promptDialog('改名', { value: o.name }) || '').trim(); if (n) save((l) => { l[i] = { ...l[i], name: n }; });
      } }, '✎'),
      h('button', { class: 'icon-btn small', type: 'button', title: '刪除', onclick: async () => {
        if (await confirmDialog(`刪除「${o.name}」？`, '只是從選單移除，以前的紀錄不會被改動。', { okLabel: '刪除', danger: true })) save((l) => l.splice(i, 1));
      } }, '🗑'))),
    h('button', { class: 'btn small', type: 'button', onclick: async () => {
      const n = (await promptDialog(`新增${title}`, { label: '名稱' }) || '').trim();
      if (n) ctx.mutate((s) => addOption(s, key, n));
    } }, '＋ 新增'));
}

export function renderSettings(ctx) {
  const s = ctx.state.settings, meta = ctx.state.meta || {};
  const names = (key) => [...(s[key] || [])].sort((a, b) => a.order - b.order).map((o) => o.name);
  const last = meta.lastBackupAt;
  const lastText = last ? `${fmtDate(todayEpochDay(new Date(last)))} ${new Date(last).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}（${Math.floor((Date.now() - last) / 86400000)} 天前）` : '還沒有備份過';
  const card = (title, ...children) => h('section', { class: 'card' }, h('div', { class: 'card-title' }, title), ...children);

  return h('div', { class: 'stack' },
    h('h1', { class: 'page-title' }, '設定'),
    card('💾 資料備份（很重要）',
      h('div', { class: 'row-between line' }, h('span', {}, '上次備份'), h('b', { class: last && Date.now() - last < 7 * 86400000 ? 'good' : 'bad' }, lastText)),
      h('div', { class: 'row-between line' }, h('span', {}, '目前紀錄'), h('span', {}, `${ctx.state.workRecords.length} 筆`)),
      h('button', { class: 'btn primary wide', type: 'button', onclick: () => exportBackup(ctx) }, '匯出備份（存一份到手機外面）'),
      h('button', { class: 'btn wide', type: 'button', onclick: () => importBackup(ctx) }, '匯入備份（從備份檔還原）'),
      h('button', { class: 'btn wide subtle', type: 'button', onclick: backupHelp }, '❓ 備份怎麼做？（圖文步驟）'),
      h('p', { class: 'small muted' }, '備份檔和舊的 Android App 格式相同，可以互相匯入。')),
    card('預設值（新增車趟時自動帶入）',
      h('label', { class: 'field' }, h('span', {}, '預設搭檔'), selectWithAdd(names('drivers'), s.defaultDriver, (v) => ctx.mutate((x) => { x.settings.defaultDriver = v; }), (n) => addOption(ctx.state, 'drivers', n))),
      h('label', { class: 'field' }, h('span', {}, '預設目的地'), selectWithAdd(names('destinations'), s.defaultDestination, (v) => ctx.mutate((x) => { x.settings.defaultDestination = v; }), (n) => addOption(ctx.state, 'destinations', n))),
      h('label', { class: 'field' }, h('span', {}, '預設酸別'), selectWithAdd(names('acidTypes'), s.defaultAcidType, (v) => ctx.mutate((x) => { x.settings.defaultAcidType = v; }), (n) => addOption(ctx.state, 'acidTypes', n)))),
    card('選單清單（目的地／酸別／搭檔）',
      h('p', { class: 'small muted' }, '每個人的清單各自獨立，改了只影響自己。'),
      optionList(ctx, 'destinations', '目的地'), optionList(ctx, 'acidTypes', '酸別'), optionList(ctx, 'drivers', '搭檔')),
    card('一般',
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!s.resetAfterPunchOut, onchange: (e) => ctx.mutate((x) => { x.settings.resetAfterPunchOut = e.target.checked; }) }),
        h('span', {}, '下班打卡後首頁歸零', h('br'), h('small', { class: 'muted' }, '適合一天打很多次卡的人；紀錄仍在「記錄」頁'))),
      h('div', { class: 'field' }, h('span', {}, '外觀'),
        h('div', { class: 'seg' }, [['LIGHT', '淺色'], ['DARK', '深色'], ['SYSTEM', '跟隨手機']].map(([k, l]) =>
          h('button', { type: 'button', class: 'seg-btn' + ((s.theme || 'LIGHT') === k ? ' on' : ''), onclick: () => ctx.mutate((x) => { x.settings.theme = k; }) }, l))))),
    card('安裝與說明',
      h('button', { class: 'btn wide', type: 'button', onclick: () => import('../app.js').then((m) => m.showInstallGuide()) }, '📲 如何安裝到手機／電腦'),
      h('p', { class: 'small muted' }, '所有資料只存在這台裝置，不會上傳到任何伺服器。'),
      h('p', { class: 'small muted' }, '全順工時記錄 網頁版 1.0.0')));
}
