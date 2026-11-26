// 依《勞動基準法》估算加班費——僅供參考，不計入薪資（對應 Android LaborLawOvertime）
import { workMinutes, isDraft, interval } from './shift.js';
import { ymdOf } from './date.js';

export const MIN_MONTHLY_WAGE_2026 = 29500;
export const MONTHLY_OT_CAP_HOURS = 46;
export const DAILY_TOTAL_CAP_HOURS = 12;
export const MIN_REST_HOURS = 11;
const NORMAL = 8 * 60;

export const DayKind = { WORKDAY: 0, REST_DAY: 1, HOLIDAY: 2 };
export const DayKindLabel = ['平日', '休息日', '例假／國定假日'];
export const DayModes = {
  MARKS: { label: '依 2X／3X 標記', description: '2X（一般加班，車趟×2）視為休息日出勤；3X（特別加班：年假、颱風假等，車趟×3）視為國定假日出勤；其餘為平日' },
  WEEKDAY: { label: '依星期', description: '週六為休息日、週日為例假；有 3X 標記的日子視為國定假日' },
};

export const hourlyWage = (monthly) => monthly / 240;

export function dayKind(epochDay, is2x, is3x, mode) {
  if (mode === 'WEEKDAY') {
    if (is3x) return DayKind.HOLIDAY;
    const dow = ymdOf(epochDay).dow;
    if (dow === 0) return DayKind.HOLIDAY;
    if (dow === 6) return DayKind.REST_DAY;
    return DayKind.WORKDAY;
  }
  return is3x ? DayKind.HOLIDAY : is2x ? DayKind.REST_DAY : DayKind.WORKDAY;
}

/** 單日：回傳 { ot（計入上限的延長工時分鐘）, pay } */
export function dayPay(kind, minutes, hourly) {
  const m = Math.max(0, minutes), h = (x) => x / 60;
  if (kind === DayKind.WORKDAY) {
    const ot = Math.max(0, m - NORMAL), first = Math.min(ot, 120);
    return { ot, pay: hourly * (h(first) * 4 / 3 + h(ot - first) * 5 / 3) };
  }
  if (kind === DayKind.REST_DAY) {
    const first = Math.min(m, 120), second = Math.min(Math.max(0, m - 120), 360), third = Math.max(0, m - NORMAL);
    return { ot: m, pay: hourly * (h(first) * 4 / 3 + h(second) * 5 / 3 + h(third) * 8 / 3) };
  }
  if (m === 0) return { ot: 0, pay: 0 };
  const ot = Math.max(0, m - NORMAL), first = Math.min(ot, 120);
  return { ot, pay: hourly * 8 + hourly * (h(first) * 4 / 3 + h(ot - first) * 5 / 3) };
}

/**
 * 第 34 條：換班間至少連續休息 11 小時。
 * 同一天（同卡片日期）的多班視為同一個工作天；比較「前一個工作天最後下班」到「這一天第一次上班」的間隔。
 * history 用來找本期第一天的前一個工作天（可能在上個計薪區間）。
 * 回傳 Map(date → 休息分鐘數)，只列出不到 11 小時的日子。
 */
export function shortRestDays(records, history = records) {
  const spans = new Map(); // date → { start, end }
  const add = (r) => {
    if (isDraft(r)) return;
    const iv = interval(r);
    if (!iv) return;
    const cur = spans.get(r.date);
    if (!cur) spans.set(r.date, { start: iv.start, end: iv.end });
    else { cur.start = Math.min(cur.start, iv.start); cur.end = Math.max(cur.end, iv.end); }
  };
  history.forEach(add);
  records.forEach(add);
  const dates = [...spans.keys()].sort((a, b) => a - b);
  const wanted = new Set(records.map((r) => r.date));
  const out = new Map();
  for (let i = 1; i < dates.length; i++) {
    if (!wanted.has(dates[i])) continue;
    const gap = spans.get(dates[i]).start - spans.get(dates[i - 1]).end;
    if (gap >= 0 && gap < MIN_REST_HOURS * 60) out.set(dates[i], Math.round(gap));
  }
  return out;
}

export function calculate(records, monthlyWageBase, breakMinutesPerShift, mode = 'MARKS', history = records) {
  const shortRest = shortRestDays(records, history);
  const hourly = hourlyWage(monthlyWageBase);
  const byDate = new Map();
  for (const r of records) {
    if (isDraft(r) || r.startTime == null || r.endTime == null) continue;
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  }
  const days = [...byDate.entries()].map(([date, recs]) => {
    const minutes = recs.reduce((a, r) => a + Math.max(0, workMinutes(r, { nowIfStillWorking: false }) - breakMinutesPerShift), 0);
    const kind = Math.max(...recs.map((r) => dayKind(date, r.is2xOvertime, r.is3xOvertime, mode)));
    const { ot, pay } = dayPay(kind, minutes, hourly);
    return { date, kind, workedMinutes: minutes, overtimeMinutes: ot, pay, exceedsDailyCap: minutes > DAILY_TOTAL_CAP_HOURS * 60, restBeforeMinutes: shortRest.get(date) ?? null };
  }).sort((a, b) => a.date - b.date);
  const sum = (f) => days.reduce((a, d) => a + f(d), 0);
  const totalOvertimeHours = sum((d) => d.overtimeMinutes) / 60;
  return {
    monthlyWageBase, hourlyWage: hourly, days,
    totalPay: Math.round(sum((d) => d.pay)),
    payOf: (k) => Math.round(days.filter((d) => d.kind === k).reduce((a, d) => a + d.pay, 0)),
    overtimeHoursOf: (k) => days.filter((d) => d.kind === k).reduce((a, d) => a + d.overtimeMinutes, 0) / 60,
    workedDaysOf: (k) => days.filter((d) => d.kind === k && d.workedMinutes > 0).length,
    totalOvertimeHours,
    exceedsMonthlyCap: totalOvertimeHours > MONTHLY_OT_CAP_HOURS,
    daysOverDailyCap: days.filter((d) => d.exceedsDailyCap).length,
    daysShortRest: days.filter((d) => d.restBeforeMinutes != null).length,
    belowMinimumWage: monthlyWageBase > 0 && monthlyWageBase < MIN_MONTHLY_WAGE_2026,
  };
}
