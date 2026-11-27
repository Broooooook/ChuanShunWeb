// 車趟／加班倍率（對應 Android TripStats）。2X 與 3X 互斥，3X 優先。
export const overtimeMultiplier = (is2x, is3x) => (is3x ? 3 : is2x ? 2 : 1);
// 林口區：資料仍記成 1.5（舊資料、備份、Android 相容），但算成「1 趟＋200 元」，加班日 200 也乘倍數
export const LINKOU_CODE = 1.5;
export const LINKOU_EXTRA_BONUS = 200;
export const isLinkou = (t) => Math.abs((t.tripCount || 0) - LINKOU_CODE) < 0.001;
export const areaTrips = (t) => (isLinkou(t) ? 1 : (t.tripCount || 0));
export const tripWeighted = (t, mult) => (areaTrips(t) + (t.specialCount || 0)) * mult + (t.overtimeCount || 0);
export const tripExtraBonus = (t, mult) => (isLinkou(t) ? LINKOU_EXTRA_BONUS * mult : 0);
export function recordExtraBonus(r) {
  const mult = overtimeMultiplier(r.is2xOvertime, r.is3xOvertime);
  return (r.trips || []).reduce((a, t) => a + tripExtraBonus(t, mult), 0);
}
export function recordTripCount(r) {
  const mult = overtimeMultiplier(r.is2xOvertime, r.is3xOvertime);
  return (r.trips || []).reduce((a, t) => a + tripWeighted(t, mult), 0);
}
/** mode: 'count'（目的地／酸別：出現次數）或 'weighted'（搭檔：加成後趟數） */
export function aggregateBy(records, keyFn, orderMap = {}, mode = 'count') {
  const map = new Map();
  for (const r of records) {
    const mult = overtimeMultiplier(r.is2xOvertime, r.is3xOvertime);
    for (const t of r.trips || []) {
      const key = (keyFn(t) || '').trim() || '(空白)';
      map.set(key, (map.get(key) || 0) + (mode === 'count' ? 1 : tripWeighted(t, mult)));
    }
  }
  const big = Number.MAX_SAFE_INTEGER;
  return [...map.entries()].sort((a, b) =>
    ((orderMap[a[0]] ?? big) - (orderMap[b[0]] ?? big)) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}
export const fmtNum = (v) => (Math.abs(v % 1) < 1e-9 ? String(Math.round(v)) : String(Math.round(v * 100) / 100));
/** 畫面上顯示的區域趟數（林口顯示「1+200」） */
export const tripCountLabel = (t) => (isLinkou(t) ? `1+${LINKOU_EXTRA_BONUS}` : fmtNum(t.tripCount || 0));
