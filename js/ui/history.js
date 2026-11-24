// 記錄：依計酬月份列出每天的紀錄，可新增／編輯／刪除
import { h, openDialog, stepper, confirmDialog, toast } from './dom.js';
import { billingRange, billingRangeStr, billingMonthOf } from '../core/billing.js';
import { addMonths, fmtDate, fmtTime, fmtDuration, weekdayLabel, todayEpochDay, toDateInput, fromDateInput, parseTimeInput, ymdOf } from '../core/date.js';
import { workMinutes, isDraft, isLateStart } from '../core/shift.js';
import { recordTripCount, overtimeMultiplier, fmtNum } from '../core/trips.js';
import { check } from '../core/validation.js';
import { upsertRecord, deleteRecord } from '../core/actions.js';
import { openTripDialog, tripRow } from './tripDialog.js';

export function renderHistory(ctx) {
  const s = ctx.state.settings;
  const v = ctx.view.history ||= { ...billingMonthOf(todayEpochDay(), s.billingStartDaysMap, s.billingStartDay) };
  const { start, end } = billingRange(v.y, v.m, s.billingStartDaysMap, s.billingStartDay);
  const recs = ctx.state.workRecords.filter((r) => r.date >= start && r.date <= end && !isDraft(r))
    .sort((a, b) => b.date - a.date || (b.startTime ?? 0) - (a.startTime ?? 0));
  const nav = (d) => () => { Object.assign(v, addMonths(v.y, v.m, d)); ctx.render(); };
  return h('div', { class: 'stack' },
    h('h1', { class: 'page-title' }, '記錄'),
    h('div', { class: 'month-nav' },
      h('button', { class: 'icon-btn', type: 'button', onclick: nav(-1), 'aria-label': '上個月' }, '‹'),
      h('div', { class: 'center' }, h('b', {}, `${v.y} 年 ${v.m} 月`), h('div', { class: 'muted small' }, billingRangeStr(v.y, v.m, s.billingStartDaysMap, s.billingStartDay))),
      h('button', { class: 'icon-btn', type: 'button', onclick: nav(1), 'aria-label': '下個月' }, '›')),
    h('button', { class: 'btn wide', type: 'button', onclick: () => openRecordEditor(ctx, null) }, '＋ 手動新增一筆'),
    recs.length ? recs.map((r) => dayCard(ctx, r)) : h('p', { class: 'muted center' }, '這個月還沒有紀錄'));
}

export function shiftText(r) {
  if (r.startTime == null) return '--:-- → --:--';
  if (r.endTime == null) return `${fmtTime(r.startTime)} → (上班中)`;
  const overnight = r.isNextDay || r.endTime < r.startTime;
  if (!overnight) return `${fmtTime(r.startTime)} → ${fmtTime(r.endTime)}`;
  return isLateStart(r.startTime)
    ? `(${fmtDate(r.date - 1)}) ${fmtTime(r.startTime)} → ${fmtTime(r.endTime)}`
    : `${fmtTime(r.startTime)} → ${fmtTime(r.endTime)} (${fmtDate(r.date + 1)})`;
}

function dayCard(ctx, r) {
  const s = ctx.state.settings;
  const bg = r.is3xOvertime ? s.color3xOvertime : r.is2xOvertime ? s.color2xOvertime : r.isOffDay ? s.colorOffDay
    : r.isOfficialBusiness ? s.colorOfficial : r.specialLeaveHours > 0 ? s.colorSpecActive : null;
  const tags = [];
  if (r.is3xOvertime) tags.push('3X'); else if (r.is2xOvertime) tags.push('2X');
  if (r.specialLeaveHours > 0) tags.push(`特休 ${fmtNum(r.specialLeaveHours)}h`);
  if (r.isOffDay) tags.push('輪空');
  if (r.isOfficialBusiness) tags.push('其他');
  if (r.nightShiftCount) tags.push(`夜點 ${r.nightShiftCount}`);
  const total = recordTripCount(r);
  return h('button', { class: 'card day-card' + (bg ? ' tinted' : ''), type: 'button', style: bg ? { '--tint': bg } : null, onclick: () => openRecordEditor(ctx, r) },
    h('div', { class: 'row-between' },
      h('b', {}, `${fmtDate(r.date)} ${weekdayLabel(r.date)}`),
      h('span', { class: 'muted' }, r.startTime != null ? fmtDuration(workMinutes(r)) : '')),
    h('div', { class: 'row-between' }, h('span', {}, shiftText(r)), h('b', {}, total ? fmtNum(total) + ' 趟' : '')),
    tags.length ? h('div', { class: 'chips' }, tags.map((t) => h('span', { class: 'chip' }, t))) : null,
    r.trips.length ? h('div', { class: 'small muted' }, r.trips.map((t) => `${t.destination || '?'}・${t.acidType || '?'}`).join('　')) : null,
    r.remarks ? h('div', { class: 'small' }, '📝 ' + r.remarks) : null);
}

