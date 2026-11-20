// 유니패스 오류점수 파일 확인 — 폴더의 「…오류…」 엑셀을 오류점수 화면과 같은 규칙으로 읽어 터미널에 보인다.
//
//   node tools/check-errfiles.mjs <폴더> [YYYY-MM]
//
// 어떤 파일이 어떤 종류 · 기간 · 월 귀속으로 인식되었는지, 월별 수입 · 수출 · 수출입 오류점수 · 총신고건 · 오류비율,
// 인천 · 울산 점수, 현황목록 ↔ 상세목록 차액을 출력한다. 실제 사내 파일은 저장소에 넣지 않는다 — 경로만 넘긴다.
// (v1.11.0) 같은 폴더의 ERP 수입실적 · 수출실적(파일 이름에 「실적」, 「오류」 없음)도 읽어 인천 신고건수(GN 포함) · 본부(PLANT) · 검증을 보인다.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('../lib/xlsx.full.min.js');
const FR = require('../js/filerules.js');
const E = require('../js/errscore.js');
const C = require('../js/customs.js');

const DIR = process.argv[2];
const ONLY = process.argv[3] || '';
if (!DIR) { console.error('사용법: node tools/check-errfiles.mjs <폴더> [YYYY-MM]'); process.exit(1); }

const files = fs.readdirSync(DIR).filter((n) => /\.xlsx?$/i.test(n) && /오류/.test(n) && (!ONLY || n.indexOf(ONLY) >= 0)).sort();
if (!files.length) { console.error('「오류」가 들어간 엑셀이 없습니다: ' + DIR); process.exit(1); }

const books = files.map((n) => {
  const wb = XLSX.read(fs.readFileSync(path.join(DIR, n)), { type: 'buffer' });
  const sheets = wb.SheetNames.map((s) => ({ name: s, aoa: XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, raw: true, defval: '' }) }));
  return E.readWorkbook(sheets, n);
});

console.log('\n[파일 인식]');
books.forEach((b) => {
  const d = FR.describe(b.fileName, null);
  const part = b.hasDetail && b.hasStatus ? '현황+상세' : b.hasDetail ? '상세목록' : b.hasStatus ? '현황목록' : '—';
  const per = b.fileMonth ? (b.fileYear + '-' + String(b.fileMonth).padStart(2, '0')) : '(시트 이름) ' + b.months.join(',');
  console.log('  ' + b.fileName);
  console.log('     종류 ' + (b.kind || '구분 모름') + ' 오류점수 · ' + part + ' | 연도 ' + (b.year || '—') + (b.summaryYear ? '(요약 A1)' : '') + ' | 기간 ' + per + ' | ' + (d.mode === 'confirmed' ? '확정본' : '조회용') + ' | 월 귀속 ' + d.rule + ' ' + d.ruleText);
  console.log('     상세 ' + b.rows.length + '줄' + (b.blankRows ? ' · 빈 줄 ' + b.blankRows : '') + (b.totalRows ? ' · 합계 · 소계 줄 ' + b.totalRows + ' 제외' : '') + (b.skipped ? ' · 읽지 못한 줄 ' + b.skipped : '') + (b.hasStatus ? ' · 현황 ' + JSON.stringify(b.status) : ''));
  (b.perSheet || []).forEach((p) => console.log('       ' + (p.month ? String(p.month).padStart(2) + '월' : '월?') + ' 상세: 시트 ' + p.sheetRows + '행 = 정정 줄 ' + p.rows + ' + 빈 줄 ' + p.blank + ' + 합계 · 소계 ' + p.totalRows + ' + 읽지 못한 줄 ' + p.skipped + (p.cutAt != null ? ' (오른쪽 작업 영역 ' + (p.cutAt + 1) + '열부터 무시)' : '')));
  b.notes.forEach((t) => console.log('     · ' + t));
});

