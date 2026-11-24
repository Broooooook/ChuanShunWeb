// 新增／編輯車趟（首頁與記錄頁共用）
import { h, openDialog, stepper, selectWithAdd, confirmDialog } from './dom.js';
import { uuid } from '../core/backup.js';
import { rememberedTripCount } from '../core/actions.js';

export const AREAS = [['北部', 1], ['林口', 1.5], ['中部', 2], ['南部', 3]];
const names = (list) => [...(list || [])].sort((a, b) => a.order - b.order).map((o) => o.name);

export function addOption(state, key, name) {
  const list = state.settings[key] || [];
  if (list.some((o) => o.name === name)) return;
  state.settings[key] = [...list, { id: uuid(), name, colorHex: '#000000', order: list.length }];
}

/**
 * initial：編輯的車趟（null = 新增）；template：新增時帶入的前一趟
 * onSave(trip)；onDelete()（編輯時）
 */
export function openTripDialog(ctx, { initial = null, template = null, defaultDriver = '', onSave, onDelete }) {
  const s = ctx.state.settings;
  const base = initial || template || {};
  const t = {
    id: initial?.id || uuid(),
    destination: base.destination ?? s.defaultDestination ?? '',
    acidType: base.acidType ?? s.defaultAcidType ?? '',
    driverName: initial ? initial.driverName : (defaultDriver || base.driverName || s.defaultDriver || ''),
    tripCount: initial?.tripCount ?? 1,
    specialCount: initial?.specialCount ?? 0,
    overtimeCount: initial?.overtimeCount ?? 0,
    isImportant: initial?.isImportant ?? false,
    note: initial?.note ?? '',
  };
  if (!initial) {
    const mem = rememberedTripCount(ctx.state, t.destination, t.acidType);
    t.tripCount = mem ?? template?.tripCount ?? 1;
  }

  const areaBox = h('div', { class: 'seg' });
  const drawAreas = () => areaBox.replaceChildren(...AREAS.map(([label, v]) =>
    h('button', { type: 'button', class: 'seg-btn' + (t.tripCount === v ? ' on' : ''), onclick: () => { t.tripCount = v; drawAreas(); } }, `${label} (${v})`)));
  drawAreas();
  const applyMemory = () => {
    const mem = rememberedTripCount(ctx.state, t.destination, t.acidType);
    if (mem != null) { t.tripCount = mem; drawAreas(); }
  };

  const add = (key) => (name) => { addOption(ctx.state, key, name); ctx.save(); };
  const body = h('div', { class: 'form' },
    !initial && template ? h('p', { class: 'hint' }, '已自動帶入前一趟資料，只要改不同的欄位。') : null,
    h('label', { class: 'field' }, h('span', {}, '目的地'),
      selectWithAdd(names(s.destinations), t.destination, (v) => { t.destination = v; if (!initial || v !== initial.destination) applyMemory(); }, add('destinations'))),
    h('label', { class: 'field' }, h('span', {}, '主要酸別'),
      selectWithAdd(names(s.acidTypes), t.acidType, (v) => { t.acidType = v; if (!initial || v !== initial.acidType) applyMemory(); }, add('acidTypes'))),
    h('label', { class: 'field' }, h('span', {}, '搭檔'),
      selectWithAdd(names(s.drivers), t.driverName, (v) => { t.driverName = v; }, add('drivers'))),
    h('div', { class: 'field' }, h('span', {}, '車趟區域（趟數）'), areaBox),
    h('div', { class: 'row-between' }, h('span', {}, '特殊趟'), stepper(t.specialCount, (v) => (t.specialCount = v))),
    h('div', { class: 'row-between' }, h('span', {}, '超時趟'), stepper(t.overtimeCount, (v) => (t.overtimeCount = v))),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: t.isImportant, onchange: (e) => (t.isImportant = e.target.checked) }), '標記注意 ★'),
    h('label', { class: 'field' }, h('span', {}, '備註'), h('input', { class: 'input', value: t.note, oninput: (e) => (t.note = e.target.value) })));

  const buttons = [];
  if (initial && onDelete) buttons.push({ label: '刪除', kind: 'danger', onClick: async () => { if (await confirmDialog('刪除這一趟？', '刪除後無法復原。', { okLabel: '刪除', danger: true })) onDelete(); else return false; } });
  buttons.push({ label: '取消' }, { label: '儲存', kind: 'primary', onClick: () => onSave({ ...t }) });
  openDialog({ title: initial ? '編輯車趟' : '新增車趟', body, buttons });
}

/** 車趟清單的一列 */
export function tripRow(state, t, mult, onClick) {
  const color = (key, name) => (state.settings[key] || []).find((o) => o.name === name)?.colorHex;
  const dot = (c) => (c && !/^#?(000000|ffffff)$/i.test(c) ? h('span', { class: 'dot', style: { background: c } }) : null);
  const count = ((t.tripCount || 0) + (t.specialCount || 0)) * mult + (t.overtimeCount || 0);
  return h('button', { class: 'trip-row', type: 'button', onclick: onClick },
    h('div', { class: 'trip-main' },
      h('div', { class: 'trip-title' }, dot(color('destinations', t.destination)), t.destination || '(未填目的地)', t.isImportant ? h('span', { class: 'star' }, ' ★') : null),
      h('div', { class: 'trip-sub' },
        h('span', {}, dot(color('acidTypes', t.acidType)), t.acidType || '—'),
        t.driverName ? h('span', {}, '👤 ' + t.driverName) : null,
        t.specialCount ? h('span', {}, `特殊 ${t.specialCount}`) : null,
        t.overtimeCount ? h('span', {}, `超時 ${t.overtimeCount}`) : null,
        t.note ? h('span', { class: 'muted' }, t.note) : null)),
    h('div', { class: 'trip-count' }, String(Math.round(count * 100) / 100), h('small', {}, ' 趟')));
}
