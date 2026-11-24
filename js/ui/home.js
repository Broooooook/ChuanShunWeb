// 本日工作
import { h, toast, openDialog, stepper, money } from './dom.js';
import { activeRecord, clockIn, clockOut, updateStatus, addTrip, updateTrip, deleteTrip } from '../core/actions.js';
import { workMinutes } from '../core/shift.js';
import { overtimeMultiplier, recordTripCount, fmtNum } from '../core/trips.js';
import { fmtTime, fmtDuration, fmtDate, weekdayLabel, todayEpochDay, monthKey } from '../core/date.js';
import { billingMonthOf } from '../core/billing.js';
import { effectiveSalary } from '../core/salary.js';
import { openTripDialog, tripRow } from './tripDialog.js';

export function renderHome(ctx) {
  const st = ctx.state, s = st.settings;
  let r = activeRecord(st);
  if (s.resetAfterPunchOut && r && r.endTime != null) r = null;
  const working = r && r.startTime != null && r.endTime == null;
  const mult = r ? overtimeMultiplier(r.is2xOvertime, r.is3xOvertime) : 1;

  // ── 狀態卡
  const statusText = working ? '上班中' : r?.endTime != null ? '已下班' : '尚未打卡';
  const card = h('section', { class: 'card status ' + (working ? 'is-working' : '') },
    h('div', { class: 'row-between' },
      h('div', {}, h('div', { class: 'muted' }, `${fmtDate(r?.date ?? todayEpochDay())} ${weekdayLabel(r?.date ?? todayEpochDay())}`),
        h('div', { class: 'status-label' }, statusText)),
      r?.startTime != null ? h('div', { class: 'big-time' }, fmtTime(r.startTime), h('small', {}, r.endTime != null ? ` → ${fmtTime(r.endTime)}` : ' 上班')) : null),
    working ? h('div', { class: 'elapsed' }, '已上班 ', h('b', {}, fmtDuration(workMinutes(r)))) : null,
    working
      ? h('button', { class: 'btn danger huge', type: 'button', onclick: () => confirmClockOut(ctx, r) }, '下班打卡')
      : h('button', { class: 'btn primary huge', type: 'button', onclick: () => ctx.mutate((x) => clockIn(x)).then(() => toast('已上班打卡')) }, '上班打卡'),
    h('div', { class: 'row-between' }, h('span', {}, '夜點'),
      stepper(r?.nightShiftCount || 0, (v) => ctx.mutate((x) => updateStatus(x, { nightShiftCount: v })))),
    h('div', { class: 'toggles' },
      toggle('2X 一般加班', r?.is2xOvertime, (on) => ctx.mutate((x) => updateStatus(x, { is2xOvertime: on, is3xOvertime: on ? false : !!r?.is3xOvertime }))),
      toggle('3X 特別加班', r?.is3xOvertime, (on) => ctx.mutate((x) => updateStatus(x, { is3xOvertime: on, is2xOvertime: on ? false : !!r?.is2xOvertime })))));

  // ── 車趟
  const trips = r?.trips || [];
  const firstDriver = trips.find((t) => t.driverName)?.driverName;
  const tripsCard = h('section', { class: 'card' },
    h('div', { class: 'card-title' }, '今日車趟', h('span', { class: 'muted' }, ` ${trips.length} 項`)),
    trips.length === 0 ? h('p', { class: 'muted center' }, '還沒有車趟') : null,
    trips.map((t) => tripRow(st, t, mult, () => openTripDialog(ctx, {
      initial: t,
      onSave: (nt) => ctx.mutate((x) => updateTrip(x, nt)),
      onDelete: () => ctx.mutate((x) => deleteTrip(x, t.id)),
    }))),
    h('button', { class: 'btn ' + (trips.length ? '' : 'primary') + ' wide', type: 'button', onclick: () => openTripDialog(ctx, {
      template: trips[trips.length - 1] || null,
      defaultDriver: firstDriver || s.defaultDriver,
      onSave: (nt) => ctx.mutate((x) => addTrip(x, nt)).then(() => toast('已新增車趟')),
    }) }, trips.length ? '＋ 新增下一趟' : '＋ 新增第一趟'),
    statusChips(r),
    h('button', { class: 'btn wide subtle', type: 'button', onclick: () => notShippedDialog(ctx, r) }, '未出車／特休／輪空／備註'));

  // ── 今日統計
  const salaryHidden = st.meta?.salaryHidden;
  const bm = r ? billingMonthOf(r.date, s.billingStartDaysMap, s.billingStartDay) : billingMonthOf(todayEpochDay(), s.billingStartDaysMap, s.billingStartDay);
  const sal = effectiveSalary(monthKey(bm.y, bm.m), st.monthlySalaries, s.salaryInfo);
  const total = r ? recordTripCount(r) : 0;
  const mins = r ? workMinutes(r) : 0;
  const avg = total > 0 && r?.startTime != null ? mins / total : 0;
  const bonus = Math.trunc(total * sal.tripBonusRate) + (r?.nightShiftCount || 0) * sal.nightShiftBonusRate;
  const summary = h('section', { class: 'card tonal' },
    h('div', { class: 'card-title' }, '今日統計'),
    line('累計工時', fmtDuration(mins)),
    line(h('span', {}, '累計車趟', h('small', { class: 'muted' }, ` (趟數+特殊)${mult > 1 ? '×' + mult : ''}+超時`)), fmtNum(total) + ' 趟'),
    line('平均時/趟', avg ? h('span', { class: avg > 199 ? 'bad' : avg < 160 ? 'good' : '' }, fmtDuration(avg)) : '--:--'),
    line('夜點', `${r?.nightShiftCount || 0} 次`),
    h('hr'),
    line(h('b', {}, '今日預估獎金'), h('b', { class: 'accent big-num' }, salaryHidden ? 'NT$ ****' : money(bonus))));

  return h('div', { class: 'stack' }, h('h1', { class: 'page-title' }, '本日工作'), card, tripsCard, summary);
}

