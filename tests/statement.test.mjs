import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { epochDayOf, hm } from '../js/core/date.js';
import { buildStatement, statementXlsx } from '../js/core/statement.js';
import { monthSummary, emptySalary } from '../js/core/salary.js';
import { parseBackup, buildBackup } from '../js/core/backup.js';

test('xlsx 對帳單可產生', () => {
  const d = epochDayOf(2026, 11, 3);
  const records = [
    { id: 1, date: d, startTime: hm(8), endTime: hm(18, 30), nightShiftCount: 1, remarks: '備註 <測試> & "引號"', trips: [{ tripCount: 1.5, destination: 'TSMC 8A' }] },
    { id: 2, date: d + 1, startTime: hm(21), endTime: hm(7), is2xOvertime: true, trips: [] },
    { id: 3, date: d + 2, isOffDay: true, trips: [] },
  ];
  const sal = { ...emptySalary(), baseSalary: 30000, foodAllowance: 3000, laborInsurance: 800, tripBonusRate: 400, nightShiftBonusRate: 300 };
  const sum = monthSummary(records, sal);
  assert.equal(sum.tripBonus, 600); assert.equal(sum.net, 33100);
  const st = buildStatement({ y: 2026, m: 11, rangeText: '10/26 ~ 11/25', records, salary: sal, summary: sum, lawPay: 1234 });
  assert.equal(st.days[1].start, '(11/3) 21:00'); assert.equal(st.days[1].tags, '2X'); assert.equal(st.totalMinutes, 1230);
  mkdirSync('tests/out', { recursive: true });
  writeFileSync('tests/out/sample.xlsx', statementXlsx(st));
});

test('備份：可讀 Android 格式並保持相容', () => {
  const android = JSON.stringify({ version: 1, timestamp: 1, sourceAppId: 'com.chuanshun.tracker.dev',
    workRecords: [{ id: 5, date: 20451, startTime: 17340, endTime: 47880, is2xOvertime: true, is3xOvertime: true, trips: [{ destination: 'A', tripCount: 2 }] }, { id: 5, date: 20452 }],
    monthlySalaries: [{ monthKey: '2026-01', baseSalary: 1 }], settings: { destinations: [{ name: 'X' }], billingStartDay: 26 } });
  const s = parseBackup(android);
  assert.equal(s.workRecords.length, 2); assert.notEqual(s.workRecords[0].id, s.workRecords[1].id);
  assert.equal(s.workRecords[0].is2xOvertime, false); assert.equal(s.workRecords[0].is3xOvertime, true);
  assert.equal(s.settings.destinations[0].name, 'X'); assert.equal(s.settings.law.breakMinutes, 60);
  const again = parseBackup(buildBackup(s));
  assert.deepEqual(again.workRecords, s.workRecords);
  assert.throws(() => parseBackup('hello'), /不是備份檔/);
  assert.throws(() => parseBackup('{"a":1}'), /不是全順/);
});
