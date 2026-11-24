// 薪資對帳單：資料整理、Excel（.xlsx）與可列印成 PDF 的 HTML
import { fmtDate, fmtTime, weekdayLabel, ymdOf, fmtDuration } from './date.js';
import { workMinutes, interval, isDraft } from './shift.js';
import { recordTripCount, fmtNum } from './trips.js';
import { INCOME, DEDUCTIONS } from './salary.js';
import { makeZip } from './zip.js';

export function buildStatement({ y, m, rangeText, records, salary, summary, lawPay }) {
  const days = records.filter((r) => !isDraft(r)).sort((a, b) => a.date - b.date || (a.startTime ?? 0) - (b.startTime ?? 0)).map((r) => {
    const iv = interval(r);
    const md = (d) => { const x = ymdOf(d); return `${x.m}/${x.d}`; };
    const start = iv && iv.startDate !== r.date ? `(${md(iv.startDate)}) ${fmtTime(r.startTime)}` : (r.startTime != null ? fmtTime(r.startTime) : '');
    const end = iv && iv.endDate !== r.date ? `${fmtTime(r.endTime)} (${md(iv.endDate)})` : (r.endTime != null ? fmtTime(r.endTime) : '');
    const tags = [];
    if (r.is3xOvertime) tags.push('3X'); else if (r.is2xOvertime) tags.push('2X');
    if (r.isOffDay) tags.push('輪空');
    if (r.isOfficialBusiness) tags.push('其他');
    if (r.specialLeaveHours > 0) tags.push(`特休 ${fmtNum(r.specialLeaveHours)}h`);
    const minutes = r.startTime != null && r.endTime != null ? workMinutes(r, { nowIfStillWorking: false }) : 0;
    return { dateText: fmtDate(r.date, true), weekday: weekdayLabel(r.date), start, end, minutes,
      hoursText: minutes > 0 ? fmtDuration(minutes) : '', trips: recordTripCount(r), night: r.nightShiftCount || 0,
      tags: tags.join(' '), remarks: r.remarks || '' };
  });
  const income = [...INCOME.map(([k, l]) => ({ label: l, amount: salary[k] || 0 })),
    { label: '車趟獎金', amount: summary.tripBonus }, { label: '夜點獎金', amount: summary.nightBonus }];
  const deductions = DEDUCTIONS.map(([k, l]) => ({ label: l, amount: salary[k] || 0 }));
  return {
    y, m, rangeText, title: `薪資對帳單 ${y} 年 ${m} 月`, fileBase: `薪資對帳單_${y}${String(m).padStart(2, '0')}`,
    days, income, deductions, gross: summary.gross, deduction: summary.deduction, net: summary.net, lawPay,
    totalMinutes: days.reduce((a, d) => a + d.minutes, 0), totalTrips: days.reduce((a, d) => a + d.trips, 0),
    totalNight: days.reduce((a, d) => a + d.night, 0),
  };
}

// ── Excel ───────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const col = (i) => { let n = i + 1, s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
const numStr = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000));
const S = { def: 0, bold: 1, header: 2, money: 3, moneyBold: 4, dec: 5, title: 6 };
const str = (v, s = 0) => ({ t: 's', v, s }), n = (v, s = 0) => ({ t: 'n', v, s }), f = (fx, cached, s = 0) => ({ t: 'f', f: fx, v: cached, s });

function sheet(rows, widths, freeze) {
  let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
  if (freeze) x += `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${freeze}" topLeftCell="A${freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`;
  x += '<cols>' + widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols><sheetData>';
  rows.forEach((row, ri) => {
    x += `<row r="${ri + 1}">`;
    row.forEach((c, ci) => {
      if (!c) return;
      const ref = col(ci) + (ri + 1);
      if (c.t === 's') { if (c.v !== '' || c.s) x += `<c r="${ref}" t="inlineStr" s="${c.s}"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`; }
      else if (c.t === 'n') x += `<c r="${ref}" s="${c.s}"><v>${numStr(c.v)}</v></c>`;
      else x += `<c r="${ref}" s="${c.s}"><f>${esc(c.f)}</f><v>${numStr(c.v)}</v></c>`;
    });
    x += '</row>';
  });
  return x + '</sheetData></worksheet>';
}

