import test from 'node:test';
import assert from 'node:assert/strict';
import { epochDayOf, hm, ymdOf, parseTimeInput } from '../js/core/date.js';
import * as S from '../js/core/shift.js';
import * as T from '../js/core/trips.js';
import * as B from '../js/core/billing.js';
import * as L from '../js/core/labor.js';
import * as V from '../js/core/validation.js';
import * as Sal from '../js/core/salary.js';

const D = epochDayOf;
const rec = (o) => ({ id: 1, date: D(2026, 11, 23), startTime: null, endTime: null, trips: [], isNextDay: false, ...o });
const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// ── BillingUtilsTest
test('billing: 預設 26 → 5 月計酬 4/26 ~ 5/25', () => {
  const r = B.billingRange(2026, 5, {}, 26);
  assert.equal(r.start, D(2026, 4, 26)); assert.equal(r.end, D(2026, 5, 25));
});
test('billing: 5/20 屬 5 月、5/26 屬 6 月', () => {
  assert.equal(B.billingMonthOf(D(2026, 5, 20), {}, 26).m, 5);
  assert.equal(B.billingMonthOf(D(2026, 5, 26), {}, 26).m, 6);
});
test('billing: 7 月區間 6/26~7/25；結算日表優先', () => {
  const r = B.billingRange(2026, 7, {}, 26);
  assert.equal(r.start, D(2026, 6, 26)); assert.equal(r.end, D(2026, 7, 25));
  const r2 = B.billingRange(2026, 7, { '2026-07': 20, '2026-01': 25 }, 26);
  assert.equal(r2.start, D(2026, 6, 26)); assert.equal(r2.end, D(2026, 7, 20));
  assert.equal(B.billingRange(2026, 2, { '2026-01': 31 }, 26).end, D(2026, 2, 28));
});

// ── ShiftTimeRulesTest
test('shift: 晚班門檻', () => {
  assert.equal(S.isLateStart(hm(17)), false); assert.equal(S.isLateStart(hm(19, 59)), false); assert.equal(S.isLateStart(hm(20)), true);
});
test('shift: 傍晚上班跨夜 → 卡片留在上班日', () => {
  const r = S.resolveClockOutDate(D(2026, 7, 13), hm(17), D(2026, 7, 14), hm(2));
  assert.equal(r.date, D(2026, 7, 13)); assert.equal(r.isNextDay, true);
});
test('shift: 晚班跨夜 → 卡片移到下班日', () => {
  const r = S.resolveClockOutDate(D(2026, 7, 13), hm(21), D(2026, 7, 14), hm(2));
  assert.equal(r.date, D(2026, 7, 14)); assert.equal(r.isNextDay, true);
});
test('shift: 工時', () => {
  assert.equal(S.workMinutes(rec({ startTime: hm(17), endTime: hm(2), isNextDay: true })), 540);
  assert.equal(S.workMinutes(rec({ startTime: hm(17), endTime: hm(23) })), 360);
  assert.equal(S.workMinutes(rec({ startTime: hm(8) }), { nowIfStillWorking: false }), 0);
});
test('shift: 夜點邊界', () => {
  assert.equal(S.defaultNightShiftForClockIn(0), 0);
  assert.equal(S.defaultNightShiftForClockIn(hm(0, 1)), 1);
  assert.equal(S.defaultNightShiftForClockIn(hm(3, 30)), 1);
  assert.equal(S.defaultNightShiftForClockIn(hm(5, 59)), 1);
  assert.equal(S.defaultNightShiftForClockIn(hm(6)), 0);
});
test('shift: 拆日區段', () => {
  const a = S.splitToDaySegments(D(2026, 7, 13), hm(17), hm(2), true);
  assert.deepEqual(a.map((x) => x.day), [D(2026, 7, 13), D(2026, 7, 14)]);
  const b = S.splitToDaySegments(D(2026, 7, 16), hm(21), hm(6), true);
  assert.deepEqual(b.map((x) => x.day), [D(2026, 7, 15), D(2026, 7, 16)]);
});
test('shift: 草稿判定不綁今天', () => {
  assert.equal(S.isDraft(rec({ date: D(2020, 1, 1) })), true);
  assert.equal(S.isDraft(rec({ isOffDay: true })), false);
  assert.equal(S.isDraft(rec({ specialLeaveHours: 8 })), false);
});

