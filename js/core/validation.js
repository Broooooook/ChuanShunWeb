// 手動編輯打卡時間的防呆（對應 Android ShiftValidation）
import { interval } from './shift.js';
import { ymdOf, fmtTime } from './date.js';

export const MAX_REASONABLE_HOURS = 20;

export function check(record, { startInvalid = false, endInvalid = false, others = [] } = {}) {
  const w = [];
  if (startInvalid) w.push('上班時間格式不正確，將不會儲存上班時間');
  if (endInvalid) w.push('下班時間格式不正確，將不會儲存下班時間');
  if (record.startTime == null && record.endTime != null) w.push('有下班時間但沒有上班時間');
  const iv = interval(record);
  if (!iv) return w;
  const mins = iv.end - iv.start;
  if (mins === 0) w.push('上下班時間相同，工時為 0');
  else if (mins >= MAX_REASONABLE_HOURS * 60) {
    w.push(`工時 ${Math.floor(mins / 60)} 小時 ${Math.round(mins % 60)} 分，超過 ${MAX_REASONABLE_HOURS} 小時，請確認日期與時間`);
  }
  const f = (day, minOfDay) => { const { m, d } = ymdOf(day); return `${m}/${d} ${fmtTime(minOfDay * 60)}`; };
  for (const o of others) {
    if (o.id === record.id) continue;
    const ov = interval(o);
    if (!ov) continue;
    if (iv.start < ov.end && ov.start < iv.end) {
      w.push(`與另一筆紀錄時段重疊（${f(ov.startDate, ov.start - ov.startDate * 1440)} → ${f(ov.endDate, ov.end - ov.endDate * 1440)}）`);
    }
  }
  return w;
}
