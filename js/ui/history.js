// 歷史記錄（對應 Android HistoryScreen + DayRecordCard + ManualRecordDialog）
import { h, openDialog, toast, appBar, checkRow, columnStepper, timeInput, optionColor, confirmDialog } from './dom.js';
import { billingRange, billingRangeStr, billingMonthOf } from '../core/billing.js';
import { addMonths, fmtTime, fmtDuration, todayEpochDay, toDateInput, fromDateInput, parseTimeInput, ymdOf } from '../core/date.js';
import { workMinutes, isDraft, isLateStart } from '../core/shift.js';
import { recordTripCount, areaCounts, areaCountsText, fmtNum, tripCountLabel } from '../core/trips.js';
import { check } from '../core/validation.js';
import { upsertRecord, deleteRecord } from '../core/actions.js';
import { openTripDialog } from './tripDialog.js';

const WK = ['日', '一', '二', '三', '四', '五', '六'];
const dayLabel = (ed) => { const { m, d, dow } = ymdOf(ed); return `${m}月${d}日 (週${WK[dow]})`; };
const md = (ed) => { const { m, d } = ymdOf(ed); return `${m}/${d}`; };

/** 卡片上的上下班時間（對應 Android getFormattedShiftTime） */
export function shiftText(r) {
  if (r.startTime == null) return '--:-- → --:--';
  if (r.endTime == null) return `${fmtTime(r.startTime)} → (上班中)`;
  const overnight = r.isNextDay || r.endTime < r.startTime;
  if (!overnight) return `${fmtTime(r.startTime)} → ${fmtTime(r.endTime)}`;
  return isLateStart(r.startTime)
    ? `(${md(r.date - 1)}) ${fmtTime(r.startTime)} → ${fmtTime(r.endTime)}`
    : `${fmtTime(r.startTime)} → ${fmtTime(r.endTime)} (${md(r.date + 1)})`;
}
const sortKey = (r) => {
  const st = r.startTime ?? 0;
  const actual = r.endTime != null && r.endTime < st && isLateStart(st) ? r.date - 1 : r.date;
  return actual * 86400 + st;
};

function listRecords(ctx, v) {
  const s = ctx.state.settings;
  const existing = ctx.state.workRecords.filter((r) => !isDraft(r));
  const today = todayEpochDay();
  const earliest = existing.length ? Math.min(...existing.map((r) => r.date)) : today;
  const dayItems = (d) => {
    const recs = existing.filter((r) => r.date === d).sort((a, b) => sortKey(b) - sortKey(a));
    if (recs.length) return recs;
    return d < today && d >= earliest ? [{ placeholder: true, id: -1 - d, date: d }] : [];
  };
  const span = (a, b) => { const out = []; for (let d = b; d >= a; d--) out.push(...dayItems(d)); return out; };
  if (v.mode === 'DAY') return dayItems(v.day);
  if (v.mode === 'RANGE') return span(Math.min(v.from, v.to), Math.max(v.from, v.to));
  if (v.mode === 'ALL') {
    const last = existing.length ? Math.max(...existing.map((r) => r.date)) : today - 1;
    return span(earliest, Math.max(last, today - 1));
  }
  const { start, end } = billingRange(v.y, v.m, s.billingStartDaysMap, s.billingStartDay);
  return span(start, end);
}