// ── TripStatsTest
test('trips: 倍率互斥 3X 優先', () => {
  assert.equal(T.overtimeMultiplier(false, false), 1); assert.equal(T.overtimeMultiplier(true, false), 2);
  assert.equal(T.overtimeMultiplier(false, true), 3); assert.equal(T.overtimeMultiplier(true, true), 3);
});
test('trips: (1+1)*2+1 = 5', () => {
  const r = rec({ is2xOvertime: true, trips: [{ tripCount: 1, specialCount: 1, overtimeCount: 1, destination: 'A', acidType: 'H', driverName: 'D' }] });
  assert.equal(T.recordTripCount(r), 5);
  assert.deepEqual(T.aggregateBy([r], (t) => t.driverName, {}, 'weighted'), [['D', 5]]);
});
test('trips: 目的地以出現次數計', () => {
  const r = rec({ trips: [{ destination: 'TSMC', tripCount: 2 }, { destination: 'TSMC', tripCount: 1.5 }] });
  assert.deepEqual(T.aggregateBy([r], (t) => t.destination), [['TSMC', 2]]);
});

// ── LaborLawOvertimeTest
const hourly = L.hourlyWage(36000);
test('labor: 時薪 = 月薪/240', () => assert.equal(hourly, 150));
test('labor: 平日 8 小時內無加班；11 小時 = 650', () => {
  assert.deepEqual(L.dayPay(L.DayKind.WORKDAY, 480, hourly), { ot: 0, pay: 0 });
  const r = L.dayPay(L.DayKind.WORKDAY, 660, hourly); assert.equal(r.ot, 180); near(r.pay, 650);
});
test('labor: 休息日 3h = 650；12h = 3500', () => {
  near(L.dayPay(L.DayKind.REST_DAY, 180, hourly).pay, 650);
  const r = L.dayPay(L.DayKind.REST_DAY, 720, hourly); assert.equal(r.ot, 720); near(r.pay, 3500);
});
test('labor: 假日 5h = 1200；10h = 1600', () => {
  near(L.dayPay(L.DayKind.HOLIDAY, 300, hourly).pay, 1200);
  const r = L.dayPay(L.DayKind.HOLIDAY, 600, hourly); assert.equal(r.ot, 120); near(r.pay, 1600);
});
test('labor: 日別判定', () => {
  const sat = D(2026, 11, 21), sun = D(2026, 11, 22), mon = D(2026, 11, 23);
  assert.equal(L.dayKind(mon, true, false, 'MARKS'), L.DayKind.REST_DAY);
  assert.equal(L.dayKind(mon, false, true, 'MARKS'), L.DayKind.HOLIDAY);
  assert.equal(L.dayKind(sat, false, false, 'MARKS'), L.DayKind.WORKDAY);
  assert.equal(L.dayKind(sat, false, false, 'WEEKDAY'), L.DayKind.REST_DAY);
  assert.equal(L.dayKind(sun, false, false, 'WEEKDAY'), L.DayKind.HOLIDAY);
});
test('labor: 同日兩班合併並扣休息', () => {
  const recs = [rec({ id: 1, startTime: hm(6), endTime: hm(12) }), rec({ id: 2, startTime: hm(13), endTime: hm(19) })];
  const r = L.calculate(recs, 36000, 30, 'MARKS');
  assert.equal(r.days.length, 1); assert.equal(r.days[0].workedMinutes, 660); assert.equal(r.totalPay, 650);
  near(r.totalOvertimeHours, 3); assert.equal(r.exceedsMonthlyCap, false);
});
test('labor: 跨夜 14 小時 × 5 天', () => {
  const recs = [1, 2, 3, 4, 5].map((i) => rec({ id: i, date: D(2026, 11, i), startTime: hm(20), endTime: hm(10) }));
  const r = L.calculate(recs, 36000, 0, 'MARKS');
  assert.equal(r.daysOverDailyCap, 5); near(r.totalOvertimeHours, 30);
});

// ── ShiftValidationTest
test('validation: 正常、晚班跨夜無警告', () => {
  assert.deepEqual(V.check(rec({ startTime: hm(8), endTime: hm(17) })), []);
  assert.deepEqual(V.check(rec({ startTime: hm(21), endTime: hm(7) })), []);
});
test('validation: 超長、0 工時、重疊、相鄰、自己', () => {
  const w = V.check(rec({ startTime: hm(6), endTime: hm(5), isNextDay: true }));
  assert.equal(w.length, 1); assert.match(w[0], /23 小時/);
  assert.equal(V.check(rec({ startTime: hm(8), endTime: hm(8) })).length, 1);
  const o = V.check(rec({ startTime: hm(8), endTime: hm(17) }), { others: [rec({ id: 2, startTime: hm(16), endTime: hm(20) })] });
  assert.equal(o.length, 1); assert.match(o[0], /重疊/);
  assert.deepEqual(V.check(rec({ startTime: hm(8), endTime: hm(12) }), { others: [rec({ id: 2, startTime: hm(12), endTime: hm(18) })] }), []);
  assert.deepEqual(V.check(rec({ startTime: hm(8), endTime: hm(17) }), { others: [rec({ startTime: hm(8), endTime: hm(17) })] }), []);
});

