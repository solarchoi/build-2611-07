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
eq(C.detectKind(['년월', '수출입구분', '신고건수', '오류건수', '오류점수']).kind, 'errors', '오류점수 파일');
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

// 오류 — 손계산: 신고 400+200+300 = 900, 오류 4+1+0 = 5, 비율 5/900, 점수 10+3+0
var nx = C.normalize([{ p: '2025년 1월', k: '수입', d: 400, e: 4, s: 10 }, { p: '2025년 1월', k: '수출', d: 200, e: 1, s: 3 }, { p: '2025년 2월', k: '수입', d: 300, e: 0, s: 0 }, { p: '2025년 3월', k: '수출', d: 0, e: 0, s: 0 }],
  'errors', { date: 'p', kind: 'k', decl: 'd', err: 'e', score: 's' });
var xs = C.errorStats(nx.records, { from: '2025-01', to: '2025-03' }, 'kind');
eq([xs.decl, xs.err, xs.score], [900, 5, 13], '오류 합계');
near(xs.rate, 5 / 900, '오류 비율 = 오류건수 ÷ 신고건수');
eq(xs.groups.map(function (g) { return [g.key, g.decl, g.err]; }), [['수입', 700, 4], ['수출', 200, 1]], '구분별');
isNull(xs.monthly[2].rate, '신고 0건인 달은 비율 null');

// 상위 N + 그 밖
var tn = C.topN(is.groups.concat([{ key: 'C본부', n: 1, goods: 10, duty: 1, burden: 0.1 }]), 1);
eq([tn.rows.length, tn.rest.key, tn.rest.goods, tn.rest.duty], [1, '그 밖 2개', 3010, 81], '상위 1 + 그 밖 합계');
near(tn.rest.burden, 81 / 3010, '그 밖의 부담율은 합계로 다시 계산');

// 표기
eq(C.fmtNum(1234567), '1,234,567', '천 단위 쉼표');
eq(C.fmtPct(0.12345), '12.3%', '백분율');
eq(C.fmtPct(null), '—', '빈 값은 —');
eq(C.fmtSignedPct(0.5), '+50.0%', '증가 +');
eq(C.fmtShort(1234000000), '12.3억원', '억 단위');
eq(C.fmtShort(56780000), '5,678만원', '만 단위');
eq(C.fmtShort(1500, '천원'), '1,500 천원', '원이 아니면 줄이지 않는다');

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
eq(files.map(function (f) { var h = f.aoa[0]; return C.detectKind(h, f.name).kind; }), ['import', 'export', 'refund', 'errors', 'ruling'], '예제 5종 종류 알아보기');
eq(files.map(function (f) { return C.mapColumns(f.aoa[0], f.kind).missing.length; }), [0, 0, 0, 0, 0], '예제 5종 필수 열 모두 찾음');
var sn = files.map(function (f) { return C.normalize(C.aoaToRows(f.aoa), f.kind, C.mapColumns(f.aoa[0], f.kind).map); });
eq(sn.slice(0, 4).map(function (n) { return n.period; }), [0, 1, 2, 3].map(function () { return { from: '2024-01', to: '2025-10' }; }), '예제 기간 2024-01~2025-10');
eq([sn[0].skipped.length, sn[0].skipped[0].reason], [1, '합계·소계 줄'], '예제 수입: 합계 줄 1개를 건너뜀');
var sis = C.importStats(sn[0].records, C.defaultRange(sn[0].period), 'hq');
eq(sis.groups.reduce(function (t, g) { return t + g.goods; }, 0), sis.goods, '예제: 본부별 합 = 전체');
var ses = C.exportStats(sn[1].records, { from: '2025-01', to: '2025-10' }, 'country');
ok(ses.hasPrev && ses.groups.some(function (g) { return g.prev == null && g.amount > 0; }), '예제 수출: 올해 새로 생긴 국가(전년 없음)가 있다');
ok(JSON.stringify(files).indexOf('(가상)') > 0, '예제 업체·본부에 「가상」 표기');
// samples/ 의 실제 엑셀이 sampleFiles() 와 같은지(tools/make-samples.mjs 로 다시 만든다) — 수입 파일은 제목 2줄이 위에 있다
var XLSX = require('../lib/xlsx.full.min.js'), fsx = require('fs'), px = require('path');
files.forEach(function (f, i) {
  var wb = XLSX.read(fsx.readFileSync(px.join(__dirname, '..', 'samples', f.name)), { type: 'buffer' });
  var aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' }), hr = C.findHeaderRow(aoa);
  var n = C.normalize(C.aoaToRows(aoa.slice(hr)), f.kind, C.mapColumns(aoa[hr].map(String), f.kind).map, hr);
  eq([hr, n.records.length, C.sum(n.records, f.kind === 'import' ? 'goods' : f.kind === 'errors' ? 'decl' : 'amount')],
    [f.kind === 'import' ? 2 : 0, sn[i].records.length, C.sum(sn[i].records, f.kind === 'import' ? 'goods' : f.kind === 'errors' ? 'decl' : 'amount')], 'samples/ ' + f.name + ' = 예제 정의');
});
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
eq(M9.종합, { decl: 1000, err: 3, score: 12.5, rate: 1.25 }, '종합: 동일 신고번호 1건 · 비율 = 점수 ÷ 건수');
eq(M9.인천, { decl: 600, err: 1, score: 2, rate: 0.33 }, '인천 건수는 요약에서'); eq(M9.울산, { decl: 400, err: 2, score: 10.5, rate: 2.63 }, '울산 = 총신고건 − 인천');
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
var SB = ES.sampleBooks().map(function (b) { return ES.readWorkbook(b.sheets, b.name); }); eq(SB.map(function (b) { return b.kind; }), ['수입', '수출'], '예제 2권'); var SS = ES.summarize(SB, ES.countsFromBooks(SB)); eq(SS.months, [7, 8, 9], '예제 3개월'); var SC = ES.compare(SB, SS); eq(SC.scoreDiffs.length, 2, '예제의 어긋난 달 인천·울산 2칸'); not(JSON.stringify(SB), '에이치디', '예제에 회사 이름 없음');

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
  eq(files.map(function (x) { return C.detectKind(x.aoa[0], x.name + ' 데이터').kind; }), ['import', 'export', 'refund', 'errors', 'ruling'], 'v1.4.5 예제 5종 판단 그대로');
  eq(files.map(function (x) { return C.detectKind(x.aoa[0]).kind; }), ['import', 'export', 'refund', 'errors', 'ruling'], 'v1.4.5 예제 5종 — 이름 없이도 그대로');
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
  eq(C.fmtShort(s.claimOutside, '원'), '300만원', 'v1.6.0 화면 표기 300만원');
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
  var old = C.sampleFiles()[4], o = load(old), so = C.rulingStats(o.n.records, { from: '2025-01', to: '2025-12' }, 'product');
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
