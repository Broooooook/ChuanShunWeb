// 新增／編輯排程項目（對應 Android TripDialog），首頁與記錄頁共用
import { h, openDialog, comboField, rowStepper, checkRow, toast, optionColor } from './dom.js';
import { uuid } from '../core/backup.js';
import { rememberedTripCount } from '../core/actions.js';
import { fmtNum, tripCountLabel } from '../core/trips.js';

export const AREAS = [['北部 (1)', 1], ['林口 (1+200)', 1.5], ['中部 (2)', 2], ['南部 (3)', 3]];
const names = (list) => [...(list || [])].sort((a, b) => a.order - b.order).map((o) => o.name);

export function addOption(state, key, name) {
  const list = state.settings[key] || [];
  if (list.some((o) => o.name === name)) return;
  state.settings[key] = [...list, { id: uuid(), name, colorHex: '#000000', order: list.length }];
}

/**
 * initial：要編輯的車趟（null = 新增）；template：新增時自動帶入的前一趟
 * onSave(trip)；onDelete()（僅編輯時）
 */
export function openTripDialog(ctx, { initial = null, template = null, defaultDriver = '', onSave, onDelete }) {
  const s = ctx.state.settings;
  const base = initial || template || {};
  const t = {
    id: initial?.id || uuid(),
    destination: base.destination ?? s.defaultDestination ?? '',
    acidType: base.acidType ?? s.defaultAcidType ?? '',
    driverName: initial ? initial.driverName : (template?.driverName || defaultDriver || s.defaultDriver || ''),
    tripCount: initial?.tripCount ?? 1,
    specialCount: initial?.specialCount ?? 0,
    overtimeCount: initial?.overtimeCount ?? 0,
    isImportant: initial?.isImportant ?? false,
    note: initial?.note ?? '',
  };
  if (!initial) t.tripCount = rememberedTripCount(ctx.state, t.destination, t.acidType) ?? template?.tripCount ?? 1;
  if (!initial && defaultDriver) t.driverName = defaultDriver;

  const areaBox = h('div', { class: 'area-box' });
  const drawAreas = () => areaBox.replaceChildren(...AREAS.map(([label, v]) =>
    h('label', { class: 'area-check' + (t.tripCount === v ? ' on' : '') },
      h('input', { type: 'checkbox', checked: t.tripCount === v, onchange: () => { t.tripCount = v; drawAreas(); } }), h('span', {}, label))));
  drawAreas();
  const applyMemory = () => { const m = rememberedTripCount(ctx.state, t.destination, t.acidType); if (m != null) { t.tripCount = m; drawAreas(); } };
  const changed = (key) => !initial || t[key] !== initial[key];
  const add = (key) => (name) => { addOption(ctx.state, key, name); ctx.save(); };

  const deleteBox = h('div', {});
  const drawDelete = (confirming) => deleteBox.replaceChildren(confirming
    ? h('div', { class: 'confirm-strip' }, h('b', {}, '確定刪除？'),
      h('span', {}, h('button', { class: 'btn text danger-text', type: 'button', onclick: () => { close(); onDelete(); } }, '確定'),
        h('button', { class: 'btn text', type: 'button', onclick: () => drawDelete(false) }, '取消')))
    : h('button', { class: 'btn outline-danger wide', type: 'button', onclick: () => drawDelete(true) }, '－ 刪除此車趟記錄'));
  if (initial && onDelete) drawDelete(false);

  const label = (text) => h('div', { class: 'field-label' }, text);
  const body = h('div', { class: 'form' },
    !initial && template ? h('p', { class: 'hint' }, '已自動帶入前一趟資料，可只修改不同欄位。') : null,
    h('div', {}, label('目的地'), comboField(names(s.destinations), t.destination, (v) => { t.destination = v; if (changed('destination')) applyMemory(); }, add('destinations'))),
    h('div', {}, label('主要酸別'), comboField(names(s.acidTypes), t.acidType, (v) => { t.acidType = v; if (changed('acidType')) applyMemory(); }, add('acidTypes'))),
    h('div', {}, label('搭檔'), comboField(names(s.drivers), t.driverName, (v) => { t.driverName = v; }, add('drivers'))),
    label('車趟區域 (趟數)'), areaBox,
    rowStepper('特殊趟', t.specialCount, (v) => (t.specialCount = v)),
    rowStepper('超時趟', t.overtimeCount, (v) => (t.overtimeCount = v)),
    checkRow('標記注意 (★)', t.isImportant, (v) => (t.isImportant = v)),
    h('label', { class: 'field' }, h('span', {}, '備註'), h('textarea', { class: 'input', rows: 2, value: t.note, oninput: (e) => (t.note = e.target.value) })),
    initial && onDelete ? deleteBox : null);

  const close = openDialog({
    title: initial ? '編輯排程項目' : '新增排程項目', body,
    buttons: [{ label: '取消' }, { label: '確認', kind: 'primary', onClick: () => {
      if (!t.destination.trim()) { toast('請先選擇或輸入目的地'); return false; }
      onSave({ ...t, destination: t.destination.trim(), acidType: t.acidType.trim(), driverName: t.driverName.trim() });
    } }],
  });
}

/** 排程項目卡（對應 Android TaskCard 內的每一趟） */
export function tripItem(state, t, index, onClick) {
  const destColor = optionColor(state, 'destinations', t.destination, 'var(--primary)');
  const acidColor = optionColor(state, 'acidTypes', t.acidType, 'var(--secondary)');
  const driverColor = optionColor(state, 'drivers', t.driverName, 'var(--outline)');
  return h('button', { class: 'trip-item', type: 'button', onclick: onClick },
    h('div', { class: 'row-between' },
      h('span', { class: 'trip-dest', style: { color: destColor } }, `${index + 1}. ${t.destination}`),
      h('span', { class: 'trip-num' }, tripCountLabel(t),
        t.specialCount || t.overtimeCount ? h('span', { class: 'badges' },
          t.specialCount ? h('span', { class: 'badge sp' }, `+特${t.specialCount}`) : null,
          t.overtimeCount ? h('span', { class: 'badge ot' }, `+超${t.overtimeCount}`) : null) : null)),
    h('div', { class: 'trip-meta' },
      h('span', { style: { color: acidColor } }, '🧪 ' + (t.acidType || '')),
      h('span', { style: { color: driverColor } }, '👤 ' + (t.driverName || '')),
      t.isImportant ? h('span', { class: 'important' }, '★ 注意') : null),
    t.note ? h('div', { class: 'trip-note' }, '📝 ' + t.note) : null);
}
