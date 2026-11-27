// 統計：月／年摘要、每日工時圖、分類統計、薪資明細、勞基法試算、匯出對帳單
import { h, openDialog, promptDialog, money, toast, appBar } from './dom.js';
import { billingRange, billingRangeStr, billingMonthOf } from '../core/billing.js';
import { addMonths, monthKey, todayEpochDay, fmtDuration, ymdOf, fmtDate, weekdayLabel } from '../core/date.js';
import { workMinutes, isDraft, splitToDaySegments } from '../core/shift.js';
import { recordTripCount, aggregateBy, fmtNum, areaCounts, AREAS, tripRatesOf, weightedTrips } from '../core/trips.js';
import { effectiveSalary, monthSummary, INCOME, DEDUCTIONS, SALARY_FIELDS } from '../core/salary.js';
import * as Law from '../core/labor.js';
import { buildStatement, buildLawSection, statementXlsx, statementHtml } from '../core/statement.js';
import { saveFile } from './files.js';

export function renderStats(ctx) {
  const v = ctx.view.stats ||= { mode: 'MONTH', ...billingMonthOf(todayEpochDay(), ctx.state.settings.billingStartDaysMap, ctx.state.settings.billingStartDay), year: ymdOf(todayEpochDay()).y };
  const hidden = ctx.state.meta?.salaryHidden !== false; // 預設不顯示本薪，按眼睛才顯示
  const head = appBar('統計',
    h('button', { class: 'icon-btn', type: 'button', title: hidden ? '顯示金額' : '隱藏金額', onclick: () => ctx.mutate((s) => { s.meta = { ...s.meta, salaryHidden: !hidden }; }) }, hidden ? '🙈' : '👁️'));
  const modeBar = h('div', { class: 'seg center-seg' },
    ['MONTH', 'YEAR'].map((m) => h('button', { type: 'button', class: 'seg-btn' + (v.mode === m ? ' on' : ''), onclick: () => { v.mode = m; ctx.render(); } }, m === 'MONTH' ? '按月檢視' : '按年檢視')));
  return h('div', { class: 'stack' }, head, modeBar, v.mode === 'MONTH' ? monthView(ctx, v, hidden) : yearView(ctx, v, hidden));
}

const line = (a, b, cls = '') => h('div', { class: 'row-between line ' + cls }, h('span', {}, a), h('span', {}, b));
const hoursFmt = (h1) => `${h1.toFixed(1)} 小時 (${(h1 / 8).toFixed(1)} 日)`;
/** 各區域車趟次數（沒有的不顯示；全部都沒有時顯示 0） */
const countLines = (c) => {
  const rows = [...AREAS.map((a) => [`${a.label}車趟`, c[a.key]]), ['特殊趟', c.special], ['超時趟', c.overtime]].filter(([, n]) => n > 0);
  return rows.length ? rows.map(([l, n]) => line(l, `${fmtNum(n)} 次`)) : [line('車趟', '0 次')];
};
const orderOf = (s, key) => Object.fromEntries((s[key] || []).map((o) => [o.name, o.order]));