const line = (a, b) => h('div', { class: 'row-between line' }, h('span', {}, a), h('span', {}, b));
function toggle(label, on, onChange) {
  return h('button', { type: 'button', class: 'chip-toggle' + (on ? ' on' : ''), onclick: () => onChange(!on) }, (on ? '✓ ' : '') + label);
}
function statusChips(r) {
  if (!r) return null;
  const c = [];
  if (r.specialLeaveHours > 0) c.push(h('span', { class: 'chip spec' }, `特休 ${fmtNum(r.specialLeaveHours)} 小時`));
  if (r.isOffDay) c.push(h('span', { class: 'chip off' }, '輪空'));
  if (r.isOfficialBusiness) c.push(h('span', { class: 'chip other' }, '其他'));
  if (r.remarks) c.push(h('span', { class: 'chip note' }, '📝 ' + r.remarks));
  return c.length ? h('div', { class: 'chips' }, c) : null;
}

function confirmClockOut(ctx, r) {
  const total = recordTripCount(r);
  openDialog({
    title: '確認下班',
    body: h('div', {},
      h('p', {}, '下班後仍可在「記錄」頁修改。'),
      h('div', { class: 'card tonal' },
        line('上班時間', fmtTime(r.startTime)), line('目前工時', fmtDuration(workMinutes(r))),
        line('車趟', `${r.trips.length} 項／${fmtNum(total)} 趟`), r.nightShiftCount ? line('夜點', `${r.nightShiftCount} 次`) : null)),
    buttons: [
      { label: '繼續編輯' },
      { label: '確認下班', kind: 'danger', onClick: async () => {
        await ctx.mutate((x) => clockOut(x));
        const noTrips = r.trips.length === 0 && !r.isOffDay && !r.isOfficialBusiness && !(r.specialLeaveHours > 0);
        toast(noTrips ? '已下班打卡。提醒：這班還沒有記錄任何車趟' : '已下班打卡，辛苦了！', noTrips ? 4500 : 2600);
      } },
    ],
  });
}

function notShippedDialog(ctx, r) {
  const v = { specialLeaveHours: r?.specialLeaveHours || 0, isOffDay: !!r?.isOffDay, isOfficialBusiness: !!r?.isOfficialBusiness, remarks: r?.remarks || '' };
  openDialog({
    title: '未出車設定',
    body: h('div', { class: 'form' },
      h('label', { class: 'field' }, h('span', {}, '特休時數'),
        h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: 0, step: 0.5, value: v.specialLeaveHours || '', placeholder: '0',
          oninput: (e) => (v.specialLeaveHours = parseFloat(e.target.value) || 0) })),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: v.isOffDay, onchange: (e) => (v.isOffDay = e.target.checked) }), '輪空（上班日但沒出車）'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: v.isOfficialBusiness, onchange: (e) => (v.isOfficialBusiness = e.target.checked) }), '其他'),
      h('label', { class: 'field' }, h('span', {}, '備註'), h('textarea', { class: 'input', rows: 2, value: v.remarks, oninput: (e) => (v.remarks = e.target.value) }))),
    buttons: [{ label: '取消' }, { label: '儲存', kind: 'primary', onClick: () => ctx.mutate((x) => updateStatus(x, v)) }],
  });
}
