// 예제 데이터 묶기 · 시험용 파일 만들기 — node tools/make-samples.mjs [폴더=samples]
// (v2.7.0) 대시보드 · 오류점수 화면의 예제는 samples/ 에 넣어 둔 실제 구조 파일 9개(가상 데이터 · 2026년 9~10월)를 그대로 쓴다.
//   이 도구는 그 9개를 samples/예제데이터.zip 한 파일로 묶고(이름은 UTF-8), 시험용 파일(samples/시험용/)을 만든다.
//   customs.js 의 sampleFiles() 는 계산 규칙 시험용으로만 남는다(예전처럼 samples/ 에 쓰지 않음).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const XLSX = require(join(ROOT, 'lib/xlsx.full.min.js'));
const C = require(join(ROOT, 'js/customs.js'));

const dir = process.argv[2] || join(ROOT, 'samples');
mkdirSync(dir, { recursive: true });
export const EXAMPLES = ['2026_예제(가상)_수입실적.xlsx', '2026_예제(가상)_수출실적.xlsx', '2026_예제(가상)_수입FTA.xlsx', '2026-10_예제(가상)_수출FTA_건기.xlsx', '2026-10_예제(가상)_수출FTA_엔진.xlsx',
  '2026_예제(가상)_수입오류.xlsx', '2026_예제(가상)_수출오류.xlsx', '2026_예제(가상)_관세환급.xlsx', '2026_예제(가상)_품목분류결정문.xlsx'];
// 작은 ZIP 쓰기(deflate · 이름 UTF-8 표시 0x0800 — 한글 파일 이름이 깨지지 않게). 날짜는 고정(같은 파일이면 같은 ZIP).
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function zip(files) {
  const parts = [], central = []; let off = 0; const time = 0, date = ((2026 - 1980) << 9) | (11 << 5) | 21;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8'), data = f.data, comp = deflateRawSync(data, { level: 9 }), crc = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8); lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10); ch.writeUInt16LE(time, 12); ch.writeUInt16LE(date, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, name, comp); central.push(ch, name); off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat(parts.concat([cd, end]));
}
{
  const miss = EXAMPLES.filter((n) => !existsSync(join(dir, n)));
  if (miss.length) { console.error('예제 파일이 없습니다: ' + miss.join(', ')); process.exit(1); }
  const z = zip(EXAMPLES.map((n) => ({ name: n, data: readFileSync(join(dir, n)) })));
  writeFileSync(join(dir, '예제데이터.zip'), z);
  console.log('썼습니다: 예제데이터.zip', EXAMPLES.length + '개', z.length + ' bytes');
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