function monthView(ctx, v, hidden) {
  const st = ctx.state, s = st.settings;
  const mKey = monthKey(v.y, v.m);
  const range = billingRange(v.y, v.m, s.billingStartDaysMap, s.billingStartDay);
  const recs = st.workRecords.filter((r) => r.date >= range.start && r.date <= range.end && !isDraft(r));
  const sal = effectiveSalary(mKey, st.monthlySalaries, s.salaryInfo);
  const sum = monthSummary(recs, sal, tripRatesOf(s));
  const days = recs.filter((r) => r.startTime != null || r.isOffDay).length;
  const mins = recs.reduce((a, r) => a + workMinutes(r), 0);
  const yearUsed = st.workRecords.filter((r) => !isDraft(r) && billingMonthOf(r.date, s.billingStartDaysMap, s.billingStartDay).y === v.y).reduce((a, r) => a + (r.specialLeaveHours || 0), 0);
  const monthUsed = recs.reduce((a, r) => a + (r.specialLeaveHours || 0), 0);
  const nav = (d) => () => { Object.assign(v, addMonths(v.y, v.m, d)); ctx.render(); };
  // 眼睛按鈕只遮本薪（和 Android 一樣：本薪、勞基法試算金額、年度實領）
  const m$ = (x) => money(x);

  const editSalary = async (key, label) => {
    const val = await promptDialog(label, { label: `只改 ${v.y} 年 ${v.m} 月起的金額（之前月份不變）`, value: String(sal[key] ?? 0), inputmode: 'decimal' });
    if (val == null) return;
    const n = key === 'totalSpecialLeave' ? parseFloat(val) : parseInt(val, 10);
    if (isNaN(n)) return;
    ctx.mutate((x) => {
      const base = effectiveSalary(mKey, x.monthlySalaries, x.settings.salaryInfo);
      const entity = { monthKey: mKey };
      SALARY_FIELDS.forEach((k) => (entity[k] = base[k] || 0));
      entity.totalSpecialLeave = base.totalSpecialLeave ?? null;
      entity[key] = n;
      x.monthlySalaries = [...x.monthlySalaries.filter((e) => e.monthKey !== mKey), entity];
    });
  };
  const edit = (key, label, text) => h('button', { class: 'row-between line editable', type: 'button', onclick: () => editSalary(key, label) }, h('span', {}, label, ' ✎'), h('span', {}, text));

  return h('div', { class: 'stack' },
    h('div', { class: 'month-nav' },
      h('button', { class: 'icon-btn', type: 'button', onclick: nav(-1) }, '‹'),
      h('div', { class: 'center' }, h('b', {}, `${v.y} 年 ${v.m} 月 計酬月份`)),
      h('button', { class: 'icon-btn', type: 'button', onclick: nav(1) }, '›')),
    h('div', { class: 'range-pill' }, `計酬區間：${billingRangeStr(v.y, v.m, s.billingStartDaysMap, s.billingStartDay)}`),
    h('section', { class: 'card' },
      h('div', { class: 'card-title' }, '當月摘要'),
      line('出勤班次', `${days} 班`), line('總工時', fmtDuration(mins)),
      ...countLines(sum.counts),
      line('夜點', `${sum.night} 次`),
      line(h('b', {}, '加權車趟'), h('b', {}, `${fmtNum(weightedTrips(recs))} 趟`)),
      line('平均每日工時', `${days ? (mins / 60 / days).toFixed(1) : '0.0'} 小時`),
      line('平均每趟工時', sum.trips > 0 ? fmtDuration(mins / sum.trips) : '00:00'),
      line('平均每日車趟', `${days ? (weightedTrips(recs) / days).toFixed(1) : '0.0'} 趟`), h('hr'),
      line(h('b', {}, '本月實領薪資'), h('b', { class: 'accent' }, m$(sum.net))), h('hr'),
      line('特休・本月已用', hoursFmt(monthUsed)), line('特休・今年已用', hoursFmt(yearUsed)),
      line('特休・剩餘', hoursFmt((sal.totalSpecialLeave || 0) - yearUsed)),
      edit('totalSpecialLeave', '特休・總共（小時）', hoursFmt(sal.totalSpecialLeave || 0))),
    dailyChart(recs, range),
    barList('目的地統計（次數）', aggregateBy(recs, (t) => t.destination, orderOf(s, 'destinations'))),
    h('div', { class: 'grid2' },
      barList('酸別統計（次數）', aggregateBy(recs, (t) => t.acidType, orderOf(s, 'acidTypes'))),
      barList('搭檔統計（次數）', aggregateBy(recs, (t) => t.driverName, orderOf(s, 'drivers')))),
    h('section', { class: 'card tonal2' },
      h('div', { class: 'card-title' }, '薪資明細', h('small', { class: 'muted' }, '（點項目可修改本月起的金額）')),
      h('div', { class: 'muted small' }, '收入項目'),
      INCOME.map(([k, l]) => edit(k, l, k === 'baseSalary' && hidden ? 'NT$ ****' : m$(sal[k] || 0))),
      line('車趟獎金', m$(sum.tripBonus)), line('夜點獎金', m$(sum.nightBonus)),
      line(h('b', {}, '月薪合計'), h('b', {}, m$(sum.gross))), h('hr'),
      h('div', { class: 'muted small bad' }, '扣款項目'),
      DEDUCTIONS.map(([k, l]) => edit(k, l, '- ' + money(sal[k] || 0))),
      line(h('b', {}, '扣款合計'), h('b', {}, '- ' + money(sum.deduction)))),
    h('button', { class: 'btn wide primary', type: 'button', onclick: () => exportChooser(ctx, v, recs, sal, sum) }, '🧾 匯出本月薪資對帳單'),
    laborCard(ctx, recs, sal, sum, hidden));
}

