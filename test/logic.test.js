/* 규칙 고정 — node test/logic.test.js
 * 이 도구의 값어치는 「빠진 것을 빠졌다고 말하고, HS 를 단정하지 않고, 세율을 싣지 않는 것」에 있다.
 * 손으로 정한 기대값과 대조한다. AI 는 부르지 않는다. */
'use strict';
var D = require('../js/engine.js');
var passed = 0, failed = 0;
function ok(c, label, detail) { if (c) passed++; else { failed++; console.log('  X ' + label + (detail ? '\n      ' + detail : '')); } }
function eq(g, w, label) { ok(JSON.stringify(g) === JSON.stringify(w), label, '기대: ' + JSON.stringify(w) + '  실제: ' + JSON.stringify(g)); }
function has(t, s, label) { ok(String(t).indexOf(s) >= 0, label, '「' + s + '」 없음: ' + String(t).slice(0, 160)); }
function not(t, s, label) { ok(String(t).indexOf(s) < 0, label, '「' + s + '」 있음'); }

// 칸 이름
eq(D.mergeLabels({}).opinion, '품목분류 의견', '기본 칸 이름');
eq(D.mergeLabels({ opinion: '  세번 의견 ' }).opinion, '세번 의견', '칸 이름 바꾸기');
eq(D.mergeLabels({ structure: '' }).structure, '구조 및 형태', '빈 칸 이름은 기본값으로(v1.2 양식 6절 이름)');

// 열 이름 별칭
eq(D.fieldOf('부품명'), 'name', '부품명 → 품명');
eq(D.fieldOf('Part No'), 'model', 'Part No → 모델·품번');
eq(D.fieldOf('HS 코드'), 'hs', 'HS 코드 → HS 후보');
eq(D.fieldOf('적용 기종'), 'machine', '적용 기종 → 적용 장비');
eq(D.fieldOf('담당자'), null, '모르는 열');

// 입력 정리 — 빈 줄은 넘기고, 모르는 열은 알린다
var n = D.normalize([{ 부품명: ' 핀 ', 담당자: '홍길동' }, { 부품명: '', 담당자: '' }, { 품명: '부싱', 관리번호: 'K-9' }]);
eq(n.items.length, 2, '빈 줄 제외 2건');
eq(n.items[0].name, '핀', '앞뒤 공백 정리');
eq(n.items[0].id, 'P-01', '관리번호 없으면 붙인다');
eq(n.items[1].id, 'K-9', '관리번호는 입력값 우선');
eq(n.items[1].row, 4, '엑셀 행 번호 기억');
ok(n.issues.some(function (s) { return s.indexOf('「담당자」') >= 0; }), '모르는 열 알림');
ok(D.normalize([]).issues.length === 1, '빈 파일 알림');

// HS 후보
var h = D.parseHS('8431.49, 7325.99 또는 8431499090');
eq(h.list.map(function (c) { return c.display; }), ['8431.49', '7325.99', '8431.49-9090'], 'HS 세 가지 표기 읽기');
eq(h.list[2].level, 'HSK', '10자리는 HSK');
eq(D.parseHS('8431').list[0].level, '호', '4자리는 호');
eq(D.parseHS('84314, 7700.10, 9999.00, 철판').bad, ['84314', '7700.10', '9999.00', '철판'], '자리수·없는 류·글자는 거른다');
eq(D.parseHS('8431.49; 8431.49').list.length, 1, '같은 후보 중복 제거');

// 조사
eq(D.josa('투스', '으로서', '로서'), '투스로서', '받침 없음 → 로서');
eq(D.josa('베어링', '으로서', '로서'), '베어링으로서', '받침 → 으로서');
eq(D.josa('실린더 레일', '으로서', '로서'), '실린더 레일로서', 'ㄹ 받침 → 로서');
eq(D.josa('HX-220', '이', '가'), 'HX-220이', '숫자 0 은 받침(영)');
eq(D.josa('Pin', '이', '가'), 'Pin(이)가', '한글 아님 → 겸용');

// 예제 — 경고 없이 읽히고, 3건 중 1건은 일부러 제조공정이 비어 있다
var smp = D.normalize(D.sample());
eq(smp.issues, [], '예제 경고 없음');
eq(smp.items.length, 3, '예제 3건');
var checks = smp.items.map(D.check);
eq(checks.map(function (c) { return c.ok; }), [true, true, false], '셋째 건만 누락');
eq(checks[2].missing, ['제조공정'], '누락 항목 = 제조공정');
ok(checks[2].warns.some(function (w) { return w.indexOf('하나뿐') >= 0; }), 'HS 후보 1개 경고');
ok(!checks[0].warns.some(function (w) { return w.indexOf('전용·범용') >= 0; }), '전용이라고 적으면 전용 여부 경고 없음');
ok(checks[1].warns.some(function (w) { return w.indexOf('전용·범용') >= 0; }), '전용 여부 미기재 경고');

// 누락 점검 — 필수 9칸
var empty = D.check({ id: 'X' });
eq(empty.missing.length, 9, '빈 부품은 필수 9칸 누락');
eq(D.check({ name: 'a', model: 'b', machine: 'c', material: 'd', structure: '긴 원통 모양의 구조체', function: '기름을 보내는 일', use: 'e', process: 'f', hs: '철판' }).missing, ['HS 후보'], 'HS 를 못 읽으면 누락으로 센다');
ok(D.check({ basis: '기본세율 8% 적용 예상' }).warns.some(function (w) { return w.indexOf('관세율') >= 0; }), '메모의 세율 경고');
ok(!D.check({ composition: '크롬 1.2%' }).warns.some(function (w) { return w.indexOf('관세율') >= 0; }), '성분 % 는 세율이 아니다');

// 초안
var d0 = D.draft(smp.items[0]);
eq(d0.sections.map(function (s) { return s.label; }), ['구조 및 형태', '기능 및 용도', '성분(함량) 및 제조공정', '제출서류 목록', '품목분류 의견'], '다섯 칸 순서(v1.2 양식 2~6절)');
eq(d0.holes, [], '다 채운 부품은 빈칸 없음');
has(d0.sections[0].text, '22톤급 유압 굴착기에 사용되는 버킷 투스(Bucket Tooth)입니다.', '구조 첫 문장');
has(d0.sections[2].text, '용해 → 주조', '공정 화살표 유지');
has(d0.sections[4].text, '버킷 투스로서', '의견 조사');
has(d0.sections[4].text, '후보 1: 8431.49', 'HS 후보 1');
has(d0.sections[4].text, '후보 2: 7325.99', 'HS 후보 2');
has(d0.sections[4].text, '서로 다른 류(제84류·제73류)', '다른 류 경고 문장');
has(d0.sections[4].text, '제84류 후보가 있으므로', '제16부 주 2 검토 안내');
has(d0.sections[4].text, '최종 품목분류는 담당자 검토', '최종 판단은 담당자');
eq(D.lint(d0.sections[4].text), [], '규칙 의견은 단정·세율 검사에 걸리지 않는다');
var d1 = D.draft(smp.items[1]);
not(d1.sections[4].text, '서로 다른 류', '같은 류 후보면 다른 류 문장 없음');
var d2 = D.draft(smp.items[2]);
eq(d2.holes, ['제조공정'], '빈칸 = 제조공정');
has(d2.sections[2].text, '[확인 필요: 제조공정]', '빈칸 표시를 문장에 남긴다');
not(d2.sections[2].text, '제조사는', '없는 제조사를 지어내지 않는다');
var dx = D.draft({ id: 'Z', name: '핀' });
has(dx.sections[4].text, '[확인 필요: HS 후보]', 'HS 없으면 빈칸');
eq(D.draft(smp.items[0], { opinion: '세번 검토 의견' }).sections[4].label, '세번 검토 의견', '바꾼 칸 이름이 초안에 쓰인다');
has(D.draft({ name: 'a', function: '작동유를 실린더로 보내는 역할을 함.' }).sections[1].text, '보내는 역할을 함.', '문장으로 적은 기능은 그대로 쓴다');
has(D.draft({ name: 'a', process: '절단>용접>도장' }).sections[2].text, '절단 → 용접 → 도장 순서로', '> 를 화살표로');

// 문체
eq(D.detectStyle(D.sampleExample()).style, 'ham', '개조식 예시 → ham');
eq(D.detectStyle('본 물품은 롤러이다. 하중을 지지한다.').style, 'ida', '평서 예시 → ida');
eq(D.detectStyle('본 물품은 롤러입니다. 하중을 지지합니다.').style, 'nida', '존댓말 예시 → nida');
eq(D.detectStyle('').style, 'nida', '예시 없으면 존댓말');
var ham = D.applyStyle(d0, 'ham'), ida = D.applyStyle(d0, 'ida');
ok(ham.sections.every(function (s) { return !/니다/.test(s.text); }), '개조식 변환 뒤 「니다」 없음', ham.sections.map(function (s) { return s.text; }).join(' ').match(/\S*니다/g));
ok(ida.sections.every(function (s) { return !/니다/.test(s.text); }), '평서 변환 뒤 「니다」 없음');
has(ham.sections[0].text, '버킷 투스(Bucket Tooth)임.', '입니다 → 임');
has(ida.sections[2].text, '순서로 이루어진다.', '이루어집니다 → 이루어진다');
eq(D.convertStyle('필요가 있습니다.', 'ham'), '필요가 있음.', '있습니다 → 있음');
eq(D.convertStyle('그대로 둡니다', 'nida'), '그대로 둡니다', 'nida 는 바꾸지 않는다');

// 세율·단정 거르기
var sr = D.scrubRates('본 물품의 관세율은 8%로 예상됩니다. 크롬 1.2%를 함유합니다.');
eq(sr.removed, 1, '세율 문장의 수치만 지운다');
has(sr.text, '[관세율 수치 삭제]', '삭제 표시');
has(sr.text, '크롬 1.2%', '성분 % 는 남긴다');
ok(D.lint('제8431.49호로 분류됩니다.').length === 1, '단정 표현 짚기');

// AI 요청·응답(실제 호출 없이)
var pr = D.buildPrompt(smp.items[0], d0, '예시 문장임.', {});
has(pr.system, '관세율 수치를 쓰지 마세요', '프롬프트: 세율 금지');
has(pr.user, '[과거 작성 사례 — 문체 참고만]', '프롬프트: 문체 예시 칸');
not(D.buildPrompt(smp.items[0], d0, '', {}).user, '과거 작성 사례', '예시 없으면 칸 생략');
var ro = D.buildRequest('openai', 'k1', pr), ra = D.buildRequest('anthropic', 'k2', pr);
eq([ro.url, ro.body.model, ro.headers.Authorization], ['https://api.openai.com/v1/chat/completions', 'gpt-4o-mini', 'Bearer k1'], 'OpenAI 요청');
eq([ra.url, ra.body.model, ra.headers['x-api-key'], ra.headers['anthropic-version'], ra.headers['anthropic-dangerous-direct-browser-access']],
  ['https://api.anthropic.com/v1/messages', 'claude-haiku-5-5', 'k2', '2023-06-01', 'true'], 'Anthropic 요청');
eq(D.extractText('openai', { choices: [{ message: { content: 'A' } }] }), 'A', 'OpenAI 응답 글');
eq(D.extractText('anthropic', { content: [{ type: 'text', text: 'B' }, { type: 'tool_use' }] }), 'B', 'Anthropic 응답 글');
var ai = D.parseAIReply('다음과 같습니다.\n```json\n{"sections":{"structure":"구조 문장","opinion":"관세율은 8%입니다. 제8431호로 확정됩니다."},"missing":["치수"]}\n```');
eq(ai.sections.structure, '구조 문장', 'AI 답 JSON 꺼내기');
not(ai.sections.opinion, '8%', 'AI 답의 세율 삭제');
ok(ai.warns.some(function (w) { return w.indexOf('단정') >= 0; }), 'AI 답의 단정 표현 경고');
eq(ai.missing, ['치수'], 'AI 가 짚은 누락');
ok(!!D.parseAIReply('JSON 없음').error, 'JSON 없으면 오류');

// 내보내기
var entries = smp.items.map(function (it) { return { item: it, sections: D.draft(it).sections, check: D.check(it) }; });
var rows = D.sheetRows(entries, {});
eq(rows.length, 4, '엑셀: 머리줄 + 3건');
eq(rows[0][4], 'HS 후보(검토 필요)', '엑셀: HS 머리말에 검토 필요');
eq(rows[3][rows[0].indexOf('누락 항목')], '제조공정', '엑셀: 누락 항목 열');
eq(rows[1][rows[0].indexOf('작성 구분')], '규칙 초안', '엑셀: 작성 구분');
entries[0].sections = entries[0].sections.map(function (s, i) { return i ? s : Object.assign({}, s, { source: 'ai' }); });
eq(D.sheetRows(entries, {})[1][rows[0].indexOf('작성 구분')], 'AI 초안 반영 — 검토 필요', '엑셀: AI 반영 구분');
var html = D.printHTML(entries, { title: '물품 설명서(질의용)' });
eq((html.match(/<article/g) || []).length, 3, '인쇄: 3건');
has(html, '물품 설명서(질의용)', '인쇄: 바꾼 제목');
has(html, 'AI 초안 반영 — 검토 필요', '인쇄: AI 표시');
has(html, '누락 1건', '인쇄: 누락 표시');
not(D.printHTML([{ item: { id: '<b>' }, sections: [], check: { missing: [], warns: [] } }], {}), '<b>', '인쇄: HTML 이스케이프');


/* ===================== v1.1 수출입통관통합관리 DashBoard — js/customs.js ===================== */
var v10 = passed + failed;
var C = require('../js/customs.js');
// JSON 비교는 Infinity·NaN 을 null 로 적어 버려 0 나누기를 못 잡는다 — null 은 === 로 본다
function isNull(g, label) { ok(g === null, label, '기대: null  실제: ' + g); }
function near(g, w, label) { ok(g != null && Math.abs(g - w) < 1e-9, label, '기대: ' + w + '  실제: ' + g); }

// 열 이름 짝짓기 — 같은 뜻 낱말, 괄호 속 단위, 대소문자·구두점
eq(C.normKey('물자대(원)'), '물자대', '괄호 속 단위를 지운다');
eq(C.normKey('HS CODE'), 'hscode', '공백·대소문자');
var mi = C.mapColumns(['수리일자', '사업본부', '원산지국', '거래처명', 'HS부호', '물자대(원)', '관세액', 'FTA물자대', 'FTA절감액', '담당자'], 'import');
eq(mi.missing, [], '수입: 필수 열을 모두 찾는다');
eq([mi.map.goods, mi.map.ftaGoods, mi.map.duty, mi.map.saving], ['물자대(원)', 'FTA물자대', '관세액', 'FTA절감액'], '수입: 물자대와 물자대_FTA 를 섞지 않는다');
eq(mi.unused, ['담당자'], '쓰지 않은 열을 알린다');
var me = C.mapColumns(['수출신고일', '본부', '목적국', '거래처', 'HS CODE', '수출금액', '물자대_FTA', '절감액'], 'export');
eq([me.map.date, me.map.country, me.map.amount, me.map.ftaGoods], ['수출신고일', '목적국', '수출금액', '물자대_FTA'], '수출: 열 짝짓기');
var mx = C.mapColumns(['일자', '조직', '나라', '업체', 'HS', '금액', '관세'], 'import');
eq(mx.missing, ['본부', '국가'], '못 찾은 필수 열을 이름으로 돌려준다');
var mo = C.mapColumns(['일자', '조직', '나라', '업체', 'HS', '금액', '관세'], 'import', { hq: '조직', country: '나라' });
eq(mo.missing, [], '사람이 고르면 채워진다');
eq(mo.score.hq, 'user', '사람이 고른 짝 표시');
eq(C.mapColumns(['일자', '본부'], 'import', { hq: '' }).map.hq, undefined, '사람이 「없음」을 고르면 자동으로 다시 짝짓지 않는다');
eq(C.mapColumns(['본부', '본부명'], 'refund').map.hq, '본부', '한 열은 한 번만 — 이름이 같은 열이 먼저');

// 머리글 줄 찾기 — 제목·조회 조건 줄이 위에 붙은 ERP 엑셀
eq(C.findHeaderRow([['수입 실적 조회'], ['조회기간: 2025-01-01 ~ 2025-01-31', ''], ['수리일자', '사업본부', '원산지', '물자대'], ['2025-01-02', 'A', '중국', 100]]), 2, '머리글은 셋째 줄');
eq(C.findHeaderRow([['가', '나'], [1, 2]]), 0, '맞는 줄이 없으면 첫 줄');
eq(C.normalize([{ 일자: '' , 본부: 'A', 환급액: 1 }], 'refund', { date: '일자', hq: '본부', amount: '환급액' }, 2).skipped[0].row, 4, '머리글 위 줄 수만큼 엑셀 줄 번호를 민다');

// 파일 종류 알아보기
eq(C.detectKind(['수리일자', '사업본부', '원산지국', '거래처명', 'HS부호', '물자대(원)', '관세액']).kind, 'import', '수입 파일');
eq(C.detectKind(['수출신고일', '본부', '목적국', '거래처', 'HS CODE', '수출금액']).kind, 'export', '수출 파일');
eq(C.detectKind(['환급년월', '본부', '환급금액']).kind, 'refund', '환급 파일');
eq(C.detectKind(['년월', '수출입구분', '신고건수', '오류건수', '오류점수']).kind, null, '(v2.0.0) 사람이 집계한 오류점수 표는 종류로 받지 않음');
eq(C.detectKind(['일자', '본부', '국가', '업체', 'HS', '금액'], '수출실적.xlsx').kind, 'export', '애매하면 찾은 열 수, 그다음 파일 이름');
eq(C.detectKind(['가', '나', '다']).kind, null, '모르는 파일은 종류를 정하지 않는다');

// 값 읽기 — 숫자
eq(C.parseNum('1,234,000'), 1234000, '쉼표 숫자');
eq(C.parseNum('(1,500)'), -1500, '괄호는 음수');
eq(C.parseNum('△200'), -200, '△ 는 음수');
eq(C.parseNum('₩ 3,000원'), 3000, '원 표기');
eq(C.parseNum(''), null, '빈칸은 null');
eq(C.parseNum('-'), null, '「-」는 빈 값');
ok(isNaN(C.parseNum('미정')), '글자는 NaN(읽지 못함)');
eq(C.parseNum(12.5), 12.5, '숫자 그대로');

// 값 읽기 — 날짜
eq(C.parseDate('2025-01-15').date, '2025-01-15', '날짜 2025-01-15');
eq(C.parseDate('2025.1.5').date, '2025-01-05', '날짜 2025.1.5');
eq(C.parseDate('20250115').month, '2025-01', '날짜 20250115');
eq(C.parseDate(202503).month, '2025-03', '숫자 202503 은 년월');
eq(C.parseDate('2025년 3월').month, '2025-03', '2025년 3월');
eq(C.parseDate(45672).date, '2025-01-15', '엑셀 날짜 일련번호 45672 = 2025-01-15');
eq(C.parseDate('2025-02-30'), null, '없는 날짜는 거른다');
eq(C.parseDate('2025-13'), null, '13월은 거른다');
eq(C.parseDate('어제'), null, '글자는 null');

// HS 4단위 자르기
eq(C.hs4('8431.49-9090'), '8431', 'HS 10자리 표기 → 8431');
eq(C.hs4('8431499090'), '8431', '숫자만 10자리 → 8431');
eq(C.hs4(843149), '8431', '숫자 6자리');
eq(C.hs4('402.10'), '0402', '앞의 0 이 빠진 3자리 호 → 0402');
eq(C.hs4(40299), '0402', '홀수 자리(5) → 앞에 0');
eq(C.hs4('84'), null, '4자리 미만은 null');
eq(C.hs4('7700.10'), null, '77류는 없다');
eq(C.hs4('9999'), null, '98류 이상은 없다');

// 정리 — 합계 줄·날짜 없는 줄은 사유와 함께 건너뛰고, 빈 금액은 0 으로 채우지 않는다
var IMP_MAP = { date: '일자', hq: '본부', country: '국가', company: '업체', hs: 'HS', goods: '물자대', duty: '관세', ftaGoods: 'FTA', saving: '절감' };
function ir(d, h, c, co, hs, g, du, f, sv) { return { 일자: d, 본부: h, 국가: c, 업체: co, HS: hs, 물자대: g, 관세: du, FTA: f, 절감: sv }; }
var IMP_ROWS = [
  ir('2025-01-10', 'A본부', '중국', '갑', '8431.49', 1000, 80, '', ''),
  ir('2025-01-20', 'A본부', '독일', '을', '8482.10', 2000, 0, 2000, 160),
  ir('2025-02-03', 'B본부', '중국', '갑', '8431.20', 3000, 150, '', ''),
  ir('2025-02-28', 'B본부', '일본', '병', '4009.42', 1000, '', '', ''),
  ir('', 'B본부', '일본', '병', '4009.42', 500, 40, '', ''),
  ir('2024-01-15', 'A본부', '중국', '갑', '8431.49', 900, 72, '', ''),
  ir('합계', '', '', '', '', 8400, 342, '', ''),
  ir('', '', '', '', '', '', '', '', '')
];
var ni = C.normalize(IMP_ROWS, 'import', IMP_MAP);
eq(ni.records.length, 5, '정리: 5줄 읽음');
eq(ni.skipped.map(function (s) { return s.row; }), [6, 8], '정리: 날짜 빈 줄(6행)과 합계 줄(8행)을 건너뜀');
eq(ni.skipped[1].reason, '합계·소계 줄', '정리: 건너뛴 사유');
eq(ni.records[3].duty, null, '정리: 빈 관세는 null');
ok(ni.issues.some(function (t) { return /관세 빈칸 1칸/.test(t); }), '정리: 빈 필수 칸을 알린다');
ok(!ni.issues.some(function (t) { return /FTA|물자대_FTA/.test(t); }), '정리: 선택 칸(FTA) 빈칸은 알리지 않는다');
eq(ni.period, { from: '2024-01', to: '2025-02' }, '정리: 데이터 기간');
eq(ni.records[0].hs4, '8431', '정리: HS 4단위');

// 기간
eq(C.shiftMonth('2025-03', -12), '2024-03', '12개월 앞');
eq(C.shiftMonth('2025-01', -1), '2024-12', '해 넘김');
eq(C.monthsBetween('2024-11', '2025-02'), ['2024-11', '2024-12', '2025-01', '2025-02'], '달 목록');
eq(C.defaultRange({ from: '2024-01', to: '2025-10' }), { from: '2025-01', to: '2025-10' }, '기본 기간 = 마지막 해 1월~마지막 달');
eq(C.defaultRange({ from: '2025-04', to: '2025-10' }), { from: '2025-04', to: '2025-10' }, '데이터가 늦게 시작하면 그 달부터');
eq(C.prevRange({ from: '2025-01', to: '2025-10' }), { from: '2024-01', to: '2024-10', overlap: false }, '전년 동기');
ok(C.prevRange({ from: '2024-01', to: '2025-10' }).overlap, '12개월을 넘으면 겹침 표시');

// 거르기
var R25 = { from: '2025-01', to: '2025-12' };
eq(C.applyFilter(ni.records, 'import', { from: '2025-02', to: '2025-02' }).records.length, 2, '기간 거르기 — 2월만 2줄');
eq(C.applyFilter(ni.records, 'import', { hq: 'A본부' }).records.length, 3, '본부 거르기');
eq(C.applyFilter(ni.records, 'import', { country: '중국', from: '2025-01' }).records.length, 2, '국가 + 기간');
var fr = C.applyFilter([{ month: '2025-01', hq: 'A', amount: 1 }], 'refund', { country: '중국' });
eq([fr.records.length, fr.ignored], [1, ['국가']], '국가 열이 없는 데이터에는 국가 조건을 걸지 않고 알린다');

// 수입 — 손계산: 2025년 물자대 1000+2000+3000+1000 = 7000, 관세 80+0+150+(빈칸) = 230, 부담율 230/7000
var is = C.importStats(ni.records, R25, 'hq');
eq([is.goods, is.duty, is.n], [7000, 230, 4], '수입 합계(빈 관세는 더하지 않음)');
near(is.burden, 230 / 7000, '관세부담율 = 관세 ÷ 물자대');
eq(is.groups.map(function (g) { return [g.key, g.goods, g.duty]; }), [['B본부', 4000, 150], ['A본부', 3000, 80]], '본부별(물자대 큰 순)');
near(is.groups[1].burden, 80 / 3000, '본부별 부담율');
eq(C.importStats(ni.records, R25, 'hs4').groups.map(function (g) { return g.key; }), ['8431', '8482', '4009'], 'HS 4단위로 묶기(8431.49 와 8431.20 이 하나)');
eq(C.importStats(ni.records, R25, 'country').groups[0], { key: '중국', n: 2, goods: 4000, duty: 230, burden: 230 / 4000 }, '국가별');
eq(is.monthly.slice(0, 3).map(function (m) { return [m.month, m.goods]; }), [['2025-01', 3000], ['2025-02', 4000], ['2025-03', null]], '월별 — 데이터 없는 달은 비움');
isNull(C.importStats([], R25, 'hq').burden, '데이터가 없으면 부담율 null(0 나누기 없음)');
isNull(C.ratio(5, 0), '0 으로 나누면 null');
isNull(C.ratio(null, 3), '빈 값 나누기는 null');

// 수출 — 전년 동기 대비. 손계산: 2025-01~03 = 100+50+300 = 450, 2024-01~03 = 200+100 = 300 → +150, +50%
var EXP_MAP = { date: 'd', hq: 'h', country: 'c', company: 'co', hs: 'hs', amount: 'a' };
function er(d, h, c, a) { return { d: d, h: h, c: c, co: c + '상사', hs: '8429.52', a: a }; }
var ne = C.normalize([er('2025-01-05', 'A', '미국', 100), er('2025-02-05', 'A', '미국', 50), er('2025-03-05', 'B', '호주', 300),
  er('2024-01-05', 'A', '미국', 200), er('2024-03-05', 'B', '브라질', 100), er('2024-06-05', 'B', '호주', 999), er('2023-01-05', 'A', '미국', 7)], 'export', EXP_MAP);
var es = C.exportStats(ne.records, { from: '2025-01', to: '2025-03' }, 'country');
eq([es.amount, es.prev, es.diff], [450, 300, 150], '수출 올해·전년 동기·증감');
near(es.rate, 0.5, '증감률 = (올해 − 전년) ÷ 전년');
eq(es.groups.map(function (g) { return [g.key, g.amount, g.prev, g.diff]; }), [['호주', 300, null, 300], ['미국', 150, 200, -50], ['브라질', null, 100, -100]], '국가별 증감 — 전년에만 있던 국가도 남긴다');
isNull(es.groups[0].rate, '전년이 없으면 증감률 null');
near(es.groups[1].rate, -0.25, '미국 -25%');
near(es.groups[2].rate, -1, '올해 없으면 -100%');
eq(es.monthly.map(function (m) { return [m.month, m.amount, m.prev]; }), [['2025-01', 100, 200], ['2025-02', 50, null], ['2025-03', 300, 100]], '월별 올해·전년');
eq(C.exportStats(ne.records, { from: '2025-01', to: '2025-03' }, 'hq').groups.map(function (g) { return [g.key, g.amount, g.prev]; }), [['B', 300, 100], ['A', 150, 200]], '본부별 증감');

// FTA — 손계산: 수입 2025 물자대 7000, 물자대_FTA 2000(빈칸=미적용), 활용률 2000/7000, 절감액 160
var fs1 = C.ftaStats(ni.records, 'import', R25, 'country', IMP_MAP);
eq([fs1.goods, fs1.ftaGoods, fs1.saving], [7000, 2000, 160], 'FTA 수입 합계');
near(fs1.util, 2000 / 7000, 'FTA 활용률 = 물자대_FTA ÷ 물자대');
eq(fs1.groups.map(function (g) { return [g.key, g.ftaGoods, g.util]; }), [['중국', 0, 0], ['독일', 2000, 1], ['일본', 0, 0]], 'FTA 국가별 — 미적용은 0%');
var fs2 = C.ftaStats(ne.records, 'export', { from: '2025-01', to: '2025-03' }, 'hq', EXP_MAP);
eq([fs2.available, fs2.ftaGoods, fs2.util], [false, null, null], '물자대_FTA 열이 없으면 값을 지어내지 않는다');

// 환급 — 본부 × 월 표
var nr = C.normalize([{ m: '2025-01', h: 'A', a: '1,000', n: 2 }, { m: '2025-01', h: 'B', a: 500, n: 1 }, { m: '2025-03', h: 'A', a: 300, n: '' }, { m: '2024-12', h: 'A', a: 9 }],
  'refund', { date: 'm', hq: 'h', amount: 'a', count: 'n' });
var rs = C.refundStats(nr.records, { from: '2025-01', to: '2025-03' });
eq([rs.amount, rs.count, rs.monthsWithData], [1800, 3, 2], '환급 합계·건수·데이터 있는 달');
eq(rs.monthAvg, 900, '월평균 = 합계 ÷ 데이터 있는 달 수');
eq(rs.pivot.map(function (p) { return [p.hq, p.total, p.months]; }), [['A', 1300, [1000, null, 300]], ['B', 500, [500, null, null]]], '본부 × 월 표');
eq(rs.last.month, '2025-03', '최근 환급 달');

// (v2.0.0) 오류점수 집계표 종류(errors) · errorStats 폐지 — 오류점수는 유니패스 원본만(errscore.js)
ok(!C.DATASETS.errors && C.KINDS.indexOf('errors') < 0 && typeof C.errorStats === 'undefined', '(v2.0.0) errors 종류 · errorStats 없음');

// 상위 N + 그 밖
var tn = C.topN(is.groups.concat([{ key: 'C본부', n: 1, goods: 10, duty: 1, burden: 0.1 }]), 1);
eq([tn.rows.length, tn.rest.key, tn.rest.goods, tn.rest.duty], [1, '그 밖 2개', 3010, 81], '상위 1 + 그 밖 합계');
near(tn.rest.burden, 81 / 3010, '그 밖의 부담율은 합계로 다시 계산');

// 표기
eq(C.fmtNum(1234567), '1,234,567', '천 단위 쉼표');
eq(C.fmtPct(0.12345), '12.3%', '백분율');
eq(C.fmtPct(null), '—', '빈 값은 —');
eq(C.fmtSignedPct(0.5), '+50.0%', '증가 +');
eq(C.fmtShort(1234000000), '12억원', '억 단위(v2.5.0 기본 억원 · 10 이상은 정수)');
eq(C.fmtShort(56780000, '백만원'), '57백만원', '백만원 단위(v2.5.0 — 만원으로 멋대로 줄이지 않음)');
eq(C.fmtShort(1500, '원'), '1,500원', '원은 소수 없이 그대로(v2.5.0)');

// 엑셀 표
var book = C.exportBook({ range: R25, filter: {}, unit: '원', data: { import: { file: 'a.xlsx', uploadedAt: '2026-11-03', period: ni.period, records: ni.records, map: IMP_MAP, skipped: ni.skipped } } });
eq(book.map(function (b) { return b.name; }), ['안내', '수입_본부', '수입_국가', '수입_업체', '수입_HS4단위', '수입_본부월', 'FTA_수입_본부', 'FTA_수입_국가'], '엑셀: 올린 데이터만 시트로(v1.9.0 수입_본부월 더함)');
ok(book.every(function (b) { return b.name.length <= 31; }), '엑셀: 시트 이름 31자 이내');
var bs = book[1].aoa;
eq(bs[bs.length - 1], ['합계', 4, 7000, 230, 3.29], '엑셀: 수입 합계 줄(부담율 %)');
has(JSON.stringify(book[0].aoa), '관세부담율 = 관세 ÷ 물자대', '엑셀: 계산식 안내');

// 자료 목록
var la = C.libAdd([], { name: ' 사유서 양식.xlsx ', category: '사유서', location: '\\\\fs\\a.xlsx' }, '2026-11-03T09:00:00');
eq([la.errors, la.list.length, la.list[0].name, la.list[0].added], [[], 1, '사유서 양식.xlsx', '2026-11-03'], '자료 등록');
eq(C.libAdd(la.list, { name: '', category: '기타' }).errors.length, 1, '이름이 없으면 등록하지 않는다');
eq(C.libAdd(la.list, { name: '사유서 양식.xlsx', category: '사유서' }).errors, ['같은 분류에 같은 이름이 이미 있습니다.'], '같은 분류·같은 이름은 거른다');
var lb = C.libAdd(la.list, { name: '환급 매뉴얼.pptx', category: '', desc: '소요량 계산 순서' }, '2026-11-03T09:00:00').list;
eq(lb[1].category, '기타', '분류가 비면 기타');
ok(lb[0].id !== lb[1].id, '번호가 겹치지 않는다');
var lc = C.libAdd(C.libRemove(lb, lb[0].id), { name: '새 자료' }, '2026-11-03T09:00:00').list;
ok(lc[0].id !== lc[1].id, '지운 뒤 다시 넣어도 번호가 겹치지 않는다');
eq(C.libSearch(lb, '소요량').length, 1, '자료 찾기 — 설명 낱말');
eq(C.libSearch(lb, '', '사유서').length, 1, '자료 찾기 — 분류');
eq(C.libSearch(lb, '양식 사유서').length, 1, '자료 찾기 — 낱말 여럿(모두 맞아야)');
eq([C.libLocationKind('https://intra.example.com/a'), C.libLocationKind('\\\\fs\\a'), C.libLocationKind('C:\\a'), C.libLocationKind('3층 캐비닛')], ['url', 'path', 'path', 'text'], '위치 종류(링크·경로·글)');
var lf = C.libFromRows([{ 파일명: 'A.xlsx', 구분: 'FTA', 경로: 'https://x.example.com' }, { 파일명: '', 구분: '' }, { 파일명: 'A.xlsx', 구분: 'FTA' }], [], '2026-11-03');
eq([lf.added, lf.errors.length, lf.list[0].location], [1, 1, 'https://x.example.com'], '엑셀에서 되읽기(빈 줄 넘김·중복 알림)');
eq(C.libToAoa(lb)[0], ['파일 이름', '분류', '설명', '사내 위치', '담당', '등록일'], '자료 목록 엑셀 머리글');

// 예제 4종 — 종류를 알아보고, 열을 다 찾고, 숫자는 계산과 맞는다
var files = C.sampleFiles();
eq(files.map(function (f) { var h = f.aoa[0]; return C.detectKind(h, f.name).kind; }), ['import', 'export', 'refund', 'ruling'], '예제 4종 종류 알아보기(v2.0.0 오류점수는 유니패스 예제로 따로)');
eq(files.map(function (f) { return C.mapColumns(f.aoa[0], f.kind).missing.length; }), [0, 0, 0, 0], '예제 4종 필수 열 모두 찾음');
var sn = files.map(function (f) { return C.normalize(C.aoaToRows(f.aoa), f.kind, C.mapColumns(f.aoa[0], f.kind).map); });
eq(sn.slice(0, 3).map(function (n) { return n.period; }), [0, 1, 2].map(function () { return { from: '2024-01', to: '2025-10' }; }), '예제 기간 2024-01~2025-10(수입 · 수출 · 환급 — v2.0.0 오류 예제는 유니패스 형식으로)');
eq([sn[0].skipped.length, sn[0].skipped[0].reason], [1, '합계·소계 줄'], '예제 수입: 합계 줄 1개를 건너뜀');
var sis = C.importStats(sn[0].records, C.defaultRange(sn[0].period), 'hq');
eq(sis.groups.reduce(function (t, g) { return t + g.goods; }, 0), sis.goods, '예제: 본부별 합 = 전체');
var ses = C.exportStats(sn[1].records, { from: '2025-01', to: '2025-10' }, 'country');
ok(ses.hasPrev && ses.groups.some(function (g) { return g.prev == null && g.amount > 0; }), '예제 수출: 올해 새로 생긴 국가(전년 없음)가 있다');
ok(JSON.stringify(files).indexOf('(가상)') > 0, '예제 업체·본부에 「가상」 표기');
// (v2.7.0) samples/ 는 실제 구조 예제 9개(가상 데이터) — sampleFiles() 는 계산 규칙 시험 데이터로만 남고 파일로 쓰지 않는다(새 예제 시험은 v270)
var XLSX = require('../lib/xlsx.full.min.js'), fsx = require('fs'), px = require('path');
eq(sn[0].skipped[0].row, 222, '예제 수입 합계 줄 = 엑셀 222행(머리글 1행 + 220줄 다음)');

/* ===================== v1.2 — 양식 6절 · 결정문 현황 · 수입보세화물 추적 ===================== */
var v11 = passed + failed;
var G = require('../js/cargo.js');

// 물품설명서 — 양식 6절(1절 품명은 머리글, 2~6절 다섯 칸)
eq(D.SECTIONS, ['structure', 'function', 'composition', 'docs', 'opinion'], '양식 2~6절 순서');
eq(D.mergeLabels({}).docs, '제출서류 목록', '제출서류 목록 칸');
var it6 = D.normalize(D.sample()).items[0]; it6.docs = '카탈로그, 도면'; it6.supplierHs = '8431.49-9090';
var d6 = D.draft(it6), docsText = d6.sections[3].text;
has(docsText, '1. 카탈로그', '제출서류를 번호 목록으로'); has(docsText, '2. 도면', '제출서류 둘째');
has(docsText, '8431.49-9090', '공급자 HS 참고 표기'); has(docsText, '참고용', '공급자 HS 는 참고');
var d6b = D.draft(D.normalize(D.sample()).items[2]);
has(d6b.sections[3].text, '붙임 자료: 없음', '제출서류 없으면 안내만'); ok(d6b.holes.indexOf('제출서류') < 0, '제출서류는 필수 칸이 아니다');
eq(D.fieldOf('첨부서류'), 'docs', '첨부서류 → 제출서류'); eq(D.fieldOf('해외공급자 HS'), 'supplierHs', '해외공급자 HS → 공급자 HS'); eq(D.fieldOf('상표명'), 'brand', '상표명 → 상표');
var ph = D.printHTML([{ item: it6, sections: d6.sections, check: D.check(it6) }]);
has(ph, '1. 품명', '인쇄 양식 1절 품명'); has(ph, '5. 제출서류 목록', '인쇄 양식 5절'); has(ph, '6. 품목분류 의견', '인쇄 양식 6절');
eq(D.sheetRows([{ item: it6, sections: d6.sections, check: D.check(it6) }])[0].length, 13, '엑셀 머리글 13칸(다섯 칸 양식)');
eq(D.parseAIReply('{"sections":{"docs":"카탈로그 1부"},"missing":[]}').sections.docs, '카탈로그 1부', 'AI 답의 docs 칸');
has(D.buildPrompt(it6, d6, '', {}).system, '"docs"', 'AI 지시문에 docs 칸');