export function renderHistory(ctx) {
  const s = ctx.state.settings;
  const today = todayEpochDay();
  const v = ctx.view.history ||= {
    mode: 'MONTH', ...billingMonthOf(today, s.billingStartDaysMap, s.billingStartDay),
    day: today, from: today - 7, to: today, expanded: new Set(),
  };
  const items = listRecords(ctx, v);
  const ids = items.filter((x) => !x.placeholder).map((x) => x.id);
  const allExpanded = ids.length > 0 && ids.every((id) => v.expanded.has(id));
  const filterText = v.mode === 'MONTH' ? `${v.y}年${v.m}月 計酬月份 (${billingRangeStr(v.y, v.m, s.billingStartDaysMap, s.billingStartDay)})`
    : v.mode === 'DAY' ? (() => { const x = ymdOf(v.day); return `${x.y}年${x.m}月${x.d}日`; })()
      : v.mode === 'RANGE' ? `${md(v.from)} ~ ${md(v.to)}` : '全部記錄';
  const move = (d) => () => { Object.assign(v, addMonths(v.y, v.m, d)); ctx.render(); };

  return h('div', { class: 'stack history' },
    appBar('歷史記錄',
      h('button', { class: 'icon-btn', type: 'button', title: allExpanded ? '全部收合' : '全部展開',
        onclick: () => { v.expanded = allExpanded ? new Set() : new Set(ids); ctx.render(); } }, allExpanded ? '⊟' : '⊞'),
      h('button', { class: 'icon-btn', type: 'button', title: '篩選', onclick: () => filterDialog(ctx, v) }, '⚲')),
    h('div', { class: 'filter-strip' },
      v.mode === 'MONTH' ? h('button', { class: 'icon-btn small', type: 'button', onclick: move(-1), 'aria-label': '上個月' }, '‹') : null,
      h('button', { class: 'filter-text', type: 'button', onclick: () => filterDialog(ctx, v) }, '🔍 ' + filterText),
      v.mode === 'MONTH' ? h('button', { class: 'icon-btn small', type: 'button', onclick: move(1), 'aria-label': '下個月' }, '›') : null),
    items.length ? items.map((r) => (r.placeholder ? placeholderCard(ctx, r) : dayCard(ctx, r, v)))
      : h('p', { class: 'muted center' }, '查無符合條件的記錄'),
    h('button', { class: 'fab', type: 'button', 'aria-label': '新增記錄', onclick: () => openRecordEditor(ctx, null) }, '＋'));
}

/** 沒有紀錄的日子：淡綠色日期＋「＋」，點了直接新增那一天 */
function placeholderCard(ctx, r) {
  return h('button', { class: 'placeholder-card', type: 'button', onclick: () => openRecordEditor(ctx, null, r.date) },
    h('span', {}, dayLabel(r.date)), h('span', { class: 'ph-plus' }, '＋'));
}

