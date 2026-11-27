// 車趟／加班倍率（對應 Android TripStats）。2X 與 3X 互斥，3X 優先。
export const overtimeMultiplier = (is2x, is3x) => (is3x ? 3 : is2x ? 2 : 1);
// 車趟區域（對應 Android TripStats）。資料裡仍用 tripCount 記區域代碼，舊紀錄、備份、Android 互通都不用改：
// 1＝北部、1.5＝林口、2＝中部、3＝南部、0.5＝廠內。獎金依各區單價計算（設定 → 車趟獎金單價）。
export const AREAS = [
  { key: 'north', label: '北部', code: 1 },
  { key: 'linkou', label: '林口', code: 1.5 },
  { key: 'central', label: '中部', code: 2 },
  { key: 'south', label: '南部', code: 3 },
  { key: 'plant', label: '廠內', code: 0.5 },
];
/** 預設單價（使用者指定）。廠內未定，先算 0 元 */
export const DEFAULT_TRIP_RATES = { north: 350, linkou: 550, central: 700, south: 1050, plant: 0, special: 350, overtime: 350, night: 300 };
export const RATE_FIELDS = [...AREAS.map((a) => [a.key, a.label]), ['special', '特殊趟'], ['overtime', '超時趟'], ['night', '夜點']];
export const tripRatesOf = (settings) => ({ ...DEFAULT_TRIP_RATES, ...(settings?.tripRates || {}) });

/** 這一趟屬於哪一區；tripCount 不是已知代碼但大於 0 時（很舊的資料）當作北部；0 代表沒有區域 */
export function areaOf(t) {
  const c = t.tripCount || 0;
  if (c <= 0) return null;
  return AREAS.find((a) => Math.abs(a.code - c) < 0.001) || AREAS[0];
}
export const isLinkou = (t) => areaOf(t)?.key === 'linkou';
/** 一趟的獎金：(區域單價＋特殊趟×特殊單價)×2X/3X 倍數＋超時趟×超時單價（超時不乘倍數） */
export function tripBonus(t, mult, rates) {
  const a = areaOf(t);
  const area = a ? (rates[a.key] || 0) : 0;
  return (area + (t.specialCount || 0) * (rates.special || 0)) * mult + (t.overtimeCount || 0) * (rates.overtime || 0);
}
export function recordTripBonus(r, rates) {
  const mult = overtimeMultiplier(r.is2xOvertime, r.is3xOvertime);
  return (r.trips || []).reduce((a, t) => a + tripBonus(t, mult, rates), 0);
}
/** 車趟次數（每一趟算 1 次，不乘倍數；特殊、超時另外計） */
export function recordTripCount(r) {
  return (r.trips || []).reduce((a, t) => a + (areaOf(t) ? 1 : 0), 0);
}
/** 各區域、特殊、超時的次數 */
export function areaCounts(records) {
  const c = Object.fromEntries([...AREAS.map((a) => [a.key, 0]), ['special', 0], ['overtime', 0]]);
  for (const r of records) for (const t of r.trips || []) {
    const a = areaOf(t);
    if (a) c[a.key]++;
    c.special += t.specialCount || 0;
    c.overtime += t.overtimeCount || 0;
  }
  return c;
}
/** 例：「北部 3・中部 1・特殊 1」；都沒有時回傳空字串 */
/** 加權車趟的權重：北部 1、林口 1.5、中部 2、南部 3、廠內 1、特殊 1、超時 1（不乘 2X／3X） */
export const TRIP_WEIGHTS = { north: 1, linkou: 1.5, central: 2, south: 3, plant: 1, special: 1, overtime: 1 };

/** 加權車趟（例：北部 24、林口 3、中部 2、特殊 8、超時 12 → 52.5） */
export function weightedTrips(c) {
  return Object.entries(TRIP_WEIGHTS).reduce((a, [k, w]) => a + (c[k] || 0) * w, 0);
}

export function areaCountsText(c) {
  return [...AREAS.map((a) => [a.label, c[a.key]]), ['特殊', c.special], ['超時', c.overtime]]
    .filter(([, n]) => n > 0).map(([l, n]) => `${l} ${fmtNum(n)}`).join('・');
}
/** 依目的地／酸別／搭檔統計出現次數 */
export function aggregateBy(records, keyFn, orderMap = {}) {
  const map = new Map();
  for (const r of records) {
    for (const t of r.trips || []) {
      const key = (keyFn(t) || '').trim() || '(空白)';
      map.set(key, (map.get(key) || 0) + 1);
    }
  }
  const big = Number.MAX_SAFE_INTEGER;
  return [...map.entries()].sort((a, b) =>
    ((orderMap[a[0]] ?? big) - (orderMap[b[0]] ?? big)) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}
export const fmtNum = (v) => (Math.abs(v % 1) < 1e-9 ? String(Math.round(v)) : String(Math.round(v * 100) / 100));
/** 畫面上顯示的區域名稱 */
export const tripCountLabel = (t) => areaOf(t)?.label ?? '—';