// 결정문 현황 — 관세율 읽기
eq(C.parseRate('8'), { rate: 8, code: '' }, '관세율 8'); eq(C.parseRate('FCN0'), { rate: 0, code: 'FCN' }, '협정 부호 FCN0');
eq(C.parseRate(' 0 % '), { rate: 0, code: '' }, '0 %'); isNull(C.parseRate(''), '빈 관세율은 null'); eq(C.parseRate('면세'), undefined, '못 읽는 관세율은 undefined');
var RM = { product: 'p', item: 'i', hs: 'h', date: 'd', rate: 'r', broker: 'b', prevRate: 'pr', goods: 'g', docNo: 'n' }, RR = { from: '2025-01', to: '2025-12' };
var nr = C.normalize([
  { p: 'EXCAVATOR', i: 'PIN', h: '8431.43-0000', d: '2025-03-10', r: '0', b: 'A', pr: '8', g: 1000000, n: '4과-1' },
  { p: 'EXCAVATOR', i: 'HORN', h: '8512.30-0000', d: '2025-04-02', r: '8', b: 'B', pr: '8', g: 500000, n: '3과-2' },
  { p: 'Wheel Loader', i: 'PIN', h: '8431.43', d: '2025-04-20', r: 'FCN0', b: 'A', pr: '', g: '', n: '' },
  { p: '천공기', i: 'PIPE', h: '7304.31-0000', d: '2024-12-01', r: '', b: 'A', pr: '8', g: 200000, n: '' },
  { p: 'EXCAVATOR', i: '합계', h: '', d: '', r: '', b: '', pr: '', g: '', n: '' }
], 'ruling', RM);
eq(nr.records.length, 4, '결정문 4건(합계 줄 제외)'); eq([nr.records[2].rate, nr.records[2].rateCode, nr.records[2].hs4], [0, 'FCN', '8431'], 'FCN0 → 0% · 부호 · HS 4단위');
isNull(nr.records[3].rate, '빈 관세율');
var rs = C.rulingStats(nr.records, RR, 'product');
eq([rs.n, rs.zero], [3, 2], '기간 안 3건 · 0% 2건'); near(rs.zeroRate, 2 / 3, '0% 비율');
eq([rs.withPrev, rs.lowered], [2, 1], '종전세율 있는 2건 중 낮아진 1건');
eq([rs.saving, rs.savingN], [80000, 2], '절감 추정 = 수입액 × (종전 − 결정)/100, 세 값이 다 있는 건만');
eq(rs.groups.map(function (g) { return [g.key, g.n, g.zero, g.saving]; }), [['EXCAVATOR', 2, 1, 80000], ['Wheel Loader', 1, 1, null]], '완제품별');
eq(C.rulingStats(nr.records, RR, 'broker').groups.map(function (g) { return g.key; }), ['A', 'B'], '관세사별');
eq(C.rulingStats(nr.records, RR, 'hs4').groups[0].key, '8431', 'HS 4단위로 묶기');
eq(rs.rates.map(function (r) { return r.key; }), ['0%', '8%', 'FCN 0%'], '세율별 분포');
eq(rs.list.map(function (r) { return r.date; }), ['2025-04-20', '2025-04-02', '2025-03-10'], '목록은 최근 시행 순');
eq(rs.monthly.filter(function (m) { return m.n; }).map(function (m) { return [m.month, m.n]; }), [['2025-03', 1], ['2025-04', 2]], '월별 시행 건수');
var rs0 = C.rulingStats(nr.records.map(function (r) { return Object.assign({}, r, { prevRate: null }); }), RR, 'product');
isNull(rs0.saving, '종전세율 없으면 절감 추정 null'); eq(rs0.withPrev, 0, '종전세율 있는 건 0');
var rm = C.mapColumns(['연번', '완제품', '품명', '결정세번', '품목분류사전심사결정문번호', '시행일자', '관세율', '관세사(해동,유니원)'], 'ruling');
eq(rm.missing, [], '기획자 파일 열 이름 모두 찾음'); eq([rm.map.docNo, rm.map.broker], ['품목분류사전심사결정문번호', '관세사(해동,유니원)'], '결정문번호 · 관세사 열');
eq(C.detectKind(['연번', '완제품', '품명', '결정세번', '시행일자', '관세율'], 'x.xlsx').kind, 'ruling', '결정문 파일 알아보기');
eq(C.detectKind(C.sampleFiles()[0].aoa[0], 'a').kind, 'import', '수입 파일은 여전히 수입');
var bk = C.exportBook({ range: RR, filter: {}, unit: '원', data: { ruling: { file: 'r.xlsx', uploadedAt: '', period: nr.period, records: nr.records, map: RM, skipped: nr.skipped } } });
eq(bk.map(function (b) { return b.name; }), ['안내', '결정문_완제품', '결정문_관세사', '결정문_HS4단위', '결정문_목록'], '결정문 엑셀 시트');
eq(bk[1].aoa[bk[1].aoa.length - 1], ['합계', 3, 2, 66.67, 80000], '결정문 합계 줄');
eq(C.applyFilter(nr.records, 'ruling', { hq: 'X' }).ignored, ['본부'], '본부 조건은 결정문에 걸지 않는다');

// 화물 추적 — 처리단계 이름
eq(G.classifyStage('수입신고 수리').key, 'cleared', '긴 별칭이 먼저(수입신고 수리 ≠ 수입신고)'); eq(G.classifyStage('수입신고').key, 'declared', '수입신고');
eq(G.classifyStage('입항보고제출').key, 'arrival', '입항보고제출'); eq(G.classifyStage('하선신고수리').key, 'unload', '하선신고수리');
eq(G.classifyStage('보세구역 반입').key, 'in', '반입'); eq(G.classifyStage('반출신고 수리').key, 'out', '반출');
eq(G.classifyStage('적하목록 제출').key, 'other', '모르는 단계는 그 밖'); eq(G.classifyStage('').key, 'other', '빈 단계');
// 일시
eq(G.parseDateTime('20261103194000'), '2026-11-03 19:40', '14자리 일시'); eq(G.parseDateTime('2026-11-03 19:40:12'), '2026-11-03 19:40', '초는 버린다');
eq(G.parseDateTime('2026.11.03'), '2026-11-03 00:00', '날짜만'); eq(G.parseDateTime(46329.5), '2026-11-03 12:00', '엑셀 일련번호(소수 = 시각)'); isNull(G.parseDateTime('어제'), '못 읽는 일시');
// 시간 외
eq(G.isAfterHours('2026-11-03 19:40'), true, '퇴근 후'); eq(G.isAfterHours('2026-11-03 10:00'), false, '근무 시간'); eq(G.isAfterHours('2026-11-03 08:59'), true, '출근 전');
eq(G.isAfterHours('2026-11-03 18:00'), true, '18:00 은 시간 외'); eq(G.isAfterHours('2026-11-01 10:00'), true, '토요일');
eq(G.isAfterHours('2026-11-01 10:00', { start: '09:00', end: '18:00', weekend: false }), false, '주말 보기 끄기'); isNull(G.isAfterHours('x'), '일시가 아니면 null');
// 등록
var L = G.add([], { bl: ' abcd-1234 ', requester: { name: '홍', email: 'a@b.co' }, broker: { name: '관', email: 'c@d.co' } }, '2026-11-04 09:00');
eq([L.errors, L.item.bl, L.item.id], [[], 'ABCD1234', 'S001'], 'BL 정규화 · 번호');
eq(G.add(L.list, { bl: 'ABCD1234' }).errors, ['이미 등록된 BL 번호입니다: ABCD1234'], '같은 BL 거름');
eq(G.add([], { bl: '' }).errors, ['BL 번호를 적어 주세요.'], 'BL 없음');
eq(G.add([], { bl: 'Z1', requester: { email: 'nope' } }).errors.length, 1, '메일 형식 검사'); eq(G.add([], { bl: 'Z1', eta: '언젠가' }).errors.length, 1, '입항예정일 검사');
// 반영
var M = G.merge(L.list, [
  { bl: 'ABCD1234', stage: '입항보고 제출', at: '20261103194000', place: 'A' },
  { bl: 'ABCD1234', stage: '입항보고 제출', at: '20261103194000', place: 'A' },
  { bl: 'ABCD1234', stage: '하선신고 수리', at: '2026-11-04 07:10' },
  { bl: '', stage: '수입신고', at: '2026-11-04 08:00' },
  { bl: 'NEW1', stage: '수입신고', at: '2026-11-04 08:30', ship: '가상호' },
  { bl: 'ABCD1234', stage: '반입신고', at: '' }
], '2026-11-04 09:00');
eq(M.added.length, 3, '새 단계 3건(같은 것은 한 번)'); eq(M.skipped.map(function (x) { return x.reason; }), ['BL 번호 없음', '처리일시를 읽지 못함: '], '건너뛴 사유');
eq(M.created, ['NEW1'], '모르는 BL 은 새로 만든다'); eq(M.list.length, 2, '목록 2건');
eq(M.list[0].events.map(function (e) { return e.key; }), ['arrival', 'unload'], '시간순'); eq(G.latest(M.list[0]).key, 'unload', '최신 단계'); eq(G.progress(M.list[0]).order, 2, '진행 2/6');
eq(G.merge(L.list, [{ bl: 'NEW2', stage: '수입신고', at: '2026-11-04 08:30' }], '', { autoAdd: false }).skipped[0].reason, '등록되지 않은 BL: NEW2', 'autoAdd 끄면 모르는 BL 은 건너뜀');
ok(L.list[0].events.length === 0, '원본 목록은 바뀌지 않는다');
// 알림
var A = G.alerts(M.list);
eq(A.map(function (a) { return [a.bl, a.key, a.afterHours]; }), [['NEW1', 'declared', true], ['ABCD1234', 'arrival', true]], '알림 = 입항보고·수입신고, 최근 순, 시간 외(08:30·19:40)');
eq(G.alerts(M.list, ['unload']).map(function (a) { return a.key; }), ['unload'], '대상 단계 바꾸기');
var M2 = G.markNotified(M.list, M.list[0].id, A[1].evKey, '2026-11-04 09:05');
eq(G.alerts(M2).length, 1, '통보하면 알림에서 빠진다'); eq(G.notifiedCount(M2[0]), 1, '통보 건수'); eq(G.alerts(M.list).length, 2, '통보 전 목록은 그대로');
// 메일 초안
var dr = G.mailDraft(M.list[0], M.list[0].events[0], {}, '통관담당');
eq(dr.to, ['c@d.co', 'a@b.co'], '받는 사람 = 관세사 · 요청자'); has(dr.subject, 'ABCD1234', '제목에 BL'); has(dr.body, '2026-11-03 19:40', '본문에 처리일시'); has(dr.body, '통관담당 드림', '보낸 사람');
eq(dr.missing, ['선명', '입항예정'], '빈 자리 알림(메모 제외)'); ok(/^mailto:c@d\.co,a@b\.co\?subject=/.test(dr.mailto), 'mailto 링크');
var dr2 = G.mailDraft(M.list[1], M.list[1].events[0], { declared: { subject: '{BL} {단계}', body: '{없는자리} {선명}' } }, '');
eq([dr2.subject, dr2.body, dr2.to], ['NEW1 수입신고', '{없는자리} 가상호', []], '틀 바꾸기 · 모르는 자리는 그대로 · 메일 없음');
eq(G.kakaoText(M.list[1], M.list[1].events[0]), '[통관] BL NEW1(가상호) 수입신고 2026-11-04 08:30', '카톡용 한 줄');
eq(G.mergeTemplates({ arrival: { subject: ' ' } }).arrival.subject, G.DEFAULT_TEMPLATES.arrival.subject, '빈 틀은 기본값');
// 유니패스 XML
var X = G.parseUnipassXML(G.sampleXML(new Date(2026, 10, 4)));
eq([X.bl, X.ship, X.events.length], ['GASANG2611003', '가상 3호(VIRTUAL SUN)', 2], 'XML 머리·단계 2건');
eq(X.events.map(function (e) { return G.classifyStage(e.stage).key; }), ['arrival', 'unload'], 'XML 단계 읽기'); eq(G.parseDateTime(X.events[0].at), '2026-11-04 06:50', 'XML 처리일시'); eq(X.events[0].place, '가상항 보세구역 C', 'XML 장치장');
eq(G.parseUnipassXML('').error, '붙여 넣은 내용이 없습니다.', '빈 XML'); eq(G.parseUnipassXML('hello').events.length, 0, 'XML 아님'); has(G.parseUnipassXML('<a><tCnt>0</tCnt></a>').error, '0건', '0건 응답');
eq(G.parseUnipassXML('<r><row><처리일시>2026-11-04 10:00</처리일시><처리단계>수입신고</처리단계></row></r>').events.length, 1, '한글 태그·row 도 읽는다');
// OpenAPI 주소
var u = G.apiUrl({ key: 'SECRETKEY', bl: 'ab-1', year: '2026' });
has(u, 'hblNo=AB1', 'House BL'); has(u, 'blYy=2026', 'BL 연도'); has(u, 'crkyCn=SECRETKEY', '키'); eq(G.maskKey(u).indexOf('SECRETKEY'), -1, '키 가림'); has(G.maskKey(u), 'SE…EY', '가린 모양'); has(G.apiUrl({ key: 'k', bl: 'x', kind: 'mbl' }), 'mblNo=X', 'Master BL');
// ERP 엑셀 열
var mh = G.mapHeaders(['B/L번호', '선명', '입항예정일', '처리단계', '처리일시', '장치장', '현업담당', '관세사']);
eq(mh.missing, [], 'ERP 열 모두 찾음'); eq([mh.map.bl, mh.map.requester], ['B/L번호', '현업담당'], 'BL · 요청자 열');
eq(G.mapHeaders(['번호', '상태']).missing, ['BL 번호', '처리일시'], '못 찾은 필수 열');
var SR = G.sampleRows(new Date(2026, 10, 4)), ev = G.eventsFromRows(SR.slice(1).map(function (r) { var o = {}; SR[0].forEach(function (h, i) { o[h] = r[i]; }); return o; }), mh.map);
eq([ev.length, ev[0].bl], [3, 'GASANG2611003'], '엑셀 줄 → 단계');
// 예제 · 엑셀 표
var S = G.sample(new Date(2026, 10, 4, 9, 0));
eq(S.length, 3, '예제 3건'); eq(G.alerts(S).map(function (a) { return [a.bl, a.key]; }), [['GASANG2611002', 'declared'], ['GASANG2611001', 'arrival']], '예제: 미통보 2건(2번 입항보고는 통보 완료)');
eq(G.alerts(S)[1].afterHours, true, '예제 1번 입항보고는 시간 외(19:40)');
var EB = G.exportBook(S);
eq(EB.map(function (b) { return b.name; }), ['현황', '진행단계', '알림'], '추적 엑셀 3시트'); eq([EB[0].aoa.length, EB[2].aoa.length], [4, 3], '현황 3건 · 알림 2건'); ok(JSON.stringify(EB).indexOf('crkyCn') < 0, '엑셀에 키 없음');

/* ===================== v1.3 — 수출입 오류점수 분석(기획자 메일 「4. 수출입통관오류점수분석」) ===================== */
var v12 = passed + failed;
var ES = require('../js/errscore.js');
eq(ES.campusOf('4390826000001M'), '울산', '43908 → 울산'); eq(ES.campusOf('4215826000001M'), '인천', '그 밖 → 인천'); eq(ES.campusOf('없음'), null, '신고번호가 아니면 없음');
eq(ES.campusOf('9999926000001M', { ulsan: ['43908', '99999'] }), '울산', '부호 목록을 바꾼다');
eq(ES.parseDeclNo('4215826604300M').kind, '수입', 'M = 수입'); eq(ES.parseDeclNo('4390826007806X').kind, '수출', 'X = 수출'); eq(ES.parseDeclNo('2237126813187X').seq, '813187', '고유번호 6자리'); eq(ES.parseDeclNo('42158-26-604300M').broker, '42158', '구분선'); 
eq(ES.parseDeclNo('4215826604300M').year, 2026, '신고년도'); eq(ES.monthOfName('귀책사유자별오류상세목록_9월 '), 9, '시트 이름의 월'); eq(ES.classifySheet('귀책사유자별오류현황목록_9월'), 'status', '현황'); eq(ES.classifySheet('귀책사유자별오류상세목록_9월'), 'detail', '상세'); eq(ES.classifySheet('요약'), 'summary', '요약');
// 실제 파일과 같은 모양(값은 가짜)
var HD = ['No', '귀책사유자부호', '신고번호', '란번호', '정정일자 및 시간', '수리구분', '정정구분', '항목코드', '항목명', '오류점수', '변경 후 오류점수', '정정전내역', '정정후내역'];
var IMP = { name: '테스트.xlsx', sheets: [
  { name: '요약', aoa: [['▣ 2026년 수입오류점수 현황'], ['구분', '9월', '', '', '', '8월', '', '', '', '합계'], ['', '수입건수', '오류건수', '오류점수', '비율', '수입건수', '오류건수', '오류점수', '비율'], ['종합', 1000, 3, 12.5, 0.0125, 800, 0, 0, 0], [], ['인천', 600, 1, 2, 0.003, 500, 0, 0, 0], ['울산', 400, 2, 10.5, 0.026, 300, 0, 0, 0]] },
  { name: '귀책사유자별오류현황목록_9월', aoa: [['No', '귀책사유자부호', '귀책사유자상호', '관할지세관부호', '관할지세관', '총신고건', '오류점수', '비율'], [1, '가짜', '가짜(주)', '012', '세관', 1000, 12.5, 1.3]] },
  { name: '귀책사유자별오류상세목록_9월', aoa: [HD, [1, '가짜', '4390826000001M', 0, '2026-09-14  14:53:05', '수리후', '정정', 'A807', '결제금액', 5, 5, '10', '20'], [2, '가짜', '4390826000001M', 0, '2026-09-14  14:53:05', '수리후', '정정', 'A809', '과세가격원화총액', 5.5, 5.5, '1', '2'], [3, '가짜', '4390826000002M', 0, '2026-09-20', '수리전', '정정', 'A807', '결제금액', 0, 0, '1', '2'], [4, '가짜', '4215826000003M', 0, '2026-09-21', '수리후', '정정', 'A100', '관세', 2, 2, '3', '4'], ['합계', '', '', '', '', '', '', '', '', '', '', '', '']] },
  { name: '귀책사유자별오류현황목록_8월', aoa: [['No', '총신고건', '오류점수'], [1, 800, 0]] },
  { name: '귀책사유자별오류상세목록_8월', aoa: [] }
] };
var B = ES.readWorkbook(IMP.sheets, IMP.name);
eq(B.kind, '수입', '요약 제목으로 수입 판정'); eq(B.rows.length, 4, '상세 4줄'); eq(B.notes, [], '빈 시트는 알림 없음'); eq(B.skipped, 1, '합계 줄 건너뜀'); eq(B.months, [9], '오류 있는 달'); eq(B.status[9].total, 1000, '총신고건'); eq(B.hand[9].인천.decl, 600, '요약의 인천 건수'); eq(B.hand[9].울산.score, 10.5, '요약의 울산 점수');
eq(ES.readWorkbook([{ name: '귀책사유자별오류상세목록_1월', aoa: [HD, [1, '', '4390826000001X', 0, '2026-01-02', '', '', '', '품명', 1, 1, '', '']] }], '무명.xlsx').kind, '수출', '끝 글자로 수출 판정');
eq(ES.readWorkbook([{ name: 'S', aoa: [['a'], [1]] }], 'x.xlsx').rows.length, 0, '상세 없으면 0줄'); has(ES.readWorkbook([{ name: 'S', aoa: [['a'], [1]] }], 'x.xlsx').notes[0], '상세목록', '상세 없음 알림');
var S = ES.summarize([B], ES.countsFromBooks([B])), M9 = S.kinds.수입.months[9];
eq(M9.종합, { decl: 1000, err: 3, scored: 2, score: 12.5, rate: 1.25 }, '종합: 동일 신고번호 1건 · 비율 = 점수 ÷ 건수');
eq(M9.인천, { decl: 600, err: 1, scored: 1, score: 2, rate: 0.33 }, '인천 건수는 요약에서'); eq(M9.울산, { decl: 400, err: 2, scored: 1, score: 10.5, rate: 2.63 }, '울산 = 총신고건 − 인천');
var S0 = ES.summarize([B], {}); eq(S0.kinds.수입.months[9].인천.decl, null, '인천 건수를 모르면 비움(짐작 금지)'); eq(S0.kinds.수입.months[9].인천.rate, null, '비율도 비움'); eq(S0.kinds.수입.months[9].종합.decl, 1000, '종합은 현황에서'); eq(S0.kinds.수입.months[9].울산.decl, null, '인천을 모르면 울산 건수도 비움');
var CMP = ES.compare([B], S); eq(CMP.scoreDiffs.length, 0, '대조: 점수 같음'); 
var B2 = JSON.parse(JSON.stringify(B)); B2.hand[9].인천.score = 7; var C2 = ES.compare([B2], S); eq(C2.scoreDiffs.length, 1, '대조: 어긋난 칸을 잡는다'); eq(C2.scoreDiffs[0].scoreDiff, -5, '차이 값');
ES.applyRule([B2], { ulsan: ['43908', '42158'] }); eq(ES.summarize([B2], {}).kinds.수입.months[9].인천.score, 0, '부호를 바꾸면 다시 나뉜다');
eq(ES.brokers(B.rows).map(function (x) { return [x.broker, x.err, x.score, x.campus]; }), [['42158', 1, 2, '인천'], ['43908', 2, 10.5, '울산']], '부호별 표');
// 분기
var qs = ES.quarters(S, 10); var q3 = qs.filter(function (q) { return q.kind === '수입' && q.campus === '울산' && q.q === 3; })[0]; eq(q3.score, 10.5, '3분기 울산'); eq(q3.over, true, '경계 이상'); var q4 = ES.quarters(S, 11).filter(function (q) { return q.kind === '수입' && q.campus === '울산'; })[0]; eq([q4.over, q4.near], [false, true], '80% 이상'); eq(ES.quarters(S, 10.5).filter(function (q) { return q.kind === '수입' && q.campus === '울산'; })[0].over, true, '경계와 같으면 이상');
eq(ES.THRESHOLD, 300, '기본 경계 300'); eq(S.quarters[0].threshold, 300, '기본값 적용');
// 항목 · 신고번호 · 대장
var TI = ES.topItems(B.rows); eq(TI[0].item, '과세가격원화총액', '점수 큰 항목 먼저'); eq(TI.filter(function (t) { return t.item === '결제금액'; })[0].err, 2, '항목의 신고번호 수'); eq(TI[0].share, 44, '비중');
var DC = ES.byDecl(B.rows); eq(DC.length, 3, '신고번호 3건'); eq(DC[0].score, 10.5, '점수 큰 순'); eq(DC[0].fixedAt, '2026-09-14', '정정일'); 
var LD = ES.ledger(DC, {}); eq(LD.length, 2, '0점 신고는 대장에서 뺀다'); eq(LD[0].length, ES.LEDGER_HEAD.length, '대장 칸 수'); has(LD[0][7], '결제금액 10 → 20', '사유가 비면 정정 내역'); eq(ES.ledger(DC, { '4390826000001M': { reason: '단가 오기', blame: '화주' } })[0][7], '단가 오기', '사유를 적으면 그 글'); eq(ES.ledger(DC, {}, { all: true }).length, 3, '전체 보기');
// 메일 — 기획자 메일의 1) 줄은 인천 기준
var ML = ES.mailDraft(S, 9, { top: TI }); eq(ML.subject, '(9월) 수출입 오류점수 현황 및 오류관리대장 공유', '제목');
has(ML.body, '(오류점수) 2점 =>', '1) 줄은 인천'); has(ML.body, '수입(인천) : (신고건수) 600건, (오류건수) 1건, (오류점수) 2점, (오류비율) 0.3%', '수입 인천 줄'); has(ML.body, '울산캠퍼스 9월 수입오류 점수는 10.5점', '울산 줄'); has(ML.body, '과세가격원화총액', '항목'); has(ML.body, '수출신고후 7일이내', 'Next Step');
var EB = ES.exportBook({ summary: S, rows: B.rows, decls: DC, notes: {} }); eq(EB.map(function (x) { return x.name; }), ['오류점수요약', '발생사유및정정내용', '분기', '항목별', '상세'], '엑셀 시트'); eq(EB[4].aoa.length, 5, '상세 줄');
// 예제
var SB = ES.sampleBooks().map(function (b) { return ES.readWorkbook(b.sheets, b.name); }); eq(SB.map(function (b) { return b.kind; }), ['수입', '수출'], '예제 2권'); var SS = ES.summarize(SB, ES.countsFromBooks(SB)); eq(SS.months, [8, 9, 10], '예제 3개월(v2.0.0 8 · 9 · 10월)'); var SC = ES.compare(SB, SS); eq(SC.scoreDiffs.length, 2, '예제의 어긋난 달 인천·울산 2칸'); not(JSON.stringify(SB), '에이치디', '예제에 회사 이름 없음');

