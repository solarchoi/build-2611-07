// 예제 엑셀 4종 만들기 — node tools/make-samples.mjs [폴더=samples]
// js/customs.js 의 sampleFiles() 로 실제 xlsx 를 쓴다. 가짜 데이터입니다(실제 사내 데이터가 아닙니다).
// 대시보드의 「예제로 해보기」와 같은 내용이다. 수입 파일은 ERP 처럼 맨 위에 제목·조회 조건 줄을 붙인다.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const XLSX = require(join(ROOT, 'lib/xlsx.full.min.js'));
const C = require(join(ROOT, 'js/customs.js'));

const dir = process.argv[2] || join(ROOT, 'samples');
mkdirSync(dir, { recursive: true });
for (const f of C.sampleFiles()) {
  const aoa = f.kind === 'import'
    ? [['수입 통관 실적 조회(예제 — 가짜 데이터)'], ['조회기간: 2024-01-01 ~ 2025-10-31']].concat(f.aoa)
    : f.aoa;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), '데이터');
  wb.Props = { Title: '예제(가짜 데이터)', CreatedDate: new Date(Date.UTC(2026, 10, 3)) };
  writeFileSync(join(dir, f.name), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }));
  console.log('썼습니다:', f.name, (aoa.length - 1) + '줄');
}
// (v1.4.6) 시험용 — 건수 열이 없는 관세환급 신청 현황 73줄 + 합계 줄. 예제 5종과 부딪히지 않게 하위 폴더에 둔다
// (브라우저 시험은 samples/ 바로 아래 파일만 한꺼번에 올린다).
{
  const f = C.sampleRefundApply(73), sub = join(dir, '시험용');
  mkdirSync(sub, { recursive: true });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(f.aoa), '데이터');
  wb.Props = { Title: '시험용 예제(가짜 데이터)', CreatedDate: new Date(Date.UTC(2026, 10, 16)) };
  writeFileSync(join(sub, f.name), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }));
  console.log('썼습니다: 시험용/' + f.name, (f.aoa.length - 1) + '줄(합계 줄 포함)');
}
// (v1.5.0) 시험용 — 관세환급 신청 현황 두 달치(2025.01 21열 · 2025.02 19열). 따로 · 함께 올려 합쳐지는지 본다.
for (const f of C.sampleRefundMonths()) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(f.aoa), '데이터');
  wb.Props = { Title: '시험용 예제(가짜 데이터)', CreatedDate: new Date(Date.UTC(2026, 10, 16)) };
  writeFileSync(join(dir, '시험용', f.name), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }));
  console.log('썼습니다: 시험용/' + f.name, f.cols + '열 ' + f.rows + '줄 + 합계 줄');
}
// (v1.6.0) 시험용 — 결정문 현황 + 고정비 절감 금액 열. 확인용 2건(가 · 나)과 여러 해 14건.
for (const f of [C.sampleRulingCheck(), C.sampleRulingAmounts()]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(f.aoa), '데이터');
  wb.Props = { Title: '시험용 예제(가짜 데이터)', CreatedDate: new Date(Date.UTC(2026, 10, 18)) };
  writeFileSync(join(dir, '시험용', f.name), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }));
  console.log('썼습니다: 시험용/' + f.name, (f.aoa.length - 1) + '줄');
}
// (v1.7.0) 시험용 — ERP EXPORT 원본 열 이름(Sheet1 · 55열 · Curr 5개 · HS 열 없음)의 가짜 15줄.
{
  const f = C.sampleExportErp();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(f.aoa), f.sheet);
  wb.Props = { Title: '시험용 예제(가짜 데이터)', CreatedDate: new Date(Date.UTC(2026, 10, 18)) };
  writeFileSync(join(dir, '시험용', f.name), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }));
  console.log('썼습니다: 시험용/' + f.name, f.aoa[0].length + '열 ' + (f.aoa.length - 1) + '줄');
}
// (v1.8.0) 시험용 — 월별 RAW 시트 파일(종합 · RAW1~3 · 3월 소계 · Memo)과 Payment method 열이 있는 수입 실적.
{
  const f = C.sampleExportRaw();
  const wb = XLSX.utils.book_new();
  for (const sh of f.sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sh.aoa), sh.name);
  wb.Props = { Title: '시험용 예제(가짜 데이터)', CreatedDate: new Date(Date.UTC(2026, 10, 18)) };
  writeFileSync(join(dir, '시험용', f.name), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }));
  console.log('썼습니다: 시험용/' + f.name, '시트 ' + f.sheets.map(s => s.name).join('·'));
  const g = C.sampleImportGN(), wb2 = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet(g.aoa), '데이터');
  wb2.Props = { Title: '시험용 예제(가짜 데이터)', CreatedDate: new Date(Date.UTC(2026, 10, 18)) };
  writeFileSync(join(dir, '시험용', g.name), XLSX.write(wb2, { type: 'buffer', bookType: 'xlsx', compression: true }));
  console.log('썼습니다: 시험용/' + g.name, (g.aoa.length - 1) + '줄');
}
// (v1.9.0) 시험용 — ERP 수입실적 원본 열 이름(Sheet1 · 70열 · HS 열 없음)의 가짜 10줄 + 맨 아래 합계 행.
{
  const f = C.sampleImportErp();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(f.aoa), f.sheet);
  wb.Props = { Title: '시험용 예제(가짜 데이터)', CreatedDate: new Date(Date.UTC(2026, 10, 18)) };
  writeFileSync(join(dir, '시험용', f.name), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }));
  console.log('썼습니다: 시험용/' + f.name, f.aoa[0].length + '열 ' + (f.aoa.length - 1) + '줄(합계 행 포함)');
}
