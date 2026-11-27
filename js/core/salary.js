// 薪資：月度設定（monthKey 之前最近的一筆生效，否則用全域設定）
import { recordTripCount, recordTripBonus, areaCounts, DEFAULT_TRIP_RATES } from './trips.js';

export const SALARY_FIELDS = [
  'baseSalary', 'foodAllowance', 'mealAllowance', 'regionAllowance', 'attendanceBonus', 'carAllowance', 'otherAllowance',
  'tripBonusRate', 'nightShiftBonusRate', 'laborInsurance', 'healthInsurance', 'groupInsurance', 'welfareFund', 'incomeTax', 'stockTrust',
];
export const INCOME = [
  ['baseSalary', '本薪'], ['foodAllowance', '伙食津貼'], ['mealAllowance', '誤餐費'], ['regionAllowance', '地區生活補助'],
  ['attendanceBonus', '全勤獎金'], ['carAllowance', '私車公用補助'], ['otherAllowance', '其它補助'],
];
export const DEDUCTIONS = [
  ['laborInsurance', '勞保費'], ['healthInsurance', '健保費'], ['groupInsurance', '團險眷保費'],
  ['welfareFund', '福利金'], ['incomeTax', '所得稅'], ['stockTrust', '員工持股信託'],
];

export function emptySalary() { const s = {}; SALARY_FIELDS.forEach((k) => (s[k] = 0)); s.totalSpecialLeave = 0; return s; }

export function effectiveSalary(mKey, monthlySalaries = [], globalSalary = emptySalary()) {
  const cand = monthlySalaries.filter((s) => s.monthKey <= mKey).sort((a, b) => (a.monthKey < b.monthKey ? 1 : -1))[0];
  if (!cand) return { ...emptySalary(), ...globalSalary };
  const out = { ...emptySalary() };
  SALARY_FIELDS.forEach((k) => (out[k] = cand[k] || 0));
  out.totalSpecialLeave = cand.totalSpecialLeave ?? globalSalary.totalSpecialLeave ?? 0;
  return out;
}

/** rates：設定裡的車趟獎金單價（各區域、特殊、超時、夜點），所有月份一律用目前的單價計算 */
export function monthSummary(records, sal, rates = DEFAULT_TRIP_RATES) {
  const trips = records.reduce((a, r) => a + recordTripCount(r), 0);
  const counts = areaCounts(records);
  const night = records.reduce((a, r) => a + (r.nightShiftCount || 0), 0);
  const tripBonus = Math.trunc(records.reduce((a, r) => a + recordTripBonus(r, rates), 0));
  const nightBonus = Math.trunc(night * (rates.night || 0));
  const gross = INCOME.reduce((a, [k]) => a + (sal[k] || 0), 0) + tripBonus + nightBonus;
  const deduction = DEDUCTIONS.reduce((a, [k]) => a + (sal[k] || 0), 0);
  return { trips, counts, night, tripBonus, nightBonus, gross, deduction, net: gross - deduction };
}