function dailyChart(recs, range) {
  const segs = new Map();
  const nowSec = new Date().getHours() * 3600 + new Date().getMinutes() * 60;
  for (const r of recs) {
    if (r.startTime == null) continue;
    for (const sg of splitToDaySegments(r.date, r.startTime, r.endTime ?? nowSec, r.isNextDay)) {
      if (!segs.has(sg.day)) segs.set(sg.day, []);
      segs.get(sg.day).push(sg);
    }
  }
  const today = todayEpochDay();
  const rows = [];
  for (let d = range.start; d <= range.end && d <= today; d++) {
    const list = segs.get(d) || [];
    const total = list.reduce((a, x) => a + (x.endMin - x.startMin), 0);
    const bar = h('div', { class: 'bar-track' });
    for (const x of list) {
      const piece = (a, b, night) => { if (b > a) bar.append(h('span', { class: 'bar-piece' + (night ? ' night' : ''), style: { left: (a / 14.4) + '%', width: ((b - a) / 14.4) + '%' } })); };
      piece(x.startMin, Math.min(x.endMin, 360), true);
      piece(Math.max(x.startMin, 360), Math.min(x.endMin, 1080), false);
      piece(Math.max(x.startMin, 1080), x.endMin, true);
    }
    rows.push(h('div', { class: 'bar-row' }, h('span', { class: 'bar-day' }, String(ymdOf(d).d).padStart(2, '0')), bar,
      h('span', { class: 'bar-total' }, total ? `${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, '0')}` : '')));
  }
  return h('section', { class: 'card' },
    h('div', { class: 'card-title' }, '每日工時分佈（24 小時）', h('small', { class: 'muted' }, ' 紅色＝18:00～06:00')),
    h('div', { class: 'bar-axis' }, ['00', '06', '12', '18', '24'].map((t) => h('span', {}, t))),
    rows.length ? h('div', { class: 'bars' }, rows) : h('p', { class: 'muted center' }, '暫無數據'));
}

function barList(title, data) {
  const max = Math.max(1, ...data.map(([, n]) => n));
  return h('section', { class: 'card' }, h('div', { class: 'card-title' }, title),
    data.length ? data.map(([k, n]) => h('div', { class: 'hbar' },
      h('div', { class: 'row-between small' }, h('span', {}, k), h('b', {}, fmtNum(n))),
      h('div', { class: 'hbar-track' }, h('span', { style: { width: (n / max * 100) + '%' } }))))
      : h('p', { class: 'muted center small' }, '暫無數據'));
}

function lawBase(ctx, sal, sum) {
  const law = ctx.state.settings.law || { breakMinutes: 60, dayMode: 'MARKS', includeBonus: true };
  const base = sal.baseSalary + sal.foodAllowance + sal.regionAllowance + sal.attendanceBonus + (law.includeBonus ? sum.tripBonus + sum.nightBonus : 0);
  return { law, base };
}

