// 수입 FTA 파일 확인 — ERP 수입FTA 엑셀을 대시보드 「수입 FTA」 탭과 같은 규칙(js/customs.js ftaImportReport)으로 읽어 터미널에 보인다.
//
//   node tools/check-ftafile.mjs <파일.xlsx> [YYYY-MM]
//
// 파일 인식(종류 · 기간 · 확정본/조회용 · 원화 금액 열), 당월 · 누적 표(전체 · 가능 · FTA · 절감액 · 비율, 억원),
// 월별 총합계, 협정별, 사후적용 대기, 미적용 사유별, 제외 건수를 출력한다. 월을 주지 않으면 파일의 마지막 월.
// 실제 사내 파일은 저장소에 넣지 않는다 — 경로만 넘긴다.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('../lib/xlsx.full.min.js');
const FR = require('../js/filerules.js');
const C = require('../js/customs.js');

const FILE = process.argv[2];
const MONTH = process.argv[3] || '';
if (!FILE) { console.error('사용법: node tools/check-ftafile.mjs <파일.xlsx> [YYYY-MM]'); process.exit(1); }

const N = path.basename(FILE);
const wb = XLSX.read(fs.readFileSync(FILE), { type: 'buffer' });
const sheets = wb.SheetNames.map((s) => {
  const a = XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, raw: true, defval: '' });
  const hr = C.findHeaderRow(a);
  return { name: s, aoa: a.slice(hr), offset: hr };
}).filter((x) => x.aoa.length > 1);
const pk = C.pickSheets(sheets, N);
const info = FR.describe(N, pk.detect);

console.log('\n[파일 인식]');
console.log('  ' + N);
console.log('     내용 판정 ' + pk.detect.kind + ' · 자료 ' + (info.dataset || '—') + ' · ' + (info.mode === 'confirmed' ? '확정본' : info.mode === 'view' ? '조회용(저장 안 함)' : info.mode) + ' · 기간 ' + (info.period ? info.period.text : '—') + ' · 월 귀속 ' + info.rule);
if (info.dataset !== 'ftaImport') { console.error('     수입 FTA 파일이 아닙니다.'); process.exit(1); }

const items = pk.use.map((u) => ({ name: N, file: N, headers: C.uniqueHeaders(u.aoa[0]), aoa: u.aoa, offset: u.offset, override: {}, meta: info }));
const m = C.mergeFiles('ftaImport', items, C.exportSettings(null));
const map = m.files[0].res.map;
console.log('     열 — 금액 ' + map.goods + ' · 절감액 ' + map.saving + ' · 수리일자 ' + map.date + ' · 관세구분 ' + map.dutyType + ' · 본부 ' + map.hq + (m.files[0].res.missing.length ? ' · 못 찾음 ' + m.files[0].res.missing.join(', ') : ''));
console.log('     읽은 란 ' + m.records.length + (m.skipped.length ? ' · 읽지 못한 줄 ' + m.skipped.length : ''));
if (!m.ok) process.exit(1);

const periods = {}; if (info.period && info.period.months) periods[N] = info.period.months;
const rep0 = C.ftaImportReport(m.records, { filePeriods: periods });
const month = MONTH || rep0.months[rep0.months.length - 1];
const rep = C.ftaImportReport(m.records, { month, filePeriods: periods, today: new Date().toISOString().slice(0, 10) });
const e = (v) => { const x = C.eok(v); return x == null ? '—' : x.toFixed(2); };
const pct = (r) => (r == null ? '—' : (r * 100).toFixed(2) + '%');
const line = (r) => '  ' + r.hq.padEnd(7) + [e(r.all), e(r.poss), e(r.fta), e(r.saving)].map((s) => s.padStart(10)).join('') + pct(r.rate).padStart(10);
const head = '  ' + 'BG'.padEnd(7) + ['전체', '가능', 'FTA', '절감액'].map((s) => s.padStart(9)).join('') + '비율'.padStart(9) + '   (억원)';

console.log('\n' + rep.basis);
console.log('\n[' + month + ' 당월]'); console.log(head); rep.current.forEach((r) => console.log(line(r)));
console.log('\n[' + rep.year + '-01 ~ ' + month + ' 누적]'); console.log(head); rep.cumulative.forEach((r) => console.log(line(r)));
console.log('\n[월별 총합계]'); rep.monthly.forEach((r) => console.log(line(Object.assign({}, r, { hq: r.month }))));
console.log('\n[협정별 · 누적]'); rep.agreements.cumulative.forEach((a) => console.log('  ' + a.code.padEnd(8) + String(a.name).padEnd(10) + ' 물자대 ' + e(a.goods) + ' · 절감액 ' + e(a.saving)));
const pend = (p, t) => { console.log('\n[사후적용 대기 · ' + t + '] ' + p.lines + '란 · ' + p.decls + '건 · ' + e(p.amount) + '억'); p.list.slice(0, 15).forEach((x) => console.log('  ' + x.declNo + '  ' + x.hq.padEnd(6) + ' ' + x.date + ' ' + String(x.days).padStart(4) + '일 ' + Math.round(x.goods).toLocaleString('ko-KR').padStart(14) + '원 ' + x.lines + '란  ' + (x.reason || ''))); if (p.list.length > 15) console.log('  … ' + (p.list.length - 15) + '건 더'); };
pend(rep.pending.month, month); pend(rep.pending.cumulative, '누적');
console.log('\n[미적용 사유별 · 누적]'); rep.reasons.cumulative.forEach((q) => console.log('  ' + String(q.key).padEnd(10) + String(q.name).padEnd(16) + e(q.goods).padStart(10) + '억 ' + q.lines + '란'));
const x = rep.excluded;
console.log('\n[제외] GN ' + x.gn + '란(' + e(x.gnAmount) + '억) · F 단독(FTA 아님, 전체에는 넣음) ' + x.fOnly + '란 · 기간 밖 ' + x.outside + '란');
