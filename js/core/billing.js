// 計酬區間（對應 Android BillingUtils）。月份以 {y, m} 表示。
import { epochDayOf, ymdOf, daysInMonth, addMonths, monthKey } from './date.js';

export function effectiveEndDay(y, m, endDaysMap = {}, defaultStartDay = 26) {
  const key = monthKey(y, m);
  const keys = Object.keys(endDaysMap).filter((k) => k <= key).sort();
  if (keys.length) return endDaysMap[keys[keys.length - 1]];
  let end = defaultStartDay - 1;
  if (end === 0) end = 31;
  return end;
}
/** 回傳 { start, end }（epochDay，含頭含尾） */
export function billingRange(y, m, map = {}, def = 26) {
  const endDay = Math.min(effectiveEndDay(y, m, map, def), daysInMonth(y, m));
  const p = addMonths(y, m, -1);
  const prevEnd = Math.min(effectiveEndDay(p.y, p.m, map, def), daysInMonth(p.y, p.m));
  return { start: epochDayOf(p.y, p.m, prevEnd) + 1, end: epochDayOf(y, m, endDay) };
}
export function billingRangeStr(y, m, map = {}, def = 26) {
  const { start, end } = billingRange(y, m, map, def);
  const a = ymdOf(start), b = ymdOf(end);
  return `${a.m}/${a.d} ~ ${b.m}/${b.d}`;
}
/** 某日屬於哪個計酬月份 → {y, m} */
export function billingMonthOf(epochDay, map = {}, def = 26) {
  const { y, m } = ymdOf(epochDay);
  const r1 = billingRange(y, m, map, def);
  if (epochDay >= r1.start && epochDay <= r1.end) return { y, m };
  const n = addMonths(y, m, 1);
  const r2 = billingRange(n.y, n.m, map, def);
  if (epochDay >= r2.start && epochDay <= r2.end) return n;
  return { y, m };
}
