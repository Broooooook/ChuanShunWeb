// 設定（對應 Android SettingsScreen：可摺疊區塊、順序相同；網頁版新增的項目保留在原位置）
import { h, toast, openDialog, confirmDialog, appBar, section, comboField } from './dom.js';
import { buildBackup, parseBackup, applyDefaultRates } from '../core/backup.js';
import { saveFile, pickTextFile } from './files.js';
import { fmtDate, todayEpochDay } from '../core/date.js';
import { addOption } from './tripDialog.js';
import { APP_VERSION } from '../app.js';

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
  try { st = parseBackup(text); applyDefaultRates(st.settings); } catch (e) { toast(e.message, 4000); return; }
  const ok = await confirmDialog('確認匯入備份？', [
    `備份檔裡有 ${st.workRecords.length} 筆紀錄。`,
    '匯入將會「完全覆蓋」目前這台裝置內的所有打卡記錄與設定，此動作無法復原。建議匯入前先將目前的資料匯出備份。'], { okLabel: '確定匯入 (覆蓋)', danger: true });
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
      sec('📱 iPhone', ['按「匯出備份檔案」', '跳出分享畫面後，選「儲存到檔案」→ 選「iCloud 雲碟」→ 按「儲存」', '或是選 LINE，傳給自己（LINE 的「Keep 筆記」或只有自己的群組）']),
      sec('📱 Android 手機', ['按「匯出備份檔案」', '跳出分享畫面後，選「LINE」傳給自己，或選「雲端硬碟」上傳', '沒有出現分享畫面的話，檔案會直接存在手機的「下載」資料夾']),
      sec('💻 Windows 電腦', ['按「匯出備份檔案」', '檔案會存到「下載」資料夾，檔名像「全順記錄備份_20261124.json」', '可以再複製到隨身碟，或用 LINE 傳給自己']),
      sec('🔄 換手機／資料不見時怎麼還原', ['在新手機打開網址，並「加入主畫面」', '先把備份檔存到新手機（例如從 LINE 下載）', '打開 App → 設定 → 資料管理與備份 →「匯入備份檔案」→ 選那個 .json 檔', '看到「已匯入 N 筆紀錄」就完成了']),
      h('p', { class: 'muted small' }, '小提醒：最新的那份備份最重要，舊的可以刪掉。超過 7 天沒備份時，App 最上面會出現提醒。')),
    buttons: [{ label: '我知道了', kind: 'primary' }],
  });
}

const STATUS_PALETTE = ['#FFB6C1', '#FF8A65', '#FFEE58', '#81C784', '#C5E1A5', '#9ECAFF', '#CE93D8'];
const TEXT_PALETTE = ['#FFFFFF', '#E53935', '#1E88E5', '#43A047', '#FB8C00', '#8E24AA', '#00ACC1', '#000000'];

function colorRow(label, current, onPick) {
  return h('div', {}, h('div', {}, label),
    h('div', { class: 'swatches' }, STATUS_PALETTE.map((hex) => h('button', {
      type: 'button', class: 'swatch' + ((current || '').toUpperCase() === hex ? ' on' : ''), style: { background: hex }, title: hex, onclick: () => onPick(hex),
    }))));
}

