// 日期／時間工具。資料格式與 Android 版備份相同：
//   日期 = epochDay（1970-01-01 起算的天數），時間 = secondOfDay（0~86399）
const DAY_MS = 86400000;

export function epochDayOf(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / DAY_MS); }
export function ymdOf(epochDay) {
  const dt = new Date(epochDay * DAY_MS);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), dow: dt.getUTCDay() };
}
export function todayEpochDay(now = new Date()) { return epochDayOf(now.getFullYear(), now.getMonth() + 1, now.getDate()); }
export function nowSecondOfDay(now = new Date()) { return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds(); }
export function hm(h, m = 0) { return h * 3600 + m * 60; }

export function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
export function addMonths(y, m, delta) {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}
export function monthKey(y, m) { return `${y}-${String(m).padStart(2, '0')}`; }

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
export function weekdayLabel(epochDay) { return '週' + WEEK[ymdOf(epochDay).dow]; }
export function fmtDate(epochDay, withYear = false) {
  const { y, m, d } = ymdOf(epochDay);
  return withYear ? `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}` : `${m}/${d}`;
}
export function fmtTime(sec) {
  if (sec == null) return '--:--';
  const h = Math.floor(sec / 3600) % 24, mi = Math.floor((sec % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}
export function fmtDuration(minutes) {
  const m = Math.max(0, Math.round(minutes));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
/** "0830" / "08:30" / "830" → secondOfDay；無效回傳 null */
export function parseTimeInput(s) {
  if (s == null) return null;
  const t = String(s).replace(/[^0-9]/g, '');
  if (t.length < 3 || t.length > 4) return null;
  const h = parseInt(t.slice(0, t.length - 2), 10), mi = parseInt(t.slice(-2), 10);
  if (h > 23 || mi > 59) return null;
  return h * 3600 + mi * 60;
}
export function toDateInput(epochDay) { const { y, m, d } = ymdOf(epochDay); return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
export function fromDateInput(s) { const [y, m, d] = s.split('-').map(Number); return epochDayOf(y, m, d); }