// ── 薪資與輸入
test('salary: 月度設定取最近的前一筆', () => {
  const list = [{ monthKey: '2026-01', baseSalary: 30000 }, { monthKey: '2026-04', baseSalary: 32000 }];
  assert.equal(Sal.effectiveSalary('2026-03', list).baseSalary, 30000);
  assert.equal(Sal.effectiveSalary('2026-06', list).baseSalary, 32000);
  assert.equal(Sal.effectiveSalary('2025-12', list, { ...Sal.emptySalary(), baseSalary: 1 }).baseSalary, 1);
});
test('date: 時間輸入解析', () => {
  assert.equal(parseTimeInput('0830'), hm(8, 30)); assert.equal(parseTimeInput('830'), hm(8, 30));
  assert.equal(parseTimeInput('08:30'), hm(8, 30)); assert.equal(parseTimeInput('2460'), null);
  assert.deepEqual(ymdOf(D(2026, 2, 28) + 1), { y: 2026, m: 3, d: 1, dow: 0 });
});

// ── 打卡流程（對應 Android ScenarioRegression）
import * as A from '../js/core/actions.js';
import { defaultSettings } from '../js/core/backup.js';
const st = () => ({ workRecords: [], monthlySalaries: [], settings: defaultSettings() });
const at = (y, mo, d, h, mi = 0) => new Date(y, mo - 1, d, h, mi);
test('actions: 晚班 21:00 上班、隔天 06:00 下班 → 卡片在下班日', () => {
  const s = st();
  A.clockIn(s, at(2026, 7, 15, 21));
  assert.equal(A.activeRecord(s, at(2026, 7, 16, 1)).startTime, hm(21)); // 跨夜仍顯示上班中
  const r = A.clockOut(s, at(2026, 7, 16, 6));
  assert.equal(r.date, D(2026, 7, 16)); assert.equal(r.isNextDay, true);
  assert.equal(S.workMinutes(r), 540);
});
test('actions: 凌晨上班自動夜點、重複按上班不覆蓋、同日可再開新班', () => {
  const s = st();
  const r = A.clockIn(s, at(2026, 7, 15, 3)); assert.equal(r.nightShiftCount, 1);
  A.clockIn(s, at(2026, 7, 15, 4)); assert.equal(s.workRecords.length, 1); assert.equal(r.startTime, hm(3));
  A.clockOut(s, at(2026, 7, 15, 12));
  A.clockIn(s, at(2026, 7, 15, 13)); assert.equal(s.workRecords.length, 2);
});
test('actions: 先記車趟再上班用同一張卡；趟數記憶', () => {
  const s = st();
  A.addTrip(s, { id: 't1', destination: 'TSMC 8A', acidType: 'H2SO4', tripCount: 1.5 }, at(2026, 7, 15, 7));
  A.clockIn(s, at(2026, 7, 15, 8));
  assert.equal(s.workRecords.length, 1); assert.equal(s.workRecords[0].trips.length, 1);
  assert.equal(A.rememberedTripCount(s, 'TSMC 8A', 'H2SO4'), 1.5);
  assert.equal(A.rememberedTripCount(s, 'TSMC 8A', 'HF'), null);
});
test('actions: 2X/3X 互斥、清除過期草稿', () => {
  const s = st();
  const r = A.updateStatus(s, { is2xOvertime: true, is3xOvertime: true }, at(2026, 7, 15, 8));
  assert.equal(r.is2xOvertime, false); assert.equal(r.is3xOvertime, true);
  s.workRecords.push({ id: 9, date: D(2026, 7, 1), trips: [], startTime: null, endTime: null });
  assert.equal(A.purgeStaleDrafts(s, at(2026, 7, 15, 9)), 1);
});

import { applyDefaultRates } from '../js/core/backup.js';
test('預設獎金基數：沒設定過才套用 400/300', () => {
  assert.deepEqual([defaultSettings().salaryInfo.tripBonusRate, defaultSettings().salaryInfo.nightShiftBonusRate], [400, 300]);
  const a = applyDefaultRates({ salaryInfo: { tripBonusRate: 0, nightShiftBonusRate: 0, baseSalary: 5 } });
  assert.deepEqual([a.salaryInfo.tripBonusRate, a.salaryInfo.nightShiftBonusRate, a.salaryInfo.baseSalary], [400, 300, 5]);
  const b = applyDefaultRates({ salaryInfo: { tripBonusRate: 350, nightShiftBonusRate: 0 } });
  assert.equal(b.salaryInfo.tripBonusRate, 350);
});
