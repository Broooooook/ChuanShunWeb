// 本日工作（對應 Android HomeScreen：StatusCard、TaskCard、未出荷、今日統計）
import { h, toast, openDialog, money, appBar, columnStepper, checkRow } from './dom.js';
import { activeRecord, clockIn, clockOut, updateStatus, addTrip, updateTrip, deleteTrip } from '../core/actions.js';
import { workMinutes } from '../core/shift.js';
import { overtimeMultiplier, recordTripCount, recordExtraBonus, fmtNum } from '../core/trips.js';
import { fmtTime, fmtDuration, todayEpochDay, monthKey, ymdOf } from '../core/date.js';
import { billingMonthOf, isBillingLastDay } from '../core/billing.js';
import { effectiveSalary } from '../core/salary.js';
import { openTripDialog, tripItem } from './tripDialog.js';

const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const pad = (n) => String(n).padStart(2, '0');
const hms = (sec) => `${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`;

/** 每秒更新時鐘與工作計時（不重畫整頁） */
let ticker = null;
function startTicker() {
  if (ticker) return;
  ticker = setInterval(() => {
    const now = new Date();
    document.querySelectorAll('[data-clock]').forEach((el) => { el.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`; });
    document.querySelectorAll('[data-since]').forEach((el) => { el.textContent = hms(Math.max(0, Math.floor((now.getTime() - Number(el.dataset.since)) / 1000))); });
  }, 1000);
}

export function renderHome(ctx) {
  startTicker();
  const st = ctx.state, s = st.settings;
  let r = activeRecord(st);
  const working = !!(r && r.startTime != null && r.endTime == null);
  const today = todayEpochDay();
  const overnightOpen = working && r.date < today;
  const headDay = overnightOpen ? r.date : today;
  const { m, d, dow } = ymdOf(headDay);
  const trips = r?.trips || [];
  const now = new Date();

  // ── StatusCard
  let timerEl = null;
  if (r?.startTime != null) {
    if (working) {
      const start = new Date(); const { y: yy, m: mm, d: dd } = ymdOf(r.date);
      start.setFullYear(yy, mm - 1, dd); start.setHours(Math.floor(r.startTime / 3600), Math.floor(r.startTime / 60) % 60, r.startTime % 60, 0);
      timerEl = h('div', { class: 'timer working', 'data-since': start.getTime() }, hms(Math.max(0, Math.floor((now - start) / 1000))));
    } else {
      timerEl = h('div', { class: 'timer' }, hms(workMinutes(r, { nowIfStillWorking: false }) * 60));
    }
  }
  // 本日已下班：改成半大小、靠左的紅色「本日再打卡」，避免誤以為沒打卡或誤觸；23:30 起自動回到新一天。
  const doneToday = !working && r?.startTime != null && r?.endTime != null;
  const actionLabel = working ? '結束班次' : doneToday ? '本日再打卡' : '開始上班';
  const statusCard = h('section', { class: 'card elevated' },
    h('div', { class: 'row-between' },
      h('div', { class: 'row-wrap' }, h('span', { class: 'title-md' }, `${m}月${d}日 ${WEEK[dow]}`),
        overnightOpen ? h('span', { class: 'tag tertiary' }, '跨夜中') : null,
        trips.some((t) => t.isImportant) ? h('span', { class: 'tag error' }, '★ 注意') : null),
      h('span', { class: 'clock', 'data-clock': '' }, `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`)),
    r?.startTime != null ? h('div', { class: 'row-between' },
      h('div', {}, h('div', { class: 'label-sm' }, '上班時間'), h('div', { class: 'big-time' }, fmtTime(r.startTime))),
      h('div', { class: 'right' }, h('div', { class: 'label-sm' }, '工作時間'), timerEl)) : null,
    r?.endTime != null ? h('div', {}, h('span', { class: 'muted' }, '下班時間：'), h('b', { class: 'error-text' }, fmtTime(r.endTime))) : null,
    h('button', { class: 'btn ' + (doneToday ? 'again-action danger' : 'big-action ' + (working ? 'danger' : 'primary')), type: 'button',
      onclick: () => (working ? confirmClockOut(ctx, r) : ctx.mutate((x) => clockIn(x)).then(() => toast('已上班打卡'))) }, actionLabel),
    h('hr'),
    h('div', { class: 'status-controls' },
      columnStepper('夜點(次)', r?.nightShiftCount || 0, (v) => ctx.mutate((x) => updateStatus(x, { nightShiftCount: v }))),
      h('div', { class: 'ot-checks' },
        checkRow('2X 加班', !!r?.is2xOvertime, (on) => ctx.mutate((x) => updateStatus(x, { is2xOvertime: on, is3xOvertime: on ? false : !!r?.is3xOvertime }))),
        checkRow('3X 加班', !!r?.is3xOvertime, (on) => ctx.mutate((x) => updateStatus(x, { is3xOvertime: on, is2xOvertime: on ? false : !!r?.is2xOvertime }))))));

  // ── TaskCard 今日排程
  const firstDriver = trips.find((t) => t.driverName)?.driverName;
  const openAdd = () => openTripDialog(ctx, {
    template: trips[trips.length - 1] || null, defaultDriver: firstDriver || s.defaultDriver,
    onSave: (nt) => ctx.mutate((x) => addTrip(x, nt)).then(() => toast('已新增排程項目')),
  });
  const spec = r?.specialLeaveHours || 0, off = !!r?.isOffDay, official = !!r?.isOfficialBusiness;
  const taskBg = r?.is3xOvertime ? 'bg-error' : r?.is2xOvertime ? 'bg-tertiary' : '';
  const taskCard = h('section', { class: 'card task ' + taskBg },
    h('div', { class: 'row-between' }, h('span', { class: 'title-md b' }, '今日排程'),
      trips.length ? h('button', { class: 'btn primary small', type: 'button', onclick: openAdd }, '＋ 新增排程項目') : null),
    trips.length === 0 && !off && !(spec > 0)
      ? h('div', { class: 'stack center' },
        h('button', { class: 'btn primary big-action', type: 'button', onclick: openAdd }, '＋ 輸入第一趟'),
        h('p', { class: 'muted small' }, '先輸入第一趟排程；之後新增的項目會自動帶入前一趟資料。', h('br'), '點擊列表中的項目可進行編輯或刪除。'))
      : h('div', { class: 'trip-list' }, trips.map((t, i) => tripItem(st, t, i, () => openTripDialog(ctx, {
        initial: t, onSave: (nt) => ctx.mutate((x) => updateTrip(x, nt)), onDelete: () => ctx.mutate((x) => deleteTrip(x, t.id)),
      })))),
    off || spec > 0 || official ? h('div', { class: 'today-status', style: { background: off ? s.colorOffDay : official ? s.colorOfficial : s.colorSpecActive } },
      '今日狀態：' + [spec > 0 ? `特休 (${fmtNum(spec)} 小時)` : null, off ? '輪空' : null,
        official ? (r.remarks ? `其它 (${r.remarks})` : '其它') : null].filter(Boolean).join(' / ') + (off ? ' (上班日不打卡)' : '')) : null);

  const active = spec > 0 || off || official;
  const notShippedBtn = h('button', { class: 'btn outline wide' + (active ? ' active' : ''), type: 'button', onclick: () => notShippedDialog(ctx, r) },
    active ? '＋ 未出荷設定' : '＋ 未出荷 (特休/輪空/其它)');

  // ── 今日統計
  const mult = r ? overtimeMultiplier(r.is2xOvertime, r.is3xOvertime) : 1;
  const bm = billingMonthOf(r?.date ?? today, s.billingStartDaysMap, s.billingStartDay);
  const sal = effectiveSalary(monthKey(bm.y, bm.m), st.monthlySalaries, s.salaryInfo);
  const total = r ? recordTripCount(r) : 0;
  const mins = r ? workMinutes(r) : 0;
  const avg = total > 0 && r?.startTime != null ? Math.floor(mins / total) : null;
  const bonus = Math.trunc(total * sal.tripBonusRate) + (r ? recordExtraBonus(r) : 0) + (r?.nightShiftCount || 0) * sal.nightShiftBonusRate;
  const line = (a, b) => h('div', { class: 'row-between line' }, h('span', {}, a), h('b', {}, b));
  const summary = h('section', { class: 'card bg-tertiary-soft' },
    h('div', { class: 'title-md b' }, '今日統計'), h('hr'),
    line('累計工時', fmtDuration(mins)),
    h('div', { class: 'row-between line' }, h('div', {}, '累計車趟', h('div', { class: 'formula' }, `(趟數+特殊)${mult > 1 ? '×' + mult : ''}+超時`)), h('b', {}, fmtNum(total) + ' 趟')),
    line('平均時/趟', avg == null ? '--:--' : h('span', { class: avg > 199 ? 'error-text' : avg >= 1 && avg < 160 ? 'good' : '' }, fmtDuration(avg))),
    line('夜點', `${r?.nightShiftCount || 0} 次`), h('hr'),
    h('div', { class: 'row-between' }, h('span', { class: 'title-lg' }, '今日預估獎金'), h('span', { class: 'bonus' }, st.meta?.salaryHidden ? 'NT$ ****' : money(bonus))));

  return h('div', { class: 'stack' }, appBar('本日工作'), statusCard, taskCard, notShippedBtn, summary);
}

function confirmClockOut(ctx, r) {
  const total = recordTripCount(r);
  const line = (a, b) => h('div', { class: 'row-between line' }, h('span', { class: 'muted' }, a), h('b', {}, b));
  openDialog({
    title: '確認結束班次',
    body: h('div', { class: 'stack' }, h('p', {}, '請確認今天的排程與班次資料。下班後仍可從「記錄」頁修改。'),
      h('div', { class: 'summary-box' }, line('上班時間', fmtTime(r.startTime)), line('目前工時', fmtDuration(workMinutes(r))),
        line('排程項目', `${r.trips.length} 項／${fmtNum(total)} 趟`), r.nightShiftCount ? line('夜點', `${r.nightShiftCount} 次`) : null)),
    buttons: [{ label: '繼續編輯' }, { label: '確認下班', kind: 'danger', onClick: async () => {
      let done = null;
      await ctx.mutate((x) => { done = clockOut(x); });
      const noTrips = r.trips.length === 0 && !r.isOffDay && !r.isOfficialBusiness && !(r.specialLeaveHours > 0);
      toast(noTrips ? '已下班打卡。提醒：這班還沒有記錄任何車趟' : '已下班打卡，辛苦了！', noTrips ? 4500 : 2600);
      const s = ctx.state.settings;
      if (done && isBillingLastDay(done.date, s.billingStartDaysMap, s.billingStartDay)) monthEndReminder(ctx, done.date);
    } }],
  });
}

/** 計酬月最後一天下班後：提醒匯出對帳單和備份，按確定跳到統計頁（只有網頁版有） */
function monthEndReminder(ctx, date) {
  const s = ctx.state.settings;
  setTimeout(() => openDialog({
    title: '本月最後一天',
    body: h('p', {}, '記得匯出本月薪資對帳單和備份記錄唷'),
    buttons: [{ label: '確定', kind: 'primary', onClick: () => {
      ctx.view.stats = { mode: 'MONTH', ...billingMonthOf(date, s.billingStartDaysMap, s.billingStartDay), year: ymdOf(date).y };
      ctx.go('stats');
    } }],
  }), 300);
}

/** 未出荷設定（對應 Android NotShippedDialog：特休／輪空／其它＋備註） */
function notShippedDialog(ctx, r) {
  const s = ctx.state.settings;
  const v = { specialLeaveHours: r?.specialLeaveHours || 0, isOffDay: !!r?.isOffDay, isOfficialBusiness: !!r?.isOfficialBusiness, remarks: r?.remarks || '' };
  const specBox = h('div', { class: 'ns-box' });
  const paintSpec = () => { specBox.style.background = v.specialLeaveHours > 0 ? s.colorSpecActive : ''; specBox.classList.toggle('on', v.specialLeaveHours > 0); };
  specBox.append(h('b', {}, '特休'), h('label', { class: 'field' }, h('span', {}, '特休時數（小時）'),
    h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: 0, step: 0.5, value: v.specialLeaveHours || '', placeholder: '0',
      oninput: (e) => { v.specialLeaveHours = parseFloat(e.target.value) || 0; paintSpec(); } })));
  paintSpec();
  const toggleBox = (key, title, desc, color) => {
    const box = h('button', { type: 'button', class: 'ns-box toggle' });
    const paint = () => { box.style.background = v[key] ? color : ''; box.classList.toggle('on', v[key]); box.replaceChildren(h('b', {}, (v[key] ? '☑ ' : '☐ ') + title), h('div', { class: 'small muted' }, desc)); };
    box.addEventListener('click', () => { v[key] = !v[key]; paint(); });
    paint();
    return box;
  };
  openDialog({
    title: '未出荷設定',
    body: h('div', { class: 'form' }, specBox,
      toggleBox('isOffDay', '輪空', '上班日但沒有出車', s.colorOffDay),
      toggleBox('isOfficialBusiness', '其它', '其他狀況（可在備註寫原因）', s.colorOfficial),
      h('label', { class: 'field' }, h('span', {}, '備註'), h('textarea', { class: 'input', rows: 2, value: v.remarks, oninput: (e) => (v.remarks = e.target.value) }))),
    buttons: [{ label: '取消' }, { label: '儲存', kind: 'primary', onClick: () => ctx.mutate((x) => updateStatus(x, v)) }],
  });
}