function laborCard(ctx, recs, sal, sum, hidden) {
  const { law, base } = lawBase(ctx, sal, sum);
  const m$ = (x) => (hidden ? 'NT$ ****' : money(x));
  const card = h('section', { class: 'card law' },
    h('div', { class: 'row-between' },
      h('div', {}, h('div', { class: 'card-title' }, '⚖️ 勞基法加班費試算'), h('div', { class: 'small muted' }, '僅供參考，不計入上方薪資')),
      h('button', { class: 'btn small', type: 'button', onclick: () => lawSettings(ctx, law) }, '計算設定')));
  if (base <= 0) { card.append(h('p', {}, '請先在「薪資明細」填入本薪，才能估算時薪與加班費。')); return card; }
  const r = Law.calculate(recs, base, law.breakMinutes, law.dayMode, ctx.state.workRecords);
  card.append(
    line('月薪基數', m$(base)), line('平日每小時工資額（÷240）', hidden ? 'NT$ ****' : 'NT$ ' + r.hourlyWage.toFixed(1)), h('hr'),
    ...[0, 1, 2].filter((k) => k === 0 || r.workedDaysOf(k) > 0).map((k) =>
      line(`${Law.DayKindLabel[k]}（${r.workedDaysOf(k)} 天，加班 ${r.overtimeHoursOf(k).toFixed(1)} 小時）`, m$(r.payOf(k)))),
    line(h('b', {}, '依法應得加班費合計'), h('b', { class: 'accent' }, m$(r.totalPay))),
    line('本月延長工時', `${r.totalOvertimeHours.toFixed(1)} 小時 / 上限 46 小時`));
  if (r.exceedsMonthlyCap || r.daysOverDailyCap || r.daysShortRest || r.belowMinimumWage) {
    card.append(h('div', { class: 'warn-box' }, h('b', {}, '⚠️ 超過法定上限'),
      r.exceedsMonthlyCap ? h('div', {}, '・本月延長工時超過 46 小時（第 32 條）') : null,
      r.daysOverDailyCap ? h('div', {}, `・有 ${r.daysOverDailyCap} 天工時超過 12 小時（第 32 條）`) : null,
      r.daysShortRest ? h('div', {}, `・有 ${r.daysShortRest} 次兩班間隔不到 11 小時（第 34 條）`) : null,
      r.belowMinimumWage ? h('div', {}, '・月薪基數低於 2026 年最低工資 29,500 元') : null));
  }
  card.append(
    h('details', {}, h('summary', {}, '每日明細'),
      r.days.filter((d) => d.pay > 0 || d.exceedsDailyCap || d.restBeforeMinutes != null).map((d) =>
        line(`${fmtDate(d.date)} ${weekdayLabel(d.date)} ${Law.DayKindLabel[d.kind]} ${(d.workedMinutes / 60).toFixed(1)}h${d.exceedsDailyCap ? ' ⚠' : ''}${d.restBeforeMinutes != null ? ` 休${(d.restBeforeMinutes / 60).toFixed(1)}h ⚠` : ''}`, m$(Math.round(d.pay)))),
      r.days.some((d) => d.pay > 0) ? null : h('p', { class: 'small muted' }, '本月沒有超過 8 小時或假日出勤的紀錄。')),
    h('p', { class: 'small muted' },
      '計算方式：時薪＝月薪基數÷240；平日超過 8 小時，前 2 小時×4/3、之後×5/3；休息日按實際時數，前 2 小時×4/3、第 3–8 小時×5/3、第 9 小時起×8/3；' +
      `例假／國定假日 8 小時內加發 1 日工資，超過部分依平日加班計算。每班扣除休息 ${law.breakMinutes} 分鐘；日別「${Law.DayModes[law.dayMode]?.label}」。` +
      (law.dayMode === 'MARKS' ? '3X 若是颱風假出勤，法令沒有強制加倍（勞動部只建議雇主加給），依法應得可能低於此估算。' : '') +
      '兩班間隔：同一天打多次卡算同一個工作天，比較前一個工作天最後下班到這天第一次上班的時間；法條寫的是輪班制換班，是否適用依實際認定。' +
      '未考慮變形工時、責任制（第 84-1 條）、補休或公司另有約定，實際以勞動部及主管機關認定為準。'));
  return card;
}

function lawSettings(ctx, law) {
  const v = { ...law };
  openDialog({
    title: '加班費試算設定',
    body: h('div', { class: 'form' },
      h('div', { class: 'card-title' }, '如何判斷平日／休息日／假日'),
      Object.entries(Law.DayModes).map(([k, m]) => h('label', { class: 'radio' },
        h('input', { type: 'radio', name: 'daymode', checked: v.dayMode === k, onchange: () => (v.dayMode = k) }),
        h('span', {}, h('b', {}, m.label), h('br'), h('small', { class: 'muted' }, m.description)))),
      h('label', { class: 'field' }, h('span', {}, '每班扣除休息（分鐘）'),
        h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 0, max: 240, value: v.breakMinutes, oninput: (e) => (v.breakMinutes = Math.max(0, Math.min(240, parseInt(e.target.value, 10) || 0))) }),
        h('small', { class: 'muted' }, '休息時間不算工時；勞基法規定連續工作 4 小時至少休息 30 分鐘')),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: v.includeBonus, onchange: (e) => (v.includeBonus = e.target.checked) }),
        h('span', {}, '車趟／夜點獎金計入時薪基數', h('br'), h('small', { class: 'muted' }, '每月固定發放、因工作而得的獎金通常屬於「工資」')))),
    buttons: [{ label: '取消' }, { label: '儲存', kind: 'primary', onClick: () => ctx.mutate((x) => { x.settings.law = v; }) }],
  });
}

