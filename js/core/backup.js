// 備份檔：與 Android 版 BackupModel 格式相同，兩邊可互相匯入
import { emptySalary } from './salary.js';

export const DEFAULT_COLORS = {
  color3xOvertime: '#FFDAD6', color2xOvertime: '#FFD8E4', colorOffDay: '#C2E7FF', colorOfficial: '#E3F2FD', colorSpecActive: '#E8F5E9',
};

/** 預設獎金基數（與 Android 版預設相同）：每趟 400、每次夜點 300 */
export const DEFAULT_RATES = { tripBonusRate: 400, nightShiftBonusRate: 300 };
/** 兩個獎金基數都是 0（從沒設定過）時，套用預設值 */
export function applyDefaultRates(settings) {
  const si = settings.salaryInfo || {};
  if (!si.tripBonusRate && !si.nightShiftBonusRate) settings.salaryInfo = { ...emptySalary(), ...si, ...DEFAULT_RATES };
  return settings;
}

export function defaultSettings() {
  return {
    defaultDriver: '', defaultDestination: '', defaultAcidType: '',
    destinations: [], acidTypes: [], drivers: [],
    billingStartDay: 26, billingStartDaysMap: {}, resetAfterPunchOut: false,
    totalSpecialLeave: 0, usedSpecialLeave: 0, salaryInfo: { ...emptySalary(), ...DEFAULT_RATES }, ...DEFAULT_COLORS,
    // 以下為網頁版自己的設定（Android 匯入時會自動忽略）
    destinationTrips: {}, law: { breakMinutes: 60, dayMode: 'MARKS', includeBonus: true }, theme: 'LIGHT',
  };
}

const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
const str = (v) => (typeof v === 'string' ? v : '');
const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2));
export { uuid };

function normTrip(t) {
  return {
    id: str(t.id) || uuid(), destination: str(t.destination), acidType: str(t.acidType), driverName: str(t.driverName),
    tripCount: num(t.tripCount, 1), specialCount: num(t.specialCount), overtimeCount: num(t.overtimeCount),
    isImportant: !!t.isImportant, note: str(t.note),
  };
}
export function normRecord(r) {
  const t = (v) => (typeof v === 'number' && v >= 0 && v < 86400 ? Math.floor(v) : null);
  return {
    id: num(r.id), date: num(r.date), startTime: t(r.startTime), endTime: t(r.endTime), driverName: str(r.driverName),
    nightShiftCount: num(r.nightShiftCount), is2xOvertime: !!r.is2xOvertime && !r.is3xOvertime, is3xOvertime: !!r.is3xOvertime,
    specialLeaveHours: num(r.specialLeaveHours), isOffDay: !!r.isOffDay, isOfficialBusiness: !!r.isOfficialBusiness,
    trips: Array.isArray(r.trips) ? r.trips.map(normTrip) : [], remarks: str(r.remarks), isNextDay: !!r.isNextDay,
  };
}
function normOptions(list) {
  return (Array.isArray(list) ? list : []).filter((o) => o && str(o.name))
    .map((o, i) => ({ id: str(o.id) || uuid(), name: o.name, colorHex: str(o.colorHex) || '#000000', order: num(o.order, i) }));
}

/** 解析備份 JSON 文字 → 完整 state；格式不對時丟出中文錯誤 */
export function parseBackup(text) {
  let m;
  try { m = JSON.parse(text); } catch { throw new Error('這不是備份檔（檔案格式不正確）'); }
  if (!m || !Array.isArray(m.workRecords) || typeof m.settings !== 'object') throw new Error('這不是全順工時記錄的備份檔');
  const base = defaultSettings();
  const s = m.settings || {};
  const settings = {
    ...base, ...s,
    destinations: normOptions(s.destinations), acidTypes: normOptions(s.acidTypes), drivers: normOptions(s.drivers),
    billingStartDaysMap: s.billingStartDaysMap && typeof s.billingStartDaysMap === 'object' ? s.billingStartDaysMap : {},
    salaryInfo: { ...emptySalary(), ...(s.salaryInfo || {}) },
    destinationTrips: s.destinationTrips && typeof s.destinationTrips === 'object' ? s.destinationTrips : {},
    law: { ...base.law, ...(s.law || {}) },
  };
  // 確保 id 唯一
  const seen = new Set(); let next = 1;
  const records = m.workRecords.map(normRecord).map((r) => {
    if (!r.id || seen.has(r.id)) { while (seen.has(next)) next++; r.id = next; }
    seen.add(r.id); return r;
  });
  const salaries = (Array.isArray(m.monthlySalaries) ? m.monthlySalaries : []).filter((x) => x && typeof x.monthKey === 'string')
    .map((x) => ({ ...emptySalary(), ...x, totalSpecialLeave: x.totalSpecialLeave ?? null }));
  return { workRecords: records, monthlySalaries: salaries, settings };
}

export function buildBackup(state) {
  return JSON.stringify({
    version: 1, timestamp: Date.now(), sourceAppId: 'web.chuanshun.tracker',
    workRecords: state.workRecords, monthlySalaries: state.monthlySalaries, settings: state.settings,
  });
}