function dayCard(ctx, r, v) {
  const s = ctx.state.settings;
  const spec = r.specialLeaveHours > 0, off = r.isOffDay, official = r.isOfficialBusiness;
  const colors = [];
  if (r.is3xOvertime) colors.push(s.color3xOvertime);
  if (r.is2xOvertime) colors.push(s.color2xOvertime);
  if (off) colors.push(s.colorOffDay);
  if (official) colors.push(s.colorOfficial);
  if (spec) colors.push(s.colorSpecActive);
  const bg = colors.length === 0 ? null : colors.length === 1 ? colors[0]
    : `linear-gradient(135deg, ${colors.map((c, i) => `${c} ${(i / colors.length * 100).toFixed(1)}%, ${c} ${((i + 1) / colors.length * 100).toFixed(1)}%`).join(', ')})`;
  const expanded = v.expanded.has(r.id);
  const total = recordTripCount(r);
  const mins = workMinutes(r);
  const avg = total > 0 ? Math.floor(mins / total) : 0;
  const avgCls = avg > 199 ? 'error-text b' : avg >= 1 && avg < 160 ? 'good b' : 'muted';
  const statusTexts = [spec ? `特休 ${fmtNum(r.specialLeaveHours)}h` : null, official ? '其它' : null, off ? '輪空' : null].filter(Boolean);
  const overnight = r.isNextDay || (r.startTime != null && r.endTime != null && r.endTime < r.startTime);
  const hasImportant = r.trips.some((t) => t.isImportant);
  const hasRemark = r.trips.some((t) => (t.note || '').trim()) || (r.remarks || '').trim();

  const card = h('div', {
    class: 'day-card' + (bg ? ' tinted' : ''), style: bg ? { background: bg } : null, role: 'button', tabindex: 0,
    onclick: () => { if (expanded) v.expanded.delete(r.id); else v.expanded.add(r.id); ctx.render(); },
  },
    h('div', { class: 'row-between' },
      h('div', { class: 'row-wrap' }, h('b', { class: 'title-md' }, dayLabel(r.date)),
        hasImportant || hasRemark ? h('span', { class: 'mini-tags' },
          hasImportant ? h('span', { class: 'tag error tiny' }, '★ 注意') : null,
          hasRemark ? h('span', { class: 'tag remark tiny' }, '有備註') : null) : null,
        h('button', { class: 'icon-btn tiny edit', type: 'button', title: '編輯', onclick: (e) => { e.stopPropagation(); openRecordEditor(ctx, r); } }, '✎')),
      h('div', { class: 'right' },
        h('div', { class: 'small b accent' }, statusTexts.length ? statusTexts.join(' / ') : `工時 ${fmtDuration(mins)}`),
        official && r.remarks ? h('div', { class: 'small b muted' }, `(${r.remarks})`)
          : !official ? h('div', { class: 'tiny-text ' + avgCls }, `平均每趟 ${fmtDuration(avg)}`) : null)),
    h('div', { class: 'row-between top' },
      h('div', {},
        h('div', { class: 'small' + (overnight ? ' overnight' : ' muted') }, shiftText(r)),
        r.is3xOvertime ? h('div', { class: 'tiny-text b error-text' }, '★ 3X 加班')
          : r.is2xOvertime ? h('div', { class: 'tiny-text b tertiary-text' }, '★ 2X 加班') : null),
      h('div', { class: 'right' },
        official && total === 0 ? null : h('div', { class: 'small b' }, total ? areaCountsText(areaCounts([r])) : '0 趟'),
        r.nightShiftCount > 0 ? h('div', { class: 'tiny-text b error-text' }, `夜點 ${r.nightShiftCount} 次`) : null)));

  if (expanded) {
    if (off || spec || official) {
      card.append(h('hr'), h('div', { class: 'tiny-text b ' + (off ? 'secondary-text' : official ? 'accent' : 'good') },
        '狀態：' + [spec ? `特休 (${fmtNum(r.specialLeaveHours)} 小時)` : null, off ? '輪空' : null, official ? '其它' : null].filter(Boolean).join(' / ')));
    }
    if ((r.remarks || '').trim()) card.append(h('hr'), h('div', { class: 'small muted' }, `備註：${r.remarks}`));
    if (r.trips.length) {
      card.append(h('hr'), ...r.trips.map((t, i) => h('div', { class: 'exp-trip' },
        h('div', { class: 'row-between' },
          h('span', { class: 'b small', style: { color: optionColor(ctx.state, 'destinations', t.destination, 'var(--primary)') } }, `${i + 1}. ${t.destination}`),
          h('span', { class: 'right' }, h('b', {}, tripCountLabel(t)),
            t.specialCount ? h('span', { class: 'badge sp' }, `+特${t.specialCount}`) : null,
            t.overtimeCount ? h('span', { class: 'badge ot' }, `+超${t.overtimeCount}`) : null)),
        h('div', { class: 'trip-meta tiny-text' },
          h('span', { style: { color: optionColor(ctx.state, 'acidTypes', t.acidType, 'var(--secondary)') } }, '🧪 ' + (t.acidType || '')),
          h('span', { style: { color: optionColor(ctx.state, 'drivers', t.driverName, 'inherit') } }, '👤 ' + (t.driverName || '')),
          t.isImportant ? h('span', { class: 'important' }, '★ 注意') : null),
        t.note ? h('div', { class: 'tiny-text muted' }, `備註：${t.note}`) : null)));
    }
  }
  return card;
}

