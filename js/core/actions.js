// 打卡、車趟、狀態等操作（對應 Android WorkRepository）。皆直接修改 state，呼叫端負責存檔。
import { todayEpochDay, nowSecondOfDay } from './date.js';
import { defaultNightShiftForClockIn, resolveClockOutDate, isDraft } from './shift.js';

const nextId = (state) => state.workRecords.reduce((m, r) => Math.max(m, r.id || 0), 0) + 1;
const blank = (state, date, driverName = '') => ({
  id: nextId(state), date, startTime: null, endTime: null, driverName, nightShiftCount: 0, is2xOvertime: false, is3xOvertime: false,
  specialLeaveHours: 0, isOffDay: false, isOfficialBusiness: false, trips: [], remarks: '', isNextDay: false,
});

/** 23:30 之後，已下班的本日卡片不再顯示，首頁回到新一天的「開始上班」 */
export const DAY_RESET_SECOND = 23 * 3600 + 30 * 60;

/** 進行中的班次（有上班、無下班，含跨夜）優先；否則今天最新一筆（23:30 後已下班的不算） */
export function activeRecord(state, now = new Date()) {
  const open = state.workRecords.filter((r) => r.startTime != null && r.endTime == null).sort((a, b) => b.date - a.date || b.id - a.id)[0];
  if (open) return open;
  const today = todayEpochDay(now);
  const latest = state.workRecords.filter((r) => r.date === today).sort((a, b) => b.id - a.id)[0] || null;
  if (latest && latest.startTime != null && latest.endTime != null && nowSecondOfDay(now) >= DAY_RESET_SECOND) return null;
  return latest;
}

function ensureDraft(state, now) {
  const a = activeRecord(state, now);
  if (a && a.endTime == null) return a;
  const r = blank(state, todayEpochDay(now), state.settings.defaultDriver);
  state.workRecords.push(r);
  return r;
}

export function clockIn(state, now = new Date()) {
  const existing = activeRecord(state, now);
  if (existing && existing.startTime != null && existing.endTime == null) return existing; // 已在上班中
  const sec = nowSecondOfDay(now), night = defaultNightShiftForClockIn(sec);
  if (existing && existing.startTime == null && existing.endTime == null) {
    existing.startTime = sec;
    if (!existing.nightShiftCount) existing.nightShiftCount = night;
    return existing;
  }
  const r = { ...blank(state, todayEpochDay(now), state.settings.defaultDriver), startTime: sec, nightShiftCount: night };
  state.workRecords.push(r);
  return r;
}

export function clockOut(state, now = new Date()) {
  const r = activeRecord(state, now);
  if (!r || r.startTime == null || r.endTime != null) return null;
  const sec = nowSecondOfDay(now);
  const { date, isNextDay } = resolveClockOutDate(r.date, r.startTime, todayEpochDay(now), sec);
  Object.assign(r, { endTime: sec, date, isNextDay });
  return r;
}

/** 夜點、2X/3X、特休、輪空、其他、備註 */
export function updateStatus(state, patch, now = new Date()) {
  const r = ensureDraft(state, now);
  Object.assign(r, patch);
  if (r.is3xOvertime) r.is2xOvertime = false;
  return r;
}

export function addTrip(state, trip, now = new Date()) {
  const r = ensureDraft(state, now);
  r.trips = [...r.trips, trip];
  rememberTrip(state, trip);
  return r;
}
export function updateTrip(state, trip, now = new Date()) {
  const r = activeRecord(state, now); if (!r) return null;
  r.trips = r.trips.map((t) => (t.id === trip.id ? trip : t));
  rememberTrip(state, trip);
  return r;
}
export function deleteTrip(state, tripId, now = new Date()) {
  const r = activeRecord(state, now); if (!r) return null;
  r.trips = r.trips.filter((t) => t.id !== tripId);
  return r;
}

export function upsertRecord(state, rec) {
  const r = { ...rec, is2xOvertime: rec.is2xOvertime && !rec.is3xOvertime };
  if (!r.id) r.id = nextId(state);
  const i = state.workRecords.findIndex((x) => x.id === r.id);
  if (i >= 0) state.workRecords[i] = r; else state.workRecords.push(r);
  return r;
}
export function deleteRecord(state, id) { state.workRecords = state.workRecords.filter((r) => r.id !== id); }

export function purgeStaleDrafts(state, now = new Date()) {
  const today = todayEpochDay(now);
  const before = state.workRecords.length;
  state.workRecords = state.workRecords.filter((r) => !(isDraft(r) && r.date !== today));
  return before - state.workRecords.length;
}

// ── 目的地＋酸別 → 上次選的區域趟數
export const tripKey = (dest, acid) => `${dest}|||${acid}`;
function rememberTrip(state, t) {
  if (!t.destination || !t.acidType || !(t.tripCount > 0)) return;
  state.settings.destinationTrips = { ...(state.settings.destinationTrips || {}), [tripKey(t.destination, t.acidType)]: t.tripCount };
}
export function rememberedTripCount(state, dest, acid) {
  const m = state.settings.destinationTrips || {};
  if (m[tripKey(dest, acid)] != null) return m[tripKey(dest, acid)];
  if (m[dest] != null) return m[dest];
  for (const r of [...state.workRecords].sort((a, b) => b.date - a.date)) {
    for (const t of r.trips) if (t.destination === dest && t.acidType === acid && t.tripCount > 0) return t.tripCount;
  }
  return null;
}