function exportChooser(ctx, v, recs, sal, sum) {
  const s = ctx.state.settings;
  const { law, base } = lawBase(ctx, sal, sum);
  const lawSec = base > 0 ? buildLawSection(Law.calculate(recs, base, law.breakMinutes, law.dayMode, ctx.state.workRecords), law.breakMinutes, law.dayMode) : null;
  const data = buildStatement({ y: v.y, m: v.m, rangeText: billingRangeStr(v.y, v.m, s.billingStartDaysMap, s.billingStartDay), records: recs, salary: sal, summary: sum, law: lawSec });
  const close = openDialog({
    title: '匯出格式',
    body: h('div', { class: 'stack' },
      h('button', { class: 'choice', type: 'button', onclick: () => { close(); printStatement(data); } },
        h('b', {}, '📄 PDF（列印）'), h('small', {}, '出現列印畫面後，印表機選「另存為 PDF」或「儲存為 PDF」')),
      h('button', { class: 'choice', type: 'button', onclick: async () => {
        close();
        const ok = await saveFile(`${data.fileBase}.xlsx`, statementXlsx(data), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        if (ok) toast('已匯出 Excel 檔');
      } }, h('b', {}, '📊 Excel 試算表 (.xlsx)'), h('small', {}, '每日明細＋薪資明細兩個工作表，可加總、篩選'))),
    buttons: [{ label: '取消' }],
  });
}

function printStatement(data) {
  document.getElementById('print-area')?.remove();
  const box = h('div', { id: 'print-area', html: statementHtml(data) });
  document.body.append(box);
  const prevTitle = document.title;
  document.title = data.fileBase;
  setTimeout(() => {
    window.print();
    setTimeout(() => { document.title = prevTitle; box.remove(); }, 1000);
  }, 100);
}

function yearView(ctx, v, hidden) {
  const st = ctx.state, s = st.settings;
  const recs = st.workRecords.filter((r) => !isDraft(r) && billingMonthOf(r.date, s.billingStartDaysMap, s.billingStartDay).y === v.year);
  const byMonth = new Map();
  recs.forEach((r) => { const bm = billingMonthOf(r.date, s.billingStartDaysMap, s.billingStartDay); const k = monthKey(bm.y, bm.m); if (!byMonth.has(k)) byMonth.set(k, []); byMonth.get(k).push(r); });
  let net = 0; const monthRows = [];
  [...byMonth.keys()].sort().forEach((k) => {
    const sm = monthSummary(byMonth.get(k), effectiveSalary(k, st.monthlySalaries, s.salaryInfo), tripRatesOf(s));
    net += sm.net;
    monthRows.push(line(`${parseInt(k.slice(5), 10)} 月（${fmtNum(sm.trips)} 趟）`, money(sm.net)));
  });
  const days = recs.filter((r) => r.startTime != null || r.isOffDay).length;
  const mins = recs.reduce((a, r) => a + workMinutes(r), 0);
  const trips = recs.reduce((a, r) => a + recordTripCount(r), 0);
  const used = recs.reduce((a, r) => a + (r.specialLeaveHours || 0), 0);
  const total = effectiveSalary(monthKey(v.year, 12), st.monthlySalaries, s.salaryInfo).totalSpecialLeave || 0;
  return h('div', { class: 'stack' },
    h('div', { class: 'month-nav' },
      h('button', { class: 'icon-btn', type: 'button', onclick: () => { v.year--; ctx.render(); } }, '‹'),
      h('b', {}, `${v.year} 年度統計`),
      h('button', { class: 'icon-btn', type: 'button', onclick: () => { v.year++; ctx.render(); } }, '›')),
    h('section', { class: 'card' },
      h('div', { class: 'card-title' }, '年度摘要'),
      line('總出勤班次', `${days} 班`), line('總工時', fmtDuration(mins)),
      ...countLines(areaCounts(recs)),
      line('總夜點', `${recs.reduce((a, r) => a + (r.nightShiftCount || 0), 0)} 次`),
      line(h('b', {}, '加權車趟'), h('b', {}, `${fmtNum(weightedTrips(recs))} 趟`)),
      line('平均每日工時', `${days ? (mins / 60 / days).toFixed(1) : '0.0'} 小時`),
      line('平均每趟工時', trips > 0 ? fmtDuration(mins / trips) : '00:00'),
      line('平均每日車趟', `${days ? (weightedTrips(recs) / days).toFixed(1) : '0.0'} 趟`), h('hr'),
      line(h('b', {}, '年度實領總薪資'), h('b', { class: 'accent' }, hidden ? 'NT$ ****' : money(net))),
      monthRows.length ? h('details', {}, h('summary', {}, '各月實領'), monthRows) : null, h('hr'),
      line('特休・今年已用', hoursFmt(used)), line('特休・剩餘', hoursFmt(total - used)), line('特休・總共', hoursFmt(total))),
    barList('目的地統計（次數）', aggregateBy(recs, (t) => t.destination, orderOf(s, 'destinations'))),
    h('div', { class: 'grid2' },
      barList('酸別統計（次數）', aggregateBy(recs, (t) => t.acidType, orderOf(s, 'acidTypes'))),
      barList('搭檔統計（次數）', aggregateBy(recs, (t) => t.driverName, orderOf(s, 'drivers')))));
}