/** 查找記錄方式（對應 Android 篩選對話框） */
function filterDialog(ctx, v) {
  const w = { mode: v.mode, y: v.y, m: v.m, day: v.day, from: v.from, to: v.to };
  const extra = h('div', {});
  const opts = h('div', { class: 'stack tight' });
  const opt = (mode, label) => h('label', { class: 'filter-opt' + (w.mode === mode ? ' on' : '') },
    h('input', { type: 'radio', name: 'hf', checked: w.mode === mode, onchange: () => { w.mode = mode; draw(); } }), h('span', {}, label));
  function draw() {
    opts.replaceChildren(opt('MONTH', '按計酬月份查找'), opt('DAY', '按特定日期查找'), opt('RANGE', '按日期區間查找'), opt('ALL', '顯示全部記錄'));
    if (w.mode === 'MONTH') {
      extra.replaceChildren(h('label', { class: 'field' }, h('span', {}, '選擇月份'),
        h('input', { class: 'input', type: 'month', value: `${w.y}-${String(w.m).padStart(2, '0')}`,
          onchange: (e) => { const [yy, mm] = e.target.value.split('-').map(Number); if (yy && mm) { w.y = yy; w.m = mm; } } })));
    } else if (w.mode === 'DAY') {
      extra.replaceChildren(h('label', { class: 'field' }, h('span', {}, '選擇日期'),
        h('input', { class: 'input', type: 'date', value: toDateInput(w.day), onchange: (e) => (w.day = fromDateInput(e.target.value)) })));
    } else if (w.mode === 'RANGE') {
      extra.replaceChildren(h('div', { class: 'field' }, h('span', {}, '選擇日期區間'),
        h('div', { class: 'grid2 keep' },
          h('label', { class: 'field' }, h('span', {}, '從'), h('input', { class: 'input', type: 'date', value: toDateInput(w.from), onchange: (e) => (w.from = fromDateInput(e.target.value)) })),
          h('label', { class: 'field' }, h('span', {}, '至'), h('input', { class: 'input', type: 'date', value: toDateInput(w.to), onchange: (e) => (w.to = fromDateInput(e.target.value)) })))));
    } else extra.replaceChildren();
  }
  draw();
  openDialog({
    title: '查找記錄方式', body: h('div', { class: 'form' }, opts, extra),
    buttons: [{ label: '確定', kind: 'primary', onClick: () => { Object.assign(v, w); ctx.render(); } }],
  });
}

