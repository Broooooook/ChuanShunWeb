// 依《勞動基準法》估算加班費——僅供參考，不計入薪資（對應 Android LaborLawOvertime）
import { workMinutes, isDraft } from './shift.js';
import { ymdOf } from './date.js';

export const MIN_MONTHLY_WAGE_2026 = 29500;
export const MONTHLY_OT_CAP_HOURS = 46;
export const DAILY_TOTAL_CAP_HOURS = 12;
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

export function calculate(records, monthlyWageBase, breakMinutesPerShift, mode = 'MARKS') {
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
    return { date, kind, workedMinutes: minutes, overtimeMinutes: ot, pay, exceedsDailyCap: minutes > DAILY_TOTAL_CAP_HOURS * 60 };
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
    belowMinimumWage: monthlyWageBase > 0 && monthlyWageBase < MIN_MONTHLY_WAGE_2026,
  };
}