export function openRecordEditor(ctx, rec) {
  const today = todayEpochDay();
  const r = rec ? JSON.parse(JSON.stringify(rec)) : { id: 0, date: today, startTime: null, endTime: null, driverName: '', nightShiftCount: 0,
    is2xOvertime: false, is3xOvertime: false, specialLeaveHours: 0, isOffDay: false, isOfficialBusiness: false, trips: [], remarks: '', isNextDay: false };
  const s0 = r.startTime, e0 = r.endTime;
  let startDate = s0 != null && e0 != null && e0 < s0 && isLateStart(s0) ? r.date - 1 : r.date;
  let endDate = s0 != null && e0 != null && (r.isNextDay || e0 < s0) ? startDate + 1 : startDate;
  let startStr = s0 != null ? fmtTime(s0).replace(':', '') : '';
  let endStr = e0 != null ? fmtTime(e0).replace(':', '') : '';

  const endDateInput = h('input', { class: 'input', type: 'date', value: toDateInput(endDate), onchange: (e) => (endDate = fromDateInput(e.target.value)) });
  const tripsBox = h('div', {});
  const drawTrips = () => {
    const mult = overtimeMultiplier(r.is2xOvertime, r.is3xOvertime);
    tripsBox.replaceChildren(
      ...r.trips.map((t) => tripRow(ctx.state, t, mult, () => openTripDialog(ctx, {
        initial: t,
        onSave: (nt) => { r.trips = r.trips.map((x) => (x.id === nt.id ? nt : x)); drawTrips(); },
        onDelete: () => { r.trips = r.trips.filter((x) => x.id !== t.id); drawTrips(); },
      }))),
      h('button', { class: 'btn wide', type: 'button', onclick: () => openTripDialog(ctx, {
        template: r.trips[r.trips.length - 1] || null, defaultDriver: r.trips.find((x) => x.driverName)?.driverName,
        onSave: (nt) => { r.trips = [...r.trips, nt]; drawTrips(); },
      }) }, '＋ 新增車趟'));
  };
  drawTrips();
  const ot = (key, other, label) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: r[key], onchange: (e) => {
    r[key] = e.target.checked; if (r[key]) { r[other] = false; const o = e.target.closest('.form').querySelector(`[data-k="${other}"]`); if (o) o.checked = false; } drawTrips();
  }, 'data-k': key }), label);

  const body = h('div', { class: 'form' },
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, h('span', {}, '上班日期'), h('input', { class: 'input', type: 'date', value: toDateInput(startDate), onchange: (e) => {
        startDate = fromDateInput(e.target.value); endDate = startDate; endDateInput.value = toDateInput(endDate);
      } })),
      h('label', { class: 'field' }, h('span', {}, '上班時間'), h('input', { class: 'input', inputmode: 'numeric', placeholder: '例 0830', value: startStr, oninput: (e) => (startStr = e.target.value) })),
      h('label', { class: 'field' }, h('span', {}, '下班日期'), endDateInput),
      h('label', { class: 'field' }, h('span', {}, '下班時間'), h('input', { class: 'input', inputmode: 'numeric', placeholder: '例 1730', value: endStr, oninput: (e) => (endStr = e.target.value) }))),
    h('p', { class: 'hint' }, '時間輸入 4 位數字即可，例如 0830。跨夜下班請把下班日期改成隔天。'),
    h('div', { class: 'row-between' }, h('span', {}, '夜點'), stepper(r.nightShiftCount, (v) => (r.nightShiftCount = v))),
    h('div', { class: 'toggles' }, ot('is2xOvertime', 'is3xOvertime', '2X 一般加班'), ot('is3xOvertime', 'is2xOvertime', '3X 特別加班')),
    h('label', { class: 'field' }, h('span', {}, '特休時數'), h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: 0, step: 0.5, value: r.specialLeaveHours || '', placeholder: '0', oninput: (e) => (r.specialLeaveHours = parseFloat(e.target.value) || 0) })),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: r.isOffDay, onchange: (e) => (r.isOffDay = e.target.checked) }), '輪空'),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: r.isOfficialBusiness, onchange: (e) => (r.isOfficialBusiness = e.target.checked) }), '其他'),
    h('label', { class: 'field' }, h('span', {}, '備註'), h('textarea', { class: 'input', rows: 2, value: r.remarks, oninput: (e) => (r.remarks = e.target.value) })),
    h('div', { class: 'card-title' }, '車趟'), tripsBox);

  const save = async (close) => {
    const st = parseTimeInput(startStr), et = parseTimeInput(endStr);
    const isNextDay = endDate > startDate;
    const overnight = isNextDay || (endDate === startDate && st != null && et != null && et < st);
    const cardDate = st != null && overnight && isLateStart(st) ? startDate + 1 : startDate;
    const out = { ...r, date: cardDate, startTime: st, endTime: et, isNextDay };
    const others = ctx.state.workRecords.filter((x) => Math.abs(x.date - cardDate) <= 1);
    const warnings = check(out, { startInvalid: startStr.trim() !== '' && st == null, endInvalid: endStr.trim() !== '' && et == null, others });
    if (warnings.length && !(await confirmDialog('請確認打卡時間', [...warnings.map((w) => '・' + w), '仍要儲存嗎？'], { okLabel: '仍要儲存' }))) return false;
    await ctx.mutate((x) => upsertRecord(x, out));
    toast('已儲存');
  };
  const buttons = [];
  if (rec) buttons.push({ label: '刪除', kind: 'danger', onClick: async () => {
    const { m, d } = ymdOf(rec.date);
    if (!(await confirmDialog('刪除這一天的紀錄？', `${m}/${d} 的紀錄和車趟會一起刪除，無法復原。`, { okLabel: '刪除', danger: true }))) return false;
    await ctx.mutate((x) => deleteRecord(x, rec.id)); toast('已刪除');
  } });
  buttons.push({ label: '取消' }, { label: '儲存', kind: 'primary', onClick: save });
  openDialog({ title: rec ? '編輯紀錄' : '新增紀錄', body, buttons, wide: true });
}
