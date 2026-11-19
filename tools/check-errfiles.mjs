// 유니패스 오류점수 파일 확인 — 폴더의 「…오류…」 엑셀을 오류점수 화면과 같은 규칙으로 읽어 터미널에 보인다.
//
//   node tools/check-errfiles.mjs <폴더> [YYYY-MM]
//
// 어떤 파일이 어떤 종류 · 기간 · 월 귀속으로 인식되었는지, 월별 수입 · 수출 · 수출입 오류점수 · 총신고건 · 오류비율,
// 인천 · 울산 점수, 현황목록 ↔ 상세목록 차액을 출력한다. 실제 사내 파일은 저장소에 넣지 않는다 — 경로만 넘긴다.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('../lib/xlsx.full.min.js');
const FR = require('../js/filerules.js');
const E = require('../js/errscore.js');

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
  console.log('     종류 ' + (b.kind || '구분 모름') + ' 오류점수 · ' + part + ' | 기간 ' + per + ' | ' + (d.mode === 'confirmed' ? '확정본' : '조회용') + ' | 월 귀속 ' + d.rule + ' ' + d.ruleText);
  console.log('     상세 ' + b.rows.length + '줄' + (b.totalRows ? ' · 합계 줄 ' + b.totalRows + ' 제외' : '') + (b.skipped ? ' · 읽지 못한 줄 ' + b.skipped : '') + (b.hasStatus ? ' · 현황 ' + JSON.stringify(b.status) : '') + (b.notes.length ? ' · ' + b.notes.join(' / ') : ''));
});

const S = E.summarize(books, E.countsFromBooks(books), {});
const f1 = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US'));
const pct = (v) => (v == null ? '자료 없음' : v.toFixed(2) + '%');
console.log('\n[월별 오류점수 — 분모는 현황목록 총신고건]');
S.months.forEach((m) => {
  [['수입', S.kinds.수입.months[m]], ['수출', S.kinds.수출.months[m]], ['수출입', S.total[m]]].forEach(([k, x]) => {
    console.log('  ' + String(m).padStart(2) + '월 ' + k.padEnd(3) + ' 오류점수 ' + f1(x.종합.score).padStart(5) + '점 · 총신고건 ' + f1(x.종합.decl).padStart(6) + '건 · 오류비율 ' + pct(x.종합.rate).padStart(8) +
      ' · 오류건수(신고번호) ' + x.종합.err + ' | 인천 ' + f1(x.인천.score) + '점 · 울산 ' + f1(x.울산.score) + '점');
  });
});

console.log('\n[현황목록 총 오류점수 ↔ 상세목록 합계]');
const chk = E.statusCheck(books);
if (!chk.length) console.log('  (현황 · 상세가 함께 있는 달 없음)');
chk.forEach((c) => console.log('  ' + c.month + '월 ' + c.kind + ' 현황 ' + c.status + '점 ↔ 상세 ' + c.detail + '점' + (c.diff ? '  ← 차액 ' + c.diff + '점' : '  (같음)')));

const want = process.env.FIND_DECL;
if (want) {
  const hit = books.flatMap((b) => b.rows.filter((r) => r.declNo === want.toUpperCase().replace(/[\s-]/g, '')).map((r) => b.fileName + ' · ' + r.kind + ' ' + r.month + '월 · ' + r.campus + ' · 오류점수 ' + r.score));
  console.log('\n[신고번호 ' + want + '] ' + (hit.length ? '집계에 포함 — ' + hit.join(' / ') : '없음'));
}