/** 清單（目的地／酸別／搭檔）：可摺疊、新增、上下移、刪除、文字顏色（對應 Android EnhancedListLazyUI） */
function optionList(ctx, key, title) {
  const list = [...(ctx.state.settings[key] || [])].sort((a, b) => a.order - b.order);
  const save = (fn) => ctx.mutate((s) => {
    const l = [...(s.settings[key] || [])].sort((a, b) => a.order - b.order);
    fn(l);
    s.settings[key] = l.map((o, i) => ({ ...o, order: i }));
  });
  const open = ctx.view.settingsOpen?.[key];
  const newInput = h('input', { class: 'input small-input', placeholder: '新增項目名稱' });
  const addNew = () => { const n = newInput.value.trim(); if (n) ctx.mutate((s) => addOption(s, key, n)); };
  newInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addNew(); });
  const det = h('details', { class: 'card section', open },
    h('summary', {}, h('span', {}, title)),
    h('div', { class: 'section-body' },
      h('div', { class: 'row-between gap8' }, newInput, h('button', { class: 'icon-btn accent', type: 'button', title: '新增', onclick: addNew }, '⊕')),
      list.map((o, i) => {
        const textColor = /^#?ffffff$/i.test(o.colorHex) ? '' : o.colorHex;
        return h('div', { class: 'opt-item' },
          h('div', { class: 'row-between gap8' },
            h('div', { class: 'updown' },
              i > 0 ? h('button', { class: 'icon-btn tiny accent', type: 'button', title: '往上', onclick: () => save((l) => { [l[i - 1], l[i]] = [l[i], l[i - 1]]; }) }, '▲') : h('span', { class: 'tiny-space' }),
              i < list.length - 1 ? h('button', { class: 'icon-btn tiny accent', type: 'button', title: '往下', onclick: () => save((l) => { [l[i + 1], l[i]] = [l[i], l[i + 1]]; }) }, '▼') : h('span', { class: 'tiny-space' })),
            h('span', { class: 'opt-name', style: textColor ? { color: textColor } : null }, o.name),
            h('button', { class: 'icon-btn small error-text', type: 'button', title: '刪除', onclick: async () => {
              if (await confirmDialog(`刪除「${o.name}」？`, '只是從選單移除，以前的紀錄不會被改動。', { okLabel: '刪除', danger: true })) save((l) => l.splice(i, 1));
            } }, '🗑')),
          h('div', { class: 'swatches small' }, TEXT_PALETTE.map((hex) => h('button', {
            type: 'button', class: 'swatch' + ((o.colorHex || '').toUpperCase() === hex ? ' on' : ''), style: { background: hex }, title: hex,
            onclick: () => save((l) => { l[i] = { ...l[i], colorHex: hex }; }),
          }, hex === '#FFFFFF' ? '無' : ''))));
      })));
  det.addEventListener('toggle', () => { ctx.view.settingsOpen = { ...(ctx.view.settingsOpen || {}), [key]: det.open }; });
  return det;
}