// (v1.11.0) ERP 실적 — GN 포함으로 고정
const erpFiles = fs.readdirSync(DIR).filter((n) => /\.xlsx?$/i.test(n) && !/오류/.test(n) && FR.kindByName(n) && FR.kindByName(n).group === 'perf' && FR.kindByName(n).dataset).sort();
const erp = { 수입: [], 수출: [] };
erpFiles.forEach((n) => {
  const kind = FR.kindByName(n).dataset, wb = XLSX.read(fs.readFileSync(path.join(DIR, n)), { type: 'buffer' });
  const sh = wb.SheetNames.map((s) => { const aoa = XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, raw: true, defval: '' }); const hr = C.findHeaderRow(aoa); return { name: s, aoa: aoa.slice(hr), offset: hr }; }).filter((x) => x.aoa.length > 1);
  const pk = C.pickSheets(sh, n), u = pk.use[0];
  const item = { name: n, file: n, headers: C.uniqueHeaders(u.aoa[0]), aoa: u.aoa, offset: u.offset, override: {} };
  if (pk.use.length > 1) item.parts = pk.use.map((x) => ({ sheet: x.name, aoa: x.aoa, offset: x.offset }));
  const set = C.exportSettings(null); set.excludeGN = false;
  const m = C.mergeFiles(kind, [item], set);
  erp[kind === 'import' ? '수입' : '수출'] = erp[kind === 'import' ? '수입' : '수출'].concat(m.records);
  console.log('  ' + n + ' — ERP ' + (kind === 'import' ? '수입' : '수출') + ' 실적 · ' + m.records.length + '줄(GN ' + m.records.filter((r) => String(r.payment || '').toUpperCase() === 'GN').length + ' 포함) · 날짜 ' + m.map.date + ' · 신고번호 ' + m.map.declNo + (m.ok ? '' : ' · 못 찾은 열 ' + m.files[0].res.missing.join(',')));
});
const year = (books.find((b) => b.year) || {}).year || null;
const erpSum = E.erpSummary(erp, year);
// (v2.0.0) 인천 신고건수 = ERP 만(요약 시트 · 직접 입력은 입력으로 받지 않음 — 요약 시트는 검증에서 대조만)
const counts = { 수입: {}, 수출: {} }, src = { 수입: {}, 수출: {} };
E.KINDS.forEach((k) => { if (erp[k].length) Object.keys(erpSum.counts[k]).forEach((mm) => { counts[k][mm] = erpSum.counts[k][mm]; src[k][mm] = 'ERP'; }); });
const S = E.summarize(books, counts, {});
const f1 = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US'));
const pct = (v) => (v == null ? '자료 없음' : v.toFixed(2) + '%');
console.log('\n[월별 오류점수 — 분모는 현황목록 총신고건 · 전사 = 수출입 합계(한쪽 현황목록이 없으면 자료 없음)]');
S.months.forEach((m) => {
  [['수입', S.kinds.수입.months[m]], ['수출', S.kinds.수출.months[m]], ['전사(수출입)', S.total[m]]].forEach(([k, x]) => {
    console.log('  ' + String(m).padStart(2) + '월 ' + k.padEnd(8) + ' 오류점수 ' + f1(x.종합.score).padStart(5) + '점 · 총신고건 ' + f1(x.종합.decl).padStart(6) + '건 · 오류비율 ' + pct(x.종합.rate).padStart(8) +
      ' · 오류건수 ' + x.종합.err + '(점수 발생 ' + x.종합.scored + ')' +
      ' | 인천 ' + f1(x.인천.decl) + '건' + (k !== '전사(수출입)' && src[k][m] ? '(' + src[k][m] + ')' : '') + ' · ' + x.인천.err + '건 · ' + f1(x.인천.score) + '점 · ' + pct(x.인천.rate) +
      ' | 울산 ' + f1(x.울산.decl) + '건 · ' + x.울산.err + '건 · ' + f1(x.울산.score) + '점 · ' + pct(x.울산.rate) + (x.미분류 && x.미분류.err ? ' | 지역 미분류 ' + x.미분류.err + '건 · ' + f1(x.미분류.score) + '점' : ''));
  });
});

