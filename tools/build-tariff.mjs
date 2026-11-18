// 관세율표 엑셀 → 사이트가 읽는 JSON 두 개로 변환
//
//   node tools/build-tariff.mjs <관세율표.xlsx> [연도]
//
// 만들어지는 파일
//   data/tariff-ac.json    기준세율용  A · C 세율
//   data/tariff-fta.json   협정세율용  FTA 협정별 세율
//
// 엑셀 원본은 저장소에 넣지 않습니다. 내 PC 어디에 두고 경로만 넘기면 됩니다.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// lib/xlsx.full.min.js 는 브라우저용 묶음이라 require 로 읽습니다.
const require = createRequire(import.meta.url);
const XLSX = require('../lib/xlsx.full.min.js');

const SRC = process.argv[2];
const YEAR = Number(process.argv[3] || new Date().getFullYear());
if (!SRC) {
  console.error('사용법: node tools/build-tariff.mjs <관세율표.xlsx> [연도]');
  process.exit(1);
}

// 사이트가 쓰는 협정 구분. ERP 수입 자료의 Duty Type 값과 같습니다.
// 새 협정으로 수입이 시작되면 여기에 코드를 추가하세요.
const AGREEMENTS = ['FCN1', 'FEU1', 'FUS1', 'FIN1', 'FGB1', 'FRCJP1', 'FEF1', 'FAS1', 'FCA1'];

const SHEET = '1.1';            // 전체 세율표 시트 이름
const COL = { hs: '품목번호', kind: '관세율구분', rate: '관세율', from: '적용개시일', to: '적용만료일' };

// 브라우저용 묶음이라 readFile 대신 파일을 읽어 넘깁니다.
const wb = XLSX.read(fs.readFileSync(SRC), { type: 'buffer' });
if (!wb.SheetNames.includes(SHEET)) {
  console.error(`「${SHEET}」 시트를 찾지 못했습니다. 시트: ${wb.SheetNames.join(', ')}`);
  process.exit(1);
}
const rows = XLSX.utils.sheet_to_json(wb.Sheets[SHEET], { defval: '' });
console.log(`읽은 줄 ${rows.length.toLocaleString()}개`);

const ac = {}, fta = {};
const want = new Set(AGREEMENTS);
let skipped = 0, expired = 0;
const periods = new Map();

for (const r of rows) {
  const hs = String(r[COL.hs] ?? '').trim();
  const kind = String(r[COL.kind] ?? '').trim();
  const raw = r[COL.rate];
  if (!/^\d{10}$/.test(hs) || !kind || raw === '' || raw === null) { skipped++; continue; }
  const rate = Number(raw);
  if (!Number.isFinite(rate)) { skipped++; continue; }

  const to = String(r[COL.to] ?? '').trim();
  if (/^\d{8}$/.test(to) && Number(to.slice(0, 4)) < YEAR) { expired++; continue; }
  if (to) periods.set(kind, to);

  const v = Number.isInteger(rate) ? rate : Number(rate.toFixed(3));
  if (kind === 'A' || kind === 'C') (ac[hs] ??= {})[kind] = v;
  else if (want.has(kind)) (fta[hs] ??= {})[kind] = v;
}

const outDir = path.resolve('data');
fs.mkdirSync(outDir, { recursive: true });

const write = (name, rates, note) => {
  const body = {
    meta: {
      year: YEAR,
      source: '관세청 관세율표',
      note,
      generated: new Date().toISOString().slice(0, 10),
      hsCount: Object.keys(rates).length,
    },
    rates,
  };
  const file = path.join(outDir, name);
  fs.writeFileSync(file, JSON.stringify(body));
  const kb = (fs.statSync(file).size / 1024).toFixed(0);
  console.log(`  ${name}  HS ${body.meta.hsCount.toLocaleString()}종  ${kb} KB`);
};

write('tariff-ac.json', ac, '기준세율 — A 우선, A가 없는 HS는 C');
write('tariff-fta.json', fta, `협정세율 — ${AGREEMENTS.join(', ')}`);

console.log(`건너뛴 줄 ${skipped.toLocaleString()} · 지난 연도로 만료된 줄 ${expired.toLocaleString()}`);
const half = [...periods].filter(([, to]) => to && !to.endsWith('1231'));
if (half.length) {
  console.log('만료일이 연말이 아닌 구분:', half.map(([k, to]) => `${k}(${to})`).join(', '));
  console.log('  → 해당 협정은 연중에 세율이 바뀝니다. 하반기 표가 나오면 다시 돌려 주세요.');
}