export function renderSettings(ctx) {
  const s = ctx.state.settings, meta = ctx.state.meta || {};
  const names = (key) => [...(s[key] || [])].sort((a, b) => a.order - b.order).map((o) => o.name);
  const last = meta.lastBackupAt;
  const lastText = last ? `${fmtDate(todayEpochDay(new Date(last)))} ${new Date(last).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}（${Math.floor((Date.now() - last) / 86400000)} 天前）` : '還沒有備份過';
  const openState = ctx.view.settingsOpen || {};
  const sec = (id, title, ...content) => {
    const d = section(title, !!openState[id], ...content);
    d.addEventListener('toggle', () => { ctx.view.settingsOpen = { ...(ctx.view.settingsOpen || {}), [id]: d.open }; });
    return d;
  };
  const setColor = (key) => (hex) => ctx.mutate((x) => { x.settings[key] = hex; });
  const rateField = (key, label) => h('label', { class: 'field' }, h('span', {}, label),
    h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 0, value: s.salaryInfo?.[key] ?? 0,
      onchange: (e) => ctx.mutate((x) => { x.settings.salaryInfo = { ...x.settings.salaryInfo, [key]: parseInt(e.target.value, 10) || 0 }; }) }));

  return h('div', { class: 'stack' },
    appBar('設定'),
    sec('appearance', '外觀',
      h('div', { class: 'seg' }, [['LIGHT', '淺色'], ['DARK', '深色'], ['SYSTEM', '跟隨手機']].map(([k, l]) =>
        h('button', { type: 'button', class: 'seg-btn' + ((s.theme || 'LIGHT') === k ? ' on' : ''), onclick: () => ctx.mutate((x) => { x.settings.theme = k; }) }, l))),
      h('p', { class: 'tiny-text secondary-text' }, '深色模式適合夜班使用；有自訂底色的紀錄卡片會維持淺色以確保看得清楚。')),
    sec('colors', '卡片狀態顏色設定',
      h('p', { class: 'tiny-text secondary-text' }, '選擇在歷史記錄中各狀態小卡的背景顯示顏色'),
      colorRow('3X 加班', s.color3xOvertime, setColor('color3xOvertime')),
      colorRow('2X 加班', s.color2xOvertime, setColor('color2xOvertime')),
      colorRow('輪空', s.colorOffDay, setColor('colorOffDay')),
      colorRow('其它', s.colorOfficial, setColor('colorOfficial')),
      colorRow('特休', s.colorSpecActive, setColor('colorSpecActive'))),
    h('div', { class: 'list-heading' }, '清單詳細設定（點標題展開）'),
    optionList(ctx, 'destinations', '目的地清單 (文字變色)'),
    optionList(ctx, 'acidTypes', '酸別清單 (文字變色)'),
    optionList(ctx, 'drivers', '搭檔清單 (文字變色)'),
    sec('defaults', '預設值（新增車趟時自動帶入）',
      h('div', {}, h('div', { class: 'field-label' }, '預設搭檔'), comboField(names('drivers'), s.defaultDriver, (v) => { ctx.state.settings.defaultDriver = v; ctx.save(); }, (n) => addOption(ctx.state, 'drivers', n))),
      h('div', {}, h('div', { class: 'field-label' }, '預設目的地'), comboField(names('destinations'), s.defaultDestination, (v) => { ctx.state.settings.defaultDestination = v; ctx.save(); }, (n) => addOption(ctx.state, 'destinations', n))),
      h('div', {}, h('div', { class: 'field-label' }, '預設酸別'), comboField(names('acidTypes'), s.defaultAcidType, (v) => { ctx.state.settings.defaultAcidType = v; ctx.save(); }, (n) => addOption(ctx.state, 'acidTypes', n)))),
    sec('bonus', '獎金基數設定 (變動自動儲存)',
      rateField('tripBonusRate', '每車趟獎金 (元)'),
      rateField('nightShiftBonusRate', '每夜點獎金 (元)'),
      h('p', { class: 'tiny-text secondary-text' }, '若在「統計 → 薪資明細」修改過某個月的金額，該月起會以那裡的金額為準。')),
    sec('backup', '資料管理與備份',
      h('p', { class: 'small muted' }, '備份包含所有打卡記錄、薪資設定與清單自定義。建議定期匯出存檔。備份檔與 Android App 格式相同，可互相匯入。'),
      h('div', { class: 'row-between line' }, h('span', {}, '上次備份'), h('b', { class: last && Date.now() - last < 7 * 86400000 ? 'good' : 'error-text' }, lastText)),
      h('div', { class: 'row-between line' }, h('span', {}, '目前紀錄'), h('span', {}, `${ctx.state.workRecords.length} 筆`)),
      h('button', { class: 'btn tertiary wide', type: 'button', onclick: () => exportBackup(ctx) }, '⬆ 匯出備份檔案'),
      h('button', { class: 'btn outline-danger wide', type: 'button', onclick: () => importBackup(ctx) }, '⬇ 匯入備份檔案'),
      h('button', { class: 'btn text wide', type: 'button', onclick: backupHelp }, '❓ 備份怎麼做？（圖文步驟）')),
    sec('install', '安裝與說明',
      h('button', { class: 'btn outline wide', type: 'button', onclick: () => import('../app.js').then((m) => m.showInstallGuide()) }, '📲 如何安裝到手機／電腦'),
      h('p', { class: 'tiny-text muted' }, '所有資料只存在這台裝置，不會上傳到任何伺服器。'),
      h('p', { class: 'tiny-text muted' }, `全順工時記錄 網頁版 ${APP_VERSION}`)));
}
