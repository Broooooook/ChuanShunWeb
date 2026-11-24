// 跨日／晚班歸屬與工時計算（對應 Android ShiftTimeRules）
import { nowSecondOfDay } from './date.js';

export const LATE_START_THRESHOLD = 19 * 3600 + 59 * 60; // 19:59
export const isLateStart = (startSec) => startSec > LATE_START_THRESHOLD; // 晚於 19:59:00（與 LocalTime.isAfter 相同）

/** 00:01 ~ 05:59 上班自動計夜點 1 次 */
export function defaultNightShiftForClockIn(sec) {
  return sec >= 60 && sec <= 5 * 3600 + 59 * 60 ? 1 : 0; // 與 Android 相同：00:01:00 ~ 05:59:00
}

/** 下班時決定卡片日期與是否跨日 → { date, isNextDay } */
export function resolveClockOutDate(cardDate, startSec, nowDate, nowSec) {
  const overnight = nowDate > cardDate || (startSec != null && nowSec < startSec);
  let date = cardDate;
  if (overnight && startSec != null && isLateStart(startSec)) date = cardDate + 1;
  return { date, isNextDay: overnight };
}

/** 工時（分鐘）。未下班時以現在時間計（nowIfStillWorking） */
export function workMinutes(r, { nowIfStillWorking = true, now = new Date() } = {}) {
  if (r.startTime == null) return 0;
  let end = r.endTime;
  if (end == null) { if (!nowIfStillWorking) return 0; end = nowSecondOfDay(now); }
  const s = r.startTime;
  const secs = (r.isNextDay || end < s) ? (86400 - s) + end : end - s;
  return Math.floor(secs / 60);
}

/** 圖表用：一班拆成各日曆日的分鐘區間 → [{day, startMin, endMin}] */
export function splitToDaySegments(cardDate, startSec, endSec, isNextDay) {
  const sMin = startSec / 60, eMin = endSec / 60;
  const overnight = isNextDay || eMin < sMin;
  if (!overnight) return [{ day: cardDate, startMin: sMin, endMin: eMin }];
  if (isLateStart(startSec)) {
    return [{ day: cardDate - 1, startMin: sMin, endMin: 1440 }, { day: cardDate, startMin: 0, endMin: eMin }];
  }
  return [{ day: cardDate, startMin: sMin, endMin: 1440 }, { day: cardDate + 1, startMin: 0, endMin: eMin }];
}

/** 卡片在時間軸上的實際起訖（絕對分鐘：epochDay*1440 + 分鐘），未完成回傳 null */
export function interval(r) {
  if (r.startTime == null || r.endTime == null) return null;
  const overnight = r.isNextDay || r.endTime < r.startTime;
  const startDate = overnight && isLateStart(r.startTime) ? r.date - 1 : r.date;
  const endDate = overnight ? startDate + 1 : startDate;
  return { start: startDate * 1440 + r.startTime / 60, end: endDate * 1440 + r.endTime / 60, startDate, endDate };
}

/** 是否為草稿（無上下班、無狀態、無車趟的空紀錄） */
export function isDraft(r) {
  return r.startTime == null && r.endTime == null && !r.isOffDay && !r.isOfficialBusiness &&
    !(r.specialLeaveHours > 0) && (r.trips || []).length === 0 && !(r.nightShiftCount > 0) &&
    !r.is2xOvertime && !r.is3xOvertime && !(r.remarks || '').trim();
}
