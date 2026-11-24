// 車趟／加班倍率（對應 Android TripStats）。2X 與 3X 互斥，3X 優先。
export const overtimeMultiplier = (is2x, is3x) => (is3x ? 3 : is2x ? 2 : 1);
export const tripWeighted = (t, mult) => ((t.tripCount || 0) + (t.specialCount || 0)) * mult + (t.overtimeCount || 0);
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