/** 手動新增／編輯每日記錄（對應 Android ManualRecordDialog） */
export function openRecordEditor(ctx, rec, presetDate = null) {
  const r = rec ? JSON.parse(JSON.stringify(rec)) : {
    id: 0, date: presetDate ?? todayEpochDay(), startTime: null, endTime: null, driverName: '', nightShiftCount: 0,
    is2xOvertime: false, is3xOvertime: false, specialLeaveHours: 0, isOffDay: false, isOfficialBusiness: false, trips: [], remarks: '', isNextDay: false,
  };
  const s0 = r.startTime, e0 = r.endTime;
  let startDate = s0 != null && e0 != null && e0 < s0 && isLateStart(s0) ? r.date - 1 : r.date;
  let endDate = s0 != null && e0 != null && (r.isNextDay || e0 < s0) ? startDate + 1 : startDate;
  let startStr = s0 != null ? fmtTime(s0).replace(':', '') : '';
  let endStr = e0 != null ? fmtTime(e0).replace(':', '') : '';

  const endDateInput = h('input', { class: 'input', type: 'date', value: toDateInput(endDate), onchange: (e) => (endDate = fromDateInput(e.target.value)) });
  const tripsBox = h('div', { class: 'stack tight' });
  const drawTrips = () => tripsBox.replaceChildren(...(r.trips.length ? r.trips.map((t, i) => h('div', {
    class: 'edit-trip', role: 'button', tabindex: 0,
    onclick: () => openTripDialog(ctx, { initial: t, onSave: (nt) => { r.trips[i] = nt; drawTrips(); }, onDelete: () => { r.trips.splice(i, 1); drawTrips(); } }),
  },
    h('div', { class: 'grow' }, h('div', { class: 'small b' }, `${i + 1}. ${t.destination}`), h('div', { class: 'tiny-text muted' }, `${t.acidType} / ${t.driverName}`)),
    h('span', { class: 'small b' }, tripCountLabel(t)),
    t.specialCount ? h('span', { class: 'tiny-text error-text' }, ` +特${t.specialCount}`) : null,
    t.overtimeCount ? h('span', { class: 'tiny-text tertiary-text' }, ` +超${t.overtimeCount}`) : null,
    h('button', { class: 'icon-btn tiny error-text', type: 'button', title: '移除', onclick: (e) => { e.stopPropagation(); r.trips.splice(i, 1); drawTrips(); } }, '✕')))
    : [h('p', { class: 'small muted center' }, '尚未加入車趟')]));
  drawTrips();

  const otBoxes = {};
  const otCheck = (key, other, label) => {
    const cb = checkRow(label, r[key], (on) => { r[key] = on; if (on) { r[other] = false; otBoxes[other].querySelector('input').checked = false; } });
    otBoxes[key] = cb; return cb;
  };
  const deleteBox = h('div', {});
  const drawDelete = (confirming) => deleteBox.replaceChildren(confirming
    ? h('div', { class: 'confirm-strip' }, h('b', {}, '確定刪除本日所有記錄？'),
      h('span', {},
        h('button', { class: 'btn text danger-text', type: 'button', onclick: async () => { close(); await ctx.mutate((x) => deleteRecord(x, rec.id)); toast('已刪除'); } }, '確定'),
        h('button', { class: 'btn text', type: 'button', onclick: () => drawDelete(false) }, '取消')))
    : h('button', { class: 'btn outline-danger wide', type: 'button', onclick: () => drawDelete(true) }, '🗑 刪除整日記錄'));
  if (rec) drawDelete(false);

  const body = h('div', { class: 'form' },
    h('div', { class: 'grid2 keep' },
      h('label', { class: 'field' }, h('span', {}, '上班日'), h('input', { class: 'input', type: 'date', value: toDateInput(startDate), onchange: (e) => {
        startDate = fromDateInput(e.target.value); endDate = startDate; endDateInput.value = toDateInput(endDate);
      } })),
      h('label', { class: 'field' }, h('span', {}, '下班日'), endDateInput)),
    h('div', { class: 'grid2 keep' },
      h('label', { class: 'field' }, h('span', {}, '上班時間'), timeInput(startStr, (d) => (startStr = d))),
      h('label', { class: 'field' }, h('span', {}, '下班時間'), timeInput(endStr, (d) => (endStr = d)))),
    h('label', { class: 'field' }, h('span', {}, '特休時數'), h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: 0, step: 0.5,
      value: r.specialLeaveHours || '', placeholder: '0', oninput: (e) => (r.specialLeaveHours = parseFloat(e.target.value) || 0) })),
    h('div', { class: 'row-wrap gap16' }, checkRow('本日輪空', r.isOffDay, (on) => (r.isOffDay = on)), checkRow('其它', r.isOfficialBusiness, (on) => (r.isOfficialBusiness = on))),
    columnStepper('夜點(次)', r.nightShiftCount, (n) => (r.nightShiftCount = n)),
    h('div', { class: 'row-wrap gap16' }, otCheck('is2xOvertime', 'is3xOvertime', '2X 加班'), otCheck('is3xOvertime', 'is2xOvertime', '3X 加班')),
    h('hr'),
    h('div', { class: 'row-between' }, h('b', { class: 'accent' }, '車趟明細'),
      h('button', { class: 'btn text', type: 'button', onclick: () => openTripDialog(ctx, {
        template: r.trips[r.trips.length - 1] || null, defaultDriver: r.trips.find((x) => x.driverName)?.driverName,
        onSave: (nt) => { r.trips.push(nt); drawTrips(); },
      }) }, '＋ 新增車趟')),
    tripsBox,
    h('label', { class: 'field' }, h('span', {}, '備註'), h('input', { class: 'input', value: r.remarks, oninput: (e) => (r.remarks = e.target.value) })),
    rec ? h('hr') : null, rec ? deleteBox : null);

  const save = async () => {
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
  const close = openDialog({ title: rec ? '編輯每日記錄' : '手動新增記錄', body, wide: true, buttons: [{ label: '取消' }, { label: '儲存', kind: 'primary', onClick: save }] });
}