/* ───────────── v1.4 워드(.docx) 내보내기 ───────────── */
var v13 = passed + failed;
(function () {
  var Doc = D;
  var items = Doc.normalize(Doc.sample()).items;
  var en = items.map(function (it) { var d = Doc.draft(it); return { item: it, check: Doc.check(it), sections: d.sections }; });
  var xml = Doc.docxDocument(en), plain = xml.replace(/<[^>]+>/g, '\n').replace(/\n+/g, '\n');
  ok(/^<\?xml[^>]*\?><w:document /.test(xml) && /<\/w:body><\/w:document>$/.test(xml), 'v1.4 문서 XML 머리 · 꼬리');
  ok((xml.match(/<w:p>/g) || []).length === (xml.match(/<\/w:p>/g) || []).length && (xml.match(/<w:r>/g) || []).length === (xml.match(/<\/w:r>/g) || []).length, 'v1.4 여는 태그와 닫는 태그 수가 같다');
  ok((plain.match(/물 품 설 명 서/g) || []).length === 3 && (xml.match(/<w:pageBreakBefore\/>/g) || []).length === 2, 'v1.4 부품 3건 — 제목 3번, 둘째부터 새 쪽');
  ['1. 품명(모델, 규격 등 포함)', '2. 구조 및 형태', '3. 기능 및 용도', '4. 성분(함량) 및 제조공정', '5. 제출서류 목록', '6. 품목분류 의견'].forEach(function (h) { ok(plain.split(h).length === 4, 'v1.4 절 제목 「' + h + '」가 부품마다'); });
  ok(/<w:sz w:val="40"\/>/.test(xml) && /<w:sz w:val="32"\/>/.test(xml) && /<w:sz w:val="24"\/>/.test(xml) && /<w:jc w:val="center"\/>/.test(xml), 'v1.4 양식 글자 크기 — 제목 20pt · 절 16pt · 본문 12pt, 제목 가운데');
  ok(/w:w="11906" w:h="16838"/.test(xml) && /w:top="1701" w:right="1440" w:bottom="1440" w:left="1440"/.test(xml), 'v1.4 A4 · 양식과 같은 여백');
  ok(plain.indexOf('☞ Invoice 품명, 거래품명, 상표명, 모델, 타입, 규격, HS CODE 등') > 0 && (plain.match(/☞ /g) || []).length === 3 * 10, 'v1.4 양식의 작성 안내 줄(부품마다 10줄)');
  ok((Doc.docxDocument(en, null, { guide: false }).match(/☞/g) || []).length === 0, 'v1.4 작성 안내 줄을 뺄 수 있다');
  var e0 = en[0], st = e0.sections[0].text;
  ok(plain.indexOf(st.split('\n')[0]) > 0 && plain.indexOf('품명 : ' + e0.item.name) > 0 && plain.indexOf('HS 후보(검토 필요) : ') > 0, 'v1.4 초안 문장 · 품명 · HS 후보가 그대로 들어간다');
  var ed = [{ item: Object.assign({}, e0.item, { name: 'A & B <테스트>', brand: '', size: '' }), check: e0.check, sections: e0.sections.map(function (s, i) { return i ? s : Object.assign({}, s, { text: '첫 줄\n\n셋째 줄 <b> & 끝', source: 'ai' }); }) }];
  var x2 = Doc.docxDocument(ed, { opinion: '세번 검토 의견' });
  ok(/A &amp; B &lt;테스트&gt;/.test(x2) && /셋째 줄 &lt;b&gt; &amp; 끝/.test(x2) && !/<b>/.test(x2), 'v1.4 & < > 는 글자로 넣는다(문서가 깨지지 않게)');
  ok(/>첫 줄<\/w:t><\/w:r><\/w:p><w:p><w:pPr>[^]*?<\/w:pPr><\/w:p><w:p>[^]*?셋째 줄/.test(x2), 'v1.4 줄바꿈은 문단으로, 빈 줄도 남긴다');
  ok(/AI 초안 반영 — 검토 필요/.test(x2) && /6\. 세번 검토 의견/.test(x2) && !/상표 : /.test(x2) && !/규격 : /.test(x2), 'v1.4 AI 반영 표시 · 바꾼 칸 이름 · 빈 값은 줄을 만들지 않는다');
  var miss = Doc.normalize([{ 관리번호: 'M-1', 품명: '이름만' }]).items, em = miss.map(function (it) { var d = Doc.draft(it); return { item: it, check: Doc.check(it), sections: d.sections }; });
  ok(/누락 \d+건\(/.test(Doc.docxDocument(em)) && /\[확인 필요/.test(Doc.docxDocument(em)), 'v1.4 누락 건수와 「확인 필요」 표시가 워드에도 남는다');
  var f = Doc.docxFiles(en);
  eq(Object.keys(f).sort(), ['[Content_Types].xml', '_rels/.rels', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/styles.xml'], 'v1.4 docx 안의 파일 5개');
  ok(/맑은 고딕/.test(f['word/styles.xml']) && /word\/document\.xml/.test(f['[Content_Types].xml']) && !/\d+(\.\d+)?\s*%/.test(f['word/document.xml'].replace(/<[^>]+>/g, '')), 'v1.4 글꼴 맑은 고딕 · 관세율 수치 없음');
  ok(Doc.docxDocument([]).indexOf('<w:sectPr>') > 0, 'v1.4 부품이 없어도 열리는 문서');
})();
var v14 = passed + failed;

// v1.4.5 관세환급 신청 현황 — 결정적 열 · 파일 이름 · 제품그룹 번호 → 본부
(function () {
  var f = C.sampleRefundApply(), head = f.aoa[0];
  eq(head, ['제출번호', '접수번호', '접수일자', '세번부호', '결정일자', '품 명', '수출물량', '단위', '수출금액', '환급액', '금액대비(%)', '환급단가', '수출월', '신청업체', '제품그룹', '제조업체', '접수세관', '접수년도', '수출형태'], 'v1.4.5 가짜 예제 머리글 = 실제 환급 신청 현황 19열');
  ok(JSON.stringify(f.aoa).indexOf('(가상)') > 0, 'v1.4.5 가짜 예제에 「가상」 표기');
  // 종류 알아보기 — 결정문 열(세번부호·결정일자·품 명·제품그룹)도 다 맞지만 「환급액」이 결정적 열
  var d = C.detectKind(head, '');
  eq([d.kind, d.reason], ['refund', '「환급액」 열'], 'v1.4.5 환급액 열이 있으면 관세환급(이름 없음)');
  eq(C.detectKind(head, '관세환급 신청현황.xlsx 데이터').kind, 'refund', 'v1.4.5 환급 파일 이름');
  eq(C.detectKind(head, '품목분류.xlsx').kind, 'refund', 'v1.4.5 결정적 열이 파일 이름보다 앞선다');
  eq(d.ranked.filter(function (r) { return r.kind === 'ruling'; })[0].ratio, 1, 'v1.4.5 (원인 재현) 결정문 필수 열 비율은 여전히 1 — 결정적 열이 가른다');
  // 파일 이름이 열 비율보다 앞선다. 낱말이 두 후보에 다 걸리면 이름으로 가르지 않는다.
  var amb = ['일자', '본부', '국가', '업체', 'HS', '금액'];
  eq(C.detectKind(amb, '수입실적.xlsx').kind, 'import', 'v1.4.5 파일 이름(수입)이 필수 열 비율보다 앞선다');
  eq([C.detectKind(amb, '수입실적.xlsx').reason, C.detectKind(amb, '수출실적.xlsx').reason], ['파일 이름', '파일 이름'], 'v1.4.5 근거 = 파일 이름');
  eq(C.detectKind(amb, '수입·수출 실적.xlsx').kind, 'export', 'v1.4.5 이름이 두 후보에 걸리면 열 비율로');
  eq(C.detectKind(['가', '나', '환급액'], '환급.xlsx').kind, null, 'v1.4.5 필수 열이 절반도 안 되면 결정적 열·이름이 있어도 정하지 않는다');
  // 예제 5종은 그대로(대시보드처럼 시트 이름을 붙여도)
  var files = C.sampleFiles();
  eq(files.map(function (x) { return C.detectKind(x.aoa[0], x.name + ' 데이터').kind; }), ['import', 'export', 'refund', 'ruling'], 'v1.4.5 예제 4종 판단 그대로');
  eq(files.map(function (x) { return C.detectKind(x.aoa[0]).kind; }), ['import', 'export', 'refund', 'ruling'], 'v1.4.5 예제 4종 — 이름 없이도 그대로');
  // 열 짝짓기 — 환급월 = 결정일자, 본부 = 제품그룹
  var m = C.mapColumns(head, 'refund');
  eq([m.map.date, m.map.hq, m.map.amount, m.missing], ['결정일자', '제품그룹', '환급액', []], 'v1.4.5 환급월=결정일자 · 본부=제품그룹 · 환급액');
  // 읽기 — 합계 줄은 빼고, 환급액 합계 = 엑셀 합계
  var n = C.normalize(C.aoaToRows(f.aoa), 'refund', m.map);
  var hand = f.aoa.slice(1).filter(function (r) { return r[0] !== '합계'; }).reduce(function (t, r) { return t + Number(String(r[9]).replace(/,/g, '')); }, 0);
  eq([n.records.length, n.skipped.length, n.skipped[0].reason], [30, 1, '합계·소계 줄'], 'v1.4.5 30줄 읽고 합계 줄 1개 건너뜀');
  eq(C.sum(n.records, 'amount'), hand, 'v1.4.5 환급액 합계 = 엑셀 각 줄을 더한 값');
  eq(hand, f.aoa[f.aoa.length - 1][9], 'v1.4.5 = 엑셀 합계 줄 값');
  var rs = C.refundStats(n.records, C.defaultRange(n.period));
  eq(rs.amount, hand, 'v1.4.5 환급 집계 합계도 같다(기간 ' + n.period.from + '~' + n.period.to + ')');
  eq(rs.pivot.reduce(function (t, p) { return t + p.total; }, 0), hand, 'v1.4.5 본부별 합 = 전체(미등록 포함)');
  // 제품그룹 번호 → 본부
  eq(C.REFUND_HQ_CODES, { B110: '건기본부', B111: '건기본부', B112: '건기본부', B130: '엔진본부', B161: '부품센터', B163: '부품센터' }, 'v1.4.5 본부 번호표');
  ok(n.records.every(function (r) { return r.hqCode === 'B999' ? r.hq === '미등록(B999)' : r.hq === C.REFUND_HQ_CODES[r.hqCode]; }), 'v1.4.5 줄마다 번호표대로 본부');
  eq(C.valuesOf(n.records, 'hq'), ['건기본부', '미등록(B999)', '부품센터', '엔진본부'], 'v1.4.5 본부 목록');
  eq(n.unknownCodes, ['B999'], 'v1.4.5 새 번호는 추측하지 않고 알린다');
  ok(n.issues.some(function (s) { return /B999 1줄\(엑셀 19행\)/.test(s) && /미등록\(B999\)/.test(s); }), 'v1.4.5 새 번호 알림에 줄 번호', n.issues.join(' / '));
  var nn = C.normalize([{ m: '2025-01', h: 'b130', a: 1 }, { m: '2025-01', h: 'B1101', a: 1 }, { m: '2025-01', h: '건설기계본부(가상)', a: 1 }], 'refund', { date: 'm', hq: 'h', amount: 'a' });
  eq(nn.records.map(function (r) { return r.hq; }), ['엔진본부', 'B1101', '건설기계본부(가상)'], 'v1.4.5 번호 모양일 때만 바꾼다(소문자 허용 · 4자리 넘으면 아님 · 본부 이름은 그대로)');
  eq(C.normalize([{ d: '2025-01-01', h: 'B110' }], 'import', { date: 'd', hq: 'h' }).records[0].hq, 'B110', 'v1.4.5 번호표는 환급에만 — 수입 본부는 그대로');
})();
var v145 = passed + failed;

// v1.4.6 관세환급 건수 — 「건수」 열이 없으면 행 수로 센다
(function () {
  // 73행 가짜 예제(건수 열 없음) + 합계 줄
  var f = C.sampleRefundApply(73), m = C.mapColumns(f.aoa[0], 'refund');
  eq([f.aoa.length, f.aoa[f.aoa.length - 1][0], f.name], [75, '합계', '예제_관세환급신청현황_73행(가상).xlsx'], 'v1.4.6 73행 예제 = 머리글 + 73줄 + 합계 줄');
  ok(JSON.stringify(f.aoa).indexOf('(가상)') > 0, 'v1.4.6 73행 예제에 「가상」 표기');
  eq([m.map.count, m.missing], [undefined, []], 'v1.4.6 73행 예제에는 건수 열이 없다');
  var n = C.normalize(C.aoaToRows(f.aoa), 'refund', m.map);
  eq([n.records.length, n.skipped.length, n.period], [73, 1, { from: '2025-01', to: '2025-11' }], 'v1.4.6 73줄 읽고 합계 줄 건너뜀 · 2025년 안');
  var rg = C.defaultRange(n.period), rs = C.refundStats(n.records, rg, m.map);
  eq([rs.count, rs.countBasis, rs.countLabel], [73, 'rows', '행 수로 센 값'], 'v1.4.6 건수 = 행 수 73');
  eq(C.fmtNum(rs.count) + '건', '73건', 'v1.4.6 카드 글자 「73건」');
  eq(rs.pivot.reduce(function (t, p) { return t + p.count; }, 0), 73, 'v1.4.6 본부별 건수 합 = 73(미등록 포함)');
  ok(rs.pivot.every(function (p) { return p.count === n.records.filter(function (r) { return r.hq === p.hq; }).length; }), 'v1.4.6 본부별 건수 = 그 본부 줄 수');
  eq(C.refundStats(n.records, rg).countBasis, 'rows', 'v1.4.6 map 없이도 행 수로(count 값이 하나도 없음)');
  eq(C.sum(n.records, 'amount'), f.total, 'v1.4.6 환급액 합계 = 엑셀 합계 줄(금액 계산은 그대로)');
  // 기간을 줄이면 그 기간 줄 수만
  var rs2 = C.refundStats(n.records, { from: '2025-01', to: '2025-02' }, m.map);
  eq(rs2.count, n.records.filter(function (r) { return r.month <= '2025-02'; }).length, 'v1.4.6 기간 안 줄 수만 센다');
  eq(C.refundStats(n.records, { from: '2026-01', to: '2026-02' }, m.map).count, 0, 'v1.4.6 기간 안에 줄이 없으면 0건(실제로 센 값)');
  // 환급액이 빈 줄도 신청 1건
  var nb = C.normalize([{ m: '2025-01', h: 'A', a: 100 }, { m: '2025-01', h: 'A', a: '' }, { m: '2025-02', h: 'B', a: 50 }], 'refund', { date: 'm', hq: 'h', amount: 'a' });
  var rb = C.refundStats(nb.records, { from: '2025-01', to: '2025-02' }, { date: 'm', hq: 'h', amount: 'a' });
  eq([rb.count, rb.amount, rb.pivot.map(function (p) { return [p.hq, p.count, p.total]; })], [3, 150, [['A', 2, 100], ['B', 1, 50]]], 'v1.4.6 환급액이 빈 줄도 건수에 넣는다(금액은 더하지 않음)');
  // 30행 예제(v1.4.5)는 그대로이고 30건
  var f30 = C.sampleRefundApply(), n30 = C.normalize(C.aoaToRows(f30.aoa), 'refund', C.mapColumns(f30.aoa[0], 'refund').map);
  eq([f30.name, f30.aoa.length, C.refundStats(n30.records, C.defaultRange(n30.period)).count], ['예제_관세환급신청현황.xlsx', 32, 30], 'v1.4.6 30행 예제는 이름·줄 수 그대로 · 30건');
  eq(C.sampleRefundApply(30).aoa, f30.aoa, 'v1.4.6 sampleRefundApply(30) = 기본값과 같은 내용');
  // 건수 열이 있으면 지금처럼 그 합(빈칸은 더하지 않음)
  var CM = { date: 'm', hq: 'h', amount: 'a', count: 'n' };
  var nr = C.normalize([{ m: '2025-01', h: 'A', a: '1,000', n: 2 }, { m: '2025-01', h: 'B', a: 500, n: 1 }, { m: '2025-03', h: 'A', a: 300, n: '' }, { m: '2024-12', h: 'A', a: 9 }], 'refund', CM);
  var rc = C.refundStats(nr.records, { from: '2025-01', to: '2025-03' }, CM);
  eq([rc.count, rc.countBasis, rc.countLabel, rc.pivot.map(function (p) { return p.count; })], [3, 'column', '건수 열의 합', [2, 1]], 'v1.4.6 건수 열이 있으면 그 합(map)');
  var rs0 = C.refundStats(nr.records, { from: '2025-01', to: '2025-03' });
  eq([rs0.count, rs0.countBasis], [3, 'column'], 'v1.4.6 건수 열이 있으면 그 합(map 없이)');
  // 건수 열은 있는데 기간 안 값이 모두 빈칸 → 지어내지 않는다(null → 「—」)
  eq(C.refundStats([{ month: '2025-01', hq: 'A', amount: 1, count: null }], { from: '2025-01', to: '2025-01' }, CM).count, null, 'v1.4.6 건수 열이 비면 행 수로 바꾸지 않는다(null)');
  // 엑셀 — 환급_본부월 시트 끝에 건수 칸, 머리글에 기준
  var bk = C.exportBook({ range: rg, data: { refund: { file: f.name, records: n.records, map: m.map, skipped: n.skipped, period: n.period } } });
  var sh = bk.filter(function (s) { return s.name === '환급_본부월'; })[0].aoa, last = sh[sh.length - 1];
  eq([sh[0][sh[0].length - 1], last[0], last[last.length - 1]], ['건수(행 수로 센 값)', '합계', 73], 'v1.4.6 엑셀 건수 칸 = 73(행 수로 센 값)');
  ok(sh.slice(1, -1).every(function (r) { return r.length === sh[0].length; }), 'v1.4.6 엑셀 본부 줄마다 건수 칸');
  ok(JSON.stringify(bk[0].aoa).indexOf('관세환급 건수') > 0, 'v1.4.6 안내 시트에 건수 계산식');
  var bk2 = C.exportBook({ range: { from: '2025-01', to: '2025-03' }, data: { refund: { file: 'x', records: nr.records, map: CM, skipped: [] } } });
  var sh2 = bk2.filter(function (s) { return s.name === '환급_본부월'; })[0].aoa;
  eq([sh2[0][sh2[0].length - 1], sh2[sh2.length - 1][sh2[0].length - 1]], ['건수(건수 열의 합)', 3], 'v1.4.6 엑셀 — 건수 열이 있으면 그 합');
  // samples/시험용/ 의 73행 파일 = 예제 정의(tools/make-samples.mjs 로 만든다)
  var XL = require('../lib/xlsx.full.min.js'), pth = require('path').join(__dirname, '..', 'samples', '시험용', f.name);
  var wb = XL.read(require('fs').readFileSync(pth), { type: 'buffer' });
  var rows = XL.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
  eq(rows, f.aoa, 'v1.4.6 samples/시험용/ 73행 파일 = 예제 정의');
})();
var v146 = passed + failed;

// v1.5.0 같은 종류 여러 파일 — 따로 · 함께 올려도 모두 더한다, 이름이 같으면 바꾼다, 기간 겹침 경고
(function () {
  function item(f, name) { return { name: name || f.name, file: name || f.name, uploadedAt: '2026-11-16 10:00', headers: f.aoa[0].map(String), aoa: f.aoa, offset: 0, override: {} }; }
  function up(files, it) { return C.upsertFile(files, it); }
  var M2 = C.sampleRefundMonths(), A = M2[0], B = M2[1];
  eq([A.cols, B.cols, A.rows, B.rows], [21, 19, 12, 10], 'v1.5.0 가짜 환급 두 달치 — 21열 12줄 · 19열 10줄');
  ok(A.aoa[0].join('|') !== B.aoa[0].join('|') && A.aoa[0][2] === '환급구분', 'v1.5.0 두 파일 머리글이 다르다(열 순서도)');
  ok(JSON.stringify(M2).indexOf('(가상)') > 0 && /\(가상\)\.xlsx$/.test(A.name), 'v1.5.0 「가상」 표기');
  eq([A, B].map(function (f) { return C.detectKind(f.aoa[0], f.name).kind; }), ['refund', 'refund'], 'v1.5.0 두 파일 다 관세환급');
  // 따로 올리기(앞 파일에 뒤 파일을 더함)
  var r1 = up([], item(A)), r2 = up(r1.files, item(B));
  eq([r1.action, r2.action, r2.files.length], ['added', 'added', 2], 'v1.5.0 따로 올리면 더한다(파일 2개)');
  var mS = C.mergeFiles('refund', r2.files), rg = C.defaultRange(mS.period), sS = C.refundStats(mS.records, rg, mS.map);
  eq([mS.ok, mS.period, mS.records.length, mS.skipped.length], [true, { from: '2025-01', to: '2025-02' }, 22, 2], 'v1.5.0 두 달 · 22줄 · 합계 줄 2개 건너뜀');
  eq(sS.amount, A.total + B.total, 'v1.5.0 합계 = 두 파일 합(각 엑셀 합계 줄의 합)');
  eq(sS.monthly.map(function (m) { return m.amount; }), [A.total, B.total], 'v1.5.0 두 달이 모두 보인다(1월 = 21열 파일, 2월 = 19열 파일)');
  eq([sS.count, sS.countBasis], [22, 'rows'], 'v1.5.0 건수 열 없는 두 파일 = 행 수 22');
  eq(mS.files.map(function (p) { return p.res.map.amount; }), ['환급액', '환급액'], 'v1.5.0 파일마다 열 짝짓기를 따로');
  ok(mS.records.every(function (r) { return r.file === A.name || r.file === B.name; }), 'v1.5.0 레코드마다 어느 파일에서 왔는지');
  eq(mS.overlaps, [], 'v1.5.0 1월 · 2월은 겹치지 않는다');
  // 함께 올리기 · 순서 바꾸기 — 결과가 같다
  var mT = C.mergeFiles('refund', [item(A), item(B)]), mR = C.mergeFiles('refund', up(up([], item(B)).files, item(A)).files);
  function sig(m) { var s = C.refundStats(m.records, rg, m.map); return [s.amount, s.count, s.monthly.map(function (x) { return x.amount; }), s.pivot.map(function (p) { return p.hq + ':' + p.total; }).sort()]; }
  eq(sig(mT), sig(mS), 'v1.5.0 함께 올려도 결과가 같다');
  eq(sig(mR), sig(mS), 'v1.5.0 올리는 순서를 바꿔도 같다');
  // 같은 파일을 다시 올리면 바꾼다(합계 그대로)
  var r3 = up(r2.files, item(A));
  eq([r3.action, r3.index, r3.files.length], ['replaced', 0, 2], 'v1.5.0 이름이 같은 파일은 그 자리만 바꾼다');
  eq(sig(C.mergeFiles('refund', r3.files)), sig(mS), 'v1.5.0 같은 파일을 다시 올려도 합계가 변하지 않는다');
  eq(C.fileKey({ name: ' a.xlsx ', file: 'a.xlsx · 시트2' }), 'a.xlsx', 'v1.5.0 같은 파일인지는 시트 이름을 뺀 파일 이름으로');
  // 이 파일 빼기 — 그 파일분만 빠진다
  var left = r2.files.filter(function (f) { return f.name !== A.name; }), mD = C.mergeFiles('refund', left), sD = C.refundStats(mD.records, rg, mD.map);
  eq([sD.amount, sD.count, sD.monthly.map(function (x) { return x.amount; })], [B.total, 10, [null, B.total]], 'v1.5.0 파일을 빼면 그 파일분만 빠진다');
  eq(C.mergeFiles('refund', []).ok, false, 'v1.5.0 파일이 없으면 집계하지 않는다');
  // 이름은 다르고 기간이 겹치면 올리되 경고
  var r4 = up(r2.files, item(A, '환급_1월_사본(가상).xlsx')), mO = C.mergeFiles('refund', r4.files);
  eq([r4.action, mO.overlaps.length, mO.overlaps[0].from, mO.overlaps[0].to], ['added', 1, '2025-01', '2025-01'], 'v1.5.0 이름이 다르면 더하고 겹친 기간을 찾는다');
  ok(mO.issues.some(function (t) { return /기간이 겹칩니다\. 중복 집계일 수 있습니다/.test(t); }), 'v1.5.0 「기간이 겹칩니다. 중복 집계일 수 있습니다」');
  eq(C.refundStats(mO.records, rg, mO.map).amount, A.total * 2 + B.total, 'v1.5.0 (경고만 하고) 겹친 파일도 더한다');
  eq(C.periodOverlaps([{ file: 'a', period: { from: '2025-01', to: '2025-03' } }, { file: 'b', period: { from: '2025-03', to: '2025-05' } }, { file: 'c', period: { from: '2025-06', to: '2025-06' } }]),
    [{ a: 'a', b: 'b', from: '2025-03', to: '2025-03' }], 'v1.5.0 겹침 = 같은 달이 하나라도 있으면');
  // 같은 이름 · 같은 머리글이면 사람이 고른 열 짝짓기를 이어받는다(머리글이 다르면 새로)
  var o1 = item(A); o1.override = { hq: '제조업체' };
  eq(up([o1], item(A)).files[0].override, { hq: '제조업체' }, 'v1.5.0 다시 올려도 고른 열 그대로');
  var o2 = item(B, A.name); eq(up([o1], o2).files[0].override, {}, 'v1.5.0 머리글이 바뀌었으면 열을 새로 짝짓는다');
  // 열을 못 찾은 파일이 섞이면 그 종류는 집계하지 않는다
  var badF = { name: '이상한(가상).xlsx', file: '이상한(가상).xlsx', headers: ['가', '나', '환급액'], aoa: [['가', '나', '환급액'], [1, 2, 3]], offset: 0, override: {} };
  var mB = C.mergeFiles('refund', [item(A), badF]);
  eq([mB.ok, mB.files.map(function (p) { return p.ok; })], [false, [true, false]], 'v1.5.0 못 찾은 열이 있는 파일이 섞이면 집계 보류');
  badF.override = { date: '가', hq: '나' };
  ok(C.mergeFiles('refund', [item(A), badF]).files[1].res.map.date === '가', 'v1.5.0 파일마다 고른 열(override)을 따로 쓴다');
  // 환급 건수 열이 일부 파일에만 — 파일마다(열의 합 / 행 수) 더한다
  var withCnt = { name: 'c(가상).xlsx', file: 'c(가상).xlsx', headers: ['환급년월', '본부', '환급금액', '환급건수'], aoa: [['환급년월', '본부', '환급금액', '환급건수'], ['2025-03', 'A', 100, 5], ['2025-03', 'B', 50, 2]], offset: 0, override: {} };
  var mX = C.mergeFiles('refund', [item(B), withCnt]), sX = C.refundStats(mX.records, { from: '2025-01', to: '2025-03' }, mX.map);
  eq([mX.map.count, mX.partial.count, sX.countBasis, sX.countLabel, sX.count], [undefined, [B.name], 'mixed', '건수 열의 합 + 행 수', 10 + 7], 'v1.5.0 건수 열이 일부에만 — 행 수 10 + 열의 합 7');
  eq(sX.pivot.filter(function (p) { return p.hq === 'A'; })[0].count, 5, 'v1.5.0 본부별 건수도 파일 기준대로');
  eq(Object.keys(mX.map).indexOf('partial'), -1, 'v1.5.0 map.partial 은 열 목록에 섞이지 않는다');
  eq(C.refundStats(mX.records, { from: '2025-01', to: '2025-03' }).countBasis, 'mixed', 'v1.5.0 map 없이도 섞임을 안다');
  // FTA 열이 일부 파일에만 — 값을 짓지 않는다
  var imp = C.sampleFiles()[0], ih = imp.aoa[0], fi = ih.indexOf(C.mapColumns(ih.map(String), 'import').map.ftaGoods);
  ok(fi >= 0, 'v1.5.0 (준비) 수입 예제에 물자대_FTA 열', ih.join(','));
  var impNo = imp.aoa.map(function (r) { return r.filter(function (_, c) { return c !== fi; }); });
  var mF = C.mergeFiles('import', [item(imp), { name: '수입_FTA없음(가상).xlsx', file: '수입_FTA없음(가상).xlsx', headers: impNo[0].map(String), aoa: impNo, offset: 0, override: {} }]);
  var fF = C.ftaStats(mF.records, 'import', C.defaultRange(mF.period), 'hq', mF.map);
  eq([mF.ok, mF.map.ftaGoods, mF.partial.ftaGoods, fF.available, fF.util], [true, undefined, ['수입_FTA없음(가상).xlsx'], false, null], 'v1.5.0 물자대_FTA 열이 일부에만 — 활용률 계산 안 함');
  // 5종 모두 같은 규칙 — 예제를 반으로 나누고 뒤 파일은 열 순서를 뒤집어도, 합치면 원래와 같다
  C.sampleFiles().forEach(function (f) {
    var head = f.aoa[0], body = f.aoa.slice(1), half = Math.floor(body.length / 2), rev = head.map(function (_, i) { return head.length - 1 - i; });
    var p1 = [head].concat(body.slice(0, half)), p2 = [rev.map(function (i) { return head[i]; })].concat(body.slice(half).map(function (r) { return rev.map(function (i) { return r[i]; }); }));
    var one = C.normalize(C.aoaToRows(f.aoa), f.kind, C.mapColumns(head.map(String), f.kind).map);
    var mm = C.mergeFiles(f.kind, [item({ aoa: p1 }, f.kind + '_앞(가상).xlsx'), item({ aoa: p2 }, f.kind + '_뒤(가상).xlsx')]);
    var key = { import: 'goods', export: 'amount', refund: 'amount', errors: 'decl', ruling: 'goods' }[f.kind];
    eq([mm.ok, mm.records.length, C.sum(mm.records, key), mm.period], [true, one.records.length, C.sum(one.records, key), one.period], 'v1.5.0 ' + f.kind + ' — 나눠 올려 합쳐도 원래와 같다');
  });
  // 파일 하나면 지금까지와 같다
  var single = C.mergeFiles('refund', [item(C.sampleFiles()[2])]), sf = C.sampleFiles()[2], cm = C.mapColumns(sf.aoa[0].map(String), 'refund');
  function srt(o) { var r = {}; Object.keys(o).sort().forEach(function (k) { r[k] = o[k]; }); return r; }
  eq([srt(single.map), single.records.length], [srt(cm.map), C.normalize(C.aoaToRows(sf.aoa), 'refund', cm.map).records.length], 'v1.5.0 파일 하나면 map · 레코드가 그대로');
  // 예전 형식으로 기억한 자료
  var v1 = { v: 1, sets: { refund: { file: '예전.xlsx', uploadedAt: '2026-11-01 09:00', headers: ['환급년월', '본부', '환급금액'], aoa: [['환급년월', '본부', '환급금액'], ['2025-01', 'A', 1]], offset: 0, override: { hq: '본부' }, reason: '열 이름' }, 모름: { aoa: [] } } };
  var mg = C.migrateSaved(v1);
  eq([Object.keys(mg.sets), mg.sets.refund.files.length, mg.sets.refund.files[0].name, mg.sets.refund.files[0].override], [['refund'], 1, '예전.xlsx', { hq: '본부' }], 'v1.5.0 예전 형식(v1) → 파일 1개짜리 목록');
  eq(C.mergeFiles('refund', mg.sets.refund.files).records.length, 1, 'v1.5.0 예전 형식도 계산된다');
  eq(C.migrateSaved({ v: 2, sets: { refund: { files: [item(A), item(B), { bad: 1 }] } } }).sets.refund.files.length, 2, 'v1.5.0 새 형식(v2) — 망가진 항목은 뺀다');
  eq([C.migrateSaved(null).sets, C.migrateSaved('x').sets, C.migrateSaved({ sets: { refund: null } }).sets], [{}, {}, {}], 'v1.5.0 망가진 저장 자료도 오류 없이(빈 목록)');
  // 엑셀 안내 시트 — 파일마다 한 줄 + 종류 합계 줄
  var bk = C.exportBook({ range: rg, data: { refund: { file: A.name + ' + ' + B.name, period: mS.period, records: mS.records, map: mS.map, skipped: mS.skipped,
    files: mS.files.map(function (p) { return { file: p.file, uploadedAt: p.uploadedAt, period: p.period, n: p.norm.records.length, skipped: p.norm.skipped.length }; }) } } });
  var info = bk[0].aoa.filter(function (r) { return /^관세환급/.test(r[0] || ''); });
  eq(info.map(function (r) { return [r[1], r[4], r[5]]; }), [[A.name, 12, 1], [B.name, 10, 1], ['파일 2개', 22, 2]], 'v1.5.0 엑셀 안내 — 파일마다 한 줄 + 합계 줄');
  var sh = bk.filter(function (s) { return s.name === '환급_본부월'; })[0].aoa, last = sh[sh.length - 1];
  eq([last[last.length - 2], last[last.length - 1]], [A.total + B.total, 22], 'v1.5.0 엑셀 환급 시트 = 두 파일 합');
  // samples/시험용/ 두 달치 파일 = 예제 정의
  var XL = require('../lib/xlsx.full.min.js');
  M2.forEach(function (f) {
    var wb = XL.read(require('fs').readFileSync(require('path').join(__dirname, '..', 'samples', '시험용', f.name)), { type: 'buffer' });
    eq(XL.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' }), f.aoa, 'v1.5.0 samples/시험용/ ' + f.name + ' = 예제 정의');
  });
})();
var v150 = passed + failed;

// v1.6.0 결정문 고정비 절감 금액 — 항목마다 기간을 거는 날짜가 다르다
(function () {
  function load(f) { var m = C.mapColumns(f.aoa[0].map(String), 'ruling'); return { m: m, n: C.normalize(C.aoaToRows(f.aoa), 'ruling', m.map) }; }
  var Y26 = { from: '2026-01', to: '2026-12' };
  // 확인용 가 · 나 (요청서의 「확인」 그대로)
  var K = C.sampleRulingCheck(), k = load(K);
  ok(/\(가상\)\.xlsx$/.test(K.name) && JSON.stringify(K.aoa).indexOf('(가상)') > 0, 'v1.6.0 확인용 예제 「가상」 표기');
  eq(C.detectKind(K.aoa[0], K.name).kind, 'ruling', 'v1.6.0 금액 열이 있어도 결정문으로 알아본다');
  eq(C.detectKind(K.aoa[0]).kind, 'ruling', 'v1.6.0 이름 없이도 결정문');
  eq([k.m.missing, k.m.map.claim, k.m.map.reserve, k.m.map.impact, k.m.map.claimDate, k.m.map.status, k.m.map.note, k.m.map.prevRate, k.m.map.goods],
    [[], '경정청구 금액', '관세유보금액', '관세절감 impact', '경정청구일', '진행상태', '비고', '종전세율', '연간 수입액'], 'v1.6.0 새 열 8개를 모두 짝짓는다');
  eq(k.m.map.date, '시행일자', 'v1.6.0 경정청구일이 있어도 날짜는 시행일자');
  eq(k.n.records.length, 2, 'v1.6.0 경정청구일이 빈 줄도 빼지 않는다');
  eq([k.n.records[0].claimDate, k.n.records[0].claimDateMonth, k.n.records[0].claimDateYear, k.n.records[1].claimDate], ['2026-02-10', '2026-02', 2026, null], 'v1.6.0 경정청구일 읽기');
  var s = C.rulingStats(k.n.records, Y26, 'product');
  eq(s.n, 1, 'v1.6.0 확인 — 결정문 건수 1건(나만)');
  eq(s.claim, 3000000, 'v1.6.0 확인 — 경정청구 금액 300만원(가: 기간 밖 결정문이지만 경정청구일이 기간 안)');
  eq(s.reserve, 1000000, 'v1.6.0 확인 — 관세유보금액 100만원(나만, 가의 유보는 2025년 귀속)');
  eq(s.impact, 4000000, 'v1.6.0 확인 — 관세절감 impact 400만원');
  eq([s.claimOutside, s.claimOutsideN], [3000000, 1], 'v1.6.0 확인 — 경정청구 금액 중 300만원은 기간 밖 결정문 건');
  eq(C.fmtShort(s.claimOutside, '원'), '3,000,000원', 'v1.6.0 화면 표기(v2.5.0 — 원을 고르면 원 그대로)');
  eq(s.basis, '건수와 유보액은 시행일자, 경정청구 금액은 경정청구일 기준', 'v1.6.0 기준 문구');
  eq(s.list.map(function (r) { return [r.seq, r.outside]; }), [['나', false], ['가', true]], 'v1.6.0 목록에 기간 밖 결정문(가)도 「기간 밖」으로');
  eq(s.mismatchN, 0, 'v1.6.0 impact 칸 = 경정청구 + 유보');
  eq(s.progress, 1, 'v1.6.0 진행중 1건(나 경정청구중)');
  var s25 = C.rulingStats(k.n.records, { from: '2025-01', to: '2025-12' }, 'product');
  eq([s25.n, s25.claim, s25.reserve, s25.impact, s25.claimOutsideN], [1, 0, 2000000, 2000000, 0], 'v1.6.0 2025년 — 가의 유보 200만만, 경정청구는 2026년 귀속이라 0');
  eq(s.yearly.map(function (y) { return [y.year, y.claim, y.reserve, y.total, y.cum]; }), [[2025, null, 2000000, 2000000, 2000000], [2026, 3000000, 1000000, 4000000, 6000000]], 'v1.6.0 연도별 — 경정청구는 경정청구일 연도, 유보는 시행일자 연도 · 누계');
  // 14건 예제
  var A = C.sampleRulingAmounts(), a = load(A), recs = a.n.records;
  eq([recs.length, a.m.missing], [14, []], 'v1.6.0 14건 예제 읽기');
  ok(a.n.issues.some(function (t) { return /여러 개\(예: 0, 8\)인 칸 1개/.test(t); }) && !a.n.issues.some(function (t) { return /관세율 값 .*읽지 못했습니다/.test(t); }), 'v1.6.0 복수 세율은 「읽지 못함」이 아니라 따로 알린다');
  var r4 = recs.filter(function (r) { return r.seq === '4'; })[0];
  eq([r4.rate, r4.rateMulti], [null, '0, 8'], 'v1.6.0 복수 세율 0, 8 — rate 비우고 원래 값 보관');
  eq(C.parseRate('0, 8'), { multi: true, rates: ['0', '8'], text: '0, 8' }, 'v1.6.0 parseRate 복수 세율');
  eq(C.parseRate('0%/8%').text, '0, 8', 'v1.6.0 「0%/8%」도 복수 세율');
  eq(C.parseRate('면세'), undefined, 'v1.6.0 못 읽는 관세율은 그대로 undefined');
  var t = C.rulingStats(recs, Y26, 'product');
  eq([t.n, t.claim, t.reserve, t.impact], [8, 16200000, 11000000, 27200000], 'v1.6.0 14건 — 2026년 건수 · 경정청구 · 유보 · impact');
  eq([t.claimOutside, t.claimOutsideN], [14400000, 2], 'v1.6.0 기간 밖 결정문(2015 · 2025 결정)의 경정청구');
  eq([t.noDate, t.noDateN], [1600000, 1], 'v1.6.0 경정청구일이 빈 경정청구 금액은 빼고 알린다');
  eq(t.progress, 4, 'v1.6.0 진행중 = 경정청구중 + 재심사 + 심판청구(파일 전체 · 기간 무관)');
  eq(C.rulingStats(recs, { from: '2026-07', to: '2026-08' }, 'product').progress, 4, 'v1.6.0 진행중은 기간을 바꿔도 같다');
  eq([C.isProgress({ status: '경정청구 중' }), C.isProgress({ status: '재 심사' }), C.isProgress({ status: '환급완료' })], [true, true, false], 'v1.6.0 진행상태 띄어쓰기 무시');
  eq([t.saving, t.savingN, t.actualN], [6600000, 3, 5], 'v1.6.0 절감 추정은 금액이 없는 건에만(12 · 13 · 14번), 실제 금액과 더하지 않는다');
  eq(t.impact, t.claim + t.reserve, 'v1.6.0 impact 에 추정이 섞이지 않는다(경정청구 + 유보)');
  eq(t.rateChanges.map(function (c) { return [c.key, c.n]; }), [['8% → 0%', 4], ['6.5% → 0%', 1], ['8% → 3%', 1], ['8% → 8%', 1], ['8% → FCN 0%', 1]], 'v1.6.0 세율 인하 분포');
  var tAll = C.rulingStats(recs, { from: '2015-01', to: '2026-12' }, 'product');
  ok(tAll.rates.some(function (r) { return r.key === '0, 8%' && r.n === 1; }), 'v1.6.0 세율 분포에 복수 세율 「0, 8%」 칸');
  eq(tAll.multiRate, 1, 'v1.6.0 복수 세율 건수');
  eq(tAll.zero, 11, 'v1.6.0 복수 세율은 0% 건수에서 뺀다(14건 − 복수 1 − 3% 1 − 8% 1)');
  eq(t.yearly.map(function (y) { return [y.year, y.claim, y.reserve, y.cum]; }), [[2024, 3200000, 1500000, 4700000], [2025, 1950000, 6500000, 13150000], [2026, 16200000, 11000000, 40350000]], 'v1.6.0 연도별 · 누계(파일 전체)');
  eq(t.groups.map(function (g) { return [g.key, g.n, g.claim, g.reserve, g.impact]; }), [['EXCAVATOR', 4, 14400000, 7500000, 21900000], ['천공기', 2, 0, 0, 0], ['Wheel Loader', 2, 1800000, 3500000, 5300000]], 'v1.6.0 완제품별 — 경정청구는 경정청구일, 유보는 시행일자');
  eq(t.byProduct.map(function (g) { return g.key; }), ['EXCAVATOR', 'Wheel Loader', '천공기'], 'v1.6.0 완제품별 절감액은 impact 큰 순');
  var tS = C.rulingStats(recs, Y26, 'status');
  eq(tS.groups.filter(function (g) { return g.key === '환급완료'; }).map(function (g) { return [g.n, g.claim]; })[0], [2, 16200000], 'v1.6.0 묶는 기준 진행상태');
  eq(tS.statuses.slice(0, 3).map(function (g) { return g.progress; }), [true, true, true], 'v1.6.0 진행상태별 표는 진행중이 먼저');
  eq(tS.statuses.filter(function (g) { return g.key === '경정청구중'; })[0].n, 2, 'v1.6.0 진행상태별 건수(파일 전체)');
  var tY = C.rulingStats(recs, { from: '2015-01', to: '2026-12' }, 'year');
  eq(tY.groups.map(function (g) { return [g.key, g.n]; }), [['2015', 1], ['2024', 2], ['2025', 3], ['2026', 8]], 'v1.6.0 묶는 기준 결정연도(시행일자 연도)');
  var tI = C.rulingStats(recs, Y26, 'product', 'impact');
  eq(tI.list.slice(0, 3).map(function (r) { return r.seq; }), ['1', '5', '10'], 'v1.6.0 목록 impact 큰 순');
  eq(tI.list.slice(-3).map(function (r) { return r.impactRow; }), [null, null, null], 'v1.6.0 금액 없는 건은 맨 뒤');
  eq(t.list[0].seq, '14', 'v1.6.0 기본은 최근 시행 순');
  // impact 열이 없을 때 · 한쪽만 있을 때 · 아무 금액 열도 없을 때
  function strip(cols) { var h = A.aoa[0], keep = h.map(function (x, i) { return cols.indexOf(x) < 0 ? i : -1; }).filter(function (i) { return i >= 0; }); return { name: 'x', aoa: A.aoa.map(function (r) { return keep.map(function (i) { return r[i]; }); }) }; }
  var nI = load(strip(['관세절감 impact'])), sI = C.rulingStats(nI.n.records, Y26, 'product');
  eq([nI.m.map.impact, sI.impact, sI.claim, sI.reserve], [undefined, 27200000, 16200000, 11000000], 'v1.6.0 impact 열이 없으면 경정청구 + 유보로 계산');
  eq(C.rowImpact({ claim: 3, reserve: null }), 3, 'v1.6.0 한 행 impact — 한쪽만 있으면 그 값');
  var nR = load(strip(['관세절감 impact', '경정청구 금액', '경정청구일'])), sR = C.rulingStats(nR.n.records, Y26, 'product');
  eq([sR.claim, sR.reserve, sR.impact], [null, 11000000, 11000000], 'v1.6.0 유보 열만 있으면 impact = 유보, 경정청구는 「—」');
  var nN = load(strip(['관세절감 impact', '경정청구 금액', '관세유보금액', '경정청구일', '진행상태', '비고'])), sN = C.rulingStats(nN.n.records, Y26, 'product');
  eq([sN.amounts, sN.claim, sN.reserve, sN.impact, sN.progress, sN.yearly, sN.byProduct, sN.statuses], [false, null, null, null, null, [], [], null], 'v1.6.0 금액 열이 없으면 모두 「—」(지어내지 않는다)');
  eq([sN.saving, sN.savingN], [25300000, 8], 'v1.6.0 금액 열이 없으면 지금처럼 추정을 모든 건에(2026년 8건)');
  // impact 값만 있는 행 · 맞지 않는 행
  var odd = C.rulingStats([
    { month: '2026-02', date: '2026-02-01', year: 2026, claim: null, reserve: null, impact: 500, claimDate: null },
    { month: '2026-03', date: '2026-03-01', year: 2026, claim: 100, reserve: 50, impact: 999, claimDate: '2026-04-01', claimDateMonth: '2026-04', claimDateYear: 2026 }
  ], Y26, 'product');
  eq([odd.impactOnly, odd.impactOnlyN, odd.mismatchN, odd.impact], [500, 1, 1, 100 + 50 + 500], 'v1.6.0 impact 값만 있는 행은 시행일자 기준으로 넣고, 맞지 않는 행은 세어 알린다');
  // 결정문 탭 기간
  var per = C.rulingPeriod(recs);
  eq(per, { from: '2015-06', to: '2026-08' }, 'v1.6.0 결정문 기간 = 시행일자 · 경정청구일 모두');
  eq(C.rulingDefaultRange(per), { from: '2026-01', to: '2026-08' }, 'v1.6.0 기본 기간은 2026-01 부터(2015년 결정문이 있어도)');
  eq(C.rulingDefaultRange(C.rulingPeriod(k.n.records)), { from: '2026-01', to: '2026-03' }, 'v1.6.0 가 · 나 기본 기간');
  eq(C.rulingMonths(C.rulingPeriod(k.n.records)).slice(-1)[0], '2026-12', 'v1.6.0 마지막 해 12월까지 고를 수 있다');
  eq(C.rulingDefaultRange({ from: '2024-02', to: '2025-06' }), { from: '2025-01', to: '2025-06' }, 'v1.6.0 자료가 모두 2026년 이전이면 다른 탭과 같은 규칙');
  eq(C.RULING_BASE_FROM, '2026-01', 'v1.6.0 기본 시작 상수');
  // 기존 예제(금액 열 없음) 그대로
  var old = C.sampleFiles()[3], o = load(old), so = C.rulingStats(o.n.records, { from: '2025-01', to: '2025-12' }, 'product');
  eq([so.amounts, so.impact, so.progress, so.has.claimDate], [false, null, null, false], 'v1.6.0 기존 예제 — 금액 칸은 「—」');
  eq(Object.keys(o.m.map).sort(), ['broker', 'date', 'docNo', 'goods', 'hs', 'item', 'prevRate', 'product', 'rate', 'seq'], 'v1.6.0 기존 예제 열 짝짓기 그대로');
  // 엑셀 내보내기
  var bk = C.exportBook({ range: { from: '2025-01', to: '2026-12' }, rulingRange: Y26, filter: {}, unit: '원', data: { ruling: { file: A.name, uploadedAt: '', period: a.n.period, records: recs, map: a.m.map, skipped: [] } } });
  eq(bk.map(function (b) { return b.name; }), ['안내', '결정문_완제품', '결정문_관세사', '결정문_HS4단위', '결정문_목록', '결정문_연도별', '결정문_진행상태', '결정문_세율인하'], 'v1.6.0 금액 열이 있으면 시트 3개 더');
  var tot = bk[1].aoa[bk[1].aoa.length - 1];
  eq(tot, ['합계', 8, 6, 75, 6600000, 16200000, 11000000, 27200000], 'v1.6.0 엑셀 합계 줄 — 결정문 기간(2026) · 금액 칸');
  ok(bk[0].aoa.some(function (r) { return r[0] === '결정문 조회 기간' && /2026\.01 ~ 2026\.12 — 건수와 유보액은 시행일자/.test(r[1]); }), 'v1.6.0 엑셀 안내에 결정문 기간 · 기준');
  var lh = bk[4].aoa[0], lr = bk[4].aoa.filter(function (r) { return r[0] === '2015-06-12'; })[0];
  eq([lr[lh.indexOf('경정청구 금액')], lr[lh.indexOf('기간 밖 결정문')], lr[lh.indexOf('관세율')]], [9600000, 'Y', '0'], 'v1.6.0 엑셀 목록 — 기간 밖 결정문 표시');
  ok(bk[5].aoa.length === 4 && bk[5].aoa[3][5] === 40350000, 'v1.6.0 엑셀 연도별 누계');
  // samples/시험용/ = 예제 정의
  var XL = require('../lib/xlsx.full.min.js');
  [K, A].forEach(function (f) {
    var wb = XL.read(require('fs').readFileSync(require('path').join(__dirname, '..', 'samples', '시험용', f.name)), { type: 'buffer' });
    eq(XL.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' }), f.aoa, 'v1.6.0 samples/시험용/ ' + f.name + ' = 예제 정의');
  });
})();
var v160 = passed + failed;

/* ===================== v1.7.0 — 수출 실적: ERP EXPORT 원본 열 · Plant → 본부 · GN 제외 · 신고번호 건수 ===================== */
(function () {
  var X = C.sampleExportErp(), H = C.uniqueHeaders(X.aoa[0]);
  function load(aoa, opts, override) { var hh = C.uniqueHeaders(aoa[0]), m = C.mapColumns(hh, 'export', override); return { m: m, n: C.normalize(C.aoaToRows(aoa), 'export', m.map, 0, opts) }; }
  var x = load(X.aoa), recs = x.n.records, OCT = { from: '2026-10', to: '2026-10' };
  // 열 짝짓기 — 원본 열 이름
  eq([X.aoa[0].length, X.sheet], [55, 'Sheet1'], 'v1.7.0 가짜 예제 = 55열 · Sheet1');
  eq(C.detectKind(X.aoa[0].map(String)).kind, 'export', 'v1.7.0 ERP EXPORT 원본 → 수출 (파일 이름 없이도)');
  eq(C.detectKind(X.aoa[0].map(String), 'EXPORT_202610.xlsx').kind, 'export', 'v1.7.0 ERP EXPORT 원본 → 수출 (파일 이름)');
  eq(x.m.missing, [], 'v1.7.0 필수 열 모두 찾음(HS 열 없이)');
  eq([x.m.map.date, x.m.map.hq, x.m.map.country, x.m.map.amount, x.m.map.company], ['Declaration Date', 'Plant', 'Destination', 'FOB(￦)', 'Sold-to Party Name'], 'v1.7.0 신고일자 · 본부 · 국가 · 금액 · 업체');
  eq([x.m.map.declNo, x.m.map.broker, x.m.map.payment, x.m.map.hs], ['Certifcate No.', 'AgentNm', 'Payment', undefined], 'v1.7.0 신고번호 · 관세사 · 결제방법 · HS 없음');
  var mapped = Object.keys(x.m.map).map(function (k) { return x.m.map[k]; });
  eq(['Req.Date', 'Division', 'FOB($)', 'Invoice Amt.'].filter(function (h) { return mapped.indexOf(h) >= 0; }), [], 'v1.7.0 Req.Date · Division · FOB($) · Invoice Amt. 는 짝짓지 않는다');
  eq(C.mapColumns(['Req.Date', 'Division', 'FOB($)', 'Invoice Amt.', 'Destination'], 'export').map, { country: 'Destination' }, 'v1.7.0 원하는 열이 없어도 엉뚱한 열로 채우지 않는다');
  // 같은 이름 열(Curr 5개)
  eq(H.filter(function (h) { return /^Curr/.test(h); }), ['Curr (8번째 열)', 'Curr (24번째 열)', 'Curr (26번째 열)', 'Curr (28번째 열)', 'Curr (30번째 열)'], 'v1.7.0 Curr 5개를 몇 번째 열인지로 구분');
  var row1 = C.aoaToRows(X.aoa)[0];
  eq([row1['Curr (8번째 열)'], row1['Curr (24번째 열)'], row1['Curr (28번째 열)']], ['USD', 'KRW', 'EUR'], 'v1.7.0 같은 이름 열 값이 서로 덮어쓰지 않는다');
  eq(C.uniqueHeaders(['A', '', 'B']), ['A', '열2', 'B'], 'v1.7.0 같은 이름이 없으면 그대로(빈 이름은 열N)');
  // 요청 시험 ① Plant 1111 → 건기본부
  eq(C.plantValue(1111).hq, '건기본부', 'v1.7.0 Plant 1111 → 건기본부');
  eq([C.plantValue('1000').hq, C.plantValue(1100).hq, C.plantValue(1130).hq, C.plantValue('6000').hq], ['건기본부', '건기본부', '엔진본부', '부품센터'], 'v1.7.0 Plant 기본 표');
  eq(recs.filter(function (r) { return r.plant === '1111'; }).map(function (r) { return r.hq; }), ['건기본부'], 'v1.7.0 예제의 Plant 1111 줄 = 건기본부');
  // 요청 시험 ④ Plant 빈칸 → 본부 미분류
  eq([C.plantValue('').hq, C.plantValue('').unclassified], ['본부 미분류', true], 'v1.7.0 Plant 빈칸 → 본부 미분류');
  eq([C.plantValue(9999).hq, C.plantValue('건설기계본부(가상)').hq, C.plantValue('A').hq], ['본부 미분류', '건설기계본부(가상)', 'A'], 'v1.7.0 표에 없는 번호는 미분류, 글자 본부 이름은 그대로');
  eq([x.n.unclassified.n, x.n.unclassified.amount], [1, 20000000], 'v1.7.0 예제 미분류 1줄 · 2,000만');
  // 요청 시험 ② GN 줄은 건수 · 금액에서 빠진다
  eq([x.n.excluded.n, x.n.excluded.amount, recs.length], [2, 40000000, 13], 'v1.7.0 GN 2줄(소문자 gn 포함) 제외 · 레코드 13');
  ok(!recs.some(function (r) { return String(r.payment).toUpperCase() === 'GN'; }), 'v1.7.0 GN 줄은 레코드에 없다');
  var noGN = load(X.aoa, { excludeGN: false });
  eq([noGN.n.records.length, noGN.n.excluded.n, C.exportReport(noGN.n.records, OCT).total.amount], [15, 0, 1060000000], 'v1.7.0 설정에서 GN 제외를 끄면 넣는다');
  // 요청 시험 ③ 같은 신고번호 2줄 = 1건
  var two = recs.filter(function (r) { return r.declNo === '12345261000011'; });
  eq([two.length, C.countDecl(two).n], [2, 1], 'v1.7.0 같은 신고번호 2줄 = 1건');
  eq([C.declNoOf('12345-26-1000011').state, C.declNoOf('').state, C.declNoOf('A2345-26-1000081').state, C.declNoOf('12345-26-100009').state], ['ok', 'blank', 'bad', 'bad'], 'v1.7.0 신고번호 형식(하이픈 지운 뒤 14자리 · 영문 시작 아님)');
  eq([x.n.declBad.n, x.n.declBad.blank, x.n.declBad.bad], [3, 1, 2], 'v1.7.0 신고번호 확인 필요 3줄 알림');
  // 요청 시험 ⑤ HS 열 없이 집계 — 손계산(2026-10, GN 제외): 300+50+120+80+150+60+40+20+90+110 = 1,020백만, 건수 6(같은 번호 1 · 빈칸/형식 다름 3줄 제외)
  var r = C.exportReport(recs, OCT);
  eq([r.total.amount, r.total.n, r.total.badN, r.total.rows], [1020000000, 6, 3, 10], 'v1.7.0 HS 열 없이 집계 — 10월 금액 · 건수');
  eq(r.pivot.map(function (p) { return [p.hq, p.total.n, p.total.amount]; }), [['건기본부', 3, 750000000], ['엔진본부', 1, 210000000], ['부품센터', 1, 40000000], ['본부 미분류', 1, 20000000]], 'v1.7.0 본부 × 월 — 건기 · 엔진 · 부품센터 · 미분류');
  eq(r.pivot.reduce(function (t, p) { return t + p.total.amount; }, 0), r.total.amount, 'v1.7.0 본부 합 = 전체 금액');
  // 전월 대비 · 전년 동월 대비 — 9월 300백만 · 2건, 2025-10 130백만 · 1건
  eq([r.mom.month, r.mom.amount.prev, r.mom.n.prev, r.mom.n.diff], ['2026-09', 300000000, 2, 4], 'v1.7.0 전월 대비(기준월 = 기간 마지막 달)');
  near(r.mom.amount.rate, 2.4, 'v1.7.0 전월 대비 증감률 = (1,020 − 300) ÷ 300');
  eq([r.yoy.month, r.yoy.amount.prev, r.yoy.n.prev], ['2025-10', 130000000, 1], 'v1.7.0 전년 동월 대비');
  var r2 = C.exportReport(recs, { from: '2026-09', to: '2026-09' });
  isNull(r2.yoy.amount.rate, 'v1.7.0 전년 같은 달 자료가 없으면 null(「—」)');
  isNull(r2.yoy.amount.diff, 'v1.7.0 비교할 달이 없으면 증감도 null');
  var r3 = C.exportReport(recs, { from: '2026-09', to: '2026-10' });
  eq(r3.pivot[0].months.map(function (c) { return [c.n, c.amount]; }), [[1, 200000000], [3, 750000000]], 'v1.7.0 본부 × 월 칸(건기 9월 · 10월)');
  eq([r3.pivot[2].months[0].n, r3.pivot[2].months[0].amount], [0, null], 'v1.7.0 자료 없는 칸은 0건 · 금액 「—」');
  near(r3.pivot[0].mom.amount.rate, 2.75, 'v1.7.0 본부별 전월 대비(건기 750 ÷ 200 − 1)');
  // 국가 상위 10 · 비중
  eq(r.countries.slice(0, 3).map(function (c) { return [c.key, c.amount]; }), [['US', 350000000], ['BR', 230000000], ['DE', 150000000]], 'v1.7.0 국가 상위(금액 큰 순)');
  near(r.countries[0].share, 350 / 1020, 'v1.7.0 국가 비중 = 국가 금액 ÷ 합계');
  isNull(r.countryRest, 'v1.7.0 10개국 이하이면 「그 밖」 없음');
  eq(r.basis, 'GN 제외 · 건수는 신고번호 기준', 'v1.7.0 기준 문구');
  eq(C.exportBasis({ excludeGN: false }), 'GN 포함 · 건수는 신고번호 기준', 'v1.7.0 GN 제외를 끄면 문구도');
  // 설정 — Plant 표 고치기
  var st = C.exportSettings({ plant: [{ code: '1000', hq: '건기본부' }, { code: '7000', hq: '가상본부' }, { code: '', hq: 'x' }], excludeGN: false });
  eq([st.plantHq, st.excludeGN, st.custom], [{ 1000: '건기본부', 1131: '엔진본부', 7000: '가상본부' }, false, true], 'v1.7.0 설정 표(빈 줄 뺌 · v1.9.0 부터 1131 = 엔진본부는 늘 넣음)');
  eq([C.exportSettings(null).plantHq, C.exportSettings(null).excludeGN], [C.EXPORT_PLANT_HQ, true], 'v1.7.0 설정 기본값');
  var y = load(X.aoa, { plantHq: { 1000: '건기본부', 1100: '건기본부', 1111: '건기본부', 1130: '엔진본부' } });
  eq(C.exportReport(y.n.records, OCT, { plantHq: { 1000: '건기본부', 1130: '엔진본부' } }).pivot.map(function (p) { return [p.hq, p.total.amount]; }), [['건기본부', 750000000], ['엔진본부', 210000000], ['본부 미분류', 60000000]], 'v1.7.0 표에서 6000 을 빼면 미분류로');
  // exportStats — 건수 = 신고번호 기준, 기존(신고번호 열 없음)은 줄 수
  var es7 = C.exportStats(recs, OCT, 'hq');
  eq([es7.n, es7.badN, es7.amount], [6, 3, 1020000000], 'v1.7.0 exportStats 건수 = 신고번호 고유 개수');
  eq(C.exportStats(recs, OCT, 'hs4').groups.map(function (g) { return g.key; }), ['(미기재)'], 'v1.7.0 HS 열이 없으면 HS 4단위 묶음은 한 덩어리(화면에서는 막음)');
  // 수출입 합계
  var tt = C.tradeTotal([{ month: '2026-10', goods: 500 }, { month: '2026-10', goods: 300 }], recs, OCT);
  eq([tt.importGoods, tt.exportAmount, tt.amount, tt.importN, tt.exportN, tt.n], [800, 1020000000, 1020000800, 2, 6, 8], 'v1.7.0 수출입 합계 = 수입 물자대 + 수출금액, 건수 = 수입 줄 + 수출 신고번호');
  var t1 = C.tradeTotal(null, recs, OCT);
  eq([t1.amount, t1.n, t1.exportAmount], [null, null, 1020000000], 'v1.7.0 한쪽 자료가 없으면 합계는 null');
  // 여러 파일 합치기 · 파일별 제외 수
  var mg = C.mergeFiles('export', [{ name: X.name, file: X.name, headers: X.aoa[0], aoa: X.aoa, offset: 0, override: {} }]);
  eq([mg.ok, mg.excluded, mg.declBad, mg.unclassified, mg.files[0].excluded, mg.records.length], [true, 2, 3, 1, 2, 13], 'v1.7.0 mergeFiles — 파일별 제외 GN · 신고번호 · 미분류');
  eq(C.mergeFiles('export', [{ name: X.name, file: X.name, headers: X.aoa[0], aoa: X.aoa }], { excludeGN: false }).records.length, 15, 'v1.7.0 mergeFiles 에 설정을 넘긴다');
  // 엑셀 내보내기
  var bk = C.exportBook({ range: { from: '2026-09', to: '2026-10' }, filter: {}, unit: '원', data: { export: { file: X.name, period: mg.period, records: mg.records, map: mg.map, skipped: [], files: [{ file: X.name, uploadedAt: '2026-11-18', period: mg.period, n: 13, skipped: 0, excluded: 2 }] } } });
  var names = bk.map(function (b) { return b.name; });
  ok(names.indexOf('수출_본부월') > 0 && names.indexOf('수출_국가상위10') > 0 && names.indexOf('수출_HS4단위') < 0, 'v1.7.0 엑셀 — 본부월 · 국가상위10 시트, HS 열 없으면 HS4단위 시트 없음', names.join(','));
  var pv = bk[names.indexOf('수출_본부월')].aoa;
  eq(pv[0].slice(0, 5), ['본부', '2026.09 건수', '2026.09 FOB', '2026.10 건수', '2026.10 FOB'], 'v1.7.0 엑셀 본부월 머리글');
  eq(pv[pv.length - 1].slice(0, 7), ['합계', 2, 300000000, 6, 1020000000, 8, 1320000000], 'v1.7.0 엑셀 본부월 합계 줄');
  ok(bk[0].aoa.some(function (rw) { return rw[0] === '수출 기준' && /GN 제외 · 건수는 신고번호 기준/.test(rw[1]); }), 'v1.7.0 엑셀 안내에 수출 기준');
  ok(bk[0].aoa.some(function (rw) { return rw[0] === '수출 통관 실적' && rw[6] === 2; }), 'v1.7.0 엑셀 안내 — 제외 GN 수');
  // 기존 예제(한글 열 · 한글 본부 · 신고번호 없음)는 그대로
  var old = C.sampleFiles()[1], om = C.mapColumns(old.aoa[0], 'export'), on = C.normalize(C.aoaToRows(old.aoa), 'export', om.map);
  eq([om.missing, om.map.hs, on.records.length, on.excluded.n, on.unclassified.n], [[], 'HS CODE', 186, 0, 0], 'v1.7.0 기존 수출 예제 그대로 읽힘');
  var oes = C.exportStats(on.records, { from: '2025-01', to: '2025-10' }, 'hq');
  eq(oes.n, oes.rows, 'v1.7.0 신고번호 열이 없으면 건수 = 줄 수(예전과 같음)');
  ok(C.exportReport(on.records, { from: '2025-01', to: '2025-10' }).pivot.every(function (p) { return p.hq !== '본부 미분류' && /\(가상\)$/.test(p.hq); }), 'v1.7.0 기존 예제 본부 이름 그대로 · 미분류 줄 없음');
  // samples/시험용/ = 예제 정의
  var XL = require('../lib/xlsx.full.min.js');
  var wb = XL.read(require('fs').readFileSync(require('path').join(__dirname, '..', 'samples', '시험용', X.name)), { type: 'buffer' });
  eq([wb.SheetNames[0], XL.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' })], ['Sheet1', X.aoa], 'v1.7.0 samples/시험용/ ' + X.name + ' = 예제 정의');
  ok(JSON.stringify(X.aoa).indexOf('(가상)') > 0, 'v1.7.0 가짜 예제에 「가상」 표기');
})();
var v170 = passed + failed;

/* ===================== v1.8.0 — GN 은 수입 · 수출 모두 · 무환구분 점검 · 여러 시트 합치기 · 기본 기간 2026-01 ===================== */
(function () {
  var W = C.sampleExportRaw();
  function prep(list) { return list.map(function (s) { var hr = C.findHeaderRow(s.aoa); return { name: s.name, aoa: s.aoa.slice(hr), offset: hr }; }); }
  var pk = C.pickSheets(prep(W.sheets), W.name);
  // 여러 시트 고르기
  eq([pk.detect.kind, pk.use.map(function (s) { return s.name; })], ['export', ['RAW1', 'RAW2', 'RAW3']], 'v1.8.0 같은 모양 시트 RAW1~RAW3 를 모두 고른다');
  eq(pk.skipped, [{ name: '종합', why: '집계표' }, { name: '3월 소계', why: '집계표' }, { name: 'Memo', why: '열 구성이 다름' }], 'v1.8.0 집계표 · 열이 다른 시트는 건너뛰고 이름을 알린다');
  eq(C.pickSheets(prep([{ name: '수출실적 합계', aoa: W.sheets[1].aoa }]), 'x.xlsx').use.length, 1, 'v1.8.0 모든 시트가 집계표 이름이면 이름 규칙 없이 고른다');
  eq(C.pickSheets([], 'x').use, [], 'v1.8.0 시트가 없으면 빈 결과');
  ok(['종합', '10월 소계', '합계', 'Summary', '집계표'].every(function (n) { return C.SUMMARY_SHEET_RE.test(n); }) && !C.SUMMARY_SHEET_RE.test('RAW10'), 'v1.8.0 집계표 시트 이름 규칙');
  // 합치기 — 시트별 줄 수 · 엑셀 행 번호
  var item = { name: W.name, file: W.name, headers: C.uniqueHeaders(pk.use[0].aoa[0]), aoa: pk.use[0].aoa, parts: pk.use.map(function (s) { return { sheet: s.name, aoa: s.aoa, offset: s.offset }; }), skippedSheets: pk.skipped };
  var m = C.mergeFiles('export', [item]), p = m.files[0];
  eq([m.ok, m.records.length, p.sheets.map(function (s) { return [s.sheet, s.n]; })], [true, 9, [['RAW1', 3], ['RAW2', 2], ['RAW3', 4]]], 'v1.8.0 시트 3장을 합쳐 읽고 시트별 줄 수를 돌려준다');
  eq(p.skippedSheets.map(function (s) { return s.name; }), ['종합', '3월 소계', 'Memo'], 'v1.8.0 건너뛴 시트를 파일 결과에 남긴다');
  eq([m.records[0].sheet, m.records[0].row, m.records[m.records.length - 1].row], ['RAW1', 'RAW1 2', 'RAW3 5'], 'v1.8.0 줄 번호는 시트별 엑셀 행(「RAW3 5」)');
  eq(p.period, { from: '2026-01', to: '2026-03' }, 'v1.8.0 합친 기간');
  // GN · 무환구분
  eq([p.excluded, p.excludedAmount], [2, 45000000], 'v1.8.0 수출 GN 2줄(RAW1 · RAW2) 제외');
  eq([p.mismatch, p.norm.mismatch.monN, p.norm.mismatch.gnN, p.norm.mismatch.rows], [2, 1, 1, ['RAW1 5', 'RAW2 3']], 'v1.8.0 무환구분 N ↔ Payment GN 불일치 줄(N 인데 TT · GN 인데 Y)');
  eq(C.mergeFiles('export', [item], { excludeGN: false }).files[0].mismatch, 2, 'v1.8.0 불일치 점검은 GN 제외 설정과 관계없이');
  has(p.norm.issues.join(' '), '실적에서 빼는 기준은 결제방법 GN 하나', 'v1.8.0 불일치는 알리기만');
  // 손계산: 1월 100+50+70 = 220 · 3건, 2월 80+10 = 90 · 2건, 3월 120+30+60+20 = 230 · 3건(같은 번호 1) → 540백만 · 8건
  var r = C.exportReport(m.records, { from: '2026-01', to: '2026-03' });
  eq([r.total.amount, r.total.n, r.monthly.map(function (c) { return [c.n, c.amount]; })], [540000000, 8, [[3, 220000000], [2, 90000000], [3, 230000000]]], 'v1.8.0 시트 3장 합친 집계');
  // 수입 GN — Payment method
  var I = C.sampleImportGN(), im = C.mapColumns(I.aoa[0], 'import'), inr = C.normalize(C.aoaToRows(I.aoa), 'import', im.map);
  eq([im.map.payment, inr.records.length, inr.excluded.n, inr.excluded.amount], ['Payment method', 3, 1, 1500000], 'v1.8.0 수입도 Payment method GN 줄 제외(물자대 금액)');
  eq(C.importStats(inr.records, { from: '2026-01', to: '2026-02' }, 'hq').goods, 60000000, 'v1.8.0 수입 물자대에서 GN 금액이 빠짐');
  eq(C.normalize(C.aoaToRows(I.aoa), 'import', im.map, 0, { excludeGN: false }).records.length, 4, 'v1.8.0 설정에서 끄면 수입 GN 도 넣음');
  eq(C.mergeFiles('import', [{ name: I.name, file: I.name, headers: I.aoa[0], aoa: I.aoa }]).excluded, 1, 'v1.8.0 수입 파일 「제외 GN」 수');
  eq(C.mapColumns(C.sampleFiles()[0].aoa[0], 'import').map.payment, undefined, 'v1.8.0 기존 수입 예제에는 결제방법 열 없음(그대로)');
  // 기본 기간
  eq(C.defaultRange({ from: '2025-01', to: '2026-10' }), { from: '2026-01', to: '2026-10' }, 'v1.8.0 기본 기간 시작 2026-01');
  eq(C.defaultRange({ from: '2026-03', to: '2026-10' }), { from: '2026-03', to: '2026-10' }, 'v1.8.0 자료가 더 늦게 시작하면 그 달');
  eq(C.defaultRange({ from: '2025-01', to: '2027-02' }), { from: '2026-01', to: '2027-02' }, 'v1.8.0 2027년까지 있어도 2026-01 부터');
  eq(C.defaultRange({ from: '2024-01', to: '2025-10' }), { from: '2025-01', to: '2025-10' }, 'v1.8.0 자료가 모두 2026년 이전이면 예전 규칙(예제 5종 그대로)');
  eq(C.DASH_BASE_FROM, '2026-01', 'v1.8.0 기본 시작 상수');
  // 전년 자료가 없으면 「—」(0 이나 추정값 없음)
  var es = C.exportStats(m.records, { from: '2026-01', to: '2026-03' }, 'hq');
  eq([es.hasPrev, es.prev, es.diff, es.rate], [false, null, null, null], 'v1.8.0 전년 동기 자료가 없으면 전년 · 증감 · 증감률 null');
  ok(es.groups.every(function (g) { return g.prev === null && g.diff === null && g.rate === null; }) && es.monthly.every(function (x) { return x.prev === null; }), 'v1.8.0 묶음 · 월별도 null');
  isNull(r.yoy.amount.rate, 'v1.8.0 전년 동월 대비 카드도 null');
  // 기억한 자료 — 여러 시트
  var saved = C.migrateSaved({ v: 2, sets: { export: { files: [{ name: W.name, file: W.name, headers: item.headers, aoa: [], parts: item.parts, skippedSheets: pk.skipped, offset: 0, override: {} }] } } });
  var sf = saved.sets.export.files[0];
  eq([sf.parts.length, sf.aoa.length > 1, sf.skippedSheets.length, C.mergeFiles('export', saved.sets.export.files).records.length], [3, true, 3, 9], 'v1.8.0 여러 시트로 기억한 자료를 다시 읽는다');
  // samples/시험용/ = 예제 정의
  var XL = require('../lib/xlsx.full.min.js'), fs = require('fs'), pth = require('path');
  var wb = XL.read(fs.readFileSync(pth.join(__dirname, '..', 'samples', '시험용', W.name)), { type: 'buffer' });
  eq([wb.SheetNames, wb.SheetNames.map(function (n) { return XL.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }); })], [W.sheets.map(function (s) { return s.name; }), W.sheets.map(function (s) { return s.aoa; })], 'v1.8.0 samples/시험용/ ' + W.name + ' = 예제 정의');
  var wb2 = XL.read(fs.readFileSync(pth.join(__dirname, '..', 'samples', '시험용', I.name)), { type: 'buffer' });
  eq(XL.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]], { header: 1, raw: true, defval: '' }), I.aoa, 'v1.8.0 samples/시험용/ ' + I.name + ' = 예제 정의');
  ok(JSON.stringify(W).indexOf('(가상)') > 0 && JSON.stringify(I).indexOf('(가상)') > 0, 'v1.8.0 가짜 예제에 「가상」 표기');
})();
var v180 = passed + failed;

/* ===================== v1.9.0 — 수입 실적: ERP 수입실적 원본 열 · Plant → 본부 · 합계 행 · 신고번호 건수 · 신고 종류 ===================== */
(function () {
  var I = C.sampleImportErp(), H = C.uniqueHeaders(I.aoa[0]), RG = { from: '2026-01', to: '2026-02' };
  // 열 짝짓기 — 실제 ERP 이름, 짝지으면 안 되는 열은 피함
  var mc = C.mapColumns(H, 'import');
  eq([mc.missing, C.detectKind(I.aoa[0].map(String), I.name).kind, C.detectKind(I.aoa[0].map(String), 'x.xlsx').kind], [[], 'import', 'import'], 'v1.9.0 ERP 수입 파일 — 필수 열 모두 찾음 · 수입으로 판단(파일 이름 없이도)');
  eq([mc.map.date, mc.map.hq, mc.map.country, mc.map.goods, mc.map.duty, mc.map.declNo, mc.map.payment, mc.map.dutyType, mc.map.broker, mc.map.supplier],
    ['Acceptance date', 'Plant', 'Origin', '(\\)Taxable.Amt', 'Tot.Duty Amt', 'Import declaration number', 'Payment method', 'Duty Type', 'Customs Broker', 'Supplier'], 'v1.9.0 열 짝짓기(신고일자 · 본부 · 국가 · 물자대 · 관세 · 신고번호 · 결제방법 · 세율구분 · 관세사 · 공급지역)');
  ok(['Carry-in date', 'Declaration date desired', 'Sh.Country', 'Amount', '($)Taxable.Amt', 'Tot.Tax Sum', 'Tot.Ratal Amt'].every(function (h) { return mc.unused.indexOf(h) >= 0; }), 'v1.9.0 Carry-in date · Sh.Country · ($)Taxable.Amt · Amount · Tot.Tax Sum · Tot.Ratal Amt 는 짝짓지 않음');
  // 같은 이름 열 — 몇 번째 열인지 구분, 업체는 Vendor Code 옆
  eq([H[1], H[7], H[21], H[29], H[39], H[40]], ['Vendor Name (2번째 열)', 'Vendor Name (8번째 열)', 'Short Descript. (22번째 열)', 'Short Descript. (30번째 열)', '열40', '열41'], 'v1.9.0 같은 이름 · 빈 이름 열에 열 번호');
  eq([mc.map.company, H.indexOf(mc.map.company) + 1], ['Vendor Name (8번째 열)', 8], 'v1.9.0 업체 = Vendor Code 옆 Vendor Name(앞쪽 같은 이름 열이 아님)');
  isNull(mc.map.hs || null, 'v1.9.0 HS 코드 열 없음(선택 열)');
  // 읽기 · 뺄 줄
  var mg = C.mergeFiles('import', [{ name: I.name, file: I.name, headers: I.aoa[0], aoa: I.aoa }]), recs = mg.records, fp = mg.files[0];
  eq([mg.ok, recs.length, mg.excluded, mg.totalRows, fp.totalRows], [true, 9, 1, 1, 1], 'v1.9.0 HS 열 없이 집계 · 10줄 중 GN 1줄 · 합계 행 1줄만 뺌');
  eq([fp.norm.totalRows.rows, fp.norm.totalRows.amount], [[12], 427500000], 'v1.9.0 합계 행 = 맨 아래 신고번호 빈 줄(엑셀 12행) — 그 금액은 더하지 않음');
  ok(!recs.some(function (r) { return r.company === '솔빛고무(가상)' && r.month === '2026-01'; }), 'v1.9.0 Payment method GN 1줄은 실적에 없음');
  eq(C.mergeFiles('import', [{ name: I.name, file: I.name, headers: I.aoa[0], aoa: I.aoa }], { excludeGN: false }).records.length, 10, 'v1.9.0 GN 제외를 끄면 GN 줄도 넣음(합계 행은 여전히 뺌)');
  // Plant → 본부
  var r1131 = recs.filter(function (r) { return r.plant === '1131'; });
  eq([r1131.length, r1131[0].hq, C.EXPORT_PLANT_HQ['1131']], [1, '엔진본부', '엔진본부'], 'v1.9.0 Plant 1131 → 엔진본부');
  eq([mg.unclassified, fp.norm.unclassified.amount, fp.norm.unclassified.codes], [1, 5000000, ['9999']], 'v1.9.0 표에 없는 Plant 9999 → 본부 미분류(건수 · 물자대 따로)');
  // 특송 · 영문 섞인 신고번호 · 보세공장 B
  var ex = recs.filter(function (r) { return r.declNo === '2235626B68687M'; })[0];
  eq([!!ex, ex && ex.declState, ex && ex.declType, ex && ex.broker, ex && ex.goods], [true, 'ok', 'M', '가상특송관세사(가상)', 3000000], 'v1.9.0 특송 관세사 · 영문 섞인 신고번호 유환 건은 실적에 들어감(일반 수입)');
  var bd = recs.filter(function (r) { return r.declType === 'B'; });
  eq([bd.length, bd[0].goods, bd[0].duty, bd[0].dutyExcl, C.DECL_TYPES.B], [1, 200000000, null, 16000000, '보세공장 사용신고'], 'v1.9.0 끝 B 건 — 실적(물자대)에 들어가고 관세(Tot.Duty Amt)는 관세 합계에서 뺌');
  eq(recs.map(function (r) { return r.declNo; }).filter(Boolean).length, 8, 'v1.9.0 신고번호를 레코드에 보관');
  // 건수 · 금액 · 관세부담율(손계산: 물자대 426백만 = 100+50+20+3+200+10+30+5+8, 관세 18.08백만 = B 16백만 뺌, 건수 7 = 같은 번호 1 · 빈 번호 1 뺌)
  var r = C.importReport(recs, RG);
  eq([r.total.n, r.total.badN, r.total.goods, r.total.duty, r.total.dutyExcl], [7, 1, 426000000, 18080000, 16000000], 'v1.9.0 건수 = 신고번호 고유 개수 · 빈 번호 줄은 건수에서만 빼고 금액은 더함');
  near(r.total.burden, 18080000 / 426000000, 'v1.9.0 관세부담율 = 관세 합계 ÷ 물자대 합계(B 물자대는 분모에 넣음)');
  near(C.importStats(recs, RG, 'hq').burden, 18080000 / 426000000, 'v1.9.0 importStats 관세부담율도 같음');
  eq(C.importStats(recs, RG, 'hq').n, 7, 'v1.9.0 importStats 건수 = 신고번호 기준');
  eq(r.pivot.map(function (p) { return [p.hq, p.total.n, p.total.goods, p.total.duty]; }), [['건기본부', 3, 338000000, 11040000], ['엔진본부', 2, 73000000, 5840000], ['부품센터', 1, 10000000, 800000], ['본부 미분류', 1, 5000000, 400000]], 'v1.9.0 표 ① 본부 합계(건기 · 엔진 · 부품센터 · 미분류)');
  eq(r.monthly.map(function (c) { return [c.n, c.goods, c.duty]; }), [[4, 373000000, 13840000], [3, 53000000, 4240000]], 'v1.9.0 월별 건수 · 물자대 · 관세');
  near(r.pivot[0].months[1].burden, 3040000 / 38000000, 'v1.9.0 본부 × 월 관세부담율(건기 2월)');
  eq(r.suppliers.slice(0, 3).map(function (c) { return [c.key, c.goods]; }), [['KR', 200000000], ['CN', 138000000], ['JP', 70000000]], 'v1.9.0 표 ② 공급지역(Supplier) 물자대 큰 순');
  near(r.suppliers[0].share, 200 / 426, 'v1.9.0 공급지역 비중 = 물자대 ÷ 합계');
  eq(r.declTypes.map(function (t) { return [t.label, t.n, t.goods, t.duty, t.dutyExcl]; }), [['일반 수입', 5, 188000000, 15040000, null], ['보세공장 사용신고', 1, 200000000, null, 16000000], ['구분 모름', 1, 38000000, 3040000, null]], 'v1.9.0 표 ③ 신고 종류별 건수 · 물자대 · 관세');
  near(r.mom.goods.rate, 53 / 373 - 1, 'v1.9.0 전월 대비(2월 vs 1월 물자대)');
  eq([r.yoy.goods.prev, r.yoy.goods.rate, r.yoy.n.diff], [null, null, null], 'v1.9.0 전년 자료가 없으면 전년 동월 대비 「—」(0 · 추정값 없음)');
  eq(r.basis, 'GN 제외 · 건수는 신고번호 기준 · 관세부담율 = 관세 ÷ 물자대 · 보세공장 사용신고(B) 관세는 관세 합계에서 제외', 'v1.9.0 화면 기준 문구');
  var tt = C.tradeTotal(recs, [{ month: '2026-02', amount: 100, declState: 'ok', declNo: 'X1' }], RG);
  eq([tt.importN, tt.importGoods, tt.n], [7, 426000000, 8], 'v1.9.0 수출입 합계의 수입 건수도 신고번호 기준');
  // 신고번호 규칙(수입 = 느슨하게)
  eq([C.declNoOf('2235626B68687M', true).state, C.declNoOf('12345-26-000203', true).state, C.declNoOf('12345가26', true).state, C.declNoOf('', true).state, C.declNoOf('A2345-26-1000081').state], ['ok', 'ok', 'bad', 'blank', 'bad'], 'v1.9.0 수입 신고번호는 영문 · 숫자면 셈(수출 규칙은 그대로)');
  // 중간 빈 번호 줄은 합계 행이 아님 · 여러 시트는 시트마다 합계 행
  var sh = function (nm) { return { sheet: nm, aoa: I.aoa, offset: 0 }; };
  var mm = C.mergeFiles('import', [{ name: 'RAW(가상).xlsx', file: 'RAW(가상).xlsx', headers: I.aoa[0], aoa: I.aoa, parts: [sh('RAW1'), sh('RAW2')] }]);
  eq([mm.records.length, mm.totalRows, mm.files[0].norm.totalRows.rows], [18, 2, ['RAW1 12', 'RAW2 12']], 'v1.9.0 시트마다 맨 아래 합계 행을 뺌');
  // 설정 — 1131 은 늘 엔진본부, 이름을 바꾸면 그 이름
  eq(C.exportSettings({ plant: [{ code: '1131', hq: '엔진(가상)' }] }).plantHq, { 1131: '엔진(가상)' }, 'v1.9.0 설정에서 1131 이름을 바꾸면 그 이름');
  // 엑셀 내보내기
  var bk = C.exportBook({ range: RG, filter: {}, unit: '원', data: { import: { file: I.name, period: mg.period, records: recs, map: mg.map, skipped: [], files: [{ file: I.name, uploadedAt: '2026-11-18', period: mg.period, n: 9, skipped: 0, excluded: 1, totalRows: 1 }] } } });
  var names = bk.map(function (b) { return b.name; });
  ok(names.indexOf('수입_본부월') > 0 && names.indexOf('수입_공급지역상위10') > 0 && names.indexOf('수입_신고종류') > 0 && names.indexOf('수입_HS4단위') < 0, 'v1.9.0 엑셀 — 수입 본부월 · 공급지역 · 신고종류, HS 열 없으면 HS4단위 시트 없음', names.join(','));
  ok(bk[0].aoa.some(function (rw) { return rw[0] === '수입 통관 실적' && rw[6] === 1 && rw[7] === 1; }) && bk[0].aoa.some(function (rw) { return rw[0] === '수입 기준'; }), 'v1.9.0 엑셀 안내 — 제외 GN · 합계 행 · 수입 기준');
  var dt = bk[names.indexOf('수입_신고종류')].aoa;
  eq(dt[2], ['보세공장 사용신고', 1, 200000000, '집계 제외', 16000000], 'v1.9.0 엑셀 신고종류 — B 관세는 「집계 제외」');
  // 기존 한글 예제는 그대로(신고번호 · 결제방법 열 없음 → 건수 = 줄 수, 본부 이름 그대로, 합계 행 규칙 안 씀)
  var old = C.sampleFiles()[0], om = C.mapColumns(old.aoa[0], 'import'), on = C.normalize(C.aoaToRows(old.aoa), 'import', om.map);
  eq([om.missing, om.map.hs, om.map.declNo, on.totalRows.n, on.unclassified.n], [[], 'HS부호', undefined, 0, 0], 'v1.9.0 기존 수입 예제 그대로 읽힘');
  var ost = C.importStats(on.records, { from: '2025-01', to: '2025-10' }, 'hq');
  eq(ost.n, on.records.filter(function (x) { return x.month >= '2025-01' && x.month <= '2025-10'; }).length, 'v1.9.0 기존 예제 건수 = 줄 수(예전과 같음)');
  eq(C.importReport(on.records, { from: '2025-01', to: '2025-10' }, null, { payment: false }).basis, '건수는 줄 수 · 관세부담율 = 관세 ÷ 물자대', 'v1.9.0 신고번호 · 결제방법 열이 없으면 기준 문구도 그에 맞춤');
  ok(C.importReport(on.records, { from: '2025-01', to: '2025-10' }).pivot.every(function (p) { return p.hq !== '본부 미분류'; }), 'v1.9.0 기존 예제 본부에 미분류 없음');
  // samples/시험용/ = 예제 정의
  var XL = require('../lib/xlsx.full.min.js'), fs = require('fs'), pth = require('path');
  var wb = XL.read(fs.readFileSync(pth.join(__dirname, '..', 'samples', '시험용', I.name)), { type: 'buffer' });
  eq([wb.SheetNames[0], XL.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' })], ['Sheet1', I.aoa], 'v1.9.0 samples/시험용/ ' + I.name + ' = 예제 정의');
  ok(JSON.stringify(I.aoa).indexOf('(가상)') > 0 && I.aoa[0].length === 70, 'v1.9.0 가짜 예제(70열)에 「가상」 표기');
})();
var v190 = passed + failed;
// ---------- v1.9.1 관세율표 조회(js/tariff.js) ----------
(async function () {
  var T = require('../js/tariff.js');
  var AC = { meta: { year: 2026, source: '관세율표(가상)', hsCount: 4 }, rates: { '8409911000': { A: 8, C: 13 }, '8409990000': { C: 5 }, '0101210000': { A: 0, C: 0 }, '9999999999': {} } };
  var FTA = { meta: { year: 2026, source: '관세율표(가상)', hsCount: 1 }, rates: { '8409911000': { FCN1: 0, FEU1: 2.4 } } };
  var calls = [];
  T.setFetcher(function (u) { calls.push(u); return Promise.resolve(u.indexOf('fta') >= 0 ? FTA : AC); });
  eq([T.baseRate('8409911000'), T.ftaRate('8409911000', 'FCN1'), T.tariffMeta()], [null, null, null], 'v1.9.1 받기 전 조회는 null');
  eq(calls.length, 0, 'v1.9.1 불러오기 전에는 받지 않음(lazy)');
  var r1 = await T.loadTariff(), r2 = await T.loadTariff();
  ok(r1.ok && r2.ok, 'v1.9.1 받기 성공');
  eq(calls.slice().sort(), ['data/tariff-ac.json', 'data/tariff-fta.json'], 'v1.9.1 두 번 불러도 파일마다 한 번만 받음');
  ok(T.loadTariff() === T.loadTariff(), 'v1.9.1 같은 Promise 를 돌려줌');
  eq(T.normHs('8409-91-1000'), '8409911000', 'v1.9.1 HS 하이픈 지움');
  eq(T.normHs(' 8409 911000 '), '8409911000', 'v1.9.1 HS 공백 지움');
  eq(T.normHs("'8409911000"), '8409911000', 'v1.9.1 HS 따옴표 지움');
  eq(T.normHs(8409911000), '8409911000', 'v1.9.1 HS 숫자 칸');
  eq([T.normHs('101210000'), T.normHs(101210000), T.normHs('84099110001'), T.normHs(''), T.normHs(null), T.normHs('8409.91')], [null, null, null, null, null, null], 'v1.9.1 10자리가 아니면 null(앞 0 · 자르기 추측 없음)');
  eq(T.baseRate('8409-91-1000'), 8, 'v1.9.1 A · C 둘 다 있으면 A');
  eq(T.baseRate('8409990000'), 5, 'v1.9.1 A 없으면 C');
  eq(T.baseRate('0101210000'), 0, 'v1.9.1 세율 0 은 0 그대로');
  eq([T.baseRate('9999999999'), T.baseRate('1234567890'), T.baseRate('101210000')], [null, null, null], 'v1.9.1 세율 없음 · 표에 없는 HS · 9자리 → null');
  eq([T.ftaRate('8409911000', 'fcn1'), T.ftaRate('8409911000', ' FEU1 '), T.ftaRate('8409911000', 'FUS1'), T.ftaRate('8409990000', 'FCN1'), T.ftaRate('8409911000', ''), T.ftaRate('8409911000', null)], [0, 2.4, null, null, null, null], 'v1.9.1 협정세율 — 대문자로 찾고 없으면 null');
  eq(T.tariffMeta(), { year: 2026, source: '관세율표(가상)', hsCount: 4 }, 'v1.9.1 tariffMeta = 기준세율 표 meta');
  eq(T.tariffMetaText({ year: 2026, source: 'x', hsCount: 11326 }), '관세율표 2026년 기준 · HS 11,326종', 'v1.9.1 화면 표기 문구');
  var src = fsx.readFileSync(__dirname + '/../js/tariff.js', 'utf8');
  ok(!/localStorage|sessionStorage|indexedDB/.test(src.replace(/\/\*[\s\S]*?\*\//, '')), 'v1.9.1 브라우저 저장소를 쓰지 않음');
  ok(!/\.(forEach|filter|find|some|map|reduce)\(|for \(|while \(/.test(src), 'v1.9.1 조회에 배열 순회 없음(해시 조회)');
  // 실패 — 조회는 null, 다른 집계는 그대로
  T.setFetcher(function (u) { return u.indexOf('fta') >= 0 ? Promise.reject(new Error('404')) : Promise.resolve(AC); });
  var bad = await T.loadTariff();
  eq([bad.ok, bad.error], [false, '관세율표를 불러오지 못했습니다'], 'v1.9.1 받기 실패 → { ok:false } · 안내 문구');
  eq([T.baseRate('8409911000'), T.ftaRate('8409911000', 'FCN1'), T.tariffMeta(), T.tariffMetaText()], [null, null, null, null], 'v1.9.1 실패하면 조회는 모두 null');
  T.setFetcher(function () { return Promise.resolve({ rates: {} }); });
  eq((await T.loadTariff()).ok, false, 'v1.9.1 meta 없는 파일은 실패로');
  // 실제 data/*.json
  var real = {}; ['ac', 'fta'].forEach(function (k) { real[k] = JSON.parse(fsx.readFileSync(__dirname + '/../data/tariff-' + k + '.json', 'utf8')); });
  T.setFetcher(function (u) { return Promise.resolve(u.indexOf('fta') >= 0 ? real.fta : real.ac); });
  var rr = await T.loadTariff();
  ok(rr.ok && rr.meta.year === 2026 && rr.meta.hsCount === 11326, 'v1.9.1 실제 관세율표 2026 · HS 11,326종');
  eq([Object.keys(real.ac.rates).length, Object.keys(real.fta.rates).length], [real.ac.meta.hsCount, real.fta.meta.hsCount], 'v1.9.1 meta.hsCount = rates 개수');
  var h0 = Object.keys(real.ac.rates)[0], e0 = real.ac.rates[h0];
  eq(T.baseRate(h0.slice(0, 4) + '-' + h0.slice(4)), e0.A != null ? e0.A : e0.C, 'v1.9.1 실제 표 기준세율 조회 ' + h0);
  var hf = Object.keys(real.fta.rates)[0], kf = Object.keys(real.fta.rates[hf])[0];
  eq(T.ftaRate(hf, kf.toLowerCase()), real.fta.rates[hf][kf], 'v1.9.1 실제 표 협정세율 조회 ' + hf + ' ' + kf);
  ok(Object.keys(real.ac.rates).every(function (h) { return /^\d{10}$/.test(h); }), 'v1.9.1 실제 표 HS 는 모두 10자리');
  T.reset();
  var html = fsx.readFileSync(__dirname + '/../dashboard.html', 'utf8');
  ok(html.indexOf('<script src="js/tariff.js">') > 0 && html.indexOf('id="tariff-meta"') > 0 && html.indexOf('tariff-ac.json') < 0, 'v1.9.1 쪽은 스크립트만 붙이고 JSON 은 받지 않음');
  console.log('v1.9.1 ' + (passed + failed - v190) + '개 검사');
  finish();
})().catch(function (e) { console.log('  X v1.9.1 예외 ' + (e && e.stack)); failed++; finish(); });
function finish() {
var v191 = passed + failed; v1100(); console.log('v1.10.0 ' + (passed + failed - v191) + '개 검사');
var v1103 = passed + failed; v1110(); console.log('v1.11.0 ' + (passed + failed - v1103) + '개 검사');
var v1110c = passed + failed; v1120(); console.log('v1.12.0 ' + (passed + failed - v1110c) + '개 검사');
var v1120c = passed + failed; v200(); console.log('v2.0.0 ' + (passed + failed - v1120c) + '개 검사');
var v200c = passed + failed; v210(); console.log('v2.1.0 ' + (passed + failed - v200c) + '개 검사');
var v210c = passed + failed; v220(); console.log('v2.2.0 ' + (passed + failed - v210c) + '개 검사');
var v220c = passed + failed; v230(); console.log('v2.3.0 ' + (passed + failed - v220c) + '개 검사');
var v230c = passed + failed; v240(); console.log('v2.4.0 ' + (passed + failed - v230c) + '개 검사');
var v240c = passed + failed; v250(); console.log('v2.5.0 ' + (passed + failed - v240c) + '개 검사');
var v250c = passed + failed; v260(); console.log('v2.6.0 ' + (passed + failed - v250c) + '개 검사');
var v260c = passed + failed; v270(); console.log('v2.7.0 ' + (passed + failed - v260c) + '개 검사');
console.log('v1.9.0 ' + (v190 - v180) + '개 검사');
console.log('v1.8.0 ' + (v180 - v170) + '개 검사');
console.log('v1.7.0 ' + (v170 - v160) + '개 검사');
console.log('v1.6.0 ' + (v160 - v150) + '개 검사');
console.log('v1.5.0 ' + (v150 - v146) + '개 검사');
console.log('v1.4.6 ' + (v146 - v145) + '개 검사');
console.log('v1.4.5 ' + (v145 - v14) + '개 검사');
console.log('v1.4 ' + (v14 - v13) + '개 검사');
console.log('v1.3 ' + (v13 - v12) + '개 검사');
console.log('v1.0 ' + v10 + ' · v1.1 ' + (v11 - v10) + ' · v1.2 ' + (v12 - v11) + '개 검사');
console.log('\n통과 ' + passed + ' · 실패 ' + failed);
process.exit(failed ? 1 : 0);
}
// ---------- v1.10.0 올린 파일 판별(js/filerules.js) · 오류점수 신고번호 · 현황목록 ----------
function v1100() {
  var FR = require('../js/filerules.js'), ES2 = require('../js/errscore.js'), C2 = require('../js/customs.js');
  function d(n, k) { return FR.describe(n, k ? { kind: k } : null); }
  function brief(x) { return [x.label, x.dataset, x.period ? x.period.type : null, x.period ? x.period.text : null, x.mode, x.rule, x.forceMonth]; }
  // [1] 표준 파일명 — 종류 · 기간 · 확정본 · 월 귀속
  eq(brief(d('2026-09_수입오류_현황목록.xlsx')), ['수입오류점수 현황목록', null, 6, '2026-09', 'confirmed', 'A', '2026-09'], 'v1.10.0 2026-09_수입오류_현황목록');
  eq(brief(d('2026-09_수입오류_상세목록.xlsx')), ['수입오류점수 상세목록', null, 6, '2026-09', 'confirmed', 'A', '2026-09'], 'v1.10.0 2026-09_수입오류_상세목록');
  eq(brief(d('2026-09_수출오류_현황목록.xlsx')).slice(0, 2), ['수출오류점수 현황목록', null], 'v1.10.0 2026-09_수출오류_현황목록');
  eq(brief(d('2026-09_수출오류_상세목록.xlsx')).slice(0, 2), ['수출오류점수 상세목록', null], 'v1.10.0 2026-09_수출오류_상세목록');
  eq(brief(d('2026-09_수입실적.xlsx')), ['수입 실적', 'import', 6, '2026-09', 'confirmed', 'A', '2026-09'], 'v1.10.0 2026-09_수입실적 = 월 확정본 · A');
  eq(brief(d('2026_수입실적.xlsx')), ['수입 실적', 'import', 7, '2026', 'confirmed', 'B', null], 'v1.10.0 2026_수입실적 = 연 확정본 · B');
  eq(brief(d('2026-01~10_수입실적.xlsx')), ['수입 실적', 'import', 5, '2026-01~10', 'confirmed', 'B', null], 'v1.10.0 2026-01~10_수입실적 = 월 범위 확정본 · B');
  eq(brief(d('2026_품목분류결정문.xlsx')), ['품목분류 결정문', 'ruling', 7, '2026', 'confirmed', 'B', null], 'v1.10.0 2026_품목분류결정문');
  eq(d('2026-10_관세환급.xlsx').dataset, 'refund', 'v1.10.0 2026-10_관세환급');
  // 순서 — 「수입FTA」에도 「수입」 · 「실적」이 들어 있다. 「오류」가 맨 앞
  eq([d('2026-10_수입FTA.xlsx').group, d('2026-10_수입FTA실적.xlsx').group, d('2026-10_수입오류_FTA.xlsx').group, d('2026-10_환급실적.xlsx').group, d('2026_결정문실적.xlsx').group], ['fta', 'fta', 'errscore', 'refund', 'ruling'], 'v1.10.0 이름 검사 순서 오류 → FTA → 환급 → 결정문 → 실적');
  eq([d('2026-10_수입FTA.xlsx').dataset, d('2026-10_수입FTA.xlsx').label, d('2026-10_수출FTA.xlsx').dataset], ['ftaImport', '수입 FTA', 'ftaExport'], 'v1.10.0 → v2.1.0 수입 FTA 는 자기 탭(수입실적 합계에 넣지 않음) · v2.4.0 수출 FTA 도 자기 탭(ftaExport)');
  eq([d('2026-10_수출입실적.xlsx').io, d('2026-10_수출입실적.xlsx', 'export').dataset], [null, 'export'], 'v1.10.0 「수출입」은 이름으로 가르지 않고 내용으로');
  // 6) 이름에 아무것도 없으면 내용 판별(이름을 바꾸지 않은 옛 파일)
  eq([d('예제_통관(가상).xlsx', 'import').dataset, d('예제_통관(가상).xlsx', 'import').how, d('예제_통관(가상).xlsx', 'import').mode], ['import', '내용', 'confirmed'], 'v1.10.0 이름 규칙에 안 걸리면 내용 판별 · 확정본');
  eq(d('예제_통관(가상).xlsx', null).warnings, ['종류를 판별하지 못함'], 'v1.10.0 이름 · 내용 모두 모르면 경고');
  // [2] 일곱 형태 — 긴 것부터
  function pt(n) { var p = FR.periodOfName(n); return p ? [p.type, p.text, p.from, p.to, p.months.length, p.confirmed] : null; }
  eq(pt('2026-10-25~2026-11-05_수입실적'), [1, '2026-10-25~2026-11-05', '2026-10-25', '2026-11-05', 2, false], 'v1.10.0 (1) 일자~일자 = 조회용');
  eq(pt('2026-11-01~18_수입실적'), [2, '2026-11-01~18', '2026-11-01', '2026-11-18', 1, false], 'v1.10.0 (2) 「2026-11-01~18」이 (3) · (6)에 먼저 걸리지 않음');
  eq(pt('2026-11-18_수입실적'), [3, '2026-11-18', '2026-11-18', '2026-11-18', 1, false], 'v1.10.0 (3) 일자 = 조회용');
  eq(pt('2026-11~2027-02_수입실적'), [4, '2026-11~2027-02', '2026-11-01', '2027-02-28', 4, true], 'v1.10.0 (4) 월~월(해 넘김)');
  eq(pt('2026-01~10_수입실적'), [5, '2026-01~10', '2026-01-01', '2026-10-31', 10, true], 'v1.10.0 (5) 월~월');
  eq(pt('2026-10_수입실적'), [6, '2026-10', '2026-10-01', '2026-10-31', 1, true], 'v1.10.0 (6) 월');
  eq(pt('2026_수입실적'), [7, '2026', '2026-01-01', '2026-12-31', 12, true], 'v1.10.0 (7) 연');
  eq([pt('수입실적'), pt('EXPORT-수입 (1)'), pt('EXPORT-수입 (12)')], [null, null, null], 'v1.10.0 기간 없음 · 「(1)」은 기간이 아님');
  // 한 달 전체를 덮는 일자 범위 → 확정본(말일은 연월로 계산, 윤년)
  var P = function (n) { var p = FR.periodOfName(n); return [p.confirmed, p.single, p.promoted]; };
  eq([P('2026-11-01~30_수입실적'), P('2026-11-01~29_수입실적')], [[true, '2026-11', true], [false, null, false]], 'v1.10.0 2026-11-01~30 = 11월 확정본 · ~29 = 조회용');
  eq([P('2026-02-01~28_수입실적')[0], P('2028-02-01~28_수입실적')[0], P('2028-02-01~29_수입실적')[0]], [true, false, true], 'v1.10.0 2월 말일 — 2026 은 28일, 2028(윤년)은 29일');
  eq([FR.lastDay(2026, 2), FR.lastDay(2028, 2), FR.lastDay(2100, 2), FR.lastDay(2000, 2)], [28, 29, 28, 29], 'v1.10.0 말일 계산(윤년 규칙)');
  eq([d('2026-11-01~30_수출실적.xlsx').rule, d('2026-11-01~30_수출실적.xlsx').forceMonth], ['A', '2026-11'], 'v1.10.0 한 달 전체 일자 범위는 단일 월(A)');
  // 조회용 / 확정본
  eq([d('2026-11-01~18_수입실적.xlsx').mode, d('2026-11-18_수입실적.xlsx').mode, d('2026-10-25~2026-11-05_수입실적.xlsx').mode], ['view', 'view', 'view'], 'v1.10.0 일자 · 일부 일자 범위 = 조회용');
  // 환급 · 오류점수 · 결정문은 늘 확정본
  eq([d('2026-11-01~18_관세환급.xlsx').mode, d('2026-11-18_수입오류_현황목록.xlsx').mode, d('2026-11-18_품목분류결정문.xlsx').mode], ['confirmed', 'confirmed', 'confirmed'], 'v1.10.0 환급 · 오류점수 · 결정문은 조회용 판정 없음');
  // [2-1] EXPORT
  var ex = d('EXPORT-수입.XLSX', 'import');
  eq([ex.mode, ex.dataset, ex.how, ex.period, ex.warnings], ['view', 'import', '내용(ERP 원본 이름)', null, []], 'v1.10.0 EXPORT · 기간 없음 = 조회용 · 종류는 내용');
  eq(d('EXPORT-수입.XLSX', 'export').warnings, ['파일명은 수입인데 내용은 수출로 보입니다. 확인이 필요합니다.'], 'v1.10.0 EXPORT 이름 수입 · 내용 수출 → 경고');
  eq([d('EXPORT-수입 (1).XLSX', 'import').mode, d('EXPORT-수입FTA.XLSX', 'import').group, d('EXPORT-수입FTA.XLSX', 'import').mode], ['view', 'fta', 'view'], 'v1.10.0 EXPORT (1) · EXPORT 수입FTA');
  eq(brief(d('2026-10_수입실적_EXPORT.XLSX')), ['수입 실적', 'import', 6, '2026-10', 'confirmed', 'A', '2026-10'], 'v1.10.0 EXPORT 가 있어도 기간이 있으면 기간 판정(월 확정본)');
  // 조회 모드 문구
  eq(FR.viewBanner(d('2026-11-01~18_수입실적.xlsx')), '조회 모드 · 2026-11-01~18 · 저장되지 않습니다', 'v1.10.0 조회 모드 문구(파일 이름 기간)');
  eq(FR.viewBanner(ex, { from: '2026-11-01', to: '2026-11-18', rows: 1247 }), '조회 모드 · 2026-11-01 ~ 2026-11-18 (데이터 기준) · 1,247행 · 저장되지 않습니다', 'v1.10.0 조회 모드 문구(EXPORT · 데이터 기준)');
  has(FR.keepHint(ex), '2026-10_수입실적.xlsx 형식으로 이름을 바꿔 다시 올리거나, [이 결과를 저장] 을 누르세요.', 'v1.10.0 보관 안내 문구');
  // [3] 날짜 열 · 기준 문구
  eq([FR.DATE_COL.import, FR.DATE_COL.export, FR.BASIS_TEXT], ['Acceptance date', 'Declaration Date', '수입: 수리일자 기준 / 수출: 신고일자 기준'], 'v1.10.0 수입 수리일자 · 수출 신고일자');
  eq([d('2026-10_수입오류_상세목록.xlsx').rule, d('2026년수입귀책사유자별오류현황및상세목록.xlsx').rule], ['A', 'C'], 'v1.10.0 오류점수 월 = 파일 이름, 없으면 시트 이름');
  eq([d('2026-10_관세환급.xlsx').rule, d('2026-10_관세환급.xlsx').forceMonth], ['A', null], 'v1.10.0 환급은 파일 이름 월을 표시만(행 날짜 그대로)');
  // [6] 기간 겹침
  var a9 = { name: '2026-01~09_수입실적', dataset: 'import', months: FR.periodOfName('2026-01~09').months }, a10 = { name: '2026-01~10_수입실적', dataset: 'import', months: FR.periodOfName('2026-01~10').months };
  eq([FR.overlapsWith(a10, [a9]).length, FR.overlapsWith(a10, [{ name: 'x', dataset: 'export', months: a9.months }]).length, FR.overlapsWith(a10, [{ name: 'y', dataset: 'import', months: ['2026-11'] }]).length], [1, 0, 0], 'v1.10.0 같은 종류 · 겹치는 월만 겹침');

  // [3] A — 단일 월 파일은 파일 전체를 그 월로(날짜 빈 행 포함), 다른 달 행은 표시
  var IM = C2.sampleImportErp().aoa, di = IM[0].indexOf('Acceptance date');
  var blank = IM.map(function (r, i) { return i === 3 ? r.map(function (c, j) { return j === di ? '' : c; }) : r; });
  var fA = { name: '2026-01_수입실적(가상).xlsx', file: '2026-01_수입실적(가상).xlsx', headers: C2.uniqueHeaders(blank[0]), aoa: blank, offset: 0, override: {}, meta: d('2026-01_수입실적(가상).xlsx') };
  var mA = C2.mergeFiles('import', [fA], C2.exportSettings(null)), dt = mA.files[0].dates;
  eq([mA.records.length, mA.records.every(function (r) { return r.month === '2026-01'; }), dt.noDate, dt.outside, dt.dateBlank, dt.dateHeader], [9, true, 1, 4, 0, 'Acceptance date'], 'v1.10.0 A — 2026-01 파일 9줄 모두 1월 · 날짜 빈 행 1 · 2월 날짜 4');
  var fB = { name: '2026-01~02_수입실적(가상).xlsx', file: 'b', headers: fA.headers, aoa: blank, offset: 0, override: {}, meta: d('2026-01~02_수입실적(가상).xlsx') };
  var mB = C2.mergeFiles('import', [fB], C2.exportSettings(null)), dB = mB.files[0].dates;
  eq([mB.records.length, dB.noDate, dB.dateBlank, dB.outside, dB.from, dB.to], [8, 0, 1, 0, '2026-01-08', '2026-02-20'], 'v1.10.0 B — 범위 파일은 행 날짜 · 날짜 빈 행 = 월 미지정 1');
  var fC = { name: '2025-12_수입실적(가상).xlsx', file: 'c', headers: fA.headers, aoa: IM, offset: 0, override: {}, meta: d('2025-12_수입실적(가상).xlsx') };
  eq(C2.mergeFiles('import', [fC], C2.exportSettings(null)).files[0].dates.outside, 9, 'v1.10.0 파일명 기간(2025-12)을 벗어난 행 9');
  var fN = { name: 'n', file: 'n', headers: fA.headers, aoa: blank, offset: 0, override: {} };
  eq(C2.mergeFiles('import', [fN], C2.exportSettings(null)).records.length, 8, 'v1.10.0 판별 정보가 없으면 예전처럼(날짜 빈 줄은 건너뜀)');
  eq(C2.migrateSaved({ sets: { import: { files: [fA] } } }).sets.import.files[0].meta.rule, 'A', 'v1.10.0 기억한 파일에 판별 정보 보관');

  // [4] 영문 섞인 신고번호
  var p1 = ES2.parseDeclNo('2235626B17742M');
  eq([p1.no, p1.broker, p1.year, p1.seq, p1.kind], ['2235626B17742M', '22356', 2026, 'B17742', '수입'], 'v1.10.0 2235626B17742M 읽음(일련번호 B17742)');
  eq([ES2.parseDeclNo('22356-26-A06211-X').no, ES2.parseDeclNo('22356-26-A06211-X').kind, ES2.parseDeclNo(' 2235626b17742m ').no], ['2235626A06211X', '수출', '2235626B17742M'], 'v1.10.0 공백 · 하이픈만 지우고 대문자 — 영문 그대로');
  eq([ES2.parseDeclNo('2235626B17742B').kind, ES2.parseDeclNo('2235626B17742B').bonded], ['수입', true], 'v1.10.0 끝 글자 B = 보세공장(수입)');
  eq([ES2.parseDeclNo('4390826000001M').seq, ES2.parseDeclNo('43908260000012').seq, ES2.parseDeclNo('12345'), ES2.parseDeclNo('2235626B17742M').no === ES2.parseDeclNo('2235626017742M').no], ['000001', '0000012', null, false], 'v1.10.0 숫자 번호는 그대로 · 영문 번호가 숫자 번호와 섞이지 않음');
  // [5] 현황목록만 / 상세목록만 / 둘 다 — 월은 파일 이름(정정일자 아님)
  var SH = ['No', '귀책사유자부호', '귀책사유자상호', '관할지세관부호', '관할지세관', '총신고건', '오류점수', '비율'];
  var DH = ['No', '귀책사유자부호', '신고번호', '란번호', '정정일자 및 시간', '수리구분', '정정구분', '항목코드', '항목명', '오류점수', '변경 후 오류점수', '정정전내역', '정정후내역'];
  var st = ES2.readWorkbook([{ name: '귀책사유자별오류현황목록', aoa: [SH, [1, '(가상)', '(가상)(주)', '012', '세관', 2234, 69, 3]] }], '2026-10_수출오류_현황목록(가상).xlsx');
  eq([st.kind, st.rows.length, st.hasStatus, st.status[10].total, st.status[10].score, st.fileMonth], ['수출', 0, true, 2234, 69, 10], 'v1.10.0 현황목록만 있어도 받음(총신고건 · 총 오류점수)');
  has(st.notes.join(' '), '현황목록(총신고건 · 총 오류점수)만 읽었습니다', 'v1.10.0 현황목록만 — 알림');
  var dtl = ES2.readWorkbook([{ name: '귀책사유자별오류상세목록', aoa: [DH, [1, '(가상)', '4390826A00001X', 0, '2026-09-30  10:00:00', '수리후', '정정', 'A1', '(가상)', 40, 40, '', ''], [2, '(가상)', '1111126000002X', 0, '2026-09-30  11:00:00', '수리후', '정정', 'A1', '(가상)', 20, 20, '', ''], ['', '', '', '', '', '', '', '', '', 60, 60, '', '']] }], '2026-10_수출오류_상세목록(가상).xlsx');
  eq([dtl.rows.length, dtl.totalRows, dtl.skipped, dtl.months, dtl.rows[0].month, dtl.rows[0].campus], [2, 1, 0, [10], 10, '울산'], 'v1.10.0 상세 — 월은 파일 이름(정정일자 9월이 아니라 10월) · 합계 줄 제외');
  var imp = ES2.readWorkbook([{ name: '귀책사유자별오류상세목록', aoa: [DH, [1, '(가상)', '2235626B17742M', 0, '2026-10-01  13:54:31', '수리전', '정정', 'A801', '(가상)', 0, 0, '', '']] }], '2026-10_수입오류_상세목록(가상).xlsx');
  eq([imp.kind, imp.rows.length, imp.rows[0].declNo, imp.skipped], ['수입', 1, '2235626B17742M', 0], 'v1.10.0 2235626B17742M 이 집계에 들어감');
  var impSt = ES2.readWorkbook([{ name: '귀책사유자별오류현황목록', aoa: [SH, [1, '(가상)', '(가상)', '012', '세관', 1740, 0, 0]] }], '2026-10_수입오류_현황목록(가상).xlsx');
  var books = [st, dtl, imp, impSt], S = ES2.summarize(books, ES2.countsFromBooks(books), {});
  eq([S.kinds.수출.months[10].종합.decl, S.kinds.수출.months[10].종합.score, S.kinds.수출.months[10].종합.rate, S.kinds.수입.months[10].종합.err, S.total[10].종합.decl], [2234, 60, 2.69, 1, 3974], 'v1.10.0 현황(분모) + 상세(점수)를 다른 파일에서 함께 씀');
  eq(ES2.statusCheck(books), [{ kind: '수입', month: 10, detail: 0, status: 0, diff: 0 }, { kind: '수출', month: 10, detail: 60, status: 69, diff: -9 }], 'v1.10.0 현황 총 오류점수 ↔ 상세 합계 차액(수출 -9)');
  var nm = ES2.readWorkbook([{ name: '귀책사유자별오류상세목록', aoa: [DH, [1, '(가상)', '4390826A00001X', 0, '2026-09-30  10:00:00', '', '', '', '', 5, 5, '', '']] }], '수출오류_상세(가상).xlsx');
  eq([nm.rows[0].month, nm.noMonth], [null, 1], 'v1.10.0 파일 이름 · 시트 이름에 월이 없으면 월 미지정(정정일자로 짐작하지 않음)');
  has(nm.notes.join(' '), '월 미지정 1줄', 'v1.10.0 월 미지정 알림');
  // [10] 분모가 없으면 비율 null(화면 「자료 없음」)
  eq([S.kinds.수출.months[10].인천.rate, S.kinds.수출.months[10].울산.rate], [null, null], 'v1.10.0 분모 없으면 비율 없음');
  // 화면 연결
  var html = fsx.readFileSync(__dirname + '/../dashboard.html', 'utf8'), eh = fsx.readFileSync(__dirname + '/../errors.html', 'utf8');
  ok(html.indexOf('<script src="js/filerules.js">') > html.indexOf('<script src="js/customs.js">') && html.indexOf('id="d-viewbar"') > 0 && eh.indexOf('<script src="js/filerules.js">') < eh.indexOf('<script src="js/errscore.js">'), 'v1.10.0 두 화면에 filerules.js');
  var dj = fsx.readFileSync(__dirname + '/../js/dash.js', 'utf8'), ej = fsx.readFileSync(__dirname + '/../js/errors.js', 'utf8');
  ok(/'자료 없음'/.test(dj) && /'자료 없음'/.test(ej), 'v1.10.0 오류 비율 분모 없으면 「자료 없음」');
  // (v1.10.1) 전사 오류비율 = 수출입 합계(기획자 결정 2026-11-19) — 분모 = 수입 + 수출 현황목록 총신고건
  var corpEx = ES2.readWorkbook([{ name: '귀책사유자별오류현황목록', aoa: [SH, [1, '(가상)', '(가상)', '012', '세관', 2234, 69, 3]] }], '2026-10_수출오류_현황목록(가상).xlsx');
  // 점수는 상세목록(가짜 60점), 분모는 현황목록 — 수출 2,234 + 수입 1,740 = 3,974
  var SC = ES2.summarize([corpEx, dtl, impSt, imp], {}, {});
  eq([SC.total[10].종합.decl, SC.total[10].종합.score, SC.total[10].종합.rate], [3974, 60, 1.51], 'v1.10.1 전사 = 수출입 합계(3,974건 · 60점 · 1.51%)');
  var half = ES2.summarize([corpEx, dtl], {}, {});
  eq([half.total[10].종합.decl, half.total[10].종합.rate, half.kinds.수출.months[10].종합.rate], [null, null, 2.69], 'v1.10.1 수입 현황목록이 없으면 전사 비율 자료 없음(수출 줄은 2.69%)');
  ok(/전사 오류비율/.test(ej) && /수출입 합계/.test(ej), 'v1.10.1 오류점수 화면에 전사(수출입 합계) 카드');
  // (v1.10.2) 집계표 이름은 힌트 — 데이터 시트 이름이 우연히 「종합」이어도 열 구성으로 고른다
  var RUL = C2.sampleFiles().filter(function (f) { return /결정문/.test(f.name); })[0].aoa;
  var GUIDE = [['안내'], ['이 파일은 (가상) 예제입니다'], ['문의: (가상) 담당자']];
  var pr = C2.pickSheets([{ name: '종합', aoa: RUL, offset: 0 }, { name: '안내', aoa: GUIDE, offset: 0 }], '2026_품목분류결정문(가상).xlsx');
  eq([pr.use.map(function (s) { return s.name; }), pr.skipped, pr.detect.kind, pr.promoted], [['종합'], [{ name: '안내', why: '열 구성이 다름' }], 'ruling', ['종합']], 'v1.10.2 결정문 파일(종합 + 안내) — 「종합」을 데이터로, 「안내」는 건너뜀');
  var pr2 = C2.pickSheets([{ name: '종합', aoa: RUL, offset: 0 }, { name: '결정문목록', aoa: RUL, offset: 0 }], '결정문(가상).xlsx');
  eq([pr2.use.map(function (s) { return s.name; }), pr2.skipped, pr2.promoted], [['결정문목록'], [{ name: '종합', why: '집계표' }], []], 'v1.10.2 이름이 아닌 시트가 필수 열을 다 갖추면 집계표 이름 시트를 끌어오지 않음');
  var pr3 = C2.pickSheets([{ name: '종합', aoa: GUIDE, offset: 0 }, { name: '안내', aoa: GUIDE.concat([['(가상)']]), offset: 0 }], 'x(가상).xlsx');
  eq([pr3.use.map(function (s) { return s.name; }), pr3.skipped, pr3.detect.kind, pr3.promoted], [['안내'], [{ name: '종합', why: '집계표' }], null, []], 'v1.10.2 다시 골라도 나아지지 않으면 처음 결과 그대로');
  eq(C2.skippedSheetNote(pr3.skipped), "(참고: 시트 '종합' 을 집계표로 보고 건너뛰었습니다. 이 시트가 데이터라면 시트 이름을 바꾸거나 아래에서 직접 골라 주세요)", 'v1.10.2 열을 못 찾을 때 덧붙일 참고 문구');
  eq([C2.skippedSheetNote(pr.skipped), C2.skippedSheetNote([])], ['', ''], 'v1.10.2 집계표로 건너뛴 시트가 없으면 참고 문구 없음');
  var mres = C2.mergeFiles('ruling', [{ name: 'r', file: 'r', headers: C2.uniqueHeaders(pr.use[0].aoa[0]), aoa: pr.use[0].aoa, offset: 0, override: {}, skippedSheets: pr.skipped, promotedSheets: pr.promoted }]);
  eq([mres.ok, mres.records.length > 0, C2.migrateSaved({ sets: { ruling: { files: [{ name: 'r', file: 'r', headers: ['a'], aoa: [['a'], [1]], promotedSheets: ['종합'] }] } } }).sets.ruling.files[0].promotedSheets], [true, true, ['종합']], 'v1.10.2 「종합」 시트로 결정문 집계 · 기억할 때 보관');
  ok(/C\.skippedSheetNote\(f\.skippedSheets\)/.test(dj) && /C\.skippedSheetNote\(item\.skippedSheets\)/.test(dj) && /data-k="promoted-sheets"/.test(dj), 'v1.10.2 화면 — 열 못 찾음 · 종류 고르기 안내에 참고 문구, 파일 목록에 열 구성으로 읽은 시트');
  // (v1.10.3) 유니패스 연 단위 파일(1~12월 시트) — 시트 이름 끝 공백 · 열 위치 밀림 · 표 두 개 · 소계 줄 · 빈 줄 · 연도는 요약 A1
  function drow(no, decl, score, fixed) { return [no, '(가상)', decl, 0, fixed || '2025-12-30  10:00:00', '수리후', '정정', 'A1', '(가상)', score, score, '', '']; }
  var BLANK13 = ['', '', '', '', '', '', '', '', '', '', '', '', ''];
  var two = [DH.concat(['']).concat(DH)].concat([
    drow(1, '4390826A00001X', 10).concat(['']).concat(drow(1, '4390826A00001X', 99)),
    drow(2, '1111126000002X', 5).concat(['']).concat(drow(2, '1111126000002X', 99)),
    BLANK13.concat(['']).concat(drow(3, '1111126000003X', 99)),                               // 오른쪽 작업 영역에만 있는 줄
    BLANK13,                                                                                    // 빈 줄
    ['', '', '', '', '', '', '', '', '', '인천CAM', 33, '', '']                                 // 팀 소계 줄(점수가 옆 칸)
  ]);
  var plantDH = DH.slice(0, 3).concat(['PLANT']).concat(DH.slice(3));                            // 열 위치 밀림(PLANT 끼움)
  var plantRow = drow(1, '2235626B17742X', 7); plantRow.splice(3, 0, '1000');
  var yb = ES2.readWorkbook([
    { name: '요약', aoa: [['▣2026년 수출오류점수 현황(가상)'], ['구분', '1월']] },
    { name: '귀책사유자별오류현황목록_6월 ', aoa: [SH, [1, '(가상)', '(가상)', '012', '세관', 2331, 15, 0.6]] },
    { name: '귀책사유자별오류상세목록_6월 ', aoa: two },
    { name: '귀책사유자별오류상세목록_5월', aoa: [plantDH, plantRow] }
  ], '2026년수출귀책사유자별오류현황및상세목록(가상).xlsx');
  var r6 = yb.rows.filter(function (r) { return r.month === 6; }), r5 = yb.rows.filter(function (r) { return r.month === 5; });
  eq([yb.kind, yb.year, yb.summaryYear, Object.keys(yb.status), r6.length, r6.map(function (r) { return r.score; }), yb.skipped], ['수출', 2026, 2026, ['6'], 2, [10, 5], 0], 'v1.10.3 끝 공백 시트 이름 · 왼쪽 표만(오른쪽 99점 안 읽음) · 읽지 못한 줄 0');
  eq([r6[0].year, r5.length, r5[0].score, r5[0].declNo], [2026, 1, 7, '2235626B17742X'], 'v1.10.3 연도는 요약 A1(정정일자 2025 아님) · PLANT 로 밀린 열도 머리글 이름으로');
  var p6 = yb.perSheet.filter(function (p) { return p.month === 6; })[0];
  eq([p6.sheetRows, p6.rows, p6.blank, p6.totalRows, p6.skipped, p6.cutAt, p6.sheet], [5, 2, 2, 1, 0, 14, '귀책사유자별오류상세목록_6월'], 'v1.10.3 시트 행 = 정정 줄 + 빈 줄(오른쪽만 있는 줄 포함) + 소계 줄 · 15번째 열부터 무시 · 이름 trim');
  has(yb.notes.join(' '), '귀책사유자별오류상세목록_6월: 오른쪽 작업 영역(15번째 열부터)은 같은 머리글이 다시 나와 읽지 않았습니다', 'v1.10.3 오른쪽 작업 영역 알림');
  eq(ES2.statusCheck([yb]), [{ kind: '수출', month: 6, detail: 15, status: 15, diff: 0 }], 'v1.10.3 왼쪽 표만 읽어 현황 = 상세(오른쪽을 읽었으면 차액)');
  var nb = ES2.readWorkbook([{ name: '귀책사유자별오류상세목록_6월', aoa: [DH, drow(1, '4390826A00001X', 3)] }], '2026년수출(가상).xlsx');
  eq([nb.year, nb.summaryYear, nb.rows[0].year], [null, null, 2025], 'v1.10.3 요약 시트가 없으면 예전처럼(정정일자 연도)');
  ok(/b\.blankRows/.test(ej) && /b\.sheetRows/.test(ej), 'v1.10.3 오류점수 화면 목록에 빈 줄 · 시트 행 수');
}
// ---------- v1.11.0 오류점수 지역(인천 · 울산) · 본부(PLANT) ----------
function v1110() {
  var ES = require('../js/errscore.js'), C3 = require('../js/customs.js');
  // [1] 지역 표 — 신고인부호
  eq(ES.normRule(null), { ulsan: ['43908', '44924', '44788'], incheon: ['22356', '22371', '42158', '15553'] }, 'v1.11.0 기본 지역 표');
  eq(ES.normRule({ ulsan: ['43908', '12345'] }), { ulsan: ['43908', '44924', '44788', '12345'], incheon: ['22356', '22371', '42158', '15553'] }, 'v1.11.0 예전 저장값({ ulsan }) → 새 기본 표 + 예전에 고른 울산 부호');
  eq(ES.normRule({ ulsan: ['44924'], incheon: ['44924', '22356', 'x'] }), { ulsan: ['44924'], incheon: ['22356'] }, 'v1.11.0 새 형식 그대로(겹치면 울산 · 5자리만)');
  eq(['4390826000001X', '4492426000001X', '4478826000001M', '2235626B17742M', '2237126000001X', '4215826000001X', '1555326000001M', '9999926000001X'].map(function (d) { return ES.campusOf(d); }),
    ['울산', '울산', '울산', '인천', '인천', '인천', '인천', '미분류'], 'v1.11.0 지역 = 신고번호 앞 5자리 · 표에 없으면 지역 미분류(인천으로 넣지 않음)');
  eq(ES.campusOf('9999926000001X', { ulsan: [], incheon: ['99999'] }), '인천', 'v1.11.0 설정에서 고친 표를 씀');
  // [2] 오류점수 · 오류건수 · 점수 발생 건수 / 지역 미분류
  var SH = ['No', '귀책사유자부호', '귀책사유자상호', '관할지세관부호', '관할지세관', '총신고건', '오류점수', '비율'];
  var DH = ['No', '귀책사유자부호', '신고번호', '란번호', '정정일자 및 시간', '수리구분', '정정구분', '항목코드', '항목명', '오류점수', '변경 후 오류점수', '정정전내역', '정정후내역'];
  function dr(no, decl, score, after) { return [no, '(가상)', decl, 0, '2026-10-01  10:00:00', '수리후', '정정', 'A1', '(가상)', score, after == null ? score : after, '', '']; }
  var ex = ES.readWorkbook([
    { name: '요약', aoa: [['▣2026년 수출오류점수 현황(가상)'], ['구분', '10월'], ['', '건수', '오류건수', '오류점수', '비율'], ['종합', 2234, 13, 69, 3.1], ['인천', 1522, 3, 40, 2.6], ['울산', 712, 10, 29, 4.1]] },
    { name: '귀책사유자별오류현황목록_10월 ', aoa: [SH, [1, '(가상)', '(가상)', '012', '세관', 2234, 69, 3]] },
    { name: '귀책사유자별오류상세목록_10월', aoa: [DH, dr(1, '2237126813391X', 16, 99), dr(2, '4215826106228X', 24), dr(3, '4215826106148X', 0), dr(4, '4390826009114X', 21), dr(5, '4390826009552X', 8), dr(6, '4390826009995X', 0)] }
  ], '2026년수출(가상).xlsx');
  var S0 = ES.summarize([ex], { 수출: { 10: 1479 } }, {}), m0 = S0.kinds.수출.months[10];
  eq([m0.인천.decl, m0.인천.err, m0.인천.scored, m0.인천.score, m0.울산.decl, m0.울산.err, m0.울산.scored, m0.울산.score, m0.종합.rate], [1479, 3, 2, 40, 755, 3, 2, 29, 3.09], 'v1.11.0 인천 1479건 · 3건(점수 발생 2) · 40점(「오류점수」 열 — 변경 후 99 아님) / 울산 755건 · 29점');
  var exU = ES.readWorkbook([{ name: '귀책사유자별오류상세목록_10월', aoa: [DH, dr(1, '2237126813391X', 16), dr(2, '9999926000001X', 5)] }, { name: '귀책사유자별오류현황목록_10월', aoa: [SH, [1, '', '', '', '', 100, 21, 0]] }], '2026년수출(가상).xlsx');
  var SU = ES.summarize([exU], { 수출: { 10: 60 } }, {}), mu = SU.kinds.수출.months[10];
  eq([mu.종합.score, mu.인천.score, mu.울산.score, mu.미분류.err, mu.미분류.score, SU.total[10].미분류.score], [21, 16, 0, 1, 5, 5], 'v1.11.0 지역 미분류 — 종합에는 넣고 인천 · 울산에는 안 넣음');
  // [3] 인천 분모 = ERP 신고번호 고유 개수(GN 포함) · countsNoGN 은 대조용
  var erp = { 수출: [
    { declNo: '22371-26-813391X', month: '2026-10', hq: '건기본부', plant: '1000', payment: 'LU' },
    { declNo: '2237126813391X', month: '2026-10', hq: '건기본부', plant: '1000', payment: 'LU' },   // 같은 신고 둘째 줄
    { declNo: '4215826106228X', month: '2026-10', hq: '부품센터', plant: '6000', payment: 'GN' },
    { declNo: '4215826106148X', month: '2026-10', hq: '부품센터', plant: '6000', payment: 'TT' },
    { declNo: '2235626000777X', month: '2026-10', hq: '본부 미분류', plant: '', payment: 'GN' },
    { declNo: '2235626000888X', month: '2025-10', hq: '건기본부', plant: '1000', payment: 'TT' }      // 다른 해
  ], 수입: [{ declNo: '2235626B17742M', month: '2026-09', hq: '엔진본부', plant: '1130', payment: 'GN' }] };
  var es = ES.erpSummary(erp, 2026);
  eq([es.counts.수출[10], es.countsNoGN.수출[10], es.byHq.수출[10], es.counts.수입[9], es.index['2235626B17742M'].hq], [4, 2, { 건기본부: 1, 부품센터: 2, 'Plant 없음': 1 }, 1, '엔진본부'], 'v1.11.0 ERP 분모 — 신고번호 고유 개수(같은 신고 둘째 줄 한 번) · GN 포함 · 다른 해 제외 · 본부별(v2.0.0 Plant 빈 건 = Plant 없음)');
  var it = { name: 'e', file: 'e', headers: C3.uniqueHeaders(C3.sampleImportErp().aoa[0]), aoa: C3.sampleImportErp().aoa, offset: 0, override: {} };
  var setOn = C3.exportSettings({ excludeGN: true }), setOff = C3.exportSettings(null); setOff.excludeGN = false;
  var withGN = C3.mergeFiles('import', [it], setOff).records, noGN = C3.mergeFiles('import', [it], setOn).records;
  ok(withGN.length === noGN.length + 1 && withGN.some(function (r) { return String(r.payment).toUpperCase() === 'GN'; }), 'v1.11.0 ERP 를 GN 포함으로 읽으면 GN 줄이 분모에 들어감');
  var ej = fsx.readFileSync(__dirname + '/../js/errors.js', 'utf8');
  ok(/o\.excludeGN = false/.test(ej) && /b2611-07\.dash\.settings/.test(ej), 'v1.11.0 오류점수 화면은 실적 탭 설정을 읽어도 GN 제외는 늘 끔(분모 고정)');
  // [4] 본부 — 인천은 ERP 조인(월 무관), 못 찾으면 본부 미분류, 울산은 전량 건기본부
  var H = ES.hqBreakdown(S0, [ex], es), by = {}; H.kinds.수출[10].forEach(function (x) { by[x.region + '|' + x.hq] = x; });
  eq([by['인천|건기본부'].err, by['인천|건기본부'].score, by['인천|건기본부'].decl, by['인천|부품센터'].err, by['인천|부품센터'].score, by['인천|부품센터'].decl, by['인천|Plant 없음'].decl, by['인천|Plant 없음'].err, by['울산|건기본부'].err, by['울산|건기본부'].score, by['울산|건기본부'].decl],
    [1, 16, 1, 2, 24, 2, 1, 0, 3, 29, 755], 'v1.11.0 → v2.0.0 본부 — 지역별 줄(인천 건기 16 · 부품센터 24 + 0 · Plant 없음 분모만 / 울산 건기본부 29점 · 분모 755)');
  eq(H.ulsanNote, '울산은 세부 자료가 없어 전량 건기본부로 집계', 'v1.11.0 울산 표기 문구');
  var H2 = ES.hqBreakdown(S0, [ex], ES.erpSummary({ 수출: [] }, 2026)), b2 = {}; H2.kinds.수출[10].forEach(function (x) { b2[x.region + '|' + x.hq] = x; });
  eq([b2['인천|ERP 미매칭'].err, b2['인천|ERP 미매칭'].score, b2['인천|ERP 미매칭'].decl, b2['인천|ERP 미매칭'].rate, H2.notFound.length, H2.uncovered], [3, 40, null, null, 0, [{ kind: '수출', month: 10 }]], 'v2.0.0 ERP 실적이 없는 달 — 인천 건은 ERP 미매칭(분자에만 · 비율 없음, 못 찾음 목록과 구분)');
  var es3 = ES.erpSummary({ 수출: erp.수출.filter(function (r) { return !/813391/.test(r.declNo); }) }, 2026), H3 = ES.hqBreakdown(S0, [ex], es3), b3 = {}; H3.kinds.수출[10].forEach(function (x) { b3[x.region + '|' + x.hq] = x; });
  eq([b3['인천|ERP 미매칭'].err, b3['인천|ERP 미매칭'].score, b3['인천|ERP 미매칭'].decl, H3.notFound], [1, 16, null, [{ kind: '수출', month: 10, declNo: '2237126813391X' }]], 'v2.0.0 ERP 가 있는 달에 신고번호를 못 찾은 인천 건 = ERP 미매칭(분모 없음) · 목록으로 알림');
  var HU = ES.hqBreakdown(SU, [exU], es), bu = HU.kinds.수출[10].filter(function (x) { return x.region === '지역 미분류'; })[0];
  eq([bu.err, bu.score, bu.decl, bu.hq], [1, 5, null, null], 'v1.11.0 지역 미분류 건은 본부에서도 따로');
  // [6] 검증
  var ck = ES.regionChecks(S0, [ex], es), f = function (src, item) { return ck.filter(function (c) { return c.source === src && c.item === item; })[0]; };
  eq([f('계산', '신고건수').ok, f('계산', '신고건수').sum, f('계산', '오류점수').ok, f('요약 시트', '신고건수').sum, f('요약 시트', '신고건수').ok], [true, 2234, true, 2234, true], 'v1.11.0 인천 + 울산 = 현황목록(계산 · 요약 시트)');
  var hx = f('요약 시트 ↔ ERP', '인천 신고건수(GN 제외)');
  eq([hx.incheon, hx.expect, hx.diff, hx.ok], [1522, 2, 1520, false], 'v1.11.0 요약 시트 인천(1522)을 ERP 인천(GN 제외)과 대조 — 수기 입력 오류를 잡음');
  var cu = ES.regionChecks(SU, [exU], null).filter(function (c) { return c.item === '오류점수'; })[0];
  eq([cu.ok, cu.diff, cu.unregion], [false, -5, 5], 'v1.11.0 지역 미분류 점수가 있으면 인천 + 울산 ≠ 현황 오류점수 → 경고');
  var neg = ES.summarize([ex], { 수출: { 10: 3000 } }, {});
  eq(ES.regionChecks(neg, [ex], null).filter(function (c) { return c.source === '계산' && c.item === '신고건수'; })[0].ok, false, 'v1.11.0 인천 건수가 총신고건보다 크면(울산 음수) 경고');
  // 화면 연결
  var eh = fsx.readFileSync(__dirname + '/../errors.html', 'utf8');
  ok(eh.indexOf('<script src="js/customs.js">') > 0 && eh.indexOf('<script src="js/customs.js">') < eh.indexOf('<script src="js/errscore.js">') && /id="e-checks"/.test(eh) && /id="e-hq"/.test(eh), 'v1.11.0 오류점수 화면 — customs.js · 검증 · 본부별 자리');
  ok(/점수 발생 건수/.test(ej) && /지역 미분류/.test(ej) && /H\.ulsanNote/.test(ej) && /setRegion/.test(ej), 'v1.11.0 화면 — 점수 발생 건수 · 지역 미분류 · 울산 표기 · 지역 고치기');
}
// ---------- v1.12.0 인천 오류건 관리대장 ----------
function v1120() {
  var ES = require('../js/errscore.js');
  var DH = ['No', '귀책사유자부호', '신고번호', '란번호', '정정일자 및 시간', '수리구분', '정정구분', '항목코드', '항목명', '오류점수', '변경 후 오류점수', '정정전내역', '정정후내역'];
  function dr(no, decl, score, at, item) { return [no, '(가상)', decl, 0, at, '수리후', '정정', 'A1', item || '(가상)항목', score, score, '10', '20']; }
  var bx = ES.readWorkbook([{ name: '귀책사유자별오류상세목록_10월', aoa: [DH,
    dr(1, '2237126813391X', 10, '2026-10-23  09:00:00'), dr(2, '2237126813391X', 6, '2026-10-24  09:00:00'),      // 같은 신고 두 줄 → 16점 · 첫 날짜
    dr(3, '4215826106228X', 24, '2026-10-20  10:00:00'), dr(4, '4215826106148X', 0, '2026-10-01  11:00:00'),
    dr(5, '4390826009114X', 21, '2026-10-05  10:00:00'),                                                          // 울산 — 대장 대상 아님
    dr(6, '9999926000001X', 3, '2026-10-06  10:00:00')] }], '2026년수출(가상).xlsx');                             // 지역 미분류 — 대상 아님
  var bi = ES.readWorkbook([{ name: '귀책사유자별오류상세목록_10월', aoa: [DH, dr(1, '2235626B17742M', 0, '2026-10-01  13:54:31')] }, { name: '귀책사유자별오류상세목록_9월', aoa: [DH, dr(1, '2235626000099M', 5, '2026-09-11  13:00:00')] }], '2026년수입(가상).xlsx');
  var books = [bi, bx]; ES.applyRule(books, null);
  var decls = ES.byDecl([].concat(bi.rows, bx.rows).filter(function (r) { return r.month; }));
  var es = ES.erpSummary({ 수입: [{ declNo: '2235626B17742M', month: '2026-09', hq: '엔진본부', plant: '1130' }], 수출: [
    { declNo: '2237126813391X', month: '2026-10', hq: '건기본부', plant: '1000' }, { declNo: '4215826106228X', month: '2026-10', hq: '부품센터', plant: '6000' }, { declNo: '4215826106148X', month: '2026-10', hq: '부품센터', plant: '6000' }] }, 2026);
  var L = ES.ledgerRows(decls, {}, es, { month: 10 });
  eq(L.map(function (r) { return [r.kind, r.no, r.div, r.declNo, r.date, r.score]; }), [
    ['수입', 1, '엔진', '2235626B17742M', '2026-10-01', 0], ['수출', 1, '부품', '4215826106148X', '2026-10-01', 0], ['수출', 2, '부품', '4215826106228X', '2026-10-20', 24], ['수출', 3, '건기', '2237126813391X', '2026-10-23', 16]],
    'v1.12.0 대장 — 인천만(울산 · 지역 미분류 빼고) · 0점 포함 · 사업부 짧게 · 첫 정정일자 · 신고번호별 점수 합 · 연번(구분마다 정정일자 순)');
  eq(L.filter(function (r) { return r.kind === '수출'; }).reduce(function (a, r) { return a + r.score; }, 0), 40, 'v1.12.0 수출 대장 합계 40점 = 수출 인천 오류점수');
  eq(ES.LEDGER_HEAD, ['구분', '연번', '사업부', 'DRAFT NO', '신고번호', '정정일자', '오류점수', '발생사유 및 정정내용', '귀책', '관련부서', '담당자'], 'v1.12.0 AEO 관리대장 11열');
  // ERP 가 없으면 사업부 미분류(담당자가 고쳐 적음)
  var L0 = ES.ledgerRows(decls, { '2235626B17742M|10': { div: '엔진(수기)' } }, null, { month: 10 });
  eq([L0[0].div, L0[0].divAuto, L0[1].div, ES.ledgerAoa(L0)[2][2]], ['엔진(수기)', false, '', '미분류'], 'v1.12.0 사업부를 못 정하면 미분류 — 담당자가 적은 값을 씀');
  // 입력값 — 열쇠 = 신고번호|월, 미입력 판정 · 진행
  var notes = { '4215826106228X|10': { draft: '210-M6S0-GR-202610-0016', reason: '단가 오기\n정정 완료', blame: '화주', dept: '(가상)부서', owner: '(가상)' }, '2237126813391X|10': { draft: 'e-mail' } };
  var L2 = ES.ledgerRows(decls, notes, es, { month: 10 });
  eq(L2.map(function (r) { return [r.key, r.missing]; }), [['2235626B17742M|10', true], ['4215826106148X|10', true], ['4215826106228X|10', false], ['2237126813391X|10', true]], 'v1.12.0 열쇠 = 신고번호|월 · 미입력 = DRAFT NO 나 발생사유가 빈 줄');
  eq(ES.ledgerProgress(L2, 10).text, '10월 인천 발생 4건 중 미입력 3건', 'v1.12.0 진행 상황 문구');
  eq([L2[2].draft, L2[2].reason, L2[3].draft], ['210-M6S0-GR-202610-0016', '단가 오기\n정정 완료', 'e-mail'], 'v1.12.0 DRAFT NO 는 형식 검사 없이(SAP 번호 · e-mail) · 여러 줄 사유');
  var aoa = ES.ledgerAoa(L2);
  eq([aoa[3], aoa[1][7]], [['수출', 2, '부품', '210-M6S0-GR-202610-0016', '4215826106228X', '2026-10-20', 24, '단가 오기\n정정 완료', '화주', '(가상)부서', '(가상)'], ''], 'v1.12.0 엑셀 — AEO 열 순서 · 발생사유를 안 썼으면 빈칸');
  // 파일을 다시 올려도 입력 유지(같은 열쇠) · 월이 다르면 다른 줄
  var again = ES.readWorkbook([{ name: '귀책사유자별오류상세목록_10월', aoa: [DH, dr(1, '4215826106228X', 24, '2026-10-20  10:00:00')] }], '2026년수출(가상).xlsx'); ES.applyRule([again], null);
  eq(ES.ledgerRows(ES.byDecl(again.rows), notes, es, { month: 10 })[0].draft, '210-M6S0-GR-202610-0016', 'v1.12.0 유니패스 파일을 다시 올려도 입력값 유지');
  eq(ES.ledgerRows(decls, {}, es, {}).map(function (r) { return r.month + ' ' + r.kind + ' ' + r.no; }), ['9 수입 1', '10 수입 1', '10 수출 1', '10 수출 2', '10 수출 3'], 'v1.12.0 전체 월 — 월 순서 · 연번은 월 · 구분마다');
  // 예전 입력값(열쇠 = 신고번호만) 옮기기
  var mg = ES.migrateNotes({ '4215826106228X': { reason: '예전 사유' }, '1111126000000X': { reason: '지금 자료에 없음' }, '2237126813391X|10': { draft: 'x' } }, decls);
  eq([mg.moved, mg.notes['4215826106228X|10'].reason, mg.notes['4215826106228X'], mg.notes['1111126000000X'].reason, mg.notes['2237126813391X|10'].draft], [1, '예전 사유', undefined, '지금 자료에 없음', 'x'], 'v1.12.0 예전 입력값을 신고번호|월로 옮김(없는 신고번호는 그대로)');
  // 지우기 버튼들은 대장 입력값을 건드리지 않는다
  var dj = fsx.readFileSync(__dirname + '/../js/dash.js', 'utf8'), ej = fsx.readFileSync(__dirname + '/../js/errors.js', 'utf8');
  var clearDash = dj.slice(dj.indexOf("$('btn-dash-clear')"), dj.indexOf('\n', dj.indexOf("$('btn-dash-clear')")));
  var clearErr = ej.slice(ej.indexOf("$('e-clear')"), ej.indexOf('\n', ej.indexOf("$('e-clear')")));
  ok(clearDash.length > 20 && !/err\.notes|LS\.notes/.test(clearDash) && clearErr.length > 20 && !/notes = \{\}|LS\.notes/.test(clearErr), 'v1.12.0 「저장된 데이터 지우기」 · 「비우기」는 대장 입력값을 지우지 않음');
  ok(/e-lclear/.test(ej) && /window\.confirm\('관리대장에 입력한 내용/.test(ej), 'v1.12.0 대장 입력값은 따로 확인을 받고 지움');
  var eh = fsx.readFileSync(__dirname + '/../errors.html', 'utf8');
  ok(/id="e-lxlsx"/.test(eh) && /id="e-lprog"/.test(eh) && /id="e-lscope"/.test(eh) && /list="e-blames"|e-blames/.test(ej), 'v1.12.0 화면 — 진행 상황 · 엑셀 내보내기(고른 달 · 전체 월) · 귀책 고르기');
  var book = ES.exportBook({ summary: ES.summarize(books, {}, {}), rows: [].concat(bi.rows, bx.rows), decls: decls, notes: notes, ledger: L2 });
  eq(book.filter(function (x) { return x.name === '발생사유및정정내용'; })[0].aoa.length, 5, 'v1.12.0 전체 엑셀의 대장 시트도 인천 · 0점 포함');
}
// ---------- v2.0.0 오류점수 — 유니패스 원본만 · 계산은 errscore.js · 요약 저장 · 대시보드는 읽기만 ----------
function v200() {
  var ES = require('../js/errscore.js'), CU = require('../js/customs.js'), FRr = require('../js/filerules.js');
  var SH = ['No', '귀책사유자부호', '귀책사유자상호', '관할지세관부호', '관할지세관', '총신고건', '오류점수', '비율'];
  var DH = ['No', '귀책사유자부호', '신고번호', '란번호', '정정일자 및 시간', '수리구분', '정정구분', '항목코드', '항목명', '오류점수', '변경 후 오류점수', '정정전내역', '정정후내역'];
  function dr(no, decl, score) { return [no, '(가상)', decl, 0, '2026-09-10  10:00:00', '수리후', '정정', 'A1', '(가상)', score, score, '', '']; }
  // [1] errors 종류 폐지 — 사람이 집계한 표 · 유니패스 현황목록 모두 대시보드 종류로 걸리지 않음
  eq([CU.detectKind(SH).kind, CU.KINDS], [null, ['import', 'export', 'refund', 'ruling', 'ftaImport']], 'v2.0.0 유니패스 현황목록은 대시보드 종류가 아님(v2.1.0 수입 FTA 더함)');
  eq([FRr.isErrorScoreFile('집계(가상).xlsx', ['년월', '구분', '본부', '신고건수', '오류건수', '오류점수'], ['Sheet1']), FRr.isErrorScoreFile('x.xlsx', SH, []), FRr.isErrorScoreFile('x.xlsx', ['a'], ['귀책사유자별오류상세목록_9월']), FRr.isErrorScoreFile('2026-10_수입실적.xlsx', ['Acceptance date', 'Plant'], ['Sheet1'])], [true, true, true, false], 'v2.0.0 사람이 만든 오류 집계표(관세환급으로 잘못 걸릴 뻔함) · 유니패스 파일은 오류점수 파일로 먼저 거름');
  ok(/FR\.isErrorScoreFile\(f\.name, best\.s\.aoa\[0\], f\.wb\.SheetNames\)/.test(fsx.readFileSync(__dirname + '/../js/dash.js', 'utf8')), 'v2.0.0 대시보드 올리기에서 오류점수 파일을 먼저 거름');
  eq([FRr.describe('2026_수입오류.xlsx', null).dataset, FRr.describe('2026-10_수입오류_현황목록.xlsx', null).dataset], [null, null], 'v2.0.0 「오류」 파일은 대시보드 자료가 아님(오류점수 화면으로)');
  // [3-1] 열쇠 = 연도 · 월 · 수입·수출 · 현황·상세 — 같은 이름 시트가 두 파일에 있어도 섞이지 않음 · A1 공백 무시
  function book(title, total, score, rows, name) {
    return ES.readWorkbook([{ name: '요약', aoa: [[title]] }, { name: '귀책사유자별오류현황목록_9월 ', aoa: [SH, [1, '(가상)', '(가상)', '012', '세관', total, score, 0]] }, { name: '귀책사유자별오류상세목록_9월', aoa: [DH].concat(rows) }], name);
  }
  var bi = book('▣ 2026년 수입오류점수 현황(가상)', 1764, 38, [dr(1, '2235626000001M', 1), dr(2, '4390826000002M', 37)], '2026년수입(가상).xlsx');
  var bx = book('▣2026년 수출오류점수 현황(가상)', 2227, 124, [dr(1, '4215826000001X', 70), dr(2, '4390826000003X', 54)], '2026년수출(가상).xlsx');
  eq([bi.kind, bx.kind, bi.year, bx.year], ['수입', '수출', 2026, 2026], 'v2.0.0 수입 · 수출 · 연도 = 요약 A1(공백 위치가 달라도)');
  var cnt = { 수입: { 9: 1075 }, 수출: { 9: 1413 } };
  function sumOf(books) { ES.applyRule(books, null); var S = ES.summarize(books, cnt, {}); return ES.buildSummary(S, ES.hqBreakdown(S, books, null), books, { now: 'T' }); }
  var both = sumOf([bi, bx]), rev = sumOf([bx, bi]), onlyI = sumOf([bi]);
  eq(JSON.stringify(both), JSON.stringify(rev), 'v2.0.0 두 파일을 어느 순서로 올려도 같은 요약');
  eq(JSON.stringify(onlyI.rows), JSON.stringify(both.rows.filter(function (r) { return r.kind === '수입'; })), 'v2.0.0 따로 올린 수입 = 함께 올린 수입(수출 자료가 섞이지 않음)');
  var g = function (k, rg, h) { return both.rows.filter(function (r) { return r.kind === k && r.region === rg && r.hq === (h || null); })[0]; };
  eq([g('수입', '종합').score, g('수입', '종합').decl, g('수출', '종합').score, g('수입', '인천').decl, g('수입', '울산').decl, g('수입', '인천').score + g('수입', '울산').score], [38, 1764, 124, 1075, 689, 38], 'v2.0.0 수입 9월 38점(124점이 아님) · 소계 = 현황목록 · 인천 + 울산 = 소계');
  // [3-2] 요약 형식 — 원본 행 없이 요약만
  eq([both.basis, both.updatedAt, Object.keys(both.rows[0]), both.files.map(function (f) { return [f.kind, f.year, f.months]; })], ['GN 포함 · 수입 수리일자 · 수출 신고일자', 'T', ['ym', 'kind', 'region', 'hq', 'decl', 'err', 'errScored', 'score'], [['수입', 2026, [9]], ['수출', 2026, [9]]]], 'v2.0.0 요약 { updatedAt, basis, rows, files }');
  ok(JSON.stringify(both).indexOf('2235626000001M') < 0 && both.rows.every(function (r) { return r.ym === '2026-09'; }), 'v2.0.0 요약에 원본 행(신고번호) 없음 · ym = 연도-월');
  eq(ES.SUMMARY_KEY, 'b2611-07.err.summary', 'v2.0.0 요약 저장 열쇠');
  // [2] 비율 = 오류점수 ÷ 총신고건 — 대시보드는 요약을 더하기만
  var mo = ES.summaryMonthly(both)[0];
  eq([mo.ym, mo.total.decl, mo.total.score, mo.total.err, mo.total.rate, mo.수출.rate], ['2026-09', 3991, 162, 4, 4.06, 5.57], 'v2.0.0 종합 3,991건 · 162점 · 4.06% (= 오류점수 ÷ 신고건수, 오류건수 ÷ 신고건수 아님)');
  eq(ES.summaryMonthly(onlyI)[0].total.partial, true, 'v2.0.0 한쪽 자료만 있으면 표시');
  // [6] Plant 없음(분모만) · ERP 미매칭(분자만) — 한 줄에 합치지 않음
  var erp = ES.erpSummary({ 수출: [{ declNo: '4215826000009X', month: '2026-09', hq: '본부 미분류', plant: '' }, { declNo: '4215826000008X', month: '2026-09', hq: '부품센터', plant: '6000' }] }, 2026);
  ES.applyRule([bx], null); var Sx = ES.summarize([bx], cnt, {}), Hx = ES.hqBreakdown(Sx, [bx], erp), sx = ES.buildSummary(Sx, Hx, [bx], { now: 'T' });
  var np = sx.rows.filter(function (r) { return r.hq === 'Plant 없음'; })[0], nm = sx.rows.filter(function (r) { return r.hq === 'ERP 미매칭'; })[0];
  eq([np.decl, np.score, nm.decl, nm.score, Hx.notFound.map(function (x) { return x.declNo; })], [1, 0, null, 70, ['4215826000001X']], 'v2.0.0 Plant 없음(분모 1 · 점수 0) · ERP 미매칭(분모 없음 · 70점 · 목록) — 466% 같은 비율이 나오지 않음');
  var lw = ES.ledgerRows(ES.byDecl(bx.rows), {}, erp, { month: 9 }).filter(function (r) { return r.declNo === '4215826000001X'; })[0];
  eq([lw.div, lw.divWhy, ES.ledgerAoa([lw])[1][2]], ['', 'ERP 미매칭', 'ERP 미매칭'], 'v2.0.0 관리대장 사업부도 ERP 미매칭으로 표시');
  // [4] · [5] 화면 — 대시보드는 요약을 읽기만, 유니패스 파일은 오류점수 화면으로
  var dj = fsx.readFileSync(__dirname + '/../js/dash.js', 'utf8'), ej = fsx.readFileSync(__dirname + '/../js/errors.js', 'utf8'), dh = fsx.readFileSync(__dirname + '/../dashboard.html', 'utf8');
  ok(dj.indexOf('C.errorStats') < 0 && dj.indexOf("filtered('errors')") < 0 && /b2611-07\.err\.summary/.test(dj) && /ES\.summaryMonthly\(sum\)/.test(dj), 'v2.0.0 대시보드 오류점수 탭은 요약을 읽기만(계산 없음)');
  ok(/계산: 오류점수 ÷ 신고건수/.test(dj) && !/오류건수 ÷ 신고건수/.test(dj), 'v2.0.0 대시보드 문구 = 오류점수 ÷ 신고건수');
  ok(/오류점수 요약이 없습니다\. 오류점수 화면에서 유니패스 파일을 올려 주세요/.test(dj) && /유니패스 오류점수 파일입니다\. 오류점수 화면으로 이동할까요\?/.test(dj) && /href="errors\.html"/.test(dj), 'v2.0.0 요약 없음 안내 · 유니패스 파일 → 오류점수 화면 단추');
  ok(dh.indexOf('<script src="js/errscore.js">') > dh.indexOf('<script src="js/filerules.js">'), 'v2.0.0 대시보드가 errscore.js 를 읽음(요약 읽기용)');
  ok(/saveSummary\(\)/.test(ej) && /E\.SUMMARY_KEY/.test(ej) && ej.indexOf("put('요약 시트'") < 0 && ej.indexOf("put('직접 입력'") < 0, 'v2.0.0 오류점수 화면 — 요약 저장 · 인천 분모는 ERP 만(요약 시트 · 직접 입력 안 받음)');
  // [7] 예제 — 유니패스 형식 · 실제 부호 체계
  var SBk = ES.sampleBooks(), b0 = SBk[0];
  eq([b0.sheets[0].name, b0.sheets[0].aoa[0][0], SBk[1].sheets[0].aoa[0][0].slice(0, 6), b0.sheets.map(function (x) { return x.name; }).indexOf('귀책사유자별오류현황목록_10월') > 0, b0.sheets.map(function (x) { return x.name; }).indexOf('귀책사유자별오류상세목록_10월') > 0], ['요약', '▣ 2026년 수입오류점수 현황(예제 · 가상)', '▣2026년', true, true], 'v2.0.0 예제 = 요약(A1 제목) · 현황목록_10월 · 상세목록_10월');
  var rb = SBk.map(function (b) { return ES.readWorkbook(b.sheets, b.name); }), codes = {};
  rb.forEach(function (b) { b.rows.forEach(function (r) { codes[r.broker] = r.campus; }); });
  eq(Object.keys(codes).sort().map(function (c) { return c + codes[c]; }), ['15553인천', '22356인천', '22371인천', '42158인천', '43908울산', '44788울산', '44924울산'].filter(function (x) { return Object.keys(codes).indexOf(x.slice(0, 5)) >= 0; }), 'v2.0.0 예제 신고번호 앞 5자리는 실제 부호 체계(인천 · 울산 모두)');
  ok(Object.keys(codes).length >= 5 && rb.every(function (b) { return b.rows.every(function (r) { return r.campus === '인천' || r.campus === '울산'; }); }), 'v2.0.0 예제에 지역 미분류 없음 · 부호 5개 이상');
  ok(!fsx.existsSync(px.join(__dirname, '..', 'samples', '예제_수출입오류점수.xlsx')) && !fsx.existsSync(px.join(__dirname, '..', 'samples', b0.name)) && /2026_예제\(가상\)_수입오류\.xlsx/.test(dh) && /2026_예제\(가상\)_수출오류\.xlsx/.test(dh), 'v2.0.0 집계표 형식 예제 없음 → v2.7.0 유니패스 예제는 samples/ 의 실제 구조 파일(수입 · 수출)');
}
// ---------- v2.1.0 수입 FTA 탭 — ERP 수입FTA 파일 ----------
function v210() {
  var CU = require('../js/customs.js'), FRr = require('../js/filerules.js');
  // 가짜 수입FTA 파일 — 실제처럼 ($)·(\) 이웃 열, 같은 이름 열(Short Descript. · Vendor Name) 둘씩
  var HD = ['Import declaration number', 'Short Descript.', 'Column sequence number', 'Vendor Name', 'Duty Type', 'Plant', 'Payment method', 'Origin', '($)Taxable.Amt', '(\\)Taxable.Amt', 'Tariff Reductions', 'Acceptance date', 'Short Descript.', 'Vendor Name', 'FTA N/A Code', 'N/A Reason'];
  function row(decl, line, dt, plant, pay, krw, red, date, na, why) { return [decl, '(가상)', line, '(가상)', dt, plant, pay, 'CN', krw / 1000, krw, red, date, '(가상)', '(가상)', na, why || '']; }
  var E8 = 1e8;
  var aoa = [HD,
    row('2235626000001M', 1, 'FCN1', '6000', 'TT', 10 * E8, 0.8 * E8, '2026-10-05', '', ''),          // 부품 FTA
    row('2235626000002M', 1, 'FEU1', '1000', 'TT', 20 * E8, 1.5 * E8, '2026-10-06', '01', '일부 적용'), // 건기 FTA(N/A 01 이 붙어도 적용분)
    row('2235626000003M', 1, 'C', '1000', 'TT', 4 * E8, 0, '2026-10-07', '04', '긴급건 사후적용_(가상)'), // 건기 04 — 가능에만
    row('2235626000003M', 2, 'A', '1000', 'TT', 1 * E8, 0, '2026-10-07', '04', ''),                    // 같은 신고 둘째 란
    row('2235626000004M', 1, 'A', '1130', 'TT', 6 * E8, 0, '2026-10-08', '', ''),                      // 엔진 사유 없음(A)
    row('2235626000005M', 1, 'C', '1131', 'TT', 3 * E8, 0, '2026-10-09', '07', '불량품'),              // 엔진 07
    row('2235626000006M', 1, 'F', '1130', 'TT', 2 * E8, 0, '2026-10-10', '', ''),                      // F 단독 — FTA 아님(전체에는)
    row('2235626000007M', 1, 'FCN1', '1000', 'GN', 5 * E8, 0.4 * E8, '2026-10-11', '', ''),            // GN — 늘 뺌
    row('2235626000008M', 1, 'C', '9999', 'TT', 1 * E8, 0, '2026-10-12', '02', ''),                    // 본부 미분류 · 02
    row('2235626000009M', 1, 'FCN1', '6000', 'TT', 7 * E8, 0.5 * E8, '2026-11-02', '', ''),            // 기간 밖(11월)
    row('2235626000010M', 1, 'FUS1', '1130', 'TT', 8 * E8, 0.6 * E8, '2026-09-15', '', ''),            // 9월 엔진 FTA
    row('2235626000011M', 1, 'C', '1100', 'TT', 2 * E8, 0, '2026-09-20', '04', '9월 대기(가상)')];      // 9월 04
  var name = '2026-01~10_수입FTA(가상).xlsx';
  var det = CU.detectKind(CU.uniqueHeaders(HD), name), info = FRr.describe(name, det);
  eq([det.kind, CU.detectKind(CU.uniqueHeaders(HD)).kind, info.dataset, info.mode, info.rule, info.period.text], ['ftaImport', 'ftaImport', 'ftaImport', 'confirmed', 'B', '2026-01~10'], 'v2.1.0 수입FTA 파일 판정(이름 · 내용) · 확정본 · 수리일자 귀속');
  var impErp = CU.sampleImportErp().aoa[0];
  eq([CU.detectKind(CU.uniqueHeaders(impErp), '2026-10_수입실적(가상).xlsx').kind, CU.detectKind(CU.uniqueHeaders(impErp)).kind], ['import', 'import'], 'v2.1.0 수입실적 ERP 파일은 수입 FTA 로 잡히지 않음(판정 열 개수)');
  eq([FRr.describe('EXPORT-수입FTA.XLSX', { kind: 'ftaImport' }).mode, FRr.describe('EXPORT-수입FTA.XLSX', { kind: 'ftaImport' }).dataset, FRr.describe('2026-10_수출FTA.xlsx', null).dataset], ['view', 'ftaImport', 'ftaExport'], 'v2.1.0 원본 이름 = 조회 모드 · v2.4.0 수출 FTA 는 자기 탭(ftaExport)');
  var item = { name: name, file: name, headers: CU.uniqueHeaders(HD), aoa: aoa, offset: 0, override: {}, meta: info };
  var m = CU.mergeFiles('ftaImport', [item], CU.exportSettings({ excludeGN: false })), map = m.files[0].res.map;
  eq([m.ok, map.goods, map.saving, map.declNo, map.dutyType, map.date, map.naCode], [true, '(\\)Taxable.Amt', 'Tariff Reductions', 'Import declaration number', 'Duty Type', 'Acceptance date', 'FTA N/A Code'], 'v2.1.0 열 짝짓기 — 원화 (\\)Taxable.Amt(달러 열 아님) · 같은 이름 열에 흔들리지 않음');
  var hd2 = HD.map(function (h) { return h === '(\\)Taxable.Amt' ? '(₩)Taxable.Amt' : h; });
  eq(CU.mapColumns(CU.uniqueHeaders(hd2), 'ftaImport').map.goods, '(₩)Taxable.Amt', 'v2.1.0 (₩)Taxable.Amt 도 같은 열');
  var rep = CU.ftaImportReport(m.records, { month: '2026-10', filePeriods: { [name]: info.period.months }, today: '2026-11-20' });
  var e = function (v) { return Math.round(v / 1e6) / 100; }, cell = function (rows, hq) { var r = rows.filter(function (x) { return x.hq === hq; })[0]; return r ? [e(r.all), e(r.poss), e(r.fta), e(r.saving), r.rate == null ? null : Math.round(r.rate * 10000) / 100] : null; };
  // 손계산(10월, GN · 기간 밖 제외): 부품 10/10/10/0.8 · 건기 20+4+1=25 / 20+5=25 / 20 / 1.5 · 엔진 6+3+2=11 / 0 / 0 / 0 · 미분류 1/0/0/0
  eq([cell(rep.current, '부품센터'), cell(rep.current, '건기본부'), cell(rep.current, '엔진본부'), cell(rep.current, '본부 미분류'), cell(rep.current, '총합계')],
    [[10, 10, 10, 0.8, 100], [25, 25, 20, 1.5, 80], [11, 0, 0, 0, null], [1, 0, 0, 0, null], [47, 35, 30, 2.3, 85.71]], 'v2.1.0 당월 다섯 지표 — FTA = F+4자 이상 · 가능 = FTA + 04 미적용 · 비율 = FTA ÷ 가능 · F 단독 · 미분류');
  eq([rep.current.map(function (r) { return r.hq; }), cell(rep.cumulative, '총합계'), cell(rep.cumulative, '엔진본부')], [['부품센터', '건기본부', '엔진본부', '본부 미분류', '총합계'], [57, 45, 38, 2.9, 84.44], [19, 8, 8, 0.6, 100]], 'v2.1.0 누적(1월 ~ 선택 월) · 행 순서(부품센터 · 건기 · 엔진 · 미분류 · 총합계)');
  eq([rep.excluded.gn, e(rep.excluded.gnAmount), rep.excluded.fOnly, rep.excluded.outside, rep.months], [1, 5, 1, 1, ['2026-09', '2026-10']], 'v2.1.0 제외 — GN 1란 5억 · F 단독 1란 · 기간 밖 1란(11월)');
  var rep9 = CU.ftaImportReport(m.records, { month: '2026-09', filePeriods: { [name]: info.period.months } });
  eq(cell(rep9.current, '총합계'), [10, 10, 8, 0.6, 80], 'v2.1.0 9월 당월');
  // GN 은 실적 탭 설정(excludeGN)과 무관하게 늘 뺌
  var m2 = CU.mergeFiles('ftaImport', [item], CU.exportSettings({ excludeGN: true }));
  eq(cell(CU.ftaImportReport(m2.records, { month: '2026-10', filePeriods: { [name]: info.period.months } }).current, '총합계'), [47, 35, 30, 2.3, 85.71], 'v2.1.0 GN 은 실적 탭 설정과 관계없이 늘 뺌');
  // 협정별 · 사후적용 대기 · 미적용 사유
  eq(rep.agreements.month.map(function (a) { return [a.code, a.name, e(a.goods), e(a.saving)]; }), [['FEU1', '한EU', 20, 1.5], ['FCN1', '한중', 10, 0.8]], 'v2.1.0 협정별(Duty Type)');
  var pm = rep.pending.month;
  eq([pm.lines, pm.decls, e(pm.amount), pm.list[0].declNo, pm.list[0].hq, pm.list[0].days, e(pm.list[0].goods), pm.list[0].reason], [2, 1, 5, '2235626000003M', '건기본부', 44, 5, '긴급건 사후적용_(가상)'], 'v2.1.0 사후적용 대기 — 04 · 미적용 · 신고번호 단위 · 경과일수');
  eq(rep.pending.cumulative.list.map(function (p) { return [p.declNo, p.days]; }), [['2235626000011M', 61], ['2235626000003M', 44]], 'v2.1.0 사후적용 대기 누적 — 경과일수 긴 순');
  eq(rep.reasons.month.map(function (q) { return [q.key, q.name, e(q.goods)]; }), [['02', '비특혜 원산지', 1], ['07', '양허대상 아님·불량품 등', 3], ['사유 없음(A)', '사유 없음(A)', 6], ['사유 없음(F)', '사유 없음(F)', 2]], 'v2.1.0 미적용 사유별(04 제외 · FEU1+01 은 적용분이라 빠짐 · 사유 없음(A))');
  var rn = CU.ftaImportReport(m.records, { month: '2026-10', filePeriods: { [name]: info.period.months }, naNames: CU.exportSettings({ ftaNa: { '07': '양허 제외(고침)' } }).ftaNa });
  eq([rn.reasons.month[1].name, CU.exportSettings(null).ftaNa['01'], CU.exportSettings({ ftaNa: { '01': ' ' } }).ftaNa['01']], ['양허 제외(고침)', '기타세율 적용', '기타세율 적용'], 'v2.1.0 사유 코드 이름은 설정에서 고침(비우면 기본)');
  // [6] 월 확정 · 비교
  var snap = CU.ftaSnapshot(rep, 'T');
  eq([snap.ym, snap.confirmedAt, Object.keys(snap.rows[0]), snap.rows.length], ['2026-10', 'T', ['hq', 'all', 'poss', 'fta', 'saving'], 5], 'v2.1.0 확정 — 본부별 다섯 지표만(원본 행 없음)');
  eq(CU.ftaCompare(rep, []), null, 'v2.1.0 확정한 적 없는 달 — 비교 없음(—)');
  var later = aoa.map(function (r, i) { return i === 3 ? r.map(function (c, j) { return j === 4 ? 'FKR1' : j === 14 ? '' : c; }) : r; });   // 사후적용 완료(04 → FKR1)
  var mL = CU.mergeFiles('ftaImport', [{ name: name, file: name, headers: CU.uniqueHeaders(HD), aoa: later, offset: 0, override: {}, meta: info }], CU.exportSettings(null));
  var repL = CU.ftaImportReport(mL.records, { month: '2026-10', filePeriods: { [name]: info.period.months }, today: '2026-11-20' }), cmp = CU.ftaCompare(repL, [snap]), tot = cmp.rows.filter(function (q) { return q.hq === '총합계'; })[0];
  eq([e(tot.then.fta), e(tot.now.fta), e(tot.diff.fta), repL.pending.month.lines], [30, 34, 4, 1], 'v2.1.0 사후적용 뒤 다시 계산 — 확정 30억 → 현재 34억 · 소급 증가 4억 · 대기 목록에서 빠짐');
  eq([CU.eok(33336000000), CU.eok(null)], [333.36, null], 'v2.1.0 억원 · 소수 둘째 자리');
  // [7] 수입실적 합계와 따로
  ok(CU.KINDS.indexOf('ftaImport') >= 0 && CU.tradeTotal.toString().indexOf('ftaImport') < 0, 'v2.1.0 수입 FTA 는 수입실적 · 수출입 합계에 더하지 않음');
  var dj = fsx.readFileSync(__dirname + '/../js/dash.js', 'utf8'), dh = fsx.readFileSync(__dirname + '/../dashboard.html', 'utf8');
  ok(/C\.ftaImportReport\(/.test(dj) && /b2611-07\.fta\.snapshots/.test(dj) && /메일용 표 복사/.test(dj) && /이 달 실적 확정/.test(dj) && /ClipboardItem/.test(dj) && /'text\/html'/.test(dj), 'v2.1.0 화면 — 보고서는 엔진 결과 · 확정 저장 · 메일용 HTML 표 복사');
  ok(dj.indexOf("info.group === 'fta' && !info.dataset") > 0 && /id="fta-imp"/.test(dh) && /data-tab="fta"[^>]*>수입 FTA</.test(dh) && /참고 — 실적 파일의 FTA 열/.test(dh), 'v2.1.0 수입FTA 는 목록 보관(held)이 아니라 탭 · 예전 활용률은 참고 칸');
  eq(CU.FTA_BASIS, '최신 ERP 기준 · GN 제외 · 수리일자 기준. 사후적용이 완료되면 과거 월 실적이 소급해 늘어납니다.', 'v2.1.0 기준 표기');
}
// ---------- v2.2.0 수입 FTA 화면 재구성 — 카드 · 쌓은 막대 · 활용 흐름 · 협정 묶음 · 대기 월별 · 사유별 신고번호 · HS 6단위 · 본부 고정색 ----------
function v220() {
  var CU = require('../js/customs.js'), FRr = require('../js/filerules.js');
  var HD = ['Import declaration number', 'Column sequence number', 'HS-Code', 'Duty Type', 'Plant', 'Payment method', '($)Taxable.Amt', '(\\)Taxable.Amt', 'Tariff Reductions', 'Acceptance date', 'FTA N/A Code', 'N/A Reason'];
  var E8 = 1e8;
  function row(decl, dt, plant, krw, red, date, na, hs) { return [decl, 1, hs, dt, plant, 'TT', krw / 1000, krw * E8, red * E8, date, na || '', '']; }
  var aoa = [HD,
    row('2235626100001M', 'FCN1', '1000', 10, 1, '2026-09-05', '', '8481809000'),
    row('2235626100002M', 'C', '1130', 2, 0, '2026-09-10', '04', ''),
    row('2235626100003M', 'FCN1', '1000', 8, 1.2, '2026-10-03', '', '8481809000'),
    row('2235626100004M', 'FEU1', '1130', 6, 0.6, '2026-10-04', '', 840999123),     // 숫자로 읽혀 앞 0 이 빠진 9자리
    row('2235626100005M', 'FUS1', '6000', 4, 0.3, '2026-10-05', '', '8413500000'),
    row('2235626100006M', 'C', '1000', 3, 0, '2026-10-06', '02', ''),
    row('2235626100007M', 'A', '1000', 1, 0, '2026-10-07', '02', ''),
    row('2235626100008M', 'C', '9999', 2, 0, '2026-10-08', '04', '')];
  var name = '2026-09~10_수입FTA(가상).xlsx', info = FRr.describe(name, CU.detectKind(CU.uniqueHeaders(HD), name));
  var m = CU.mergeFiles('ftaImport', [{ name: name, file: name, headers: CU.uniqueHeaders(HD), aoa: aoa, offset: 0, override: {}, meta: info }], CU.exportSettings(null));
  var fp = {}; fp[name] = info.period.months;
  var rep = CU.ftaImportReport(m.records, { month: '2026-10', filePeriods: fp, today: '2026-11-20' }), k = rep.kpi, e = CU.eok, p2 = function (v) { return v == null ? null : Math.round(v * 10000) / 100; };
  eq([m.ok, m.files[0].res.map.hs], [true, 'HS-Code'], 'v2.2.0 HS-Code 열 짝짓기(없어도 되는 열)');
  // 손계산 10월: 절감액 1.2+0.6+0.3 = 2.1 · 9월 1 → +110% · 누적 3.1 · 2개월 → 월평균 1.55 · 전체 24 · FTA 18 · 가능 20 · 활용률 90% · 미활용 2 · 협정국 비중 20/24
  eq([e(k.saving), k.prevMonth, e(k.prevSaving), p2(k.momPct), e(k.cumSaving), k.cumMonths, e(k.avgSaving)], [2.1, '2026-09', 1, 110, 3.1, 2, 1.55], 'v2.2.0 카드 ① 당월 절감액 · 전월 대비 % · ② 누적 · 월평균');
  eq([p2(k.rate), e(k.unused), p2(k.possShare), e(k.all), e(k.poss), e(k.fta)], [90, 2, 83.33, 24, 20, 18], 'v2.2.0 카드 ③ 활용률 · 미활용(가능 − FTA) · 협정국 수입 비중(가능 ÷ 전체 — 새 지표)');
  eq([e(k.pendingAmount), k.pendingDecls, k.pendingLines], [4, 2, 2], 'v2.2.0 카드 ④ 사후적용 대기(1월 ~ 선택 월 수리분)');
  var k9 = CU.ftaImportReport(m.records, { month: '2026-09', filePeriods: fp }).kpi;
  eq([k9.prevMonth, k9.prevSaving, k9.momPct, CU.prevMonthOf('2026-01')], ['2026-08', null, null, '2025-12'], 'v2.2.0 전월 자료가 없으면 전월 대비 null(「—」) · 1월의 전월은 전년 12월');
  var h10 = rep.monthlyHq.filter(function (q) { return q.month === '2026-10'; })[0].rows;
  eq(h10.map(function (q) { return [q.hq, e(q.saving)]; }), [['부품센터', 0.3], ['건기본부', 1.2], ['엔진본부', 0.6], ['본부 미분류', 0]], 'v2.2.0 월별 본부별 절감액(쌓은 막대) — 고정 순서 + 미분류');
  ok(rep.monthlyHq.every(function (q) { var s = q.rows.reduce(function (a, w) { return a + w.saving; }, 0), t = rep.monthly.filter(function (z) { return z.month === q.month; })[0].saving; return Math.abs(s - t) < 1; }), 'v2.2.0 쌓은 막대 합 = 그 달 총합계 절감액');
  eq(rep.pendingMonthly.map(function (q) { return [q.month, e(q.amount), q.decls]; }), [['2026-09', 2, 1], ['2026-10', 2, 1]], 'v2.2.0 월별 사후적용 대기 금액(수리월)');
  var r02 = rep.reasons.cumulative.filter(function (q) { return q.code === '02'; })[0];
  eq([e(r02.goods), r02.decls.map(function (d) { return [d.declNo, e(d.goods), d.hq]; })], [4, [['2235626100006M', 3, '건기본부'], ['2235626100007M', 1, '건기본부']]], 'v2.2.0 미적용 사유별 신고번호 목록(물자대 큰 순서)');
  eq([rep.hs.has, rep.hs.cumulative.map(function (q) { return [q.hs6, e(q.saving), e(q.ftaGoods)]; }), rep.hs.month.length], [true, [['8481.80', 2.2, 18], ['0840.99', 0.6, 6], ['8413.50', 0.3, 4]], 3], 'v2.2.0 HS 6단위 절감액 상위 — 9자리 숫자는 앞 0 채움');
  eq([CU.ftaHs6('8481.80-9000'), CU.ftaHs6(''), CU.ftaHs6(8481809000), CU.ftaHs6('84')], ['8481.80', '(HS 없음)', '8481.80', '(HS 없음)'], 'v2.2.0 HS 6단위 읽기');
  // 협정 묶음 — 큰 순서 5개 + 기타
  var seven = ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1'].map(function (c, i) { return { code: 'F' + c + 'X', name: c, goods: 1, saving: 7 - i, lines: 1 }; });
  var g7 = CU.ftaAgreeGroups(seven.slice().reverse()), g6 = CU.ftaAgreeGroups(seven.slice(0, 6));
  eq([g7.top.map(function (a) { return a.saving; }), g7.other.name, g7.other.saving, g7.other.codes, g6.other, g6.top.length, CU.FTA_AGREE_TOP], [[7, 6, 5, 4, 3], '기타 2개 협정', 3, ['FF1X', 'FG1X'], null, 6, 5], 'v2.2.0 협정별 절감액 — 큰 순서 5개 + 「기타 N개 협정」(6개 이하는 묶지 않음)');
  // 본부 고정색
  var HC = CU.HQ_COLORS, hue = function (hex) { var r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return null; var hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (hh * 60 + 360) % 360; };
  eq([Object.keys(HC), CU.hqColor('건기본부'), CU.hqColor(' 엔진본부 '), CU.hqColor('없는 본부'), new Set(Object.keys(HC).map(function (q) { return HC[q]; })).size], [['건기본부', '엔진본부', '부품센터', '본부 미분류'], HC['건기본부'], HC['엔진본부'], HC['본부 미분류'], 4], 'v2.2.0 본부 고정색 — 이름으로 정함(조건을 바꿔도 같은 색) · 모르는 본부는 미분류 회색');
  ok(['건기본부', '엔진본부', '부품센터'].every(function (q) { var hh = hue(HC[q]); return hh != null && !(hh >= 20 && hh <= 160) && !(hh >= 340 || hh < 20); }), 'v2.2.0 본부 색에 노랑 · 초록 · 빨강 계열 없음(노랑 = 조치 필요, 초록/빨강 = 증감)');
  var lum = function (hex) { return [1, 3, 5].map(function (i) { var c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }).reduce(function (a, c, i) { return a + c * [0.2126, 0.7152, 0.0722][i]; }, 0); };
  var con = function (a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  ok(Object.keys(HC).every(function (q) { return con(HC[q], '#ffffff') >= 3 && con(HC[q], '#111827') >= 3; }), 'v2.2.0 본부 색 — 밝은 바탕 · 어두운 바탕 모두 대비 3:1 이상(다크 모드는 다음 판)');
  // 화면 — 순서 · 두 축 없음 · 다른 탭 본부 막대
  var dj = fsx.readFileSync(__dirname + '/../js/dash.js', 'utf8'), cs = fsx.readFileSync(__dirname + '/../css/dash.css', 'utf8');
  var body = dj.slice(dj.indexOf('function renderFtaImport()'), dj.indexOf('function renderFta()'));
  var order = ['fta-badge', 'fta-k-saving', 'fta-k-cum', 'fta-k-rate', 'fta-k-pending', 'fta-ch-saving', 'fta-ch-flow', 'fta-ch-agree', 'id="fta-pend-sec"', 'fta-ch-pending', 'fta-pending', 'data-fta-copy', 'fta-cur', 'fta-cum', 'fta-reasons', 'fta-hs', 'fta-excluded'].map(function (s) { return body.indexOf(s); });
  ok(order.every(function (v, i) { return v > 0 && (!i || v > order[i - 1]); }), 'v2.2.0 화면 순서 [5-1] → [5-7](상단 줄 · 카드 4 · 월별 절감액 · 활용 흐름 · 협정별 · 대기 · 표)', JSON.stringify(order));
  ok(dj.indexOf('function ftaCombo') < 0 && body.indexOf('polyline') < 0, 'v2.2.0 두 축 차트(절감액 막대 + 비율 선) 없음');
  ok((dj.match(/by === 'hq' \? hqFill/g) || []).length === 3 && /value: p\.total \}; \}\), money, hqFill\)/.test(dj) && /function hqFill\(r\) \{ return C\.hqColor\(r\.label\); \}/.test(dj), 'v2.2.0 다른 탭(수입 · 수출 · 관세환급 · 참고 활용률) 본부 막대도 본부 고정색');
  ok(/FTA_WARN = '#d9a400'/.test(dj) && (dj.match(/FTA_WARN\b/g) || []).length === 2 && /\.kpi\.warn\{background:#fff6d6/.test(cs) && /\.kpi\.none\{/.test(cs), 'v2.2.0 노랑은 사후적용 대기(카드 · 막대)에만 · 대기 없음은 회색');
  ok(/@media \(max-width:640px\)\{ \.kpis\.fta4\{grid-template-columns:repeat\(2,/.test(cs) && /tr\.late td:nth-child\(4\)\{color:#c0362c/.test(cs) && /p\.days >= 30/.test(body), 'v2.2.0 모바일 카드 2열 · 경과일수 30일 이상 빨강');
  ok(/data-fta-goto="fta-pend-sec"/.test(body) && /data-fta-reason=/.test(body) && /\[data-fta-goto\]/.test(dj) && /state\.ftaReasonOpen/.test(dj), 'v2.2.0 대기 카드 → 목록 이동 · 사유 행 → 신고번호 목록');
  ok(/class="hit"><title>/.test(dj) && /i === peak/.test(dj) && /m === sel && tots\[i\] > 0/.test(dj), 'v2.2.0 쌓은 막대 — 숫자 라벨은 최댓값 달 · 고른 달에만, 마우스를 올리면 본부별 금액');
}
// ---------- v2.3.0 저장 · 지우기 · 탭 · 눈금 — ERP 결과(b2611-07.err.erp) · 유니패스 결과(b2611-07.err.books) ----------
function v230() {
  var ES = require('../js/errscore.js');
  var SH = ['No', '귀책사유자부호', '귀책사유자상호', '관할지세관부호', '관할지세관', '총신고건', '오류점수', '비율'];
  var DH = ['No', '귀책사유자부호', '신고번호', '란번호', '정정일자 및 시간', '수리구분', '정정구분', '항목코드', '항목명', '오류점수', '변경 후 오류점수', '정정전내역', '정정후내역'];
  function dr(no, decl, score, m) { return [no, '(가상)', decl, 0, '2026-' + m + '-01  10:00:00', '수리후', '정정', 'A1', '(가상)', score, score, '전(가상)', '후(가상)']; }
  var book = ES.readWorkbook([
    { name: '귀책사유자별오류현황목록_9월', aoa: [SH, [1, '', '', '', '', 2000, 30, 1.5]] },
    { name: '귀책사유자별오류상세목록_9월', aoa: [DH, dr(1, '2237126800001X', 10, '09'), dr(2, '4390826000001X', 20, '09')] },
    { name: '귀책사유자별오류현황목록_10월', aoa: [SH, [1, '', '', '', '', 2234, 69, 3.09]] },
    { name: '귀책사유자별오류상세목록_10월', aoa: [DH, dr(1, '2237126813391X', 16, '10'), dr(2, '4215826106228X', 24, '10'), dr(3, '4215826106148X', 0, '10'), dr(4, '4390826009114X', 29, '10')] }
  ], '2026년수출오류(가상).xlsx');
  ES.applyRule([book], ES.normRule(null));
  function R(d, m, hq, plant, pay) { return { declNo: d, month: m, hq: hq, plant: plant, payment: pay || 'TT' }; }
  var erp = { 수출: [
    R('2237126800001X', '2026-09', '건기본부', '1000'), R('4215826100001X', '2026-09', '부품센터', '6000'),
    R('2237126813391X', '2026-10', '건기본부', '1000'), R('2237126813391X', '2026-10', '건기본부', '1000'),
    R('4215826106228X', '2026-10', '부품센터', '6000', 'GN'), R('4215826106148X', '2026-10', '부품센터', '6000'),
    R('2235626000777X', '2026-10', '본부 미분류', ''), R('2235626000999X', '2026-10', '본부 미분류', '7777')],
    수입: [R('2235626B17742M', '2026-10', '엔진본부', '1130', 'GN')] };
  var meta = { files: [{ name: '2026-09~10_수출실적(가상).xlsx', kind: '수출', rows: 8 }, { name: '2026-10_수입실적(가상).xlsx', kind: '수입', rows: 1 }], src: 'errors', at: '2026-11-20T06:20:00Z' };
  var st = ES.erpStoreMerge(null, ES.erpStoreFrom(erp, meta)), old = ES.erpSummary(erp, 2026), nw = ES.erpSumFromStore(st, 2026);
  eq([nw.counts, nw.countsNoGN, nw.byHq], [old.counts, old.countsNoGN, old.byHq], 'v2.3.0 저장값 → 계산값이 지금 계산(erpSummary)과 같음(신고건수 · GN 제외 · 본부별)');
  ok(Object.keys(old.index).every(function (k) { return nw.index[k] && nw.index[k].hq === old.index[k].hq; }) && Object.keys(nw.index).length === Object.keys(old.index).length, 'v2.3.0 신고번호 → 본부 조인표도 같음');
  eq([st.plantOf.수출['2026-10'], st.plantOf.수입['2026-10'], st.counts.수출['2026-10'], st.countsNoGN.수출['2026-10']],
    [{ '2237126813391X': 'B', '4215826106228X': 'P', '4215826106148X': 'P', '2235626000777X': 'N', '2235626000999X': 'U' }, { '2235626B17742M': 'E' }, { 건기본부: 1, 부품센터: 2, 'Plant 없음': 1, 'Plant 미등록': 1 }, 4],
    'v2.3.0 본부 한 글자(B 건기 · E 엔진 · P 부품 · N Plant 없음 · U Plant 미등록) · counts 는 본부별 신고번호 수(GN 포함)');
  ok(!/payment|records|aoa/.test(JSON.stringify(st)) && st.files.every(function (f) { return f.src === 'errors' && f.at === meta.at; }) && JSON.stringify(st.files[0].months) === '["2026-09","2026-10"]', 'v2.3.0 원본 행 없이 결과만 · 파일마다 출처 · 시각 · 달');
  // 같은 달을 다시 올리면 그 달만 바뀜
  var part = ES.erpStoreFrom({ 수출: erp.수출.filter(function (r) { return r.month === '2026-10' && r.declNo !== '4215826106148X'; }) }, { files: [{ name: '2026-10_수출실적(가상).xlsx', kind: '수출', rows: 5 }], src: 'dashboard', at: '2026-11-21T01:00:00Z' });
  var st2 = ES.erpStoreMerge(st, part);
  eq([st2.counts.수출['2026-09'], st2.counts.수출['2026-10'].부품센터, st2.counts.수입['2026-10'], st2.files.map(function (f) { return f.name + ':' + f.months.join('/'); })],
    [{ 건기본부: 1, 부품센터: 1 }, 1, { 엔진본부: 1 }, ['2026-09~10_수출실적(가상).xlsx:2026-09', '2026-10_수입실적(가상).xlsx:2026-10', '2026-10_수출실적(가상).xlsx:2026-10']], 'v2.3.0 같은 달 ERP 를 다시 올리면 그 달만 교체(다른 달 · 다른 종류 그대로)');
  ok(st.counts.수출['2026-10'].부품센터 === 2, 'v2.3.0 합치기는 이전 저장값을 바꾸지 않음(복사)');
  // 1MB 를 넘으면 오래된 달부터 plantOf 를 지우고 counts 는 남김
  var b0 = ES.utf8Len(JSON.stringify(st)), tr = ES.erpStoreTrim(JSON.parse(JSON.stringify(st)), b0 - 1);
  eq([tr.dropped, Object.keys(tr.store.plantOf.수출), tr.store.counts.수출['2026-09'], tr.store.noJoin, ES.ERP_LIMIT, ES.utf8Len('가a')], [[{ kind: '수출', month: '2026-09' }], ['2026-10'], { 건기본부: 1, 부품센터: 1 }, [{ kind: '수출', month: '2026-09' }], 1048576, 4], 'v2.3.0 용량을 넘으면 오래된 달의 조인표만 지움(신고건수는 남김) · 한도 1MB');
  var trs = ES.erpSumFromStore(tr.store, 2026);
  var S = ES.summarize([book], trs.counts, {}), H = ES.hqBreakdown(S, [book], trs), h9 = {}; H.kinds.수출[9].forEach(function (x) { h9[x.region + '|' + x.hq] = x; });
  eq([trs.noJoin.map(function (x) { return x.kind + x.month; }), H.noJoin, !!h9['인천|본부 조인 정보 없음'], h9['인천|본부 조인 정보 없음'].decl, H.notFound.length, !h9['인천|ERP 미매칭']],
    [['수출9'], [{ kind: '수출', month: 9 }], true, null, 0, true], 'v2.3.0 조인표를 지운 달의 인천 오류 건 = 「본부 조인 정보 없음」(ERP 미매칭으로 세지 않음)');
  var H10 = ES.hqBreakdown(S, [book], trs), h10 = {}; H10.kinds.수출[10].forEach(function (x) { h10[x.region + '|' + x.hq] = x; });
  eq([h10['인천|건기본부'].score, h10['인천|부품센터'].score, h10['인천|부품센터'].decl, h10['인천|Plant 없음'].decl], [16, 24, 2, 1], 'v2.3.0 조인표가 남은 달(10월)은 그대로 본부로 나뉨');
  var back = ES.erpStoreMerge(tr.store, ES.erpStoreFrom({ 수출: erp.수출.filter(function (r) { return r.month === '2026-09'; }) }, { files: [{ name: '9월', kind: '수출', rows: 2 }] }));
  eq([back.noJoin, Object.keys(back.plantOf.수출).sort()], [[], ['2026-09', '2026-10']], 'v2.3.0 그 달 ERP 를 다시 올리면 조인표가 돌아오고 「조인 정보 없음」이 사라짐');
  ok(/^인천 신고건수 · 본부: ERP 실적 2026-09, 2026-10 \(오류점수 화면에서 올림 · 11\/20 \d\d:\d\d\)$/.test(ES.erpSourceText(st)) && /대시보드에서 올림 · 오류점수 화면에서 올림/.test(ES.erpSourceText(st2)) && ES.erpSourceText(null) === '', 'v2.3.0 출처 줄 — ERP 실적 달 · 어디서 올렸는지 · 시각');
  // 유니패스 읽은 결과 저장 · 되살리기
  var pk = ES.booksPack([book]), un = ES.booksUnpack(JSON.parse(JSON.stringify(pk)));
  ES.applyRule(un, ES.normRule(null));
  var Sa = ES.summarize([book], trs.counts, {}), Sb = ES.summarize(un, trs.counts, {});
  eq([JSON.stringify(Sb), un[0].rows.length, un[0].fileName, ES.booksUnpack(null), ES.booksUnpack({ v: 9 })], [JSON.stringify(Sa), book.rows.length, book.fileName, [], []], 'v2.3.0 유니패스 결과 저장 → 되살려 계산해도 같은 요약 · 잘못된 저장값은 무시');
  ok(JSON.stringify(pk).length < JSON.stringify([book]).length && Array.isArray(pk.books[0].rowCols) && !pk.books[0].rows, 'v2.3.0 줄은 열 이름 한 번 + 값 배열로 줄여 저장');
  // 화면 — 지우기 창 · 탭 · 기록 · 눈금
  var dj = fsx.readFileSync(__dirname + '/../js/dash.js', 'utf8'), ej = fsx.readFileSync(__dirname + '/../js/errors.js', 'utf8'), eh = fsx.readFileSync(__dirname + '/../errors.html', 'utf8');
  ok(/\{ id: 'data', label: '실적 데이터 \(수입 · 수출 · 관세환급 · 품목분류 · 수입 FTA( · 수출 FTA)?\)', on: true/.test(dj) && /\{ id: 'errsum', label: '오류점수 요약[^']*', on: true/.test(dj) && /\{ id: 'notes', label: '오류점수 관리대장 입력값[^']*', on: false/.test(dj) && /\{ id: 'snaps', label: '수입 FTA 확정 스냅샷', on: false/.test(dj), 'v2.3.0 지우기 창 — 실적 · 오류점수 요약은 기본 체크, 관리대장 입력값 · FTA 확정값은 기본 해제');
  ok(/E\.ERP_KEY \|\| 'b2611-07\.err\.erp', E\.BOOKS_KEY/.test(dj) && /을\(를\) 지웠습니다\.' \+ \(kept\.length \? ' ' \+ esc\(kept\.join\(' · '\)\) \+ '은\(는\) 남겨 두었습니다\.'/.test(dj) && /btn-dash-clear'\)\.addEventListener\('click', clearDialog\)/.test(dj), 'v2.3.0 지우기 — 오류점수 요약에 ERP · 유니패스 결과 포함 · 무엇을 지우고 남겼는지 알림');
  ok(ej.indexOf("notes: 'build-2611-07.err.notes'") > 0 && ES.NOTES_KEY === 'build-2611-07.err.notes', 'v2.3.0 관리대장 입력값 열쇠가 두 화면에서 같음');
  ok(dj.indexOf("state.tab = fOk ? 'fta' : 'errors'") < 0 && /수입 실적 자료가 없습니다\. 위에서 ERP 수입실적 엑셀을 올려 주세요\./.test(dj) && /수입 FTA 자료가 없습니다\. ERP 수입FTA 엑셀을 올려 주세요\./.test(dj) && /오류점수 요약이 없습니다\. 오류점수 화면에서 유니패스 파일을 올려 주세요\./.test(dj), 'v2.3.0 탭을 되돌리지 않음 · 자료 없는 탭은 안내');
  ok(/excludeGN: false/.test(dj) && /!state\.loadingSample\) erpItems\.push/.test(dj) && /src: 'dashboard'/.test(dj) && dj.indexOf("if (info.mode === 'view') { views.push") < dj.indexOf('erpItems.push'), 'v2.3.0 대시보드 확정본 ERP 실적 → 오류점수용 결과(GN 포함 · 예제 · 조회 모드는 넣지 않음)');
  ok(/fmtKind === 'pct' && max \/ 4 < 0\.01 \? function \(v\) \{ return C\.fmtPct\(v, 1\); \}/.test(dj) && /data-k="one-label"/.test(dj) && C_fmtPct(0.015) === '1.5%' && C_fmtPct(0.02) === '2.0%', 'v2.3.0 눈금 간격이 1% 미만이면 소수 첫째 자리(1.5% · 2.0%) · 점이 하나뿐이면 값 라벨');
  ok(/function restoreSaved\(\)/.test(ej) && /localStorage\.setItem\(E\.ERP_KEY/.test(ej) && /localStorage\.setItem\(E\.BOOKS_KEY/.test(ej) && /\[E\.SUMMARY_KEY, E\.ERP_KEY, E\.BOOKS_KEY\]\.forEach/.test(ej) && /id="e-erpsrc"/.test(eh), 'v2.3.0 오류점수 화면 — 열 때 저장값을 먼저 읽음 · 비우기는 요약 · ERP · 유니패스 결과(관리대장 입력값은 그대로)');
  function C_fmtPct(v) { return require('../js/customs.js').fmtPct(v, 1); }
}
// ---------- v2.4.0 수출 FTA 탭 — 담당자 분석본(시트를 내용으로 고름 · 판가 · 절감액 그대로 · 피벗 대조 · 제외 건 · 세율표) ----------
function v240() {
  var CU = require('../js/customs.js'), FRr = require('../js/filerules.js'), E8 = 1e8;
  var H = ['대상FTA', 'Commercial Invoice 번', 'BG', 'BG명', '국가코드', 'Sold-to Party', 'Name', '자재코드', '품명', '수량', '단위', 'HS Code', '거래통화', 'Invoice금액', '단가', '거래통화', '환산금액', '판가', 'CO 번호', 'Invoice금액(CO발급)', 'On Board Date', 'CO(FTA)예비', 'CO(FTA)확정', '확정판정', '철폐스케쥴', 'FTA기본관세율', '적용년도FTA관세율', '적용년도', '기본관세금액1(환산금액)', '기본관세금액2(판가)', 'FTA관세금액1(환산금액)', 'FTA관세금액2(판가)', 'FTA절감관세금액1(환산금액)', 'FTA절감관세금액2(판가)'];
  function row(fta, ci, bg, bgn, country, hs, amt, base, rate, co, judged) {
    var r = H.map(function () { return ''; }), s = amt * (base - rate) / 100;
    r[0] = fta; r[1] = ci; r[2] = bg; r[3] = bgn; r[4] = country; r[6] = '(가상)'; r[11] = hs; r[16] = amt * 0.9; r[17] = amt; r[20] = 46298; r[22] = co; r[23] = judged; r[25] = base; r[26] = rate; r[27] = '2026'; r[32] = s * 0.9; r[33] = s;
    return r;
  }
  var A = [H,
    row('한-EU', 'GXX0001', 'B110', 'CE', '벨기에', '8431499000', 10 * E8, 4.5, 0, 'KR', 'Y'),
    row('한-중', 'GXX0002', 'B110', 'CE', '중국', '8408900000', 4 * E8, 5, 1, '', 'N'),          // CO 확정 없음 · 판정 N — 다시 거르지 않음
    row('한-칠레', 'GXX0003', 'B110', 'CE Gunsan', '칠레', '8429520000', 2 * E8, 6, 0, 'KR', 'Y'),
    row('한-미', 'GXX0004', 'B110', 'CE', '미국', '8431499000', 20 * E8, 2.5, 2.5, 'KR', 'Y')];  // 판가는 크고 절감은 0
  var RAW = [H].concat(A.slice(1)).concat(A.slice(1).map(function (r) { var q = r.slice(); q[25] = 0; q[26] = 0; q[33] = 0; q[1] += 'R'; return q; }));   // 원본 — 절반은 세율 비어 있음
  function pivot(rows, total) { return [['행 레이블', '합계 : 판가', '합계 : FTA절감관세금액2(판가)']].concat(rows).concat([['총합계'].concat(total)]); }
  var PV = pivot([['한-EU', 10 * E8, 0.45 * E8], ['한-미', 20 * E8, 0], ['한-중', 4 * E8, 0.16 * E8], ['한-칠레', 2 * E8, 0.12 * E8]], [36 * E8, 0.73 * E8]);
  var PV0 = pivot([['한-EU', 0, 0]], [0, 0]);
  var EXC = [['대상FTA', 'Commercial Invoice 번', ''], ['한-EU', 'GXX0099', '담당자(가상)']];
  // 시트 이름 · 순서를 바꿔도 내용으로 고른다(분석본 = FTA기본관세율 > 0 비율이 가장 높은 34열 시트)
  var book = [{ name: '피벗B', aoa: PV0.concat([[]]).concat(PV) }, { name: '분석(가상)', aoa: A }, { name: 'ERP원본', aoa: RAW }, { name: '빼낸건', aoa: EXC }, { name: '피벗A', aoa: PV }];
  var name = '2026-10_수출FTA_건기(가상).xlsx', info = FRr.describe(name, null);
  var r = CU.readExportFta(book, name, info.period.single);
  eq([info.dataset, info.mode, info.period.text, info.rule, info.bg, r.ok, r.pick.sheet, r.pick.fill, r.candidates.map(function (c) { return c.sheet + ':' + c.fill; })],
    ['ftaExport', 'confirmed', '2026-10', 'A', '건기본부', true, '분석(가상)', 1, ['분석(가상):1', 'ERP원본:0.5']], 'v2.4.0 분석본 = 34열 시트 중 FTA기본관세율 > 0 비율이 가장 높은 시트(이름 · 순서와 무관) · 비율을 남김');
  ok(/FTA기본관세율 > 0 인 행 4 \/ 4 = 100\.0% \(다른 시트: ERP원본 50\.0%\)/.test(r.pick.why), 'v2.4.0 왜 그 시트를 골랐는지(채움 비율) 문구');
  var sA = r.rows.reduce(function (a, x) { return a + x.amount; }, 0), sS = r.rows.reduce(function (a, x) { return a + x.saving; }, 0);
  eq([r.rows.length, sA / E8, Math.round(sS / 1e4) / 1e4, r.hq, r.month, r.rows[1].coFinal, r.rows[1].judged], [4, 36, 0.73, '건기본부', '2026-10', '', 'N'], 'v2.4.0 모든 행을 그대로(CO확정 없음 · 판정 N 도) · 금액 = 판가(환산금액 아님) · 절감 = FTA절감관세금액2(판가)');
  eq([r.check.ok, r.check.sheet, r.check.rows.map(function (q) { return q.fta + (q.ok ? '' : 'X'); }), r.pivots, r.excluded.sheet, r.excluded.headers, r.excluded.rows], [true, '피벗B', ['한-EU', '한-미', '한-중', '한-칠레'], 2, '빼낸건', ['대상FTA', 'Commercial Invoice 번', '비고'], [['한-EU', 'GXX0099', '담당자(가상)']]], 'v2.4.0 담당자 피벗과 대조(합계 0 블록은 건너뜀) · 제외 건 시트(이름 없는 열 = 비고)');
  // 열 순서를 바꿔도 머리글 이름으로
  var perm = H.map(function (_, i) { return i; }).reverse(), A2 = A.map(function (rr) { return perm.map(function (i) { return rr[i]; }); });
  var r2 = CU.readExportFta([{ name: 'S', aoa: A2 }], name, '2026-10');
  eq([r2.ok, r2.rows.reduce(function (a, x) { return a + x.amount; }, 0) / E8, r2.rows[0].hs, r2.rows[0].baseRate, r2.check], [true, 36, '8431499000', 4.5, null], 'v2.4.0 열 번호가 아니라 머리글 이름으로(순서를 거꾸로 해도 같음) · 피벗이 없으면 대조 없음');
  // 피벗과 다르면 협정별로 차이
  var PVbad = pivot([['한-EU', 10 * E8, 0.45 * E8], ['한-미', 20 * E8, 0], ['한-중', 4.1 * E8, 0.16 * E8], ['한-칠레', 2 * E8, 0.12 * E8]], [36.1 * E8, 0.73 * E8]);
  var r3 = CU.readExportFta([{ name: 'a', aoa: A }, { name: 'p', aoa: PVbad }], name, '2026-10'), bad = r3.check.rows.filter(function (q) { return !q.ok; });
  eq([r3.check.ok, bad.map(function (q) { return q.fta; }), Math.round(bad[0].diffAmount), r3.check.total.ok], [false, ['한-중'], -10000000, false], 'v2.4.0 피벗과 다르면 그 협정 · 차이(원)를 표시');
  // 분석본이 없는 파일(원본만 — 채움 50%) — 집계하지 않고 알림
  var r4 = CU.readExportFta([{ name: 'Sheet1', aoa: RAW }], '2026-10_수출FTA_엔진_V1.0(가상).xlsx', '2026-10');
  ok(!r4.ok && /담당자 분석본\(세율을 채운 시트\)이 없습니다/.test(r4.reason) && r4.rows.length === 0 && CU.EXFTA_MIN_FILL === 0.9, 'v2.4.0 분석본이 없는 파일(가장 높은 채움 < 90%)은 집계하지 않고 알림');
  // 본부 — 파일 이름이 앞서고, BG 열과 다르면 경고
  var r5 = CU.readExportFta([{ name: 'a', aoa: A }], '2026-10_수출FTA_엔진(가상).xlsx', '2026-10');
  eq([r5.hq, r5.rowHq, r5.warnings.filter(function (w) { return /파일 이름은 엔진본부인데 BG 열은 건기본부/.test(w); }).length], ['엔진본부', '건기본부', 1], 'v2.4.0 본부 = 파일 이름(건기 · 엔진) · BG 열(B110 · B111 = 건기, B130 = 엔진)과 다르면 경고');
  eq([CU.readExportFta([{ name: 'a', aoa: A }], '수출FTA(가상).xlsx', null).hq, CU.readExportFta([{ name: 'a', aoa: A }], '수출FTA(가상).xlsx', null).month], ['건기본부', '2026-10'], 'v2.4.0 이름에 본부 · 월이 없으면 BG 열 · On Board Date 로');
  // 집계 — 두 파일(같은 달 건기 · 엔진) + 앞 달
  var EM = [H, row('한-EU', 'E0001', 'B130', 'EM', '독일', '8408900000', 8 * E8, 2.7, 0, 'KR', 'Y'), row('한-중', 'E0002', 'B130', 'EM', '중국', '8408900000', 3 * E8, 5, 1, 'KR', 'Y')];
  var fE = CU.readExportFta([{ name: 'x', aoa: EM }], '2026-10_수출FTA_엔진(가상).xlsx', '2026-10'), f9 = CU.readExportFta([{ name: 'x', aoa: EM }], '2026-09_수출FTA_엔진(가상).xlsx', '2026-09');
  var rep = CU.exportFtaReport([r, fE, f9, r4], {}), e = function (v) { return Math.round(v / 1e4) / 1e4; };
  eq([rep.month, rep.months, e(rep.current.saving), rep.current.amount / E8, rep.current.lines, rep.current.byHq.map(function (q) { return q.hq + ':' + e(q.saving); }), e(rep.cumulative.saving), rep.files.length],
    ['2026-10', ['2026-09', '2026-10'], 1.066, 47, 6, ['건기본부:0.73', '엔진본부:0.336'], 1.402, 2], 'v2.4.0 두 파일(건기 · 엔진)을 같은 달로 합쳐 전사 · 누적 · 분석본 없는 파일은 빠짐');
  eq(rep.agreements.map(function (a) { return [a.key, e(a.saving), a.amount / E8, Math.round(a.rate * 10000) / 100]; }), [['한-EU', 0.666, 18, 3.7], ['한-중', 0.28, 7, 4], ['한-칠레', 0.12, 2, 6], ['한-미', 0, 20, 0]], 'v2.4.0 협정별 — 절감액 큰 순서 · 유효절감율(절감 ÷ 판가) — 한-미는 판가가 커도 0%');
  eq([rep.monthlyHq.map(function (q) { return q.month + ':' + q.rows.map(function (w) { return w.hq; }).join('/'); }), rep.countries[0].key, CU.exportFtaReport([], {}).month], [['2026-09:엔진본부', '2026-10:건기본부/엔진본부'], '벨기에', null], 'v2.4.0 월별 본부별(쌓은 막대) · 국가별 상위');
  // [8] 세율표 — 분석본에서 모으기 · 커버리지 · 불일치 · 검증용 계산
  var m1 = CU.exftaRatesMerge(null, r), m2 = CU.exftaRatesMerge(m1.table, r);
  eq([m1.coverage, m2.coverage.pct, Object.keys(m1.table.rates).length, m1.table.rates['한-EU|8431499000|벨기에'].months['2026-10']], [{ total: 4, existed: 0, added: 4, pct: 0 }, 1, 4, [4.5, 0]], 'v2.4.0 세율표 — (협정 · HS · 국가)별 기본 · FTA 세율 · 커버리지(이미 있던 것 % · 새로 건수)');
  var r9 = JSON.parse(JSON.stringify(r)); r9.month = '2026-11'; r9.rows[0].baseRate = 4;
  var m3 = CU.exftaRatesMerge(m1.table, r9), lst = CU.exftaRatesList(m3.table);
  eq([m3.conflicts.length, lst[0].key, lst[0].conflict, /달마다 다름: 2026-10 4\.5\/0 · 2026-11 4\/0/.test(lst[0].why), m1.table.rates['한-EU|8431499000|벨기에'].conflict], [1, '한-EU|8431499000|벨기에', true, true, false], 'v2.4.0 같은 (협정 · HS · 국가)인데 달마다 세율이 다르면 「세율 불일치」(맨 위로)');
  var rw = JSON.parse(JSON.stringify(r)); rw.rows.push(Object.assign({}, rw.rows[0], { baseRate: 3 }));
  ok(CU.exftaRatesMerge(null, rw).conflicts.length === 1, 'v2.4.0 같은 달 안에서 세율이 둘이어도 불일치');
  var cc = CU.exftaCalc(r.rows, m1.table, '2026-10'), cc9 = CU.exftaCalc(r.rows, m3.table, '2026-11');
  eq([e(cc.saving), cc.hit, e(cc9.saving)], [0.73, 4, 0.68], 'v2.4.0 검증용 「세율표로 계산하면」 = 판가 × (기본 − FTA)% (그 달 세율 — 세율이 바뀐 달은 값이 벌어짐)');
  var pk = CU.exftaUnpack(JSON.parse(JSON.stringify(CU.exftaPack([r]))));
  eq([pk[0].rows.length, pk[0].rows[3].amount, pk[0].pick.sheet, pk[0].check.ok, CU.exftaUnpack(null)], [4, 20 * E8, '분석(가상)', true, []], 'v2.4.0 저장은 읽은 결과만(원본 엑셀 없음) · 되살리기');
  // 파일 이름 · 내용 판별
  eq([FRr.describe('2026_10_수출FTA_건기.xlsx', null).period.text, FRr.describe('2026_10_수출FTA_건기.xlsx', null).dataset, FRr.describe('2026_10_수입실적.xlsx', null).period.single, FRr.describe('2026_13_x.xlsx', null).period.text, FRr.describe('2026_수입실적.xlsx', null).period.text],
    ['2026-10', 'ftaExport', '2026-10', '2026', '2026'], 'v2.4.0 밑줄 연 · 월(2026_10_)도 2026-10 · 월이 13 이면 연도만');
  ok(CU.isExportFtaBook(book) && !CU.isExportFtaBook([{ name: 's', aoa: CU.sampleImportErp().aoa }]) && FRr.describe('x.xlsx', { kind: 'ftaExport' }).dataset === 'ftaExport', 'v2.4.0 이름이 달라도 내용(대상FTA · 판가 · FTA기본관세율 · FTA절감관세금액2(판가))으로 수출 FTA');
  ok(CU.KINDS.indexOf('ftaExport') < 0 && CU.KINDS.indexOf('ftaImport') >= 0, 'v2.4.0 수출 FTA 는 실적 묶음(KINDS)에 넣지 않음 — 수입 FTA 와 별개 탭');
  // 화면
  var dj = fsx.readFileSync(__dirname + '/../js/dash.js', 'utf8'), dh = fsx.readFileSync(__dirname + '/../dashboard.html', 'utf8');
  ok(/data-tab="fta"[^>]*>수입 FTA<\/button>\s*<button role="tab" class="tab" data-tab="exfta"[^>]*>수출 FTA</.test(dh) && /id="t-exfta"/.test(dh) && /exfta: renderExportFta/.test(dj), 'v2.4.0 「수출 FTA」 탭(수입 FTA 다음 · 별개)');
  ok(dj.indexOf("info.dataset === 'ftaExport'") > 0 && dj.indexOf("info.dataset === 'ftaExport'") < dj.indexOf("if (info.group === 'fta' && !info.dataset)"), 'v2.4.0 수출 FTA 분석본은 목록 보관이 아니라 자기 탭으로');
  var body = dj.slice(dj.indexOf('function renderExportFta()'), dj.indexOf('function renderFta()'));
  var ord = ['exfta-k-saving', 'exfta-k-cum', 'exfta-k-amount', 'exfta-k-lines', 'exfta-ch-saving', 'exfta-ch-agree', 'exfta-rate-note', "'exfta-agree'", 'exfta-check', "'exfta-country'", 'exfta-excl', 'exfta-foot'].map(function (k) { return body.indexOf(k); });
  ok(ord.every(function (v, i) { return v > 0 && (!i || v > ord[i - 1]); }) && /C\.hqColor\(hq\)/.test(body) && /유효절감율/.test(body) && /세율표로 계산하면/.test(body), 'v2.4.0 화면 — 카드 4 · 본부별 쌓은 막대(본부 고정색) · 협정별 · 유효절감율 · 피벗 대조 · 국가 · 제외 건 · 하단 근거', JSON.stringify(ord));
  ok(/\{ id: 'exrates', label: '수출 FTA 세율표 \(분석본에서 모은 세율\)', on: false/.test(dj) && /LS\.files, C\.EXFTA_DATA_KEY\]/.test(dj) && /data-exrates-xlsx/.test(dj) && CU.EXFTA_RATES_KEY === 'b2611-07.exfta.rates', 'v2.4.0 세율표는 지우기 창에서 따로(기본 해제) · 수출 FTA 집계 자료는 실적 데이터 · 설정에서 세율표 내보내기');
}
// ---------- v2.5.0 금액 단위 — 고른 단위로만 표시(원 · 백만원 · 천만원 · 억원) ----------
function v250() {
  var CU = require('../js/customs.js'), V = 221600000000;
  eq(CU.UNIT_LIST.map(function (u) { return CU.fmtShort(V, u); }), ['221,600,000,000원', '221,600백만원', '22,160천만원', '2,216억원'], 'v2.5.0 [검증] 221,600,000,000원 → 원 · 백만원 · 천만원 · 억원');
  eq([CU.UNIT_LIST, CU.UNIT_DEFAULT, CU.UNITS], [['원', '백만원', '천만원', '억원'], '억원', { '원': 1, '백만원': 1e6, '천만원': 1e7, '억원': 1e8 }], 'v2.5.0 단위 네 가지 · 기본 억원');
  eq([CU.fmtShort(940000000, '억원'), CU.fmtShort(1000000000, '억원'), CU.fmtShort(996000000, '억원'), CU.fmtShort(-940000000, '억원'), CU.fmtShort(-2216e8, '억원'), CU.fmtShort(1234567.6, '원'), CU.fmtShort(5500000, '백만원'), CU.fmtShort(123456789, '천만원')],
    ['9.4억원', '10억원', '10.0억원', '-9.4억원', '-2,216억원', '1,234,568원', '5.5백만원', '12천만원'], 'v2.5.0 소수 첫째 · 그 단위로 10 이상이면 정수 · 원은 정수 · 음수 「-」');
  eq([CU.fmtShort(0, '억원'), CU.fmtShort(null, '원'), CU.fmtShort(NaN, '억원'), CU.fmtUnitNum(0, '원')], ['—', '—', '—', '—'], 'v2.5.0 0 · 빈값은 「—」');
  eq([CU.fmtShort(1e8, '천원'), CU.fmtShort(1e8, 'USD'), CU.normUnit(undefined), CU.fmtShort(1e8)], ['1.0억원', '1.0억원', '억원', '1.0억원'], 'v2.5.0 목록에 없는 단위(천원 · USD)는 기본 억원 — USD 는 열 이름일 뿐 표시 단위가 아님');
  eq([CU.fmtUnitNum(V, '억원'), CU.fmtUnitNum(49804000000, '억원', 2), CU.fmtUnitNum(49804000000, '백만원', 2), CU.fmtUnitNum(49804000000, '원', 2), CU.fmtUnitNum(8000000, '억원', 2)], ['2,216', '498.04', '49,804.00', '49,804,000,000', '0.08'], 'v2.5.0 숫자만(표 · 축) · FTA 는 고른 단위 · 소수 둘째(원은 정수)');
  ok(CU.UNIT_LIST.every(function (u) { return Math.abs(Number(CU.fmtUnitNum(V, u).replace(/,/g, '')) * CU.UNITS[u] - V) < CU.UNITS[u]; }), 'v2.5.0 어떤 단위를 골라도 값은 같고 반올림만 다름');
  eq([CU.toUnit(V, '억원'), CU.toUnit(123456789, '백만원'), CU.toUnit(V, '원'), CU.toUnit('x', '억원')], [2216, 123.46, V, 'x'], 'v2.5.0 엑셀 숫자 — 고른 단위로 나눔(소수 둘째 반올림 · 원은 그대로)');
  // 엑셀 내보내기 — 금액 열만 고른 단위로 · 머리글에 단위 · 금액 단위 줄
  var data = {}; CU.sampleFiles().forEach(function (f) { var d = CU.detectKind(CU.uniqueHeaders(f.aoa[0]), f.name), k = d.kind; if (!k || !CU.DATASETS[k]) return; var m = CU.mergeFiles(k, [{ name: f.name, file: f.name, headers: CU.uniqueHeaders(f.aoa[0]), aoa: f.aoa, offset: 0, override: {} }], CU.exportSettings(null)); if (m.ok) data[k] = { file: f.name, period: m.period, records: m.records, map: m.map, skipped: m.skipped }; });
  var rg = CU.defaultRange(CU.unionPeriod(Object.keys(data).map(function (k) { return data[k].period; })));
  var ctx = function (u) { return { range: rg, rulingRange: CU.rulingDefaultRange(CU.rulingPeriod(data.ruling ? data.ruling.records : [])), filter: {}, unit: u, data: data, exportOpts: CU.exportSettings(null) }; };
  var bW = CU.exportBook(ctx('원')), bE = CU.exportBook(ctx('억원')), sh = function (b, n) { return b.filter(function (x) { return x.name === n; })[0]; };
  var iW = sh(bW, '수입_본부'), iE = sh(bE, '수입_본부'), rE = sh(bE, '환급_본부월'), rW = sh(bW, '환급_본부월'), dE = sh(bE, '결정문_목록');
  eq([iE.aoa[0], iE.aoa[1][1] === iW.aoa[1][1], iE.aoa[1][2], iE.aoa[1][4] === iW.aoa[1][4]], [['본부', '건수', '물자대(억원)', '관세(억원)', '관세부담율(%)'], true, Math.round(iW.aoa[1][2] / 1e6) / 100, true], 'v2.5.0 엑셀 — 금액 열만 억원으로(건수 · 비율 그대로) · 머리글에 단위');
  eq([rE.aoa[0][1], rE.aoa[0][rE.aoa[0].length - 1], rE.aoa[1][rE.aoa[1].length - 1] === rW.aoa[1][rW.aoa[1].length - 1], dE.aoa[0].slice(5), sh(bE, '수출_본부').aoa[0]],
    ['2025.01(억원)', '건수(건수 열의 합)', true, ['관세율', '종전세율', '관세사', '연간 수입액(억원)', '절감 추정(억원)'], ['본부', '건수', '수출금액(억원)', '전년 동기(억원)', '증감(억원)', '증감률(%)']], 'v2.5.0 엑셀 — 환급 달 열 · 합계도 금액, 관세율 · 종전세율 · 건수는 그대로');
  eq([bE[0].aoa.filter(function (r) { return r[0] === '금액 단위'; })[0][1], JSON.stringify(sh(bW, '수입_본부').aoa[0]).indexOf('(원)') < 0], ['억원', true], 'v2.5.0 엑셀 「금액 단위」 = 화면 단위 · 원이면 그대로(머리글도 그대로)');
  // 화면
  var dj = fsx.readFileSync(__dirname + '/../js/dash.js', 'utf8'), dh = fsx.readFileSync(__dirname + '/../dashboard.html', 'utf8');
  ok(/<select id="f-unit"><option>원<\/option><option>백만원<\/option><option>천만원<\/option><option selected>억원<\/option><\/select>/.test(dh) && !/USD|천원/.test(dh.match(/<select id="f-unit">[\s\S]*?<\/select>/)[0]), 'v2.5.0 단위 선택지 — 원 · 백만원 · 천만원 · 억원(기본 억원 · USD · 천원 없음)');
  ok(/function unitInit\(\)/.test(dj) && /localStorage\.getItem\(LS\.unit \+ '\.v'\) !== '2'/.test(dj) && /return C\.normUnit\(v\)/.test(dj), 'v2.5.0 예전 단위 저장값(올린 파일 단위)은 한 번만 기본 억원으로');
  var body = dj.replace(/\/\/[^\r\n]*/g, '');
  var mail = dj.slice(dj.indexOf('function ftaMailHtml'), dj.indexOf('function copyHtml'));
  ok(!/\(억원\)|단위 억원|\+ '억|'\(억\)|물자대\(억\)/.test(body.replace(mail, '')) && /\(단위: 억원\)<\/p>/.test(mail) && mail.indexOf('eokT(') < 0 && /eokMail\(/.test(mail), 'v2.5.0 화면에 박힌 「억원」 없음 — 메일용 표만 늘 억원 · 소수 둘째(보고 양식)');
  ok(/function eokT\(v\) \{ return v == null \? '—' : C\.fmtUnitNum\(v, state\.unit, 2\); \}/.test(dj) && /function eokU\(v\)/.test(dj), 'v2.5.0 FTA 탭 — 원 단위로 집계해 둔 값을 표시할 때만 고른 단위로(소수 둘째)');
  ok(/C\.fmtUnitNum\(v, state\.unit\); \}; \}/.test(dj) && /if \(!fmtKind \|\| fmtKind === 'money'\) title = UT\(title\);/.test(dj) && /if \(fmt === money\) title = UT\(title\);/.test(dj) && (dj.match(/title = UT\(title\);/g) || []).length === 5, 'v2.5.0 금액 축 = 고른 단위 숫자 · 금액 차트 제목에 (단위: …)');
  ok(!/n0\((?:[a-z]+\.)*(?:goods|duty|dutyExcl|amount|prev|ftaGoods|saving)\)/.test(dj) && /p\.months\.map\(m0\)/.test(dj) && /U\('물자대'\)/.test(dj) && /U\('FOB'\)/.test(dj) && /sp\(g\.diff, ms0\(g\.diff\)\)/.test(dj), 'v2.5.0 실적 · 환급 표 — 금액 칸은 고른 단위(건수는 그대로) · 머리글에 단위');
  ok(dj.indexOf('금액 단위는 올린 파일 그대로') < 0 && /금액은 원화 원본을 고른 단위\(' \+ esc\(state\.unit\) \+ '\)로 나눠 보입니다/.test(dj), 'v2.5.0 조건 줄 문구 — 고른 단위로 나눠 보임');
}
// ---------- v2.6.0 수입 FTA · 수출 FTA · 오류점수 탭도 상단 조회 기간(state.range)을 따름 ----------
function v260() {
  var CU = require('../js/customs.js'), FRr = require('../js/filerules.js'), ES = require('../js/errscore.js'), E8 = 1e8, e = function (v) { return Math.round(v / 1e4) / 1e4; };
  // 수입 FTA — 가짜 「(가상)」 9월 · 10월
  var HD = ['Import declaration number', 'Column sequence number', 'Duty Type', 'Plant', 'Payment method', '(\\)Taxable.Amt', 'Tariff Reductions', 'Acceptance date', 'FTA N/A Code', 'N/A Reason'];
  function row(d, dt, plant, krw, red, date, na) { return [d, 1, dt, plant, 'TT', krw * E8, red * E8, date, na || '', '']; }
  var aoa = [HD, row('2235626200001M', 'FCN1', '1000', 10, 1, '2026-09-05'), row('2235626200002M', 'C', '1130', 2, 0, '2026-09-10', '04'),
    row('2235626200003M', 'FCN1', '1000', 8, 1.2, '2026-10-03'), row('2235626200004M', 'FEU1', '1130', 6, 0.6, '2026-10-04'), row('2235626200005M', 'C', '6000', 4, 0, '2026-10-06', '02')];
  var name = '2026-09~10_수입FTA(가상).xlsx', info = FRr.describe(name, CU.detectKind(CU.uniqueHeaders(HD), name));
  var m = CU.mergeFiles('ftaImport', [{ name: name, file: name, headers: CU.uniqueHeaders(HD), aoa: aoa, offset: 0, override: {}, meta: info }], CU.exportSettings(null));
  var fp = {}; fp[name] = info.period.months;
  var tot = function (rows) { var t = rows[rows.length - 1]; return [e(t.all), e(t.fta), e(t.saving)]; };
  var r2 = CU.ftaImportReport(m.records, { range: { from: '2026-09', to: '2026-10' }, filePeriods: fp, today: '2026-11-20' });
  eq([r2.month, r2.series, tot(r2.current), tot(r2.cumulative), e(r2.kpi.cumSaving), r2.kpi.cumMonths, r2.range, r2.empty, e(r2.pending.cumulative.amount)],
    ['2026-10', ['2026-09', '2026-10'], [18, 14, 1.8], [30, 24, 2.8], 2.8, 2, { from: '2026-09', to: '2026-10' }, false, 2], 'v2.6.0 수입 FTA — 기간 09~10: 당월 = 마지막 달(10월) · 누적 = 두 달 합 · 대기도 기간');
  var r1 = CU.ftaImportReport(m.records, { range: { from: '2026-10', to: '2026-10' }, filePeriods: fp });
  eq([tot(r1.current), tot(r1.cumulative), r1.series, e(r1.pending.cumulative.amount)], [[18, 14, 1.8], [18, 14, 1.8], ['2026-10'], 0], 'v2.6.0 수입 FTA — 한 달(10~10)이면 그 달만');
  var r3 = CU.ftaImportReport(m.records, { range: { from: '2026-08', to: '2026-10' }, filePeriods: fp });
  eq([r3.series, r3.monthly.map(function (q) { return q.empty; }), r3.monthlyHq[0].rows.every(function (q) { return !q.lines; }), r3.kpi.cumMonths, tot(r3.cumulative)], [['2026-08', '2026-09', '2026-10'], [true, false, false], true, 2, [30, 24, 2.8]], 'v2.6.0 자료 없는 달은 계열에 빈칸(0 막대 아님 · empty 표시) · 월평균은 자료 있는 달 수로');
  var r4 = CU.ftaImportReport(m.records, { range: { from: '2026-11', to: '2026-12' }, filePeriods: fp });
  eq([r4.empty, r4.month, r4.months], [true, '2026-12', ['2026-09', '2026-10']], 'v2.6.0 기간에 자료가 없으면 empty(화면 「선택 기간에 자료가 없습니다」)');
  var r0 = CU.ftaImportReport(m.records, { month: '2026-10', filePeriods: fp });
  eq([tot(r0.cumulative), r0.series, r0.range], [[30, 24, 2.8], ['2026-09', '2026-10'], { from: '2026-01', to: '2026-10' }], 'v2.6.0 기간을 주지 않으면 예전 그대로(1월 ~ 그 달)');
  // 수출 FTA — 9월 엔진 · 10월 건기 · 엔진
  var H = ['대상FTA', 'Commercial Invoice 번', 'BG', '국가코드', 'HS Code', '판가', 'FTA기본관세율', '적용년도FTA관세율', 'FTA절감관세금액2(판가)'];
  function xr(fta, bg, c, amt, base, rate) { return [fta, 'CI(가상)', bg, c, '8408900000', amt * E8, base, rate, amt * E8 * (base - rate) / 100]; }
  var fG = CU.readExportFta([{ name: 'a', aoa: [H, xr('한-EU', 'B110', '벨기에', 10, 4.5, 0)] }], '2026-10_수출FTA_건기(가상).xlsx', '2026-10');
  var fE = CU.readExportFta([{ name: 'a', aoa: [H, xr('한-중', 'B130', '중국', 3, 5, 1)] }], '2026-10_수출FTA_엔진(가상).xlsx', '2026-10');
  var f9 = CU.readExportFta([{ name: 'a', aoa: [H, xr('한-EU', 'B130', '독일', 8, 2.7, 0)] }], '2026-09_수출FTA_엔진(가상).xlsx', '2026-09');
  var x2 = CU.exportFtaReport([fG, fE, f9], { range: { from: '2026-09', to: '2026-10' } });
  eq([x2.month, e(x2.current.saving), e(x2.cumulative.saving), x2.cumulative.lines, x2.agreements.map(function (a) { return a.key + ':' + e(a.saving); }), x2.files.length, x2.countries[0].key, x2.series],
    ['2026-10', 0.57, 0.786, 3, ['한-EU:0.666', '한-중:0.12'], 3, '벨기에', ['2026-09', '2026-10']], 'v2.6.0 수출 FTA — 기간 09~10: 당월 = 10월 · 누적 · 협정 · 국가 · 파일 = 기간 합');
  var x1 = CU.exportFtaReport([fG, fE, f9], { range: { from: '2026-10', to: '2026-10' } }), x0 = CU.exportFtaReport([fG, fE, f9], { month: '2026-10' });
  eq([e(x1.cumulative.saving), x1.agreements.map(function (a) { return a.key; }), x1.files.length, CU.exportFtaReport([fG], { range: { from: '2026-11', to: '2026-11' } }).empty, e(x0.cumulative.saving), x0.agreements.length], [0.57, ['한-EU', '한-중'], 2, true, 0.786, 2], 'v2.6.0 수출 FTA — 한 달이면 그 달만 · 자료 없는 기간은 empty · 기간을 주지 않으면 예전 그대로');
  // 오류점수 — 요약에서 기간 안 달만(종합 = 기간 합계)
  function R(ym, kind, decl, score, err) { return { ym: ym, kind: kind, region: '종합', hq: null, decl: decl, err: err, errScored: err, score: score }; }
  var sum = { rows: [R('2026-09', '수입', 1764, 38, 3), R('2026-09', '수출', 2227, 124, 20), R('2026-10', '수입', 1740, 0, 0), R('2026-10', '수출', 2234, 69, 14), { ym: '2026-10', kind: '수출', region: '인천', hq: null, decl: 1479, err: 3, errScored: 2, score: 40 }] };
  var s2 = ES.rangeSummary(sum, { from: '2026-09', to: '2026-10' });
  eq([s2.total.decl, s2.total.score, s2.total.rate, s2.last.total.decl, s2.last.total.score, s2.last.total.rate, s2.months, s2.empty], [7965, 231, 2.9, 3974, 69, 1.74, ['2026-09', '2026-10'], false], 'v2.6.0 [검증] 오류점수 2026.09~10 종합 = 신고 7,965 · 오류점수 231 · 2.90% · 당월(10월) 3,974 · 69 · 1.74%');
  var s1 = ES.rangeSummary(sum, { from: '2026-10', to: '2026-10' }), s3 = ES.rangeSummary(sum, { from: '2026-08', to: '2026-10' }), s4 = ES.rangeSummary(sum, { from: '2026-11', to: '2026-11' });
  eq([s1.total.decl, s1.total.score, s3.months.length, s3.withData, s3.total.decl, !!s3.byMonth['2026-08'], s4.empty, s4.last], [3974, 69, 3, ['2026-09', '2026-10'], 7965, false, true, null], 'v2.6.0 오류점수 — 한 달 · 자료 없는 달은 집계에서 빠지고 추이에만(빈칸) · 자료 없는 기간');
  var sp = ES.rangeSummary({ rows: [R('2026-09', '수입', 1764, 38, 3), R('2026-10', '수입', 1740, 0, 0), R('2026-10', '수출', 2234, 69, 14)] }, { from: '2026-09', to: '2026-10' });
  eq([sp.total.decl, sp.total.rate, sp.total.partial, sp.total.score], [null, null, true, 107], 'v2.6.0 한쪽 자료뿐인 달이 있으면 기간 신고건수 · 비율은 「자료 없음」(점수는 합)');
  // 화면 — 탭 안 월 선택 없앰 · 상단 기간 · 조회 기간 표기
  var dj = fsx.readFileSync(__dirname + '/../js/dash.js', 'utf8');
  ok(dj.indexOf('<select id="fta-month">') < 0 && dj.indexOf('<select id="exfta-month">') < 0 && !/state\.ftaMonth|state\.exftaMonth/.test(dj), 'v2.6.0 수입 FTA · 수출 FTA 탭 안 월 선택 없앰(상단 기간을 따름)');
  ok(/C\.ftaImportReport\(s\.m\.records, \{ range: state\.range,/.test(dj) && /C\.exportFtaReport\(state\.exfta, \{ range: state\.range,/.test(dj) && /ES\.rangeSummary\(sum, state\.range\)/.test(dj), 'v2.6.0 세 탭 렌더가 state.range 를 참조(f-from · f-to 를 바꾸면 renderTab 으로 함께 갱신)');
  ok(/function extraPeriods\(\)/.test(dj) && /C\.unionPeriod\(\[basePeriod\]\.concat\(extraPeriods\(\)\)\)/.test(dj) && /C\.defaultRange\(basePeriod \|\| period\)/.test(dj), 'v2.6.0 기간 선택지에 수입 FTA · 수출 FTA · 오류점수 달을 더함 · 기본 기간은 실적이 있으면 실적 기준(v2.1.0 기준월 문제 방지)');
  ok(/수리일자 기준 · 조회 기간 ' \+ esc\(rangeText\(r\.range\)\)/.test(dj) && /판가\(원화\) · 조회 기간 ' \+ esc\(rgT\)/.test(dj) && /data-k="err-basis">조회 기간 ' \+ esc\(rgT\)/.test(dj), 'v2.6.0 세 탭 상단 · 기준에 「조회 기간 …」');
  ok(/선택 기간\(' \+ esc\(rangeText\(r\.range\)\) \+ '\)에 자료가 없습니다/.test(dj) && /data-k="exfta-empty"/.test(dj) && /data-k="err-empty"/.test(dj) && /function mailCumTitle\(rep\)/.test(dj), 'v2.6.0 기간에 자료가 없으면 「선택 기간에 자료가 없습니다」 · 메일 표 누적 제목은 기간으로');
}
// ---------- v2.7.0 예제 = samples/ 의 실제 구조 파일 9개(가상 데이터 · 2026년 9~10월) ----------
function v270() {
  var CU = require('../js/customs.js'), FRr = require('../js/filerules.js'), ES = require('../js/errscore.js'), XL = require('../lib/xlsx.full.min.js'), S = __dirname + '/../samples/';
  var EX = ['2026_예제(가상)_수입실적.xlsx', '2026_예제(가상)_수출실적.xlsx', '2026_예제(가상)_수입FTA.xlsx', '2026-10_예제(가상)_수출FTA_건기.xlsx', '2026-10_예제(가상)_수출FTA_엔진.xlsx', '2026_예제(가상)_수입오류.xlsx', '2026_예제(가상)_수출오류.xlsx', '2026_예제(가상)_관세환급.xlsx', '2026_예제(가상)_품목분류결정문.xlsx'];
  ok(EX.every(function (n) { return fsx.existsSync(S + n); }), 'v2.7.0 samples/ 에 예제 9개');
  function raw(n) { var wb = XL.read(fsx.readFileSync(S + n), { type: 'buffer' }); return wb.SheetNames.map(function (s) { return { name: s, aoa: XL.utils.sheet_to_json(wb.Sheets[s], { header: 1, raw: true, defval: '' }) }; }); }
  function load(n) { var sh = raw(n).map(function (s) { var hr = CU.findHeaderRow(s.aoa); return { name: s.name, aoa: s.aoa.slice(hr), offset: hr }; }).filter(function (x) { return x.aoa.length > 1; }); var pk = CU.pickSheets(sh, n), u = pk.use[0], info = FRr.describe(n, pk.detect); return { info: info, kind: pk.detect.kind, item: { name: n, file: n, headers: CU.uniqueHeaders(u.aoa[0]), aoa: u.aoa, offset: u.offset, override: {}, meta: info } }; }
  var want = { '2026_예제(가상)_수입실적.xlsx': 'import', '2026_예제(가상)_수출실적.xlsx': 'export', '2026_예제(가상)_수입FTA.xlsx': 'ftaImport', '2026_예제(가상)_관세환급.xlsx': 'refund', '2026_예제(가상)_품목분류결정문.xlsx': 'ruling' }, got = {}, rec = {};
  Object.keys(want).forEach(function (n) { var L = load(n), m = CU.mergeFiles(L.info.dataset, [L.item], CU.exportSettings(null)); rec[n] = m; got[n] = [L.kind, L.info.dataset, L.info.mode, m.ok, m.files[0].res.missing.length, m.records.length > 0, m.period.to]; });
  eq(Object.keys(want).map(function (n) { return got[n]; }), Object.keys(want).map(function (n) { return [want[n], want[n], 'confirmed', true, 0, true, /결정문/.test(n) ? '2026-09' : '2026-10']; }), 'v2.7.0 대시보드 예제 5개 — 내용 · 이름 모두 맞는 종류 · 확정본 · 필수 열 다 찾음 · 2026-10 까지(결정문 예제는 9월까지)');
  eq(['2026_예제(가상)_수입실적.xlsx', '2026_예제(가상)_수출실적.xlsx', '2026_예제(가상)_관세환급.xlsx', '2026_예제(가상)_수입FTA.xlsx'].map(function (n) { return rec[n].period.from + '~' + rec[n].period.to; }), ['2026-09~2026-10', '2026-09~2026-10', '2026-09~2026-10', '2026-09~2026-10'], 'v2.7.0 예제 기간 2026년 9~10월');
  var xg = CU.readExportFta(raw('2026-10_예제(가상)_수출FTA_건기.xlsx'), '2026-10_예제(가상)_수출FTA_건기.xlsx', '2026-10'), xe = CU.readExportFta(raw('2026-10_예제(가상)_수출FTA_엔진.xlsx'), '2026-10_예제(가상)_수출FTA_엔진.xlsx', '2026-10');
  eq([xg.ok, xg.hq, xg.pick.sheet, xg.pick.fill, xg.check.ok, xg.excluded.rows.length, xe.ok, xe.hq, xe.pick.sheet, xe.check.ok, FRr.describe('2026-10_예제(가상)_수출FTA_건기.xlsx', null).dataset],
    [true, '건기본부', 'Sheet2', 1, true, 2, true, '엔진본부', 'Sheet2', true, 'ftaExport'], 'v2.7.0 수출FTA 예제(담당자 분석본) — Sheet2 를 내용으로 골라 집계 · 담당자 피벗과 일치 · 제외 건');
  // 오류점수 예제 — 유니패스 수입 · 수출 + ERP 실적(GN 포함)이 신고번호로 이어짐
  var rule = ES.normRule(null), books = ['2026_예제(가상)_수입오류.xlsx', '2026_예제(가상)_수출오류.xlsx'].map(function (n) { return ES.readWorkbook(raw(n), n, rule); });
  var gn = CU.exportSettings(null); gn.excludeGN = false;
  var ri = CU.mergeFiles('import', [load('2026_예제(가상)_수입실적.xlsx').item], gn).records, re = CU.mergeFiles('export', [load('2026_예제(가상)_수출실적.xlsx').item], gn).records;
  var store = ES.erpStoreFrom({ 수입: ri, 수출: re }, { files: [{ name: 'i', kind: '수입', rows: ri.length }, { name: 'e', kind: '수출', rows: re.length }], src: 'example' });
  var res = ES.summaryFrom(books, store, { rule: rule });
  eq([books.map(function (b) { return b.kind; }), res.year, res.hq.notFound.length, Object.keys(res.summary.kinds.수출.months).sort(), res.saved.rows.length > 0], [['수입', '수출'], 2026, 0, ['10', '9'], true], 'v2.7.0 유니패스 예제(수입 · 수출) — 오류 신고번호가 모두 ERP 실적에 있음(ERP 미매칭 0)');
  var hqs = {}; ['수입', '수출'].forEach(function (k) { [9, 10].forEach(function (m) { (res.hq.kinds[k][m] || []).forEach(function (x) { if (x.region === '인천') hqs[x.hq] = 1; }); }); });
  var L = ES.ledgerRows(ES.byDecl(res.rows), {}, res.erpSum, {});
  eq([Object.keys(hqs).sort(), L.length, L.every(function (r) { return ['건기', '엔진', '부품'].indexOf(r.div) >= 0; })], [['건기본부', '부품센터', '엔진본부'], 6, true], 'v2.7.0 예제에서도 지역 · 본부 · 관리대장이 채워짐(사업부 건기 · 엔진 · 부품)');
  // summaryFrom = 예전 오류점수 화면 계산(erpSummary 경로)과 같은 요약
  var old = ES.erpSummary({ 수입: ri, 수출: re }, 2026), cnt = { 수입: {}, 수출: {} }; ['수입', '수출'].forEach(function (k) { Object.keys(old.counts[k]).forEach(function (m) { cnt[k][m] = old.counts[k][m]; }); });
  ok(JSON.stringify(ES.summarize(books, cnt, {})) === JSON.stringify(res.summary), 'v2.7.0 summaryFrom(계산 한 곳) = 예전 계산과 같은 요약');
  ok(/예제\(가상 데이터\)/.test(ES.erpSourceText(store)), 'v2.7.0 예제로 넣은 ERP 결과의 출처 표기');
  // ZIP — 9개 · 이름 UTF-8
  var z = fsx.readFileSync(S + '예제데이터.zip'), eocd = z.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])), n = z.readUInt16LE(eocd + 10), cdo = z.readUInt32LE(eocd + 16), names = [];
  for (var i = 0, p = cdo; i < n; i++) { var fl = z.readUInt16LE(p + 8), nl = z.readUInt16LE(p + 28), xl = z.readUInt16LE(p + 30), cl = z.readUInt16LE(p + 32); names.push((fl & 0x0800 ? 'u:' : '') + z.slice(p + 46, p + 46 + nl).toString('utf8')); p += 46 + nl + xl + cl; }
  eq(names, EX.map(function (x) { return 'u:' + x; }), 'v2.7.0 samples/예제데이터.zip = 예제 9개(한글 이름 UTF-8 표시)');
  var tool = fsx.readFileSync(__dirname + '/../tools/make-samples.mjs', 'utf8');
  ok(tool.indexOf('C.sampleFiles()') < 0 && tool.indexOf('sampleBooks()') < 0 && /예제데이터\.zip/.test(tool) && EX.every(function (x) { return tool.indexOf("'" + x + "'") > 0; }), 'v2.7.0 tools/make-samples.mjs — 예전 예제를 samples/ 에 다시 쓰지 않고 9개를 ZIP 으로 묶음');
  // 화면
  var dj = fsx.readFileSync(__dirname + '/../js/dash.js', 'utf8'), ej = fsx.readFileSync(__dirname + '/../js/errors.js', 'utf8'), dh = fsx.readFileSync(__dirname + '/../dashboard.html', 'utf8'), ih = fsx.readFileSync(__dirname + '/../index.html', 'utf8'), eh = fsx.readFileSync(__dirname + '/../errors.html', 'utf8');
  ok(dj.indexOf('C.sampleFiles()') < 0 && EX.every(function (x) { return dj.indexOf("'" + x + "'") > 0; }) && /E\.summaryFrom\(books, store, \{ rule: rule \}\)/.test(dj) && /fetch\('samples\/' \+ encodeURIComponent\(n\)\)/.test(dj), 'v2.7.0 대시보드 「예제로 해보기」 = samples/ 의 9개(오류점수 2개는 summaryFrom 으로 요약)');
  ok(/if \(!state\.loadingSample\) \{   \/\/ \(v2\.7\.0\) 예제\(가상\)의 세율은 세율표에 쌓지 않음/.test(dj), 'v2.7.0 예제의 세율은 수출 FTA 세율표에 쌓지 않음');
  ok(['2026_예제(가상)_수입오류.xlsx', '2026_예제(가상)_수출오류.xlsx', '2026_예제(가상)_수입실적.xlsx', '2026_예제(가상)_수출실적.xlsx'].every(function (x) { return ej.indexOf("'" + x + "'") > 0; }) && ej.indexOf('setBooks(E.sampleBooks())') < 0 && /E\.summaryFrom\(state\.books/.test(ej) && /예제로 해보기\(가상 데이터\)/.test(eh), 'v2.7.0 오류점수 화면 「예제로 해보기」 = 유니패스 수입 · 수출 + ERP 실적 2 · 계산은 summaryFrom');
  [['dashboard.html', dh], ['index.html', ih]].forEach(function (p) {
    var h = p[1];
    ok(/<b>예제 엑셀 9종\(가상 데이터\)<\/b> — 수입실적 · 수출실적 · 수입FTA · 수출FTA\(건기·엔진\) · 관세환급 · 품목분류 결정문 · 유니패스 오류점수\(수입·수출\)/.test(h) && /수출FTA 는 FTA 담당자 분석본 형식/.test(h) && /href="samples\/예제데이터\.zip" download/.test(h) &&
      EX.every(function (x) { return h.indexOf('href="samples/' + x + '" download>' + x.replace(/\.xlsx$/, '').replace(/_/g, ' ') + '<') > 0; }) && h.indexOf('data-ex5') < 0 && h.indexOf('예제 엑셀 5') < 0, 'v2.7.0 ' + p[0] + ' — 예제 엑셀 9종 · 묶음 설명 · 하나씩 받기 9개 · ZIP 하나(겹치던 「모두 내려받기」 단추 없앰)');
  });
  ok(/모든 예제는 가상 데이터이며, 실제 거래처·회사명·신고번호와 무관합니다\./.test(dh) && /모든 예제는 가상 데이터이며, 실제 거래처·회사명·신고번호와 무관합니다\./.test(ih) && dh.indexOf('2024-01~2025-10') < 0 && EX.every(function (x) { return /\(가상\)/.test(x); }), 'v2.7.0 안내 문구 · 예제 파일 이름과 내려받기 이름에 「(가상)」 그대로');
}