export function statementXlsx(d) {
  const r1 = [[str(d.title, S.title)], [str(`計酬區間：${d.rangeText}`)], [],
    ['日期', '星期', '上班', '下班', '工時(小時)', '工時(時:分)', '趟數', '夜點', '註記', '備註'].map((h) => str(h, S.header))];
  const first = r1.length + 1;
  d.days.forEach((x) => r1.push([str(x.dateText), str(x.weekday), str(x.start), str(x.end),
    x.minutes > 0 ? n(Math.round(x.minutes / 60 * 100) / 100, S.dec) : null, str(x.hoursText), n(x.trips, S.dec), n(x.night), str(x.tags), str(x.remarks)]));
  const last = r1.length;
  if (d.days.length) r1.push([str('合計', S.bold), str(`${d.days.length} 筆`, S.bold), null, null,
    f(`SUM(E${first}:E${last})`, d.days.reduce((a, x) => a + (x.minutes > 0 ? Math.round(x.minutes / 60 * 100) / 100 : 0), 0), S.dec),
    str(fmtDuration(d.totalMinutes), S.bold), f(`SUM(G${first}:G${last})`, d.totalTrips, S.dec), f(`SUM(H${first}:H${last})`, d.totalNight)]);

  const r2 = [[str(d.title, S.title)], [], [str('收入項目', S.header), str('金額 (NT$)', S.header)]];
  const is = r2.length + 1; d.income.forEach((x) => r2.push([str(x.label), n(x.amount, S.money)])); const ie = r2.length;
  r2.push([str('月薪合計', S.bold), f(`SUM(B${is}:B${ie})`, d.gross, S.moneyBold)]); const gRow = r2.length;
  r2.push([], [str('扣款項目', S.header), str('金額 (NT$)', S.header)]);
  const ds = r2.length + 1; d.deductions.forEach((x) => r2.push([str(x.label), n(x.amount, S.money)])); const de = r2.length;
  r2.push([str('扣款合計', S.bold), f(`SUM(B${ds}:B${de})`, d.deduction, S.moneyBold)]); const dRow = r2.length;
  r2.push([], [str('本月實領', S.bold), f(`B${gRow}-B${dRow}`, d.net, S.moneyBold)]);
  if (d.lawPay > 0) r2.push([], [str('（參考）勞基法估算加班費，未計入上方金額'), n(d.lawPay, S.money)]);

  const ct = 'application/vnd.openxmlformats-officedocument.spreadsheetml';
  return makeZip([
    { name: '[Content_Types].xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${ct}.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${ct}.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="${ct}.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="${ct}.styles+xml"/></Types>` },
    { name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="每日明細" sheetId="1" r:id="rId1"/><sheet name="薪資明細" sheetId="2" r:id="rId2"/></sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: 'xl/styles.xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="0.##"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF1565C0"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE3EDF8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF9E9E9E"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' },
    { name: 'xl/worksheets/sheet1.xml', text: sheet(r1, [12, 6, 14, 14, 11, 11, 7, 7, 16, 30], 4) },
    { name: 'xl/worksheets/sheet2.xml', text: sheet(r2, [38, 16], 0) },
  ]);
}

// ── 列印用 HTML（另存 PDF）──────────────────────────────────────────
const h = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (v) => 'NT$ ' + Math.round(v).toLocaleString('en-US');
export function statementHtml(d) {
  const rows = d.days.map((x) => `<tr><td>${h(x.dateText.slice(5))}</td><td>${h(x.weekday)}</td><td>${h(x.start)}</td><td>${h(x.end)}</td><td class="r">${h(x.hoursText)}</td><td class="r">${x.trips ? fmtNum(x.trips) : ''}</td><td class="r">${x.night || ''}</td><td>${h(x.tags)}</td><td>${h(x.remarks)}</td></tr>`).join('');
  const sec = (title, list, totalLabel, total, minus) => `<h3>${title}</h3><table class="money">${list.filter((x) => x.amount).map((x) => `<tr><td>${h(x.label)}</td><td class="r">${minus ? '- ' : ''}${money(x.amount)}</td></tr>`).join('')}<tr class="b"><td>${totalLabel}</td><td class="r">${minus ? '- ' : ''}${money(total)}</td></tr></table>`;
  return `<div class="stmt"><h1>${h(d.title)}</h1><p class="sub">計酬區間：${h(d.rangeText)}　產生時間：${new Date().toLocaleString('zh-TW')}</p>
<h3>每日明細</h3><table class="days"><thead><tr><th>日期</th><th>星期</th><th>上班</th><th>下班</th><th>工時</th><th>趟數</th><th>夜點</th><th>註記</th><th>備註</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr><td>合計</td><td>${d.days.length} 筆</td><td></td><td></td><td class="r">${fmtDuration(d.totalMinutes)}</td><td class="r">${fmtNum(d.totalTrips)}</td><td class="r">${d.totalNight}</td><td></td><td></td></tr></tfoot></table>
${sec('收入項目', d.income, '月薪合計', d.gross, false)}${sec('扣款項目', d.deductions, '扣款合計', d.deduction, true)}
<p class="net">本月實領　<b>${money(d.net)}</b></p>${d.lawPay > 0 ? `<p class="sub">（參考）依勞基法估算加班費 ${money(d.lawPay)}，未計入上方金額。</p>` : ''}</div>`;
}