console.log('\n[관세사부호 → 지역]');
E.brokers(books.flatMap((b) => b.rows), null).forEach((b) => console.log('  ' + b.broker + ' ' + (b.campus === E.UNREGION ? '지역 미분류 ← 경고' : b.campus) + ' · ' + b.err + '건 · ' + b.score + '점'));
if (erpFiles.length) {
  const H = E.hqBreakdown(S, books, erpSum);
  console.log('\n[본부별(PLANT) — ' + H.ulsanNote + ']');
  S.months.forEach((m) => E.KINDS.forEach((k) => (H.kinds[k][m] || []).forEach((x) => console.log('  ' + String(m).padStart(2) + '월 ' + k + ' ' + (x.region === '지역 미분류' ? '지역 미분류' : x.region) + ' ' + String(x.hq || '—').padEnd(8) + ' 신고 ' + f1(x.decl).padStart(6) + '건 · 오류 ' + x.err + '건(점수 발생 ' + x.scored + ') · ' + f1(x.score) + '점 · ' + (x.hq === E.HQ_NOMATCH ? '—' : pct(x.rate))))));
  if (H.uncovered.length) console.log('  ERP 실적이 없는 달(인천 건 본부 미분류): ' + H.uncovered.map((x) => x.month + '월 ' + x.kind).join(', '));
  if (H.notFound.length) console.log('  ERP 에 없는 인천 건(본부 미분류): ' + H.notFound.map((x) => x.month + '월 ' + x.kind + ' ' + x.declNo).join(', '));
}
console.log('\n[검증 — 인천 + 울산 = 현황목록]');
E.regionChecks(S, books, erpFiles.length ? erpSum : null).forEach((c) => console.log('  ' + String(c.month).padStart(2) + '월 ' + c.kind + ' ' + c.source.padEnd(5) + ' ' + c.item + ' ' + (c.ulsan == null ? f1(c.incheon) + ' / ERP ' + f1(c.expect) : f1(c.incheon) + ' + ' + f1(c.ulsan) + ' = ' + f1(c.sum) + ' / 현황 ' + f1(c.expect)) + (c.ok ? '  ✓' : '  ← 차이 ' + c.diff + (c.unregion ? '(지역 미분류 ' + c.unregion + '점)' : ''))));

// (v2.0.0) 오류점수 화면이 저장하는 요약(b2611-07.err.summary)과 같은 것
{
  const SUM = E.buildSummary(S, erpFiles.length ? E.hqBreakdown(S, books, erpSum) : null, books, { now: new Date().toISOString() });
  console.log('\n[요약 — ' + SUM.basis + ' · ' + SUM.rows.length + '줄 · ' + JSON.stringify(SUM).length + '바이트]');
  E.summaryMonthly(SUM).forEach((x) => console.log('  ' + x.ym + ' 종합(수입 + 수출) ' + f1(x.total.decl) + '건 · ' + x.total.err + '건 · ' + f1(x.total.score) + '점 · ' + pct(x.total.rate)));
}

console.log('\n[현황목록 총 오류점수 ↔ 상세목록 합계]');
const chk = E.statusCheck(books);
if (!chk.length) console.log('  (현황 · 상세가 함께 있는 달 없음)');
chk.forEach((c) => console.log('  ' + c.month + '월 ' + c.kind + ' 현황 ' + c.status + '점 ↔ 상세 ' + c.detail + '점' + (c.diff ? '  ← 차액 ' + c.diff + '점' : '  (같음)')));

const want = process.env.FIND_DECL;
if (want) {
  const hit = books.flatMap((b) => b.rows.filter((r) => r.declNo === want.toUpperCase().replace(/[\s-]/g, '')).map((r) => b.fileName + ' · ' + r.kind + ' ' + r.month + '월 · ' + r.campus + ' · 오류점수 ' + r.score));
  console.log('\n[신고번호 ' + want + '] ' + (hit.length ? '집계에 포함 — ' + hit.join(' / ') : '없음'));
}
