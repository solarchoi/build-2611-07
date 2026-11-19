/* 수출입통관 업무 대시보드 — 엔진 (v1.1 · v1.2 결정문 현황)
 *
 * 화면(dash.js · library.js)은 판정하지 않는다. 열 이름 짝짓기·값 읽기·집계·전년 동기 대비·
 * FTA 활용률·환급·오류 비율·엑셀 표·자료 목록 규칙은 전부 여기서 만들고 test/logic.test.js 로 고정한다.
 * 브라우저(window.Customs)와 node(require) 양쪽에서 읽힌다.
 *
 * 지키는 것
 *   - 화면에 보이는 숫자는 올린 파일에서 계산한다. 손으로 적은 값이 없다.
 *   - 0 으로 나누면 값을 지어내지 않고 null(화면 「—」)로 둔다.
 *   - 못 읽은 줄은 조용히 버리지 않는다. 건너뛴 줄과 사유를 돌려준다.
 *   - 열 이름이 달라도 받는다. 늘릴 때는 코드가 아니라 DATASETS 의 aliases 표를 늘린다.
 */
(function (root) {
  'use strict';

  /* ---------- 데이터 종류와 열 ---------- */
  // type: date · text · hs · num. req = 이 열이 없으면 집계할 수 없다(사용자가 골라야 한다).
  var HQ = { key: 'hq', label: '본부', type: 'text', req: true, aliases: ['사업본부', '본부명', '사업부', '부문', '사업부문', 'division', 'bu'] };
  var HS = { key: 'hs', label: 'HS 코드', type: 'hs', req: true, aliases: ['hs', 'hscode', 'hs코드', 'hs부호', '세번', '세번부호', '품목번호', 'hsk', '품목분류'] };
  var FTA_GOODS = { key: 'ftaGoods', label: '물자대_FTA', type: 'num', aliases: ['물자대fta', 'fta물자대', 'fta적용물자대', 'fta금액', 'fta적용금액', '협정적용금액', 'fta적용액'] };
  var SAVING = { key: 'saving', label: '절감액', type: 'num', aliases: ['fta절감액', '관세절감액', '감면액', 'fta감면액', '절감관세'] };
  // 관세환급 제품그룹 번호 → 본부. 새 번호는 추측하지 않는다(「미등록(번호)」으로 두고 알린다).
  // 번호를 늘릴 때는 기획자에게 먼저 확인한 뒤 이 표만 고친다.
  var REFUND_HQ_CODES = { B110: '건기본부', B111: '건기본부', B112: '건기본부', B130: '엔진본부', B161: '부품센터', B163: '부품센터' };
  var CODE_RE = /^([A-Za-z]\d{3})(?!\d)/;
  // 종류마다 decisive = 그 종류에만 있는 「결정적 열」 이름. 열 이름이 이것과 똑같을 때만(일부 포함은 아님) 인정한다.
  var DATASETS = {
    // (v1.9.0) ERP 수입실적 원본(Sheet1 · 70열 · HS 열 없음)의 열 이름을 받는다. 한글 열 이름(예전 예제)도 그대로 받는다.
    // exact = 원래 이름(가장 앞선다), exclude = 자동으로 짝짓지 않는 열(Carry-in date · Sh.Country · ($)Taxable.Amt · Amount · Duty Type …).
    import: {
      label: '수입 통관 실적', source: 'ERP 엑셀', cycle: '매일', hint: /수입|import/i, decisive: ['관세액', '관세', '납부관세', 'Import declaration number', 'Tot.Duty Amt'],
      fields: [
        { key: 'date', label: '신고일자', type: 'date', req: true, exact: ['Acceptance date'], exclude: ['carryindate', 'declarationdatedesired'],
          aliases: ['수리일자', '신고일', '수입신고일', '수입신고일자', '통관일자', '수리일', '일자', 'acceptancedate', 'date'] },
        { key: 'hq', label: '본부', type: 'text', req: true, plant: true, exact: ['Plant'], aliases: HQ.aliases.concat(['plant', '플랜트']) },
        { key: 'country', label: '국가', type: 'text', req: true, exact: ['Origin'], exclude: ['shcountry'], aliases: ['원산지', '원산지국', '적출국', '국가명', '수입국', '원산국', 'country', 'origin'] },
        // 업체 = Vendor Name. 같은 이름 열이 둘이면 Vendor Code 바로 옆 열(nextTo). Supplier 는 국가 코드라 업체로 쓰지 않는다(공급지역).
        { key: 'company', label: '업체', type: 'text', req: true, exact: ['Vendor Name'], nextTo: 'Vendor Code', exclude: ['supplier'],
          aliases: ['업체명', '거래처', '거래처명', '공급사', '공급업체', '수출자', '해외공급자', 'vendorname', 'vendor'] },
        { key: 'supplier', label: '공급지역', type: 'text', exact: ['Supplier'], aliases: ['공급지역', '공급국', 'supplier'] },
        { key: 'hs', label: 'HS 코드', type: 'hs', aliases: HS.aliases },
        { key: 'goods', label: '물자대', type: 'num', req: true, exact: ['(\\)Taxable.Amt', '(₩)Taxable.Amt', '(￦)Taxable.Amt', '(KRW)Taxable.Amt', '(원)Taxable.Amt'],
          excludeRaw: ['($)Taxable.Amt', '(USD)Taxable.Amt'], exclude: ['amount', 'totratalamt', 'tottaxsum'],
          aliases: ['물품가액', '과세가격', '물자대금액', '수입금액', '과세가격원화', '금액'] },
        { key: 'duty', label: '관세', type: 'num', req: true, exact: ['Tot.Duty Amt'], exclude: ['dutytype', 'tottaxsum', 'totratalamt'],
          aliases: ['관세액', '관세금액', '납부관세', '납부세액관세', 'totdutyamt', 'duty'] },
        // (v1.9.0) 수입신고번호 — 건수(고유 개수) · 신고 종류(끝 글자 M · B) · 맨 아래 합계 행(번호 빈 줄)에 쓴다. 레코드에 보관(오류점수 · FTA 연결용).
        { key: 'declNo', label: '신고번호', type: 'text', keepBlank: true, declLoose: true, exact: ['Import declaration number'],
          aliases: ['수입신고번호', '신고번호', 'importdeclarationnumber', 'importdeclarationno'] },
        // (v1.8.0) 결제방법 — GN(샘플 등 무환거래) 줄은 수입도 실적에서 뺀다. ERP 수입 파일은 「Payment method」 열.
        { key: 'payment', label: '결제방법', type: 'text', keepBlank: true, exact: ['Payment method', 'Payment'], aliases: ['결제방법', '결제방식', '결제조건', 'paymentmethod', 'payment'] },
        { key: 'dutyType', label: '세율구분', type: 'text', keepBlank: true, exact: ['Duty Type'], aliases: ['세율구분', 'dutytype'] },
        { key: 'broker', label: '관세사', type: 'text', keepBlank: true, exact: ['Customs Broker'], aliases: ['관세사명', '관세법인', 'customsbroker'] },
        FTA_GOODS, SAVING
      ]
    },
    // (v1.7.0) ERP EXPORT 원본(Sheet1 · 55열)의 열 이름을 받는다. exact = 괄호 · 기호까지 같은 원래 이름(가장 앞선다),
    // exclude = 이 항목에 자동으로 짝짓지 않는 열(Req.Date · Division · FOB($) · Invoice Amt.). HS 열은 없어도 된다(HS 4단위 묶기만 못 함).
    export: {
      label: '수출 통관 실적', source: 'ERP 엑셀', cycle: '매일', hint: /수출|export/i, decisive: ['수출신고일', '수출신고일자', '목적국'],
      fields: [
        { key: 'date', label: '신고일자', type: 'date', req: true, exact: ['Declaration Date'], exclude: ['reqdate', 'requestdate'],
          aliases: ['수출신고일', '수출신고일자', '수리일자', '선적일자', '신고일', '일자', 'declarationdate', 'date'] },
        { key: 'hq', label: '본부', type: 'text', req: true, plant: true, exact: ['Plant'], exclude: ['division'],
          aliases: ['사업본부', '본부명', '사업부', '부문', '사업부문', 'plant', '플랜트'] },
        { key: 'country', label: '국가', type: 'text', req: true, exact: ['Destination'], aliases: ['목적국', '도착국', '수출국', '국가명', '수입국', 'country', 'destination'] },
        { key: 'company', label: '업체', type: 'text', req: true, exact: ['Sold-to Party Name'],
          aliases: ['업체명', '거래처', '거래처명', '수입자', '바이어', '구매자', 'soldtopartyname', 'soldtoparty', 'buyer', 'customer'] },
        { key: 'hs', label: 'HS 코드', type: 'hs', aliases: HS.aliases },
        { key: 'amount', label: '수출금액', type: 'num', req: true, exact: ['FOB(￦)', 'FOB(₩)', 'FOB(\\)', 'FOB(KRW)', 'FOB(원)', 'FOB(WON)'], exclude: ['invoiceamt', 'invoiceamount'], excludeRaw: ['FOB($)', 'FOB(USD)'],
          aliases: ['수출액', 'fob금액', '신고금액', '결제금액', '물자대', '금액', 'amount'] },
        { key: 'declNo', label: '신고번호', type: 'text', keepBlank: true, exact: ['Certifcate No.', 'Certificate No.'],
          aliases: ['수출신고번호', '신고번호', 'certifcateno', 'certificateno', 'declarationno'] },
        { key: 'broker', label: '관세사', type: 'text', exact: ['AgentNm'], aliases: ['관세사명', '관세법인', 'agentnm', 'agentname'] },
        { key: 'payment', label: '결제방법', type: 'text', keepBlank: true, exact: ['Payment'], aliases: ['결제방식', '결제조건', '지급조건', 'paymentterms', 'payment'] },
        // (v1.8.0) 무환구분 — N 이면 무환. Payment GN 과 어긋나는 줄을 세어 알린다(입력 오류 점검 — 빼는 기준은 Payment 하나)
        { key: 'monetary', label: '무환구분', type: 'text', keepBlank: true, exact: ['Monetary Transaction'], aliases: ['monetarytransaction', '유무환', '유무환구분', '무환구분'] },
        FTA_GOODS, SAVING
      ]
    },
    refund: {
      label: '관세환급 실적', source: '환급프로그램 엑셀', cycle: '매월', hint: /환급|refund|drawback/i, decisive: ['환급액', '환급금액', '관세환급액', '환급세액', '환급금'],
      fields: [
        { key: 'date', label: '환급월', type: 'date', req: true, aliases: ['환급일자', '지급일자', '환급결정일', '결정일자', '환급년월', '년월', '월', '기간', '일자'] },
        // 환급 신청 현황 엑셀에는 본부 대신 「제품그룹」 번호가 있다 → REFUND_HQ_CODES 로 본부 이름을 붙인다.
        { key: 'hq', label: '본부', type: 'text', req: true, aliases: HQ.aliases.concat(['제품그룹']), codes: REFUND_HQ_CODES },
        { key: 'amount', label: '환급액', type: 'num', req: true, aliases: ['환급금액', '환급금', '관세환급액', '환급세액', '결정금액'] },
        { key: 'count', label: '건수', type: 'num', aliases: ['환급건수', '신청건수', '결정건수'] }
      ]
    },
    errors: {
      label: '수출입 오류점수', source: '관세청 엑셀', cycle: '매월', hint: /오류|error|성실/i, decisive: ['오류점수', '오류건수'],
      fields: [
        { key: 'date', label: '기간', type: 'date', req: true, aliases: ['년월', '월', '대상월', '신고월', '평가월', '일자'] },
        { key: 'kind', label: '구분', type: 'text', aliases: ['수출입구분', '신고구분', '수출입', '업무구분'] },
        { key: 'hq', label: '본부', type: 'text', aliases: HQ.aliases },
        { key: 'decl', label: '신고건수', type: 'num', req: true, aliases: ['신고수', '전체건수', '총신고건수', '신고건'] },
        { key: 'err', label: '오류건수', type: 'num', req: true, aliases: ['오류수', '오류신고건수', '정정건수', '오류건'] },
        { key: 'score', label: '오류점수', type: 'num', req: true, aliases: ['점수', '오류점수합계', '감점', '벌점'] }
      ]
    }
  };
  // (v1.2) 품목분류 사전회신 결정문 현황 — 담당자가 관리하는 엑셀(연번·완제품·품명·결정세번·결정문번호·시행일자·관세율·관세사).
  // 종전세율·연간 수입액 열이 함께 있을 때만 절감 추정을 계산한다. 관세율은 올린 파일의 값을 그대로 보인다(물품설명서 초안에는 여전히 싣지 않는다).
  DATASETS.ruling = {
    label: '품목분류 결정문 현황', source: '결정문 현황 엑셀', cycle: '수시', hint: /결정문|품목분류|사전심사|사전회신|ruling/i,
    decisive: ['결정세번', '결정문번호', '품목분류사전심사결정문번호', '사전심사결정문번호'],
    fields: [
      { key: 'seq', label: '연번', type: 'text', aliases: ['번호', 'no', '순번'] },
      { key: 'product', label: '완제품', type: 'text', req: true, aliases: ['완제품명', '적용기종', '기종', '장비', '제품', '제품명', 'product'] },
      { key: 'item', label: '품명', type: 'text', req: true, aliases: ['부품명', '물품명', '품목명', 'item', 'description'] },
      { key: 'hs', label: '결정세번', type: 'hs', req: true, aliases: ['결정hs', '결정품목번호', '결정hscode', 'hs', 'hscode', 'hs코드', '세번', '품목번호', 'hsk'] },
      { key: 'docNo', label: '결정문번호', type: 'text', aliases: ['품목분류사전심사결정문번호', '사전심사결정문번호', '결정문', '문서번호', '회신번호', '결정번호'] },
      { key: 'date', label: '시행일자', type: 'date', req: true, aliases: ['시행일', '결정일자', '결정일', '회신일자', '회신일', '일자', 'date'] },
      { key: 'rate', label: '관세율', type: 'rate', aliases: ['결정세율', '결정관세율', '세율', '기본세율', 'rate'] },
      { key: 'broker', label: '관세사', type: 'text', aliases: ['관세법인', '대리인', '신청대리인', '신청인'] },
      { key: 'prevRate', label: '종전세율', type: 'rate', aliases: ['기존세율', '종전관세율', '변경전세율', '이전세율', '신청전세율'] },
      { key: 'goods', label: '연간 수입액', type: 'num', aliases: ['물자대', '수입금액', '연간물자대', '과세가격', '수입액', '연간수입액'] },
      // (v1.6.0) 고정비 절감 금액 — 모두 선택 열. 관세절감 impact = 경정청구 금액 + 관세유보금액.
      // 경정청구 금액은 경정청구일 연도, 관세유보금액은 시행일자(결정문 접수일) 연도에 귀속된다(rulingStats).
      { key: 'claim', label: '경정청구 금액', type: 'num', aliases: ['경정청구액', '경정청구환급액', '경정환급액', '경정청구환급금액'] },
      { key: 'reserve', label: '관세유보금액', type: 'num', aliases: ['관세유보액', '유보금액', '유보액', '관세유보'] },
      { key: 'impact', label: '관세절감 impact', type: 'num', aliases: ['관세절감임팩트', '절감impact', '절감임팩트', 'impact', '관세절감효과'] },
      { key: 'claimDate', label: '경정청구일', type: 'date', opt: true, aliases: ['경정청구일자', '경정청구환급일', '경정환급일', '청구일자'] },
      { key: 'status', label: '진행상태', type: 'text', aliases: ['진행현황', '진행상황', '상태', 'status'] },
      { key: 'note', label: '비고', type: 'text', keepBlank: true, aliases: ['메모', '참고', 'note', 'remark'] }
    ]
  };
  // (v1.6.0) 결정문 탭의 기본 조회 시작 — 고정비 절감 과제를 이 달부터 누적 관리한다(사용자가 바꿀 수 있다).
  var RULING_BASE_FROM = '2026-01';   // = DASH_BASE_FROM
  // 진행중 = 이 상태들(띄어쓰기 무시)
  var RULING_PROGRESS = ['경정청구중', '재심사', '심판청구'];
  // (v1.7.0) 수출 Plant 번호 → 본부(기본값). 설정에서 고친 표가 있으면 그것을 쓴다(normalize 의 opts.plantHq).
  // 표에 없는 번호 · 빈칸은 「본부 미분류」(건수 · 금액을 따로 보인다). 한글로 본부 이름이 적힌 값은 그대로 둔다.
  // (v1.9.0) 수입 · 수출이 같은 표를 쓴다(수출에는 1100, 수입에는 1131 이 나온다). 1131 = 엔진본부는 기획자 확인(2026-11-18).
  var EXPORT_PLANT_HQ = { '1000': '건기본부', '1100': '건기본부', '1111': '건기본부', '1130': '엔진본부', '1131': '엔진본부', '6000': '부품센터' };
  // (v1.9.0) 이미 고쳐 저장한 표에 없어도 늘 넣는 번호(기획자 결정 — 1131 은 엔진본부). 본부 이름은 설정에서 바꿀 수 있다.
  var PLANT_HQ_ALWAYS = { '1131': '엔진본부' };
  var HQ_UNCLASSIFIED = '본부 미분류';
  // (v1.9.0) 수입신고번호 끝 글자 → 신고 종류. 모두 실적에 넣고, 보세공장 사용신고(B)의 관세(Tot.Duty Amt)만 관세 합계에서 뺀다.
  var DECL_TYPES = { M: '일반 수입', B: '보세공장 사용신고', '?': '구분 모름' };
  var DECL_TYPE_ORDER = ['M', 'B', '?'];
  // (v1.7.0) 결제방법이 이 값이면 수출 실적에서 뺀다(설정에서 끌 수 있다 — 기본 켜짐)
  var EXPORT_EXCLUDE_PAYMENT = 'GN';
  // (v1.8.0) 대시보드 기본 조회 시작 — 데이터는 2026년 1월부터 관리한다(사용자가 바꿀 수 있다). 결정문 탭도 같은 값.
  var DASH_BASE_FROM = '2026-01';
  // (v1.8.0) 집계표 시트 이름(「종합」 · 「10월 소계」 …) — 여러 시트를 합칠 때 건너뛴다
  var SUMMARY_SHEET_RE = /종합|소계|합계|총계|집계|요약|summary|total|pivot/i;
  var KINDS = ['import', 'export', 'refund', 'errors', 'ruling'];
  function fieldsOf(kind) { return DATASETS[kind].fields; }
  function hasField(kind, key) { return fieldsOf(kind).some(function (f) { return f.key === key; }); }

  /* ---------- 열 이름 짝짓기 ---------- */
  // 괄호 속 단위(원)·[KRW] 와 공백·구두점을 지우고 소문자로 맞춘 뒤 비교한다.
  function normKey(s) {
    return String(s == null ? '' : s).replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/[\s.·_\-/:()[\]]/g, '').toLowerCase();
  }
  // 이름 점수: 같음 1 · 같은 뜻 낱말과 같음 0.95 · 낱말을 품음 0.6 + 0.3×(낱말 길이 / 열 이름 길이)
  // (v1.7.0) 원래 이름 그대로 비교(공백만 지우고 대문자) — FOB(￦) 와 FOB($) 처럼 괄호 속이 뜻을 가르는 열
  function rawKey(s) { return String(s == null ? '' : s).replace(/\s+/g, '').toUpperCase(); }
  // (v1.7.0) 같은 이름의 열(Curr 5개 등) → 「Curr (8번째 열)」처럼 몇 번째 열인지 붙인다. 빈 이름은 「열N」.
  // 같은 이름이 없으면 그대로라 예전 파일 · 기억한 열 짝짓기에 영향이 없다. 줄 읽기(aoaToRows)와 화면이 같은 이름을 쓴다.
  function uniqueHeaders(headers) {
    var hs = (headers || []).map(function (h, i) { return clean(h) || ('열' + (i + 1)); }), cnt = {};
    hs.forEach(function (h) { cnt[h] = (cnt[h] || 0) + 1; });
    return hs.map(function (h, i) { return cnt[h] > 1 ? h + ' (' + (i + 1) + '번째 열)' : h; });
  }
  // (v1.9.0) 「Vendor Name (12번째 열)」 → 「Vendor Name」 (uniqueHeaders 가 붙인 꼬리를 뗀 원래 이름)
  function baseHeader(h) { return String(h == null ? '' : h).replace(/ \(\d+번째 열\)$/, ''); }
  function nameScore(header, field) {
    var h = normKey(header); if (!h) return 0;
    var rk = rawKey(baseHeader(header));
    if (field.exact && field.exact.some(function (e) { return rawKey(e) === rk; })) return 1;
    if (field.excludeRaw && field.excludeRaw.some(function (e) { return rawKey(e) === rk; })) return 0;
    if (field.exclude && field.exclude.indexOf(h) >= 0) return 0;
    var words = [normKey(field.label)].concat(field.aliases.map(normKey));
    if (h === words[0]) return 1;
    var best = 0;
    words.forEach(function (w, i) {
      if (!w) return;
      if (h === w) best = Math.max(best, i ? 0.95 : 1);
      else if (w.length >= 2 && h.indexOf(w) >= 0) best = Math.max(best, 0.6 + 0.3 * w.length / h.length);
    });
    return best;
  }
  var MIN_SCORE = 0.6;
  // headers: 열 이름 배열. override: { 필드key: 열 이름 | '' (없음) } — 사람이 고른 것이 늘 앞선다.
  // → { map: {key: header}, score: {key: 점수}, missing: [필수인데 못 찾은 label], unused: [쓰지 않은 열] }
  function mapColumns(headers, kind, override) {
    override = override || {};
    var fields = fieldsOf(kind), map = {}, score = {}, used = {};
    fields.forEach(function (f) {
      if (Object.prototype.hasOwnProperty.call(override, f.key)) {
        var o = override[f.key];
        if (o && headers.indexOf(o) >= 0) { map[f.key] = o; score[f.key] = 'user'; used[o] = true; }
        else score[f.key] = 'user-none';
      }
    });
    var cand = [];
    fields.forEach(function (f) {
      if (score[f.key]) return;
      headers.forEach(function (h, i) {
        var s = nameScore(h, f); if (s < MIN_SCORE) return;
        // (v1.9.0) 같은 이름 열이 여럿일 때 nextTo 열(Vendor Code) 바로 오른쪽 · 왼쪽 열을 앞세운다(점수는 반올림해 보이므로 1 그대로)
        if (f.nextTo) { var nt = rawKey(f.nextTo); if (rawKey(baseHeader(headers[i - 1])) === nt) s += 0.002; else if (rawKey(baseHeader(headers[i + 1])) === nt) s += 0.001; }
        cand.push({ f: f.key, h: h, s: s });
      });
    });
    cand.sort(function (a, b) { return b.s - a.s; });
    cand.forEach(function (c) { if (!map[c.f] && !score[c.f] && !used[c.h]) { map[c.f] = c.h; score[c.f] = Math.round(c.s * 100) / 100; used[c.h] = true; } });
    return {
      map: map, score: score,
      missing: fields.filter(function (f) { return f.req && !map[f.key]; }).map(function (f) { return f.label; }),
      missingKeys: fields.filter(function (f) { return f.req && !map[f.key]; }).map(function (f) { return f.key; }),
      unused: headers.filter(function (h) { return !used[h] && String(h).trim(); })
    };
  }
  // 머리글 줄 찾기 — ERP 엑셀은 맨 위에 제목·조회 조건 줄이 붙어 나오기도 한다.
  // 처음 10줄 중 어느 종류의 열 이름이든 가장 많이 맞는 줄. 하나도 안 맞으면 첫 줄.
  function findHeaderRow(aoa) {
    var best = 0, bestN = 0;
    (aoa || []).slice(0, 10).forEach(function (row, i) {
      var n = 0;
      (row || []).forEach(function (h) {
        if (typeof h !== 'string' || !h.trim()) return;
        if (KINDS.some(function (k) { return fieldsOf(k).some(function (f) { return nameScore(h, f) >= MIN_SCORE; }); })) n++;
      });
      if (n > bestN) { best = i; bestN = n; }
    });
    return best;
  }
  // 어떤 종류의 파일인가. 필수 열을 절반 이상 찾은 종류만 후보로 삼고, 그 안에서
  //   ① 결정적 열(decisive)이 있는 종류 → ② 파일·시트 이름의 낱말(환급·수입·수출…) → ③ 필수 열 비율 → ④ 찾은 열 수 순으로 고른다.
  // 파일 이름 낱말이 후보 여럿에 걸리면(예: 「수출입」) 이름으로는 가르지 않는다.
  function detectKind(headers, fileName) {
    var keys = (headers || []).map(normKey);
    var ranked = KINDS.map(function (k) {
      var m = mapColumns(headers, k), req = fieldsOf(k).filter(function (f) { return f.req; }).length;
      var dec = (DATASETS[k].decisive || []).filter(function (d) { return keys.indexOf(normKey(d)) >= 0; });
      var ratio = (req - m.missing.length) / req;
      return { kind: k, ratio: ratio, ok: ratio >= 0.5 ? 1 : 0, found: Object.keys(m.map).length, decisive: dec.length ? 1 : 0, decisiveCol: dec[0] || '', hit: DATASETS[k].hint.test(fileName || '') };
    });
    var hits = ranked.filter(function (r) { return r.ok && r.hit; });
    ranked.forEach(function (r) { r.name = hits.length === 1 && hits[0] === r ? 1 : 0; });
    ranked.sort(function (a, b) { return b.ok - a.ok || b.decisive - a.decisive || b.name - a.name || b.ratio - a.ratio || b.found - a.found; });
    var top = ranked[0], kind = top.ok ? top.kind : null;
    var reason = !kind ? '' : top.decisive ? '「' + top.decisiveCol + '」 열' : top.name ? '파일 이름' : '열 이름';
    return { kind: kind, ratio: top.ratio, reason: reason, ranked: ranked };
  }

  /* ---------- 값 읽기 ---------- */
  function clean(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
  // 숫자: 1,234 · (1,234)=음수 · ₩·원·KRW·USD 표기 · 빈칸/「-」= null(빈 값) · 읽지 못하면 NaN
  function parseNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    var s = clean(v); if (!s || /^[-–—]$/.test(s)) return null;
    var neg = /^\(.*\)$/.test(s) || /^△|^▲/.test(s);
    s = s.replace(/^\(|\)$/g, '').replace(/^[△▲]/, '').replace(/[,\s]|원|₩|krw|usd|\$/gi, '');
    if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
    var n = Number(s); return neg ? -Math.abs(n) : n;
  }
  // 관세율: 「8」·「8%」·「0」·「FCN0」(협정세율 부호 + 세율) → { rate, code }. 빈칸은 null, 읽지 못하면 undefined.
  function parseRate(v) {
    if (typeof v === 'number') return isFinite(v) ? { rate: v, code: '' } : undefined;
    var s = clean(v); if (!s || /^[-–—]$/.test(s)) return null;
    var m = s.match(/^([A-Za-z]{0,6})\s*(\d+(?:\.\d+)?)\s*%?$/);
    if (m) return { rate: Number(m[2]), code: m[1].toUpperCase() };
    // (v1.6.0) 「0, 8」·「0/8」·「0%, 8%」 = 복수 세율 → { multi: true, rates, text }. 0% 건수 · 절감 추정에서는 빼고 목록에는 그대로 보인다.
    var parts = s.split(/\s*[,/;·]\s*/);
    if (parts.length < 2) return undefined;
    var got = parts.map(function (p) { var q = p.match(/^([A-Za-z]{0,6})\s*(\d+(?:\.\d+)?)\s*%?$/); return q ? (q[1] ? q[1].toUpperCase() + ' ' : '') + q[2] : null; });
    if (got.some(function (g) { return g == null; })) return undefined;
    return { multi: true, rates: got, text: got.join(', ') };
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function mkDate(y, m, d) {
    if (!(y >= 1990 && y <= 2100) || !(m >= 1 && m <= 12)) return null;
    if (d != null && !(d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate())) return null;
    return { y: y, m: m, d: d == null ? null : d, month: y + '-' + pad2(m), date: d == null ? null : y + '-' + pad2(m) + '-' + pad2(d) };
  }
  // 날짜: 2025-01-15 · 2025.1.15 · 2025/01 · 20250115 · 202501 · 2025년 1월 · 엑셀 날짜 일련번호 · Date
  function parseDate(v) {
    if (v instanceof Date) return isNaN(v) ? null : mkDate(v.getFullYear(), v.getMonth() + 1, v.getDate());
    if (typeof v === 'number') {
      if (v >= 19900101 && v <= 21001231 && v % 1 === 0) return mkDate(Math.floor(v / 10000), Math.floor(v / 100) % 100, v % 100);
      if (v >= 199001 && v <= 210012 && v % 1 === 0) return mkDate(Math.floor(v / 100), v % 100, null);
      if (v >= 20000 && v < 80000) { var t = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000); return mkDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); }
      return null;
    }
    var s = clean(v); if (!s) return null;
    var m = s.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*(?:[-./월]\s*(?:(\d{1,2})\s*일?)?)?/);
    if (m) return mkDate(+m[1], +m[2], m[3] ? +m[3] : null);
    m = s.match(/^(\d{4})(\d{2})(\d{2})?$/);
    if (m) return mkDate(+m[1], +m[2], m[3] ? +m[3] : null);
    if (/^\d+(\.\d+)?$/.test(s)) return parseDate(Number(s));
    return null;
  }
  // HS 4단위(호): 점 앞이 3자리면 앞의 0 이 빠진 것(402.10 → 0402). 점이 없고 자리수가 홀수(5·7·9)여도
  // 엑셀이 앞의 0 을 지운 것으로 본다. 류 01~97(77 제외)이 아니면 null.
  function hs4(v) {
    var s = clean(v); if (!s) return null;
    var head = s.split(/[.\s-]/)[0].replace(/\D/g, ''), digits = s.replace(/\D/g, '');
    var four;
    if (/[.\s-]/.test(s) && head.length >= 3 && head.length <= 4) four = (head.length === 3 ? '0' + head : head);
    else {
      if (digits.length % 2 === 1 && digits.length >= 5) digits = '0' + digits;
      if (digits.length < 4) return null;
      four = digits.slice(0, 4);
    }
    var ch = +four.slice(0, 2);
    return ch >= 1 && ch <= 97 && ch !== 77 ? four : null;
  }
  var TOTAL_RE = /^(합\s*계|소\s*계|총\s*계|누\s*계|total|subtotal)$/i;

  // rows: 엑셀 한 시트의 객체 배열(sheet_to_json). → { records, skipped:[{row, reason}], issues:[문장], blanks:{label: 칸 수}, period }
  // row 번호는 엑셀 줄 번호(머리글 1줄 + 1부터)다.
  // offset = 머리글 위에 있던 줄 수(제목 줄 등) — 엑셀 줄 번호를 맞추려고 쓴다.
  // (v1.7.0) opts = { plantHq: {번호: 본부}, excludeGN: true|false } — 수출 설정. 없으면 기본값(EXPORT_PLANT_HQ · GN 제외 켜짐).
  //   결제방법(payment)이 GN 인 줄은 레코드에서 빼고 excluded 로 센다(「건너뛴 줄」과 따로).
  //   신고번호(declNo)가 짝지어져 있으면 줄마다 declState = ok | blank | bad(길이 ≠ 14 · 영문으로 시작) — 건수는 ok 번호의 고유 개수.
  // (v1.8.0) GN 제외는 수입(물자대) · 수출(금액) 모두. 무환구분(monetary)과 결제방법이 둘 다 있으면 「N 인데 GN 아님 / GN 인데 N 아님」 줄을 mismatch 로 센다
  //   (GN 제외 설정과 관계없이 모든 줄). opts.rowNos[i] = { sheet, row } 를 주면(여러 시트를 이어 붙인 줄) 줄 번호를 「RAW3 15」처럼 적고 rec.sheet 를 남긴다.
  function normalize(rows, kind, map, offset, opts) {
    opts = opts || {};
    var fields = fieldsOf(kind), recs = [], skipped = [], blanks = {}, bad = {}, badRows = {}, unknownCodes = {}, multi = {};
    var plantHq = opts.plantHq || EXPORT_PLANT_HQ, dropGN = (kind === 'export' || kind === 'import') && !!map.payment && opts.excludeGN !== false;
    var gnAmt = kind === 'import' ? map.goods : map.amount, chkMon = !!(map.monetary && map.payment), mismatch = { n: 0, rows: [], monN: 0, gnN: 0 };
    var excluded = { n: 0, amount: null, rows: [] }, unclassified = {}, declBad = { blank: 0, bad: 0, rows: [] };
    // (v1.9.0) 수입 — 신고번호 열이 있으면 시트마다 「마지막으로 번호가 있는 줄」 뒤의 번호 빈 줄 = 맨 아래 합계 행(실적에서 뺌).
    //   중간의 번호 빈 줄은 금액은 넣고 건수에서만 뺀다(declBad). 번호가 하나도 없는 시트에는 이 규칙을 쓰지 않는다.
    var declF = fields.filter(function (f) { return f.key === 'declNo'; })[0], loose = !!(declF && declF.declLoose && map.declNo);
    var lastDecl = {}, totalRows = { n: 0, rows: [], amount: null }, bonded = { n: 0, duty: null };
    if (loose) (rows || []).forEach(function (r, i) { var rn = opts.rowNos && opts.rowNos[i], sk = rn && rn.sheet || ''; if (clean(r[map.declNo])) lastDecl[sk] = i; });
    (rows || []).forEach(function (r, i) {
      var rn = opts.rowNos && opts.rowNos[i], row = rn ? (rn.sheet ? rn.sheet + ' ' + rn.row : rn.row) : i + 2 + (offset || 0), vals = fields.map(function (f) { return map[f.key] ? r[map[f.key]] : undefined; });
      if (vals.every(function (x) { return clean(x) === ''; })) return;                       // 완전히 빈 줄
      if (loose) {
        var sk = rn && rn.sheet || '';
        if (lastDecl[sk] != null && i > lastDecl[sk] && !clean(r[map.declNo])) {
          var ta = map.goods ? parseNum(r[map.goods]) : null;
          totalRows.n++; totalRows.rows.push(row); if (ta != null && !isNaN(ta)) totalRows.amount = (totalRows.amount || 0) + ta;
          return;
        }
      }
      var text = fields.filter(function (f) { return f.type === 'text' && map[f.key]; }).map(function (f) { return clean(r[map[f.key]]); });
      var firstCells = Object.keys(r).slice(0, 3).map(function (k) { return clean(r[k]); });
      if (text.concat(firstCells).some(function (t) { return TOTAL_RE.test(t); })) { skipped.push({ row: row, reason: '합계·소계 줄' }); return; }
      var isGN = map.payment && clean(r[map.payment]).toUpperCase() === EXPORT_EXCLUDE_PAYMENT;
      if (chkMon) {
        var isN = clean(r[map.monetary]).toUpperCase() === 'N';
        if (isN !== isGN) { mismatch.n++; mismatch.rows.push(row); if (isN) mismatch.monN++; else mismatch.gnN++; }
      }
      if (dropGN && isGN) {
        var ga = gnAmt ? parseNum(r[gnAmt]) : null;
        excluded.n++; excluded.rows.push(row); if (ga != null && !isNaN(ga)) excluded.amount = (excluded.amount || 0) + ga;
        return;
      }
      var rec = { row: row };
      if (rn && rn.sheet) rec.sheet = rn.sheet;
      var ok = true;
      fields.forEach(function (f) {
        if (!map[f.key]) return;
        var raw = r[map[f.key]];
        if (f.type === 'date' && f.opt) {
          // (v1.6.0) 선택 날짜 열(경정청구일): 비어도 줄을 빼지 않는다. 읽지 못하면 비운 채 알린다.
          var od = parseDate(raw);
          if (od) { rec[f.key] = od.date || od.month; rec[f.key + 'Month'] = od.month; rec[f.key + 'Year'] = od.y; }
          else { rec[f.key] = null; if (clean(raw)) { bad[f.label] = (bad[f.label] || 0) + 1; (badRows[f.label] = badRows[f.label] || []).push(row); } }
        } else if (f.type === 'date') {
          var d = parseDate(raw), fm = opts.forceMonth;
          // (v1.10.0) 파일 이름이 단일 월(2026-09_수입실적)이면 파일 전체를 그 월로 — 날짜가 빈 줄(미수리)도 그 월에 넣고, 다른 달 날짜는 표시만 한다
          if (!d && fm) { rec.date = null; rec.month = fm; rec.year = +fm.slice(0, 4); rec.noDate = true; return; }
          if (!d) { ok = false; skipped.push({ row: row, reason: clean(raw) ? f.label + '을(를) 날짜로 읽지 못함: ' + clean(raw) : f.label + ' 빈칸' }); return; }
          rec.date = d.date; rec.month = d.month; rec.year = d.y;
          if (fm && d.month !== fm) { rec.dateMonth = d.month; rec.month = fm; rec.year = +fm.slice(0, 4); rec.outside = true; }
        } else if (f.type === 'num') {
          var n = parseNum(raw);
          if (n === null) { blanks[f.label] = (blanks[f.label] || 0) + 1; rec[f.key] = null; }
          else if (isNaN(n)) { bad[f.label] = (bad[f.label] || 0) + 1; (badRows[f.label] = badRows[f.label] || []).push(row); rec[f.key] = null; }
          else rec[f.key] = n;
        } else if (f.type === 'rate') {
          var rt = parseRate(raw);
          if (rt === undefined) { bad[f.label] = (bad[f.label] || 0) + 1; (badRows[f.label] = badRows[f.label] || []).push(row); rec[f.key] = null; }
          else if (rt === null) { blanks[f.label] = (blanks[f.label] || 0) + 1; rec[f.key] = null; }
          else if (rt.multi) { multi[f.label] = (multi[f.label] || 0) + 1; rec[f.key] = null; rec[f.key + 'Multi'] = rt.text; }
          else { rec[f.key] = rt.rate; if (rt.code) rec[f.key + 'Code'] = rt.code; }
        } else if (f.type === 'hs') {
          rec.hs = clean(raw); rec.hs4 = hs4(raw) || '(HS 미상)';
          if (rec.hs4 === '(HS 미상)') bad['HS 4단위'] = (bad['HS 4단위'] || 0) + 1;
        } else if (f.codes) {
          var cv = clean(raw), cm = cv.match(CODE_RE);
          if (cm) {
            var code = cm[1].toUpperCase();
            rec.hqCode = code;
            if (f.codes[code]) rec[f.key] = f.codes[code];
            else { rec[f.key] = '미등록(' + code + ')'; (unknownCodes[code] = unknownCodes[code] || []).push(row); }
          } else rec[f.key] = cv || '(미기재)';
        } else if (f.plant) {
          var pv = plantValue(raw, plantHq);
          rec[f.key] = pv.hq; rec.plant = pv.code;
          if (pv.unclassified) { rec.hqUnclassified = true; var uk = pv.code || '(빈칸)'; (unclassified[uk] = unclassified[uk] || []).push(row); }
        } else if (f.key === 'declNo') {
          var dn = declNoOf(raw, f.declLoose);
          rec.declNo = dn.no; rec.declState = dn.state;
          if (dn.state !== 'ok') { declBad[dn.state]++; declBad.rows.push(row); }
          if (f.declLoose) rec.declType = declTypeOf(dn.no);
        } else rec[f.key] = clean(raw) || (f.keepBlank ? null : '(미기재)');
      });
      // (v1.9.0) 보세공장 사용신고(B) — 건수 · 물자대는 넣고 관세는 관세 합계에서 뺀다(dutyExcl 에 따로 둔다)
      if (ok && rec.declType === 'B' && map.duty) {
        rec.dutyExcl = rec.duty; rec.duty = null; bonded.n++;
        if (rec.dutyExcl != null) bonded.duty = (bonded.duty || 0) + rec.dutyExcl;
      }
      if (ok) recs.push(rec);
    });
    var uncl = Object.keys(unclassified).sort(), unclN = 0, unclAmt = null;
    var amtKey = kind === 'import' ? 'goods' : 'amount';
    recs.forEach(function (r) { if (r.hqUnclassified) { unclN++; if (r[amtKey] != null) unclAmt = (unclAmt || 0) + r[amtKey]; } });
    var issues = [];
    Object.keys(bad).forEach(function (k) {
      issues.push(k + ' 값 ' + bad[k] + '칸을 읽지 못했습니다' + (badRows[k] ? '(엑셀 ' + badRows[k].slice(0, 5).join('·') + '행' + (badRows[k].length > 5 ? ' 외' : '') + ')' : '') + ' — 집계에서 뺍니다.');
    });
    Object.keys(multi).forEach(function (k) { issues.push(k + ' 값이 여러 개(예: 0, 8)인 칸 ' + multi[k] + '개 — 「복수 세율」로 따로 두고, 0% 건수 · 절감 추정에서는 뺍니다. 목록에는 그대로 보입니다.'); });
    // 필수 금액 칸의 빈칸만 알린다. FTA·절감액 같은 선택 칸은 비어 있는 것이 보통이다(FTA 미적용).
    fields.forEach(function (f) { if (f.req && blanks[f.label]) issues.push(f.label + ' 빈칸 ' + blanks[f.label] + '칸 — 0 으로 채우지 않고 비워 둔 채 더합니다.'); });
    var unk = Object.keys(unknownCodes).sort();
    unk.forEach(function (c) {
      var rs = unknownCodes[c];
      issues.push('본부 번호표에 없는 새 번호 ' + c + ' ' + rs.length + '줄(엑셀 ' + rs.slice(0, 5).join('·') + '행' + (rs.length > 5 ? ' 외' : '') + ') — 본부를 추측하지 않고 「미등록(' + c + ')」으로 둡니다. 금액은 합계에 넣습니다. 담당자에게 어느 본부인지 확인해 주세요.');
    });
    if (uncl.length) issues.push(HQ_UNCLASSIFIED + ' ' + unclN + '줄 · 금액 ' + fmtNum(unclAmt) + ' — Plant 값 ' + uncl.map(function (c) { return c + ' ' + unclassified[c].length + '줄'; }).join(', ') +
      '. 본부를 추측하지 않고 따로 셉니다(금액은 합계에 넣음). 설정의 Plant → 본부 표에 넣으면 그 본부로 셉니다.');
    if (excluded.n) issues.push('결제방법 ' + EXPORT_EXCLUDE_PAYMENT + '(무환) ' + excluded.n + '줄을 실적에서 뺐습니다(' + (kind === 'import' ? '물자대 ' : '금액 ') + fmtNum(excluded.amount) + ') — 설정에서 끌 수 있습니다.');
    if (totalRows.n) issues.push('합계 행 ' + totalRows.n + '줄(맨 아래 신고번호가 빈 줄, 엑셀 ' + totalRows.rows.slice(0, 5).join('·') + '행) — 실적에서 뺐습니다.');
    if (bonded.n) issues.push(DECL_TYPES.B + '(신고번호 끝 B) ' + bonded.n + '줄 — 건수 · 물자대에는 넣고, 관세(' + fmtNum(bonded.duty) + ')는 관세 합계에서 뺍니다.');
    if (mismatch.n) issues.push('무환구분(Monetary Transaction)과 결제방법(Payment)이 어긋나는 줄 ' + mismatch.n + '개 — N 인데 GN 아님 ' + mismatch.monN + ' · GN 인데 N 아님 ' + mismatch.gnN +
      '(엑셀 ' + mismatch.rows.slice(0, 5).join('·') + '행' + (mismatch.rows.length > 5 ? ' 외' : '') + '). 입력 오류인지 확인해 주세요. 실적에서 빼는 기준은 결제방법 GN 하나입니다.');
    if (declBad.rows.length) issues.push('신고번호 확인 필요 ' + declBad.rows.length + '줄(빈칸 ' + declBad.blank + ' · 형식 다름 ' + declBad.bad + ', 엑셀 ' + declBad.rows.slice(0, 5).join('·') + '행' + (declBad.rows.length > 5 ? ' 외' : '') + ') — 건수에서는 빼고 금액은 더합니다.');
    if (skipped.length) issues.push('건너뛴 줄 ' + skipped.length + '개(합계 줄·날짜 없음)');
    return { records: recs, skipped: skipped, issues: issues, blanks: blanks, period: periodOf(recs), unknownCodes: unk,
      excluded: excluded, mismatch: mismatch, unclassified: { n: unclN, amount: unclAmt, codes: uncl }, declBad: { n: declBad.rows.length, blank: declBad.blank, bad: declBad.bad, rows: declBad.rows },
      totalRows: totalRows, bonded: bonded };
  }
  // (v1.9.0) 수입신고번호 끝 글자 → 'M' | 'B' | '?'
  function declTypeOf(no) { var c = no ? String(no).slice(-1).toUpperCase() : ''; return c === 'M' || c === 'B' ? c : '?'; }
  // (v1.7.0) Plant 값 → { hq, code, unclassified }. 번호표에 있으면 그 본부, 표에 없는 숫자 번호 · 빈칸은 「본부 미분류」,
  // 글자가 든 값(예: 「건설기계본부」)은 본부 이름으로 보고 그대로 둔다.
  function plantValue(raw, table) {
    var v = clean(raw).replace(/\.0+$/, '');
    if (!v) return { hq: HQ_UNCLASSIFIED, code: '', unclassified: true };
    var t = table || EXPORT_PLANT_HQ;
    if (Object.prototype.hasOwnProperty.call(t, v)) return { hq: t[v], code: v, unclassified: false };
    if (/^\d+$/.test(v)) return { hq: HQ_UNCLASSIFIED, code: v, unclassified: true };
    return { hq: v, code: '', unclassified: false };
  }
  // (v1.7.0) 수출신고번호 — 하이픈 · 공백을 지운 뒤 14자리, 영문으로 시작하지 않음 → ok. 빈칸 → blank, 그 밖 → bad.
  // (v1.9.0) loose = 수입 규칙: 영문 · 숫자만이면 길이 · 모양과 관계없이 ok(특송 「2235626B68687M」 포함). 한글 · 기호가 섞이면 bad.
  function declNoOf(raw, loose) {
    var s = clean(raw).replace(/[-\s]/g, '');
    if (!s) return { no: null, state: 'blank' };
    if (loose) return { no: s.toUpperCase(), state: /^[A-Za-z0-9]+$/.test(s) ? 'ok' : 'bad' };
    return { no: s, state: s.length === 14 && !/^[A-Za-z]/.test(s) ? 'ok' : 'bad' };
  }
  // (v1.7.0) 수출 건수 — 신고번호를 짝지은 줄은 ok 번호의 고유 개수(같은 번호 여러 줄 = 1건, 빈칸 · 형식 다름은 빼고 badN 으로 센다),
  // 신고번호 열이 없는 파일의 줄(declState 없음)은 한 줄 = 1건. → { n, badN, rows }
  function countDecl(recs) {
    var seen = {}, n = 0, badN = 0;
    (recs || []).forEach(function (r) {
      if (!r.declState) { n++; return; }
      if (r.declState !== 'ok') { badN++; return; }
      if (!seen[r.declNo]) { seen[r.declNo] = 1; n++; }
    });
    return { n: n, badN: badN, rows: (recs || []).length };
  }
  // (v1.7.0) 설정 — 저장된 값 → { plantHq, excludeGN, rows:[{code, hq}] }. 빈 줄은 빼고, 번호가 같으면 뒤의 것.
  function exportSettings(saved) {
    var s = saved && typeof saved === 'object' ? saved : {}, rows = Array.isArray(s.plant) ? s.plant : null, t = {};
    if (rows) rows.forEach(function (r) { var c = clean(r && r.code).replace(/\.0+$/, ''), h = clean(r && r.hq); if (c && h) t[c] = h; });
    else Object.keys(EXPORT_PLANT_HQ).forEach(function (k) { t[k] = EXPORT_PLANT_HQ[k]; });
    // (v1.9.0) 고쳐 저장한 표에 없으면 늘 넣는다(1131 = 엔진본부). 이름은 사용자가 바꾼 값이 앞선다.
    Object.keys(PLANT_HQ_ALWAYS).forEach(function (k) { if (!t[k]) t[k] = PLANT_HQ_ALWAYS[k]; });
    return { plantHq: t, excludeGN: s.excludeGN !== false, rows: Object.keys(t).sort().map(function (k) { return { code: k, hq: t[k] }; }), custom: !!rows };
  }
  function exportBasis(opts) { return (opts && opts.excludeGN === false ? 'GN 포함' : 'GN 제외') + ' · 건수는 신고번호 기준'; }
  // (v1.9.0) 수입 실적 기준 문구. has = { payment, declNo } — 그 열이 없는 파일(예전 한글 예제)에는 해당 문구를 붙이지 않는다.
  function importBasis(opts, has) {
    has = has || { payment: true, declNo: true };
    var p = [];
    if (has.payment) p.push(opts && opts.excludeGN === false ? 'GN 포함' : 'GN 제외');
    p.push(has.declNo ? '건수는 신고번호 기준' : '건수는 줄 수');
    p.push('관세부담율 = 관세 ÷ 물자대');
    if (has.declNo) p.push('보세공장 사용신고(B) 관세는 관세 합계에서 제외');
    return p.join(' · ');
  }

  /* ---------- (v1.5.0) 같은 종류 여러 파일 합치기 ---------- */
  // 파일 = { name(올린 파일 이름), file(보이는 이름 — 시트 이름 포함), uploadedAt, headers, aoa(머리글 포함), offset, override, reason }
  // 같은 파일인지는 name 으로 본다(시트 이름은 보지 않는다). name 이 없는 예전 자료는 file 을 쓴다.
  function fileKey(f) { return clean(f && (f.name || f.file)); }
  // 이름이 같은 파일이 있으면 그 자리만 바꾸고(replaced), 없으면 뒤에 더한다(added). 머리글이 같으면 사람이 고른 열 짝짓기를 이어받는다.
  function upsertFile(files, item) {
    var list = (files || []).slice(), key = fileKey(item), i = -1;
    list.forEach(function (f, j) { if (fileKey(f) === key) i = j; });
    if (i < 0) { list.push(item); return { files: list, action: 'added', index: list.length - 1 }; }
    var old = list[i];
    if (!item.override || !Object.keys(item.override).length) item.override = (old.headers || []).join('|') === (item.headers || []).join('|') ? (old.override || {}) : {};
    list[i] = item;
    return { files: list, action: 'replaced', index: i };
  }
  // 파일마다 열 짝짓기 · 읽기를 따로 하고, 짝지은 항목(날짜 · 본부 · 금액 …)으로 만든 레코드를 이어 붙인다.
  // ok = 모든 파일이 필수 열을 다 찾음. 하나라도 못 찾으면 그 종류는 집계하지 않는다(일부만 더한 값이 전체처럼 보이지 않게).
  // map = 모든 파일에 있는 항목만(선택 항목이 일부 파일에만 있으면 partial 에 그 파일 이름 — FTA 는 값을 짓지 않고, 환급 건수는 파일마다 센다).
  // (v1.7.0) opts = 수출 설정(normalize 와 같음). 머리글은 uniqueHeaders 로 맞춘다(같은 이름 열 구분).
  function mergeFiles(kind, files, opts) {
    var per = (files || []).map(function (f) {
      var res = mapColumns(uniqueHeaders(f.headers || []), kind, f.override), norm = null, sheets = null;
      // (v1.10.0) 파일 판별(filerules.js describe)이 붙어 있으면 — 실적(수입 · 수출)만 파일 이름 단일 월로 귀속한다
      var meta = f.meta || null, force = meta && meta.forceMonth && (kind === 'import' || kind === 'export') ? meta.forceMonth : null;
      var o1 = opts; if (force) { o1 = {}; Object.keys(opts || {}).forEach(function (k) { o1[k] = opts[k]; }); o1.forceMonth = force; }
      if (!res.missing.length) {
        if (f.parts && f.parts.length > 1) {
          // (v1.8.0) 같은 모양의 시트 여러 장 — 줄을 이어 붙이고 시트별 엑셀 줄 번호를 넘긴다
          var rows = [], rowNos = [];
          f.parts.forEach(function (pt) { aoaToRows(pt.aoa || [[]]).forEach(function (r, i) { rows.push(r); rowNos.push({ sheet: pt.sheet, row: i + 2 + (pt.offset || 0) }); }); });
          var o = {}; Object.keys(o1 || {}).forEach(function (k) { o[k] = o1[k]; }); o.rowNos = rowNos;
          norm = normalize(rows, kind, res.map, 0, o);
          sheets = f.parts.map(function (pt) { var rs = norm.records.filter(function (r) { return r.sheet === pt.sheet; }); return { sheet: pt.sheet, n: rs.length, period: periodOf(rs) }; });
        } else norm = normalize(aoaToRows(f.aoa || []), kind, res.map, f.offset, o1);
      }
      return { file: f.file || f.name || '', name: fileKey(f), uploadedAt: f.uploadedAt || '', res: res, norm: norm, ok: !res.missing.length, period: norm ? norm.period : null,
        sheets: sheets, skippedSheets: f.skippedSheets || [],
        excluded: norm ? norm.excluded.n : 0, excludedAmount: norm ? norm.excluded.amount : null, declBad: norm ? norm.declBad.n : 0, unclassified: norm ? norm.unclassified.n : 0, mismatch: norm ? norm.mismatch.n : 0,
        totalRows: norm ? norm.totalRows.n : 0, bonded: norm ? norm.bonded.n : 0, dates: fileDates(kind, res, norm, meta, force) };
    });
    var ok = per.length > 0 && per.every(function (p) { return p.ok; });
    var records = [], skipped = [], issues = [], unknown = {}, map = {}, partial = {};
    fieldsOf(kind).forEach(function (fd) {
      var have = per.filter(function (p) { return p.res.map[fd.key]; });
      if (per.length && have.length === per.length) map[fd.key] = have[0].res.map[fd.key];
      else if (have.length) partial[fd.key] = per.filter(function (p) { return !p.res.map[fd.key]; }).map(function (p) { return p.file; });
    });
    per.forEach(function (p) {
      if (!p.norm) return;
      var noCount = kind === 'refund' && !p.res.map.count;
      p.norm.records.forEach(function (r) { r.file = p.file; if (noCount) r.countRow = true; records.push(r); });
      p.norm.skipped.forEach(function (s) { skipped.push({ file: p.file, row: s.row, reason: s.reason }); });
      p.norm.issues.forEach(function (t) { issues.push(per.length > 1 ? p.file + ' — ' + t : t); });
      (p.norm.unknownCodes || []).forEach(function (c) { unknown[c] = 1; });
    });
    // map.partial — 집계 함수(refundStats)가 볼 수 있게 붙이되, 열 이름 목록으로 돌 때 섞이지 않게 숨긴다
    Object.defineProperty(map, 'partial', { value: partial, enumerable: false });
    var overlaps = periodOverlaps(per);
    overlaps.forEach(function (o) { issues.push('기간이 겹칩니다. 중복 집계일 수 있습니다 — ' + o.a + ' · ' + o.b + ' (' + monthLabel(o.from) + ' ~ ' + monthLabel(o.to) + ')'); });
    var tot = function (k) { return per.reduce(function (t, p) { return t + (p[k] || 0); }, 0); };
    return {
      kind: kind, files: per, ok: ok, records: records, skipped: skipped, issues: issues, unknownCodes: Object.keys(unknown).sort(),
      excluded: tot('excluded'), declBad: tot('declBad'), unclassified: tot('unclassified'), mismatch: tot('mismatch'), totalRows: tot('totalRows'), bonded: tot('bonded'),
      period: periodOf(records), map: map, partial: partial, overlaps: overlaps
    };
  }
  // 데이터 기간(월)이 겹치는 파일 쌍 — [{ a, b, from, to }]. 이름이 같은 파일은 upsertFile 이 이미 하나로 만든다.
  function periodOverlaps(files) {
    var out = [], fs = (files || []).filter(function (f) { return f.period; });
    for (var i = 0; i < fs.length; i++) for (var j = i + 1; j < fs.length; j++) {
      var a = fs[i].period, b = fs[j].period, from = a.from > b.from ? a.from : b.from, to = a.to < b.to ? a.to : b.to;
      if (from <= to) out.push({ a: fs[i].file, b: fs[j].file, from: from, to: to });
    }
    return out;
  }
  // (v1.10.0) 파일 하나의 날짜 사정 — 파일 목록 경고용(집계에는 쓰지 않는다).
  //   dateHeader = 날짜로 짝지은 머리글(없으면 null → 「날짜 열 없음」), noDate = 날짜 빈 줄을 파일 이름 월로 넣은 수,
  //   dateBlank = 날짜 빈 줄(월 미지정 — 실적에서 빠짐), outside = 파일 이름 기간을 벗어난 줄, from · to = 데이터의 첫 · 끝 날짜.
  function fileDates(kind, res, norm, meta, force) {
    var df = fieldsOf(kind).filter(function (f) { return f.type === 'date' && !f.opt; })[0];
    var out = { dateHeader: df ? res.map[df.key] || null : null, noDate: 0, dateBlank: 0, outside: 0, from: null, to: null, rows: 0 };
    if (!norm) return out;
    var recs = norm.records, ds = recs.map(function (r) { return r.date; }).filter(Boolean).sort();
    out.rows = recs.length; out.from = ds[0] || null; out.to = ds[ds.length - 1] || null;
    out.noDate = recs.filter(function (r) { return r.noDate; }).length;
    out.dateBlank = df ? norm.skipped.filter(function (s) { return s.reason === df.label + ' 빈칸'; }).length : 0;
    var p = meta && meta.period;
    if (force) out.outside = recs.filter(function (r) { return r.outside; }).length;
    else if (p && p.months && p.months.length) { var set = {}; p.months.forEach(function (m) { set[m] = 1; }); out.outside = recs.filter(function (r) { return r.month && !set[r.month]; }).length; }
    return out;
  }
  // 이 브라우저에 기억한 자료 → { sets: { kind: { files: [...] } } }. 예전 형식(v1: 종류마다 파일 하나)은 파일 1개짜리 목록으로.
  function migrateSaved(j) {
    var out = { sets: {} };
    if (!j || typeof j !== 'object' || !j.sets || typeof j.sets !== 'object') return out;
    Object.keys(j.sets).forEach(function (k) {
      if (!DATASETS[k]) return;
      var s = j.sets[k], list = s && Array.isArray(s.files) ? s.files : s && s.aoa ? [s] : [];
      list = list.filter(function (f) { return f && Array.isArray(f.headers) && (Array.isArray(f.aoa) || (Array.isArray(f.parts) && f.parts.length)); }).map(function (f) {
        // (v1.8.0) 여러 시트(parts)로 기억한 파일은 aoa 를 비워 두었다 → 첫 시트로 채운다(열 확인의 예시 값)
        var parts = Array.isArray(f.parts) && f.parts.length > 1 ? f.parts.filter(function (pt) { return pt && Array.isArray(pt.aoa); }) : null;
        var aoa = Array.isArray(f.aoa) && f.aoa.length ? f.aoa : parts ? parts[0].aoa : [];
        var o = { name: f.name || f.file || '', file: f.file || f.name || '', uploadedAt: f.uploadedAt || '', headers: f.headers, aoa: aoa, offset: f.offset || 0, override: f.override || {}, reason: f.reason };
        if (parts) o.parts = parts;
        if (Array.isArray(f.skippedSheets)) o.skippedSheets = f.skippedSheets;
        if (f.meta && typeof f.meta === 'object') o.meta = f.meta;           // (v1.10.0) 파일 판별(종류 · 기간 · 확정본 · 월 귀속)
        return o;
      });
      if (list.length) out.sets[k] = { files: list };
    });
    return out;
  }

  /* ---------- 기간 ---------- */
  function periodOf(recs) {
    var ms = recs.map(function (r) { return r.month; }).filter(Boolean).sort();
    return ms.length ? { from: ms[0], to: ms[ms.length - 1] } : null;
  }
  function shiftMonth(m, k) {
    var y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + k;
    y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12;
    return y + '-' + pad2(mo + 1);
  }
  function monthsBetween(from, to) { var out = []; for (var m = from; m <= to && out.length < 600; m = shiftMonth(m, 1)) out.push(m); return out; }
  // 여러 데이터의 기간을 합친다
  function unionPeriod(periods) {
    var p = periods.filter(Boolean); if (!p.length) return null;
    return { from: p.map(function (x) { return x.from; }).sort()[0], to: p.map(function (x) { return x.to; }).sort().pop() };
  }
  // 기본 조회 기간 — (v1.8.0) 자료가 2026-01(DASH_BASE_FROM) 이후까지 있으면 2026-01(자료가 더 늦게 시작하면 그 달) ~ 마지막 달.
  // 자료가 모두 그보다 앞서면 예전 규칙: 마지막 달이 든 해의 1월(데이터가 그보다 늦게 시작하면 그 달) ~ 마지막 달.
  function defaultRange(period) {
    if (!period) return null;
    var from = period.to < DASH_BASE_FROM ? period.to.slice(0, 4) + '-01' : DASH_BASE_FROM;
    return { from: from < period.from ? period.from : from, to: period.to };
  }
  // (v1.6.0) 결정문 탭은 기간을 따로 가진다. 고를 수 있는 달 = 시행일자 · 경정청구일 모두 + 마지막 해 12월까지.
  function rulingPeriod(recs) {
    var ms = [];
    (recs || []).forEach(function (r) { if (r.month) ms.push(r.month); if (r.claimDateMonth) ms.push(r.claimDateMonth); });
    ms.sort();
    return ms.length ? { from: ms[0], to: ms[ms.length - 1] } : null;
  }
  function rulingMonths(period) { return period ? monthsBetween(period.from, period.to.slice(0, 4) + '-12') : []; }
  // 기본 = RULING_BASE_FROM(2026-01) ~ 자료 마지막 달. 자료가 모두 그보다 앞서면 다른 탭과 같은 규칙.
  function rulingDefaultRange(period) { return defaultRange(period); }   // (v1.8.0) 다른 탭과 같은 규칙이 됨
  // 전년 동기 = 같은 달 수만큼 12개월 앞. 12개월을 넘게 고르면 두 기간이 겹친다(overlap).
  function prevRange(range) {
    return { from: shiftMonth(range.from, -12), to: shiftMonth(range.to, -12), overlap: monthsBetween(range.from, range.to).length > 12 };
  }

  /* ---------- 거르기 ---------- */
  // f = { from, to, hq, country }. 그 열이 없는 데이터(예: 환급에는 국가가 없다)는 그 조건을 걸지 않고 ignored 로 알린다.
  function applyFilter(recs, kind, f) {
    f = f || {};
    var ignored = [];
    var useHq = f.hq && hasField(kind, 'hq'), useCo = f.country && hasField(kind, 'country');
    if (f.hq && !useHq) ignored.push('본부');
    if (f.country && !useCo) ignored.push('국가');
    var out = recs.filter(function (r) {
      if (f.from && r.month < f.from) return false;
      if (f.to && r.month > f.to) return false;
      if (useHq && r.hq !== f.hq) return false;
      if (useCo && r.country !== f.country) return false;
      return true;
    });
    return { records: out, ignored: ignored };
  }
  function valuesOf(recs, key) {
    var s = {}; recs.forEach(function (r) { if (r[key] != null) s[r[key]] = true; });
    return Object.keys(s).sort(function (a, b) { return a.localeCompare(b, 'ko'); });
  }

  /* ---------- 계산 ---------- */
  // 빈 값(null)은 더하지 않는다. 하나도 없으면 null.
  function sum(recs, key) {
    var t = 0, n = 0;
    recs.forEach(function (r) { if (r[key] != null && isFinite(r[key])) { t += r[key]; n++; } });
    return n ? t : null;
  }
  function ratio(a, b) { return a == null || b == null || b === 0 ? null : a / b; }
  function change(cur, prev) { return { cur: cur, prev: prev, diff: cur == null && prev == null ? null : (cur || 0) - (prev || 0), rate: ratio((cur || 0) - (prev || 0), prev) }; }
  // 묶어 더하기 → [{ key, n, sums:{m: 합} }] — 첫 측정값 큰 순, 같으면 이름 순
  function group(recs, by, measures) {
    var g = {};
    recs.forEach(function (r) {
      var k = r[by] == null ? '(미기재)' : r[by];
      var o = g[k] || (g[k] = { key: k, n: 0, rows: [] });
      o.n++; o.rows.push(r);
    });
    return Object.keys(g).map(function (k) {
      var o = g[k], sums = {}; measures.forEach(function (m) { sums[m] = sum(o.rows, m); });
      return { key: k, n: o.n, sums: sums };
    }).sort(function (a, b) { return (b.sums[measures[0]] || 0) - (a.sums[measures[0]] || 0) || String(a.key).localeCompare(String(b.key), 'ko'); });
  }
  function byMonth(recs, months, measures) {
    var idx = {}; months.forEach(function (m, i) { idx[m] = i; });
    var out = months.map(function (m) { var o = { month: m, n: 0 }; measures.forEach(function (k) { o[k] = null; }); return o; });
    recs.forEach(function (r) {
      var o = out[idx[r.month]]; if (!o) return; o.n++;
      measures.forEach(function (k) { if (r[k] != null) o[k] = (o[k] || 0) + r[k]; });
    });
    return out;
  }
  function inRange(recs, range) { return recs.filter(function (r) { return r.month >= range.from && r.month <= range.to; }); }

  var BY = { hq: '본부', country: '국가', company: '업체', hs4: 'HS 4단위', kind: '구분' };

  // 수입: 물자대 · 관세 · 관세부담율(=관세 ÷ 물자대)
  function importStats(recs, range, by) {
    var cur = inRange(recs, range), goods = sum(cur, 'goods'), duty = sum(cur, 'duty'), b = by || 'hq';
    // (v1.9.0) 건수 = 신고번호 고유 개수(countDecl). 신고번호 열이 없는 파일은 예전처럼 줄 수.
    var rowsOf = {}; cur.forEach(function (r) { var k = r[b] == null ? '(미기재)' : r[b]; (rowsOf[k] = rowsOf[k] || []).push(r); });
    return {
      range: range, n: countDecl(cur).n, goods: goods, duty: duty, burden: ratio(duty, goods),
      groups: group(cur, b, ['goods', 'duty']).map(function (g) { return { key: g.key, n: countDecl(rowsOf[g.key]).n, goods: g.sums.goods, duty: g.sums.duty, burden: ratio(g.sums.duty, g.sums.goods) }; }),
      monthly: byMonth(cur, monthsBetween(range.from, range.to), ['goods', 'duty']).map(function (m) { m.burden = ratio(m.duty, m.goods); return m; })
    };
  }
  // 수출: 수출금액과 전년 동기 대비 증감(금액·비율). 전년에만 있던 묶음도 남긴다(올해 0).
  function exportStats(recs, range, by) {
    by = by || 'hq';
    var pr = prevRange(range), cur = inRange(recs, range), prev = inRange(recs, pr);
    var gc = {}, gp = {};
    group(cur, by, ['amount']).forEach(function (g) { gc[g.key] = g; });
    group(prev, by, ['amount']).forEach(function (g) { gp[g.key] = g; });
    var keys = Object.keys(gc).concat(Object.keys(gp).filter(function (k) { return !gc[k]; }));
    // (v1.7.0) 건수 = 신고번호 고유 개수(countDecl). 신고번호 열이 없으면 예전처럼 줄 수.
    var rowsOf = {}; cur.forEach(function (r) { var k = r[by] == null ? '(미기재)' : r[by]; (rowsOf[k] = rowsOf[k] || []).push(r); });
    var groups = keys.map(function (k) {
      var c = gc[k] ? gc[k].sums.amount : null, p = gp[k] ? gp[k].sums.amount : null, ch = change(c, p);
      return { key: k, n: gc[k] ? countDecl(rowsOf[k]).n : 0, amount: c, prev: p, diff: ch.diff, rate: ch.rate };
    }).sort(function (a, b) { return (b.amount || 0) - (a.amount || 0) || (b.prev || 0) - (a.prev || 0); });
    var months = monthsBetween(range.from, range.to);
    var mc = byMonth(cur, months, ['amount']), mp = byMonth(prev, months.map(function (m) { return shiftMonth(m, -12); }), ['amount']);
    var tot = change(sum(cur, 'amount'), sum(prev, 'amount')), cnt = countDecl(cur);
    // (v1.8.0) 전년 동기 자료가 하나도 없으면 0 으로 보지 않는다 — 전년 · 증감 · 증감률 모두 null(「—」)
    if (!prev.length) { tot = { cur: tot.cur, prev: null, diff: null, rate: null }; groups.forEach(function (g) { g.prev = null; g.diff = null; g.rate = null; }); }
    return {
      range: range, prevRange: pr, n: cnt.n, badN: cnt.badN, rows: cnt.rows, amount: tot.cur, prev: tot.prev, diff: tot.diff, rate: tot.rate,
      hasPrev: prev.length > 0, groups: groups,
      monthly: months.map(function (m, i) { return { month: m, amount: mc[i].amount, prev: mp[i].amount }; })
    };
  }
  // (v1.7.0) 수출 실적 탭 — 월말 보고 모양.
  //   기준월 = 조회 기간의 마지막 달. 전월 대비 = 기준월 vs 그 앞 달, 전년 동월 대비 = 기준월 vs 12개월 앞 같은 달
  //   (비교할 달에 자료가 없으면 null → 「—」). recs 는 본부 · 국가 조건을 건 뒤 전체(기간 밖 달도 비교에 쓴다).
  //   pivot = 본부 × 월(건수 · 금액) + 기간 합계 + 기준월 전월 대비. 본부 순서 = Plant 표의 본부 → 그 밖 본부(금액 큰 순) → 본부 미분류.
  //   countries = 국가 상위 10 + 그 밖, 비중 = 국가 금액 ÷ 기간 합계.
  function exportReport(recs, range, opts) {
    recs = recs || [];
    var months = monthsBetween(range.from, range.to), cur = inRange(recs, range), base = range.to;
    var byM = {}; recs.forEach(function (r) { (byM[r.month] = byM[r.month] || []).push(r); });
    function cell(rs) { var c = countDecl(rs || []); return { n: c.n, badN: c.badN, rows: c.rows, amount: sum(rs || [], 'amount') }; }
    function cmp(a, b, has) {
      if (!has) return { cur: a, prev: null, diff: null, rate: null };
      var ch = change(a, b); return { cur: a, prev: b, diff: ch.diff, rate: ch.rate };
    }
    function vs(rsCur, rsPrev) {
      var a = cell(rsCur), b = cell(rsPrev), has = (rsPrev || []).length > 0;
      return { amount: cmp(a.amount, b.amount, has), n: cmp(a.n, b.n, has), month: null };
    }
    var prevM = shiftMonth(base, -1), yoyM = shiftMonth(base, -12);
    var mom = vs(byM[base], byM[prevM]), yoy = vs(byM[base], byM[yoyM]);
    mom.month = prevM; yoy.month = yoyM;
    var total = cell(cur);
    var ho = hqOrder(recs, cur, opts, 'amount'), hqRows = ho.rows, hqs = ho.hqs;
    var pivot = hqs.map(function (h) {
      var rs = hqRows[h] || [], all = recs.filter(function (r) { return r.hq === h; });
      var mrows = {}; rs.forEach(function (r) { (mrows[r.month] = mrows[r.month] || []).push(r); });
      return { hq: h, unclassified: h === HQ_UNCLASSIFIED, months: months.map(function (m) { return cell(mrows[m]); }), total: cell(rs),
        mom: vs(all.filter(function (r) { return r.month === base; }), all.filter(function (r) { return r.month === prevM; })) };
    });
    var monthly = months.map(function (m) { var c = cell(byM[m]); c.month = m; return c; });
    // 국가 상위 10
    var cg = group(cur, 'country', ['amount']), top = cg.slice(0, 10), rest = cg.slice(10);
    var crow = function (key, rs, amount) { return { key: key, n: countDecl(rs).n, amount: amount, share: ratio(amount, total.amount) }; };
    var cRows = {}; cur.forEach(function (r) { var k = r.country == null ? '(미기재)' : r.country; (cRows[k] = cRows[k] || []).push(r); });
    var countries = top.map(function (g) { return crow(g.key, cRows[g.key], g.sums.amount); });
    var countryRest = rest.length ? crow('그 밖 ' + rest.length + '개국', [].concat.apply([], rest.map(function (g) { return cRows[g.key]; })), rest.reduce(function (t, g) { return g.sums.amount == null ? t : (t || 0) + g.sums.amount; }, null)) : null;
    var un = cur.filter(function (r) { return r.hqUnclassified; });
    return {
      range: range, base: base, months: months, total: total, mom: mom, yoy: yoy, monthly: monthly, pivot: pivot,
      countries: countries, countryRest: countryRest, countryN: cg.length,
      unclassified: { n: countDecl(un).n, rows: un.length, amount: sum(un, 'amount'), codes: valuesOf(un, 'plant').filter(Boolean) },
      basis: exportBasis(opts)
    };
  }
  // 본부 순서 = Plant 표의 본부(번호 순) → 그 밖 본부(금액 큰 순) → 본부 미분류. Plant 자료가 아니면(한글 본부 이름) 기간에 있는 본부만.
  function hqOrder(recs, cur, opts, measure) {
    var table = (opts && opts.plantHq) || EXPORT_PLANT_HQ, order = [];
    Object.keys(table).sort().forEach(function (k) { if (order.indexOf(table[k]) < 0) order.push(table[k]); });
    var plantData = recs.some(function (r) { return r.plant || r.hqUnclassified; });
    var hqRows = {}; cur.forEach(function (r) { (hqRows[r.hq] = hqRows[r.hq] || []).push(r); });
    var others = Object.keys(hqRows).filter(function (h) { return order.indexOf(h) < 0 && h !== HQ_UNCLASSIFIED; })
      .sort(function (a, b) { return (sum(hqRows[b], measure) || 0) - (sum(hqRows[a], measure) || 0) || a.localeCompare(b, 'ko'); });
    var hqs = (plantData ? order : order.filter(function (h) { return hqRows[h]; })).concat(others);
    if (plantData || hqRows[HQ_UNCLASSIFIED]) hqs.push(HQ_UNCLASSIFIED);
    return { hqs: hqs, rows: hqRows };
  }
  // (v1.9.0) 수입 실적 탭 — exportReport 와 같은 모양(기준월 = 조회 기간의 마지막 달).
  //   칸 = 건수(신고번호 고유 개수) · 물자대 · 관세(B 관세 뺌) · 관세부담율(= 관세 ÷ 물자대, B 물자대는 분모에 넣음).
  //   suppliers = 공급지역(Supplier) 상위 10 + 그 밖(비중 = 물자대 ÷ 기간 합계). 공급지역 열이 없으면 null.
  //   declTypes = 신고 종류(M · B · 구분 모름)별 건수 · 물자대 · 관세 · 관세 집계 제외 금액. 신고번호 열이 없으면 null.
  function importReport(recs, range, opts, has) {
    recs = recs || [];
    has = has || {};
    var months = monthsBetween(range.from, range.to), cur = inRange(recs, range), base = range.to;
    var byM = {}; recs.forEach(function (r) { (byM[r.month] = byM[r.month] || []).push(r); });
    function cell(rs) {
      rs = rs || []; var c = countDecl(rs), g = sum(rs, 'goods'), d = sum(rs, 'duty');
      return { n: c.n, badN: c.badN, rows: c.rows, goods: g, duty: d, burden: ratio(d, g), dutyExcl: sum(rs, 'dutyExcl') };
    }
    function cmp(a, b, hasPrev) { if (!hasPrev) return { cur: a, prev: null, diff: null, rate: null }; var ch = change(a, b); return { cur: a, prev: b, diff: ch.diff, rate: ch.rate }; }
    function vs(rsCur, rsPrev) {
      var a = cell(rsCur), b = cell(rsPrev), hp = (rsPrev || []).length > 0;
      return { goods: cmp(a.goods, b.goods, hp), duty: cmp(a.duty, b.duty, hp), n: cmp(a.n, b.n, hp), burden: { cur: a.burden, prev: hp ? b.burden : null }, month: null };
    }
    var prevM = shiftMonth(base, -1), yoyM = shiftMonth(base, -12);
    var mom = vs(byM[base], byM[prevM]), yoy = vs(byM[base], byM[yoyM]);
    mom.month = prevM; yoy.month = yoyM;
    var total = cell(cur), ho = hqOrder(recs, cur, opts, 'goods');
    var pivot = ho.hqs.map(function (h) {
      var rs = ho.rows[h] || [], mrows = {};
      rs.forEach(function (r) { (mrows[r.month] = mrows[r.month] || []).push(r); });
      return { hq: h, unclassified: h === HQ_UNCLASSIFIED, months: months.map(function (m) { return cell(mrows[m]); }), total: cell(rs) };
    });
    var monthly = months.map(function (m) { var c = cell(byM[m]); c.month = m; return c; });
    var hasSup = has.supplier != null ? !!has.supplier : recs.some(function (r) { return r.supplier != null && r.supplier !== '(미기재)'; });
    var suppliers = null, supplierRest = null, supplierN = 0;
    if (hasSup) {
      var sRows = {}; cur.forEach(function (r) { var k = r.supplier == null ? '(미기재)' : r.supplier; (sRows[k] = sRows[k] || []).push(r); });
      var sg = group(cur, 'supplier', ['goods']), srow = function (key, rs, goods) { return { key: key, n: countDecl(rs).n, goods: goods, share: ratio(goods, total.goods) }; };
      suppliers = sg.slice(0, 10).map(function (g) { return srow(g.key, sRows[g.key], g.sums.goods); });
      var rest = sg.slice(10); supplierN = sg.length;
      if (rest.length) supplierRest = srow('그 밖 ' + rest.length + '곳', [].concat.apply([], rest.map(function (g) { return sRows[g.key]; })), rest.reduce(function (t, g) { return g.sums.goods == null ? t : (t || 0) + g.sums.goods; }, null));
    }
    var hasDecl = has.declNo != null ? !!has.declNo : recs.some(function (r) { return r.declType; });
    var declTypes = !hasDecl ? null : DECL_TYPE_ORDER.map(function (t) {
      var rs = cur.filter(function (r) { return r.declType === t; }), c = cell(rs);
      return { type: t, label: DECL_TYPES[t], n: c.n, rows: c.rows, goods: c.goods, duty: t === 'B' ? null : c.duty, dutyExcl: c.dutyExcl, dutyExcluded: t === 'B' };
    });
    var un = cur.filter(function (r) { return r.hqUnclassified; });
    return {
      range: range, base: base, months: months, total: total, mom: mom, yoy: yoy, monthly: monthly, pivot: pivot,
      suppliers: suppliers, supplierRest: supplierRest, supplierN: supplierN, declTypes: declTypes,
      unclassified: { n: countDecl(un).n, rows: un.length, goods: sum(un, 'goods'), codes: valuesOf(un, 'plant').filter(Boolean) },
      basis: importBasis(opts, { payment: has.payment != null ? !!has.payment : true, declNo: hasDecl })
    };
  }
  // (v1.7.0) 수출입 합계 = 수입 물자대 + 수출금액, 건수 = 수입 건수 + 수출 신고번호 건수. 한쪽 자료가 없으면 합계는 null(「—」).
  // (v1.9.0) 수입 건수도 신고번호 고유 개수(신고번호 열이 없는 파일은 줄 수 — 예전과 같음).
  function tradeTotal(impRecs, expRecs, range) {
    var hasI = !!impRecs, hasE = !!expRecs;
    var ic = hasI ? inRange(impRecs, range) : [], ec = hasE ? inRange(expRecs, range) : [];
    var ig = hasI ? sum(ic, 'goods') : null, ea = hasE ? sum(ec, 'amount') : null, en = hasE ? countDecl(ec).n : null, inn = hasI ? countDecl(ic).n : null;
    var both = hasI && hasE;
    return { importGoods: ig, importN: inn, exportAmount: ea, exportN: en, both: both,
      amount: both ? (ig == null && ea == null ? null : (ig || 0) + (ea || 0)) : null, n: both ? inn + en : null };
  }
  // FTA: 물자대 · 물자대_FTA · 활용률(=물자대_FTA ÷ 물자대) · 절감액. 수입은 goods, 수출은 amount 가 물자대다.
  function ftaStats(recs, kind, range, by, map) {
    var base = kind === 'import' ? 'goods' : 'amount';
    var available = !map || !!map.ftaGoods, cur = inRange(recs, range);
    // 물자대_FTA 열이 있으면 빈칸은 「FTA 미적용」이라 0 으로 본다. 열이 없으면 값을 지어내지 않는다(null).
    var hasSaving = !map || !!map.saving;
    // (v1.5.0) 열이 없다고 본 값(여러 파일 중 일부에만 열이 있을 때 포함)은 계산하지 않는다(null)
    function z(v, on, col) { return col === false ? null : v == null && on ? 0 : v; }
    var goods = sum(cur, base), fg = z(sum(cur, 'ftaGoods'), available && cur.length, available), sv = z(sum(cur, 'saving'), hasSaving && cur.length, hasSaving);
    return {
      kind: kind, available: available, hasSaving: hasSaving, range: range, n: cur.length,
      goods: goods, ftaGoods: fg, util: ratio(fg, goods), saving: sv,
      groups: group(cur, by || 'hq', [base, 'ftaGoods', 'saving']).map(function (g) {
        var gf = z(g.sums.ftaGoods, available, available);
        return { key: g.key, n: g.n, goods: g.sums[base], ftaGoods: gf, util: ratio(gf, g.sums[base]), saving: z(g.sums.saving, hasSaving, hasSaving) };
      }),
      monthly: byMonth(cur, monthsBetween(range.from, range.to), [base, 'ftaGoods', 'saving']).map(function (m) {
        var mf = z(m.ftaGoods, available && m.n, available);
        return { month: m.month, goods: m[base], ftaGoods: mf, util: ratio(mf, m[base]), saving: z(m.saving, hasSaving && m.n, hasSaving) };
      })
    };
  }
  // 환급: 본부 × 월 표(행 합계·열 합계), 월 평균은 데이터가 있는 달 수로 나눈다
  // (v1.4.6) 건수: 「건수」 열이 있으면 그 열의 합(countBasis 'column'), 없으면 읽은 행 수(countBasis 'rows' — 신청 1건이 한 줄).
  // 행 수에는 환급액이 빈 줄도 넣는다(신청은 있었다). 합계·소계 줄 · 날짜 없는 줄은 normalize 가 이미 뺐다.
  // map(열 짝짓기)을 주면 map.count 로, 안 주면 count 값이 하나라도 있는지로 판단한다.
  // (v1.5.0) 여러 파일 중 일부에만 건수 열이 있으면 'mixed' — 열이 있는 파일은 그 합, 없는 파일(r.countRow)은 행 수.
  function refundCountBasis(recs, map) {
    if (map) return map.count ? 'column' : map.partial && map.partial.count ? 'mixed' : 'rows';
    var rowsPart = (recs || []).some(function (r) { return r.countRow; }), colPart = (recs || []).some(function (r) { return !r.countRow && r.count != null; });
    return rowsPart && colPart ? 'mixed' : colPart ? 'column' : 'rows';
  }
  var REFUND_COUNT_LABEL = { column: '건수 열의 합', rows: '행 수로 센 값', mixed: '건수 열의 합 + 행 수' };
  function refundCount(rows, basis) {
    if (basis === 'rows') return rows.length;
    if (basis === 'column') return sum(rows, 'count');
    return rows.filter(function (r) { return r.countRow; }).length + (sum(rows.filter(function (r) { return !r.countRow; }), 'count') || 0);
  }
  function refundStats(recs, range, map) {
    var cur = inRange(recs, range), months = monthsBetween(range.from, range.to), basis = refundCountBasis(recs, map);
    var monthly = byMonth(cur, months, ['amount', 'count']);
    var filled = monthly.filter(function (m) { return m.amount != null; });
    var hqs = group(cur, 'hq', ['amount', 'count']);
    var pivot = hqs.map(function (g) {
      var rows = cur.filter(function (r) { return r.hq === g.key; });
      return { hq: g.key, total: g.sums.amount, count: refundCount(rows, basis), months: byMonth(rows, months, ['amount']).map(function (m) { return m.amount; }) };
    });
    var total = sum(cur, 'amount');
    return {
      range: range, months: months, n: cur.length, amount: total, count: refundCount(cur, basis),
      countBasis: basis, countLabel: REFUND_COUNT_LABEL[basis],
      monthAvg: filled.length ? total / filled.length : null, monthsWithData: filled.length,
      last: filled.length ? filled[filled.length - 1] : null, monthly: monthly, pivot: pivot
    };
  }
  // 오류: 신고건수 · 오류건수 · 오류 비율(=오류건수 ÷ 신고건수) · 오류점수
  function errorStats(recs, range, by) {
    var cur = inRange(recs, range), decl = sum(cur, 'decl'), err = sum(cur, 'err');
    function row(o) { return { decl: o.decl, err: o.err, rate: ratio(o.err, o.decl), score: o.score }; }
    return {
      range: range, n: cur.length, decl: decl, err: err, rate: ratio(err, decl), score: sum(cur, 'score'),
      groups: group(cur, by || 'kind', ['decl', 'err', 'score']).map(function (g) { var o = row(g.sums); o.key = g.key; o.n = g.n; return o; }),
      monthly: byMonth(cur, monthsBetween(range.from, range.to), ['decl', 'err', 'score']).map(function (m) { var o = row(m); o.month = m.month; return o; })
    };
  }
  // (v1.2) 결정문: 건수 · 관세율 0 결정 건수와 비율 · 종전보다 낮아진 건 · 절감 추정(연간 수입액 × (종전세율 − 결정세율), 세 값이 다 있을 때만)
  // · 묶음별(완제품·관세사·HS 4단위) · 월별 시행 건수 · 세율별 분포 · 목록(최근 시행 순)
  // (v1.6.0) 고정비 절감 금액 — 항목마다 기간을 거는 날짜가 다르다(RULING_BASIS).
  //   시행일자 기준: 결정문 건수 · 세율 분포 · 묶음별 건수 · 월별 그래프 · 관세유보금액
  //   경정청구일 기준: 경정청구 금액(시행일자가 기간 밖이어도 경정청구일이 기간 안이면 넣는다 → claimOutside 로 따로 보인다)
  //   경정청구일이 빈 경정청구 금액은 빼고 noDate 로 알린다(파일 전체).
  //   impact = 걸러낸 경정청구 + 걸러낸 유보 (+ impact 값만 있고 경정청구·유보가 빈 행은 시행일자 기준 — impactOnly).
  //   진행중 · 진행상태별 · 연도별은 기간과 관계없이 파일 전체(지금 상태 · 누계).
  //   절감 추정은 실제 금액이 하나도 없는 건에만 계산하고 실제 금액과 더하지 않는다.
  var RULING_BY = { product: '완제품', broker: '관세사', hs4: 'HS 4단위', status: '진행상태', year: '결정연도' };
  var RULING_BASIS = '건수와 유보액은 시행일자, 경정청구 금액은 경정청구일 기준';
  function statusKey(s) { return clean(s).replace(/\s/g, ''); }
  function isProgress(r) { return r.status != null && RULING_PROGRESS.indexOf(statusKey(r.status)) >= 0; }
  // 관세율 표기: 「8%」·「FCN 0%」·복수 세율 「0, 8%」. 없으면 null.
  function rateText(r, key) { return r[key] != null ? (r[key + 'Code'] ? r[key + 'Code'] + ' ' : '') + r[key] + '%' : r[key + 'Multi'] ? r[key + 'Multi'] + '%' : null; }
  function hasActual(r) { return r.claim != null || r.reserve != null || r.impact != null; }
  // 한 행의 impact: impact 칸이 있으면 그 값, 없으면 경정청구 + 유보(둘 다 비면 null)
  function rowImpact(r) { return r.impact != null ? r.impact : r.claim == null && r.reserve == null ? null : (r.claim || 0) + (r.reserve || 0); }
  function rowEstimate(r) { return !hasActual(r) && r.goods != null && r.rate != null && r.prevRate != null ? r.goods * (r.prevRate - r.rate) / 100 : null; }
  function impactOnlyRow(r) { return r.impact != null && r.claim == null && r.reserve == null; }
  function addTo(o, k, v) { if (v != null && isFinite(v)) o[k] = (o[k] || 0) + v; }
  function byDateDesc(a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; }
  // sort: 'date'(최근 시행 순, 기본) | 'impact'(impact 큰 순)
  function rulingStats(recs, range, by, sort) {
    by = RULING_BY[by] ? by : 'product';
    recs = recs || [];
    function inR(m) { return !!m && m >= range.from && m <= range.to; }
    var has = {};
    ['claim', 'reserve', 'impact', 'claimDate', 'status', 'note'].forEach(function (k) { has[k] = recs.some(function (r) { return r[k] !== undefined; }); });
    var amounts = has.claim || has.reserve || has.impact;
    var cur = recs.filter(function (r) { return inR(r.month); }), months = monthsBetween(range.from, range.to);
    var claimRows = recs.filter(function (r) { return r.claim != null && inR(r.claimDateMonth); });
    var claimOut = claimRows.filter(function (r) { return !inR(r.month); });
    var noDate = recs.filter(function (r) { return r.claim != null && !r.claimDateMonth; });
    var impactOnly = cur.filter(impactOnlyRow);
    var mismatch = recs.filter(function (r) { return r.impact != null && (r.claim != null || r.reserve != null) && Math.abs(r.impact - (r.claim || 0) - (r.reserve || 0)) > 0.5; });
    var claim = has.claim ? sum(claimRows, 'claim') || 0 : null;
    var reserve = has.reserve ? sum(cur, 'reserve') || 0 : null;
    var impactOnlySum = sum(impactOnly, 'impact');
    var impact = amounts ? (claim || 0) + (reserve || 0) + (impactOnlySum || 0) : null;

    var zero = cur.filter(function (r) { return r.rate === 0; }).length;
    var withPrev = cur.filter(function (r) { return r.rate != null && r.prevRate != null; });
    var lowered = withPrev.filter(function (r) { return r.rate < r.prevRate; }).length;
    var canSave = withPrev.filter(function (r) { return rowEstimate(r) != null; });
    var saving = canSave.length ? canSave.reduce(function (t, r) { return t + rowEstimate(r); }, 0) : null;

    function keyOf(r, b) { var v = b === 'year' ? r.year : r[b]; return v == null || v === '' ? '(미기재)' : String(v); }
    function groupBy(b, order) {
      var g = {};
      function get(r) { var k = keyOf(r, b); return g[k] || (g[k] = { key: k, n: 0, zero: 0, saving: null, claim: null, reserve: null, impact: null }); }
      cur.forEach(function (r) {
        var o = get(r); o.n++; if (r.rate === 0) o.zero++;
        addTo(o, 'saving', rowEstimate(r)); addTo(o, 'reserve', r.reserve); if (impactOnlyRow(r)) addTo(o, '_io', r.impact);
      });
      claimRows.forEach(function (r) { addTo(get(r), 'claim', r.claim); });
      return Object.keys(g).map(function (k) {
        var o = g[k]; o.zeroRate = ratio(o.zero, o.n);
        if (has.claim && o.claim == null) o.claim = 0;
        if (has.reserve && o.reserve == null) o.reserve = 0;
        o.impact = amounts ? (o.claim || 0) + (o.reserve || 0) + (o._io || 0) : null; delete o._io;
        return o;
      }).sort(order === 'impact' ? function (a, b) { return (b.impact || 0) - (a.impact || 0) || b.n - a.n || String(a.key).localeCompare(String(b.key), 'ko'); }
        : b === 'year' ? function (a, c) { return String(a.key).localeCompare(String(c.key)); }
        : function (a, c) { return c.n - a.n || String(a.key).localeCompare(String(c.key), 'ko'); });
    }

    var rates = {};
    cur.forEach(function (r) { var k = rateText(r, 'rate') || '(미기재)'; rates[k] = (rates[k] || 0) + 1; });
    var changes = {};
    cur.forEach(function (r) {
      var a = rateText(r, 'prevRate'), b = rateText(r, 'rate'); if (!a || !b) return;
      var k = a + ' → ' + b, o = changes[k] || (changes[k] = { key: k, from: a, to: b, n: 0, lowered: r.rate != null && r.prevRate != null ? r.rate < r.prevRate : null });
      o.n++;
    });

    // 진행상태별 — 파일 전체(지금 상태)
    var stat = null, progress = null;
    if (has.status) {
      var sg = {};
      recs.forEach(function (r) {
        var k = r.status == null || r.status === '' ? '(미기재)' : r.status, o = sg[k] || (sg[k] = { key: k, n: 0, claim: null, reserve: null, impact: null, progress: isProgress(r) });
        o.n++; addTo(o, 'claim', r.claim); addTo(o, 'reserve', r.reserve); addTo(o, 'impact', rowImpact(r));
      });
      stat = Object.keys(sg).map(function (k) { return sg[k]; }).sort(function (a, b) { return (b.progress ? 1 : 0) - (a.progress ? 1 : 0) || b.n - a.n || String(a.key).localeCompare(String(b.key), 'ko'); });
      progress = recs.filter(isProgress).length;
    }
    // 연도별 — 파일 전체. 경정청구는 경정청구일 연도, 유보(와 impact 값만 있는 행)는 시행일자 연도.
    var yearly = [];
    if (amounts) {
      var ys = {};
      var Y = function (y) { return ys[y] || (ys[y] = { year: y, claim: null, reserve: null, other: null }); };
      recs.forEach(function (r) {
        if (r.claim != null && r.claimDateYear) addTo(Y(r.claimDateYear), 'claim', r.claim);
        if (r.reserve != null) addTo(Y(r.year), 'reserve', r.reserve);
        if (impactOnlyRow(r)) addTo(Y(r.year), 'other', r.impact);
      });
      var yk = Object.keys(ys).map(Number).sort(function (a, b) { return a - b; }), cum = 0;
      for (var y = yk[0]; yk.length && y <= yk[yk.length - 1]; y++) {
        var o = ys[y] || { year: y, claim: null, reserve: null, other: null };
        o.total = o.claim == null && o.reserve == null && o.other == null ? null : (o.claim || 0) + (o.reserve || 0) + (o.other || 0);
        cum += o.total || 0; o.cum = cum; yearly.push(o);
      }
    }

    var list = cur.concat(claimOut).map(function (r) {
      return Object.assign({}, r, { outside: !inR(r.month), impactRow: rowImpact(r), estimate: rowEstimate(r), rateText: rateText(r, 'rate'), prevRateText: rateText(r, 'prevRate') });
    });
    list.sort(sort === 'impact' ? function (a, b) {
      var x = a.impactRow == null ? -Infinity : a.impactRow, z = b.impactRow == null ? -Infinity : b.impactRow;
      return z - x || byDateDesc(a, b);
    } : byDateDesc);
    var latest = cur.slice().sort(byDateDesc)[0] || null;
    return {
      range: range, months: months, by: by, byLabel: RULING_BY[by], sort: sort === 'impact' ? 'impact' : 'date', basis: RULING_BASIS, has: has, amounts: amounts,
      n: cur.length, zero: zero, zeroRate: ratio(zero, cur.length), multiRate: cur.filter(function (r) { return r.rateMulti; }).length,
      withPrev: withPrev.length, lowered: lowered, saving: saving, savingN: canSave.length, actualN: cur.filter(hasActual).length,
      claim: claim, reserve: reserve, impact: impact, claimN: claimRows.length,
      claimOutside: has.claim ? sum(claimOut, 'claim') || 0 : null, claimOutsideN: claimOut.length,
      noDate: has.claim ? sum(noDate, 'claim') || 0 : null, noDateN: noDate.length,
      impactOnly: impactOnlySum, impactOnlyN: impactOnly.length, mismatchN: mismatch.length,
      progress: progress, statuses: stat, yearly: yearly,
      products: valuesOf(cur, 'product').length, brokers: valuesOf(cur, 'broker').length,
      latest: latest, groups: groupBy(by), byProduct: amounts ? groupBy('product', 'impact') : [], monthly: byMonth(cur, months, []),
      rates: Object.keys(rates).map(function (k) { return { key: k, n: rates[k] }; }).sort(function (a, b) { return b.n - a.n; }),
      rateChanges: Object.keys(changes).map(function (k) { return changes[k]; }).sort(function (a, b) { return b.n - a.n || a.key.localeCompare(b.key); }),
      list: list
    };
  }
  function topN(groups, n) {
    if (groups.length <= n) return { rows: groups, rest: null };
    var rest = groups.slice(n), keys = Object.keys(rest[0]).filter(function (k) { return k !== 'key' && typeof rest[0][k] !== 'object'; });
    var o = { key: '그 밖 ' + rest.length + '개', n: 0 };
    ['n', 'goods', 'duty', 'amount', 'prev', 'ftaGoods', 'saving', 'decl', 'err', 'score'].forEach(function (k) {
      if (keys.indexOf(k) < 0) return;
      var t = null; rest.forEach(function (r) { if (r[k] != null) t = (t || 0) + r[k]; }); o[k] = t;
    });
    if ('burden' in rest[0]) o.burden = ratio(o.duty, o.goods);
    if ('util' in rest[0]) o.util = ratio(o.ftaGoods, o.goods);
    if ('rate' in rest[0] && 'prev' in rest[0]) { var c = change(o.amount, o.prev); o.diff = c.diff; o.rate = c.rate; }
    else if ('rate' in rest[0]) o.rate = ratio(o.err, o.decl);
    return { rows: groups.slice(0, n), rest: o };
  }

  /* ---------- 표기 ---------- */
  function fmtNum(v, dp) {
    if (v == null || !isFinite(v)) return '—';
    var s = Math.abs(v).toFixed(dp || 0).split('.');
    s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (v < 0 ? '-' : '') + s.join('.');
  }
  function fmtPct(v, dp) { return v == null || !isFinite(v) ? '—' : fmtNum(v * 100, dp == null ? 1 : dp) + '%'; }
  function fmtSigned(v, dp) { return v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : '') + fmtNum(v, dp); }
  function fmtSignedPct(v) { return v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : '') + fmtPct(v); }
  // 원 단위일 때만 억·만으로 줄여 쓴다(다른 단위면 그대로).
  function fmtShort(v, unit) {
    if (v == null || !isFinite(v)) return '—';
    if (unit && unit !== '원') return fmtNum(v) + ' ' + unit;
    var a = Math.abs(v), sg = v < 0 ? '-' : '';
    if (a >= 1e8) return sg + fmtNum(a / 1e8, a >= 1e10 ? 0 : 1) + '억원';
    if (a >= 1e4) return sg + fmtNum(a / 1e4, 0) + '만원';
    return fmtNum(v) + '원';
  }
  function monthLabel(m) { return m ? m.slice(0, 4) + '.' + m.slice(5, 7) : ''; }

  /* ---------- 엑셀 표(탭별 집계 시트) ---------- */
  // ctx = { range, filter:{hq,country}, unit, data:{kind:{file, uploadedAt, period, records, map, skipped}} }
  // → [{ name, aoa }]. 화면은 이 표를 그대로 SheetJS 로 쓴다.
  function exportBook(ctx) {
    var out = [], d = ctx.data || {}, range = ctx.range, unit = ctx.unit || '원';
    var info = [['수출입통관 업무 대시보드 — 집계 내보내기'], ['조회 기간', monthLabel(range.from) + ' ~ ' + monthLabel(range.to)],
      ['전년 동기', monthLabel(prevRange(range).from) + ' ~ ' + monthLabel(prevRange(range).to)],
      ['본부 조건', (ctx.filter && ctx.filter.hq) || '전체'], ['국가 조건', (ctx.filter && ctx.filter.country) || '전체'], ['금액 단위', unit], [],
      ['데이터', '파일', '자료 기준일(올린 날)', '데이터 기간', '읽은 줄', '건너뛴 줄', '제외 GN', '합계 행']];
    KINDS.forEach(function (k) {
      var x = d[k]; if (!x) return;
      function pl(p) { return p ? monthLabel(p.from) + ' ~ ' + monthLabel(p.to) : ''; }
      // (v1.5.0) 여러 파일이면 파일마다 한 줄 + 종류 합계 줄
      if (x.files && x.files.length) {
        x.files.forEach(function (fl) { info.push([DATASETS[k].label, fl.file || '', fl.uploadedAt || '', pl(fl.period), fl.n, fl.skipped].concat(k === 'export' ? [fl.excluded || 0] : k === 'import' ? [fl.excluded || 0, fl.totalRows || 0] : [])); });
        if (x.files.length > 1) info.push([DATASETS[k].label + ' 합계', '파일 ' + x.files.length + '개', '', pl(x.period), x.records.length, (x.skipped || []).length]);
        return;
      }
      info.push([DATASETS[k].label, x.file || '', x.uploadedAt || '', pl(x.period), x.records.length, (x.skipped || []).length]);
    });
    info.push([], ['계산식', '관세부담율 = 관세 ÷ 물자대 · FTA 활용률 = 물자대_FTA ÷ 물자대 · 오류 비율 = 오류건수 ÷ 신고건수 · 증감률 = (올해 − 전년 동기) ÷ 전년 동기'],
      ['', '나누는 값이 0 이거나 비면 비워 둡니다. 빈 금액은 0 으로 더하지 않습니다.'],
      ['', '관세환급 건수 = 「건수」 열이 있으면 그 열의 합, 없으면 읽은 행 수(신청 1건 = 1줄, 합계 줄 제외, 환급액이 빈 줄 포함)']);
    var impHas = d.import ? { payment: !!(d.import.map && d.import.map.payment), declNo: !!(d.import.map && d.import.map.declNo), supplier: !!(d.import.map && d.import.map.supplier) } : null;
    if (d.import) info.push(['수입 기준', importBasis(ctx.exportOpts, impHas) + (impHas.declNo ? ' — 같은 신고번호 여러 줄은 1건. 번호를 못 읽은 줄은 건수에서만 빼고 금액은 더합니다. 맨 아래 신고번호가 빈 합계 행은 뺍니다.' : '')]);
    if (d.export) info.push(['수출 기준', exportBasis(ctx.exportOpts) + ' — 같은 신고번호 여러 줄은 1건, 빈칸 · 형식이 다른 신고번호는 건수에서 빼고 금액은 더합니다. Plant 번호표에 없는 값은 「' + HQ_UNCLASSIFIED + '」.'],
      ['', '전월 대비 · 전년 동월 대비는 조회 기간의 마지막 달 기준. ERP 는 마감 뒤에도 신고가 늘어 같은 달을 다시 올리면 숫자가 바뀔 수 있습니다.']);
    if (d.ruling) {
      var rrg = ctx.rulingRange || range;
      info.push(['결정문 조회 기간', monthLabel(rrg.from) + ' ~ ' + monthLabel(rrg.to) + ' — ' + RULING_BASIS],
        ['', '관세절감 impact = 경정청구 금액 + 관세유보금액. 경정청구일이 빈 경정청구 금액은 뺍니다. 절감 추정은 금액이 아직 없는 건에만 참고로 계산하고 실제 금액과 더하지 않습니다.']);
    }
    out.push({ name: '안내', aoa: info });
    function f(rec, k) { return rec && rec[k] != null && isFinite(rec[k]) ? rec[k] : ''; }
    function pct(v) { return v == null ? '' : Math.round(v * 10000) / 100; }
    function filt(k) { return applyFilter(d[k].records, k, ctx.filter).records; }
    ['hq', 'country', 'company', 'hs4'].forEach(function (by) {
      if (d.import && (by !== 'hs4' || !d.import.map || d.import.map.hs)) {
        var s = importStats(filt('import'), range, by);
        out.push({ name: '수입_' + BY[by].replace(/\s/g, ''), aoa: [[BY[by], '건수', '물자대', '관세', '관세부담율(%)']].concat(s.groups.map(function (g) { return [g.key, g.n, f(g, 'goods'), f(g, 'duty'), pct(g.burden)]; }), [['합계', s.n, f(s, 'goods'), f(s, 'duty'), pct(s.burden)]]) });
      }
      if (d.export && (by !== 'hs4' || !d.export.map || d.export.map.hs)) {
        var e = exportStats(filt('export'), range, by);
        out.push({ name: '수출_' + BY[by].replace(/\s/g, ''), aoa: [[BY[by], '건수', '수출금액', '전년 동기', '증감', '증감률(%)']].concat(e.groups.map(function (g) { return [g.key, g.n, f(g, 'amount'), f(g, 'prev'), f(g, 'diff'), pct(g.rate)]; }), [['합계', e.n, f(e, 'amount'), f(e, 'prev'), f(e, 'diff'), pct(e.rate)]]) });
      }
    });
    if (d.import) {
      // (v1.9.0) 수입 본부 × 월 · 공급지역 상위 10 · 신고 종류
      var ir = importReport(filt('import'), range, ctx.exportOpts, impHas);
      var ic4 = function (c) { return [c.n, f(c, 'goods'), f(c, 'duty'), pct(c.burden)]; };
      out.push({ name: '수입_본부월', aoa: [['본부'].concat([].concat.apply([], ir.months.map(function (m) { var l = monthLabel(m); return [l + ' 건수', l + ' 물자대', l + ' 관세', l + ' 관세부담율(%)']; })), ['기간 건수', '기간 물자대', '기간 관세', '기간 관세부담율(%)'])]
        .concat(ir.pivot.map(function (p) { return [p.hq].concat([].concat.apply([], p.months.map(ic4)), ic4(p.total)); }),
          [['합계'].concat([].concat.apply([], ir.monthly.map(ic4)), ic4(ir.total))]) });
      if (ir.suppliers) out.push({ name: '수입_공급지역상위10', aoa: [['공급지역(Supplier)', '건수', '물자대', '비중(%)']].concat(ir.suppliers.concat(ir.supplierRest ? [ir.supplierRest] : []).map(function (c) { return [c.key, c.n, f(c, 'goods'), pct(c.share)]; }), [['합계', ir.total.n, f(ir.total, 'goods'), ir.total.goods ? 100 : '']]) });
      if (ir.declTypes) out.push({ name: '수입_신고종류', aoa: [['신고 종류', '건수', '물자대', '관세', '관세 집계 제외(참고)']].concat(ir.declTypes.map(function (t) { return [t.label, t.n, f(t, 'goods'), t.dutyExcluded ? '집계 제외' : f(t, 'duty'), t.dutyExcluded ? f(t, 'dutyExcl') : '']; }), [['합계', ir.total.n, f(ir.total, 'goods'), f(ir.total, 'duty'), f(ir.total, 'dutyExcl')]]) });
    }
    if (d.export) {
      // (v1.7.0) 수출 본부 × 월(월말 보고 모양) · 국가 상위 10
      var xr = exportReport(filt('export'), range, ctx.exportOpts);
      out.push({ name: '수출_본부월', aoa: [['본부'].concat([].concat.apply([], xr.months.map(function (m) { return [monthLabel(m) + ' 건수', monthLabel(m) + ' FOB']; })), ['기간 건수', '기간 FOB', '전월 대비 FOB(%) ' + monthLabel(xr.base)])]
        .concat(xr.pivot.map(function (p) { return [p.hq].concat([].concat.apply([], p.months.map(function (c) { return [c.n, f(c, 'amount')]; })), [p.total.n, f(p.total, 'amount'), pct(p.mom.amount.rate)]); }),
          [['합계'].concat([].concat.apply([], xr.monthly.map(function (c) { return [c.n, f(c, 'amount')]; })), [xr.total.n, f(xr.total, 'amount'), pct(xr.mom.amount.rate)])]) });
      out.push({ name: '수출_국가상위10', aoa: [['국가', '건수', 'FOB', '비중(%)']].concat(xr.countries.concat(xr.countryRest ? [xr.countryRest] : []).map(function (c) { return [c.key, c.n, f(c, 'amount'), pct(c.share)]; }), [['합계', xr.total.n, f(xr.total, 'amount'), xr.total.amount ? 100 : '']]) });
    }
    ['import', 'export'].forEach(function (k) {
      if (!d[k]) return;
      ['hq', 'country'].forEach(function (by) {
        var s = ftaStats(filt(k), k, range, by, d[k].map);
        out.push({ name: 'FTA_' + (k === 'import' ? '수입' : '수출') + '_' + BY[by], aoa: [[BY[by], '물자대', '물자대_FTA', 'FTA 활용률(%)', '절감액']].concat(s.groups.map(function (g) { return [g.key, f(g, 'goods'), f(g, 'ftaGoods'), pct(g.util), f(g, 'saving')]; }), [['합계', f(s, 'goods'), f(s, 'ftaGoods'), pct(s.util), f(s, 'saving')]]) });
      });
    });
    if (d.refund) {
      var r = refundStats(filt('refund'), range, d.refund.map), cntHead = '건수(' + r.countLabel + ')';
      out.push({ name: '환급_본부월', aoa: [['본부'].concat(r.months.map(monthLabel), ['합계', cntHead])].concat(r.pivot.map(function (p) { return [p.hq].concat(p.months.map(function (v) { return v == null ? '' : v; }), [f(p, 'total'), f(p, 'count')]); }),
        [['합계'].concat(r.monthly.map(function (m) { return m.amount == null ? '' : m.amount; }), [f(r, 'amount'), f(r, 'count')])]) });
    }
    if (d.errors) {
      var er = errorStats(filt('errors'), range, 'kind');
      out.push({ name: '오류_월', aoa: [['월', '신고건수', '오류건수', '오류 비율(%)', '오류점수']].concat(er.monthly.map(function (m) { return [monthLabel(m.month), f(m, 'decl'), f(m, 'err'), pct(m.rate), f(m, 'score')]; }), [['합계', f(er, 'decl'), f(er, 'err'), pct(er.rate), f(er, 'score')]]) });
      out.push({ name: '오류_구분', aoa: [['구분', '신고건수', '오류건수', '오류 비율(%)', '오류점수']].concat(er.groups.map(function (g) { return [g.key, f(g, 'decl'), f(g, 'err'), pct(g.rate), f(g, 'score')]; })) });
    }
    if (d.ruling) {
      // (v1.6.0) 결정문은 자기 기간(ctx.rulingRange). 금액 열이 있을 때만 금액 칸 · 연도별 · 진행상태 · 세율 인하 시트를 더한다.
      var rr = ctx.rulingRange || range, rl = rulingStats(filt('ruling'), rr, 'product'), am = rl.amounts;
      var amHead = am ? ['경정청구 금액(경정청구일 기준)', '관세유보금액(시행일자 기준)', '관세절감 impact'] : [];
      var amCells = function (o) { return am ? [f(o, 'claim'), f(o, 'reserve'), f(o, 'impact')] : []; };
      ['product', 'broker', 'hs4'].forEach(function (by) {
        var rs = rulingStats(filt('ruling'), rr, by);
        out.push({ name: '결정문_' + RULING_BY[by].replace(/\s/g, ''), aoa: [[RULING_BY[by], '결정 건수', '관세율 0% 건수', '0% 비율(%)', am ? '절감 추정(금액 없는 건)' : '절감 추정'].concat(amHead)].concat(rs.groups.map(function (g) { return [g.key, g.n, g.zero, pct(g.zeroRate), f(g, 'saving')].concat(amCells(g)); }), [['합계', rs.n, rs.zero, pct(rs.zeroRate), f(rs, 'saving')].concat(amCells(rs))]) });
      });
      var ext = am || rl.has.status || rl.has.claimDate || rl.has.note;
      out.push({ name: '결정문_목록', aoa: [['시행일자', '완제품', '품명', '결정세번', '결정문번호', '관세율', '종전세율', '관세사', '연간 수입액', '절감 추정'].concat(ext ? ['경정청구 금액', '관세유보금액', '관세절감 impact', '경정청구일', '진행상태', '비고', '기간 밖 결정문'] : [])].concat(rl.list.map(function (r) {
        var row = [r.date, r.product, r.item, r.hs, r.docNo || '', r.rate == null ? (r.rateMulti || '') : (r.rateCode ? r.rateCode + ' ' : '') + r.rate, r.prevRate == null ? (r.prevRateMulti || '') : r.prevRate, r.broker || '', f(r, 'goods'), r.estimate == null ? '' : r.estimate];
        return ext ? row.concat([f(r, 'claim'), f(r, 'reserve'), f(r, 'impactRow'), r.claimDate || '', r.status || '', r.note || '', r.outside ? 'Y' : '']) : row;
      })) });
      if (am) {
        out.push({ name: '결정문_연도별', aoa: [['연도', '경정청구(경정청구일 연도)', '관세유보(시행일자 연도)', 'impact 값만 있는 건(시행일자 연도)', '합계', '누계']].concat(rl.yearly.map(function (y) { return [y.year, f(y, 'claim'), f(y, 'reserve'), f(y, 'other'), f(y, 'total'), f(y, 'cum')]; })) });
        if (rl.statuses) out.push({ name: '결정문_진행상태', aoa: [['진행상태(파일 전체 · 지금 상태)', '건수', '경정청구 금액', '관세유보금액', '관세절감 impact', '진행중']].concat(rl.statuses.map(function (s) { return [s.key, s.n, f(s, 'claim'), f(s, 'reserve'), f(s, 'impact'), s.progress ? 'Y' : '']; })) });
        out.push({ name: '결정문_세율인하', aoa: [['종전세율 → 결정세율', '건수', '낮아짐']].concat(rl.rateChanges.map(function (c) { return [c.key, c.n, c.lowered == null ? '' : c.lowered ? 'Y' : 'N']; })) });
      }
    }
    return out;
  }

  /* ---------- 자료 목록(⑦ 통관 서식·업무 매뉴얼) ---------- */
  // 파일 자체는 저장하지 않는다. 이름·설명·분류·사내 위치(링크/경로)만 이 브라우저에 둔다.
  var LIB_CATEGORIES = ['사유서', '업무 매뉴얼', '통관 서식', 'FTA', '관세환급', '기타'];
  var LIB_FIELDS = [
    { key: 'name', label: '파일 이름', aliases: ['파일명', '이름', '자료명', '제목', 'name', 'file'] },
    { key: 'category', label: '분류', aliases: ['구분', '종류', 'category'] },
    { key: 'desc', label: '설명', aliases: ['내용', '비고', '메모', 'description'] },
    { key: 'location', label: '사내 위치', aliases: ['위치', '경로', '링크', '주소', '저장위치', 'url', 'path', 'link'] },
    { key: 'owner', label: '담당', aliases: ['담당자', '등록자', '작성자'] }
  ];
  function libLocationKind(loc) {
    var s = clean(loc); if (!s) return 'none';
    if (/^https?:\/\/\S+$/i.test(s)) return 'url';
    if (/^(\\\\|[a-z]:\\|\/|file:)/i.test(s)) return 'path';
    return 'text';
  }
  function libValidate(e, list) {
    var errs = [], name = clean(e && e.name);
    if (!name) errs.push('파일 이름을 적어 주세요.');
    if (name.length > 120) errs.push('파일 이름이 너무 깁니다(120자 이내).');
    if (/^https?:\/\/\S*\s/i.test(clean(e && e.location))) errs.push('링크 주소에 빈칸이 있습니다.');
    var cat = clean(e && e.category) || '기타';
    if (name && (list || []).some(function (x) { return x.id !== (e && e.id) && clean(x.name) === name && x.category === cat; })) errs.push('같은 분류에 같은 이름이 이미 있습니다.');
    return errs;
  }
  function libEntry(e, now, seq) {
    return { id: e.id || ('L' + String(now || '').replace(/\D/g, '').slice(0, 14) + '-' + (seq || 0)), name: clean(e.name), category: clean(e.category) || '기타',
      desc: clean(e.desc), location: clean(e.location), owner: clean(e.owner), added: e.added || String(now || '').slice(0, 10) };
  }
  // → { list, errors } — 틀린 항목이면 list 를 바꾸지 않는다
  function libAdd(list, e, now) {
    list = list || [];
    var errs = libValidate(e, list); if (errs.length) return { list: list, errors: errs };
    var seq = list.length + 1, ent = libEntry(e, now, seq);
    while (!e.id && list.some(function (x) { return x.id === ent.id; })) ent = libEntry(e, now, ++seq);
    return { list: list.concat([ent]), errors: [] };
  }
  function libRemove(list, id) { return (list || []).filter(function (x) { return x.id !== id; }); }
  function libSearch(list, q, cat) {
    var words = clean(q).toLowerCase().split(' ').filter(Boolean);
    return (list || []).filter(function (x) {
      if (cat && x.category !== cat) return false;
      var hay = [x.name, x.desc, x.location, x.category, x.owner].join(' ').toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    });
  }
  function libCounts(list) { var c = {}; (list || []).forEach(function (x) { c[x.category] = (c[x.category] || 0) + 1; }); return c; }
  function libToAoa(list) { return [LIB_FIELDS.map(function (f) { return f.label; }).concat(['등록일'])].concat((list || []).map(function (x) { return [x.name, x.category, x.desc, x.location, x.owner, x.added]; })); }
  // 엑셀에서 되읽기(다른 PC 로 목록 옮기기). 열 이름은 같은 뜻 낱말로 찾는다.
  function libFromRows(rows, list, now) {
    var head = rows && rows.length ? Object.keys(rows[0]) : [], m = {};
    LIB_FIELDS.forEach(function (f) { head.forEach(function (h) { if (!m[f.key] && nameScore(h, f) >= 0.95) m[f.key] = h; }); });
    var added = 0, errors = [];
    list = list || [];
    (rows || []).forEach(function (r, i) {
      var e = {}; LIB_FIELDS.forEach(function (f) { e[f.key] = m[f.key] ? r[m[f.key]] : ''; });
      if (!clean(e.name)) return;
      var res = libAdd(list, e, now);
      if (res.errors.length) errors.push((i + 2) + '행: ' + res.errors.join(' ')); else { list = res.list; added++; }
    });
    return { list: list, added: added, errors: errors, mapped: m };
  }
  function libSample() {
    return [
      { name: '수입 신고 정정 사유서 양식(예시).xlsx', category: '사유서', desc: '수입신고 정정·취하 때 내는 사유서 양식', location: '\\\\fileserver\\통관\\서식\\사유서_예시.xlsx', owner: '통관 담당(예시)' },
      { name: 'FTA 원산지 확인 업무 매뉴얼(예시).pptx', category: 'FTA', desc: '원산지 증명서 확인 순서와 보관 기준', location: 'https://intranet.example.com/customs/fta-manual', owner: 'FTA 담당(예시)' },
      { name: '관세환급 신청 절차(예시).pptx', category: '관세환급', desc: '소요량 계산과 환급 신청 순서', location: '\\\\fileserver\\통관\\매뉴얼\\환급_예시.pptx', owner: '환급 담당(예시)' }
    ];
  }

  /* ---------- 예제 — 가짜 ERP·환급·오류 엑셀 4종(실제 사내 데이터가 아닙니다) ---------- */
  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  var S_HQ = ['건설기계본부(가상)', '엔진본부(가상)', '산업차량본부(가상)', '부품사업본부(가상)'];
  var S_IMP_CO = [['가람정밀(가상)', '중국'], ['한빛유압(가상)', '일본'], ['새솔산업(가상)', '독일'], ['누리베어링(가상)', '일본'], ['미르전장(가상)', '베트남'], ['다온주물(가상)', '인도'], ['솔빛고무(가상)', '중국'], ['라온기어(가상)', '이탈리아']];
  var S_EXP_CO = [['가상건설상사(미국)', '미국'], ['가상중장비(브라질)', '브라질'], ['가상기계무역(인니)', '인도네시아'], ['가상엔지니어링(호주)', '호주'], ['가상머신(독일)', '독일'], ['가상트레이딩(사우디)', '사우디아라비아']];
  var S_HS_IMP = ['8431.49-9090', '8482.10-0000', '8413.60-9000', '4009.42-0000', '8483.40-1000', '7325.99-0000', '8544.42-9000'];
  var S_HS_EXP = ['8429.52-1000', '8408.20-9000', '8427.20-1000', '8431.49-9090'];
  var S_DUTY = { '8431': 0.08, '8482': 0.08, '8413': 0.05, '4009': 0.08, '8483': 0.08, '7325': 0.03, '8544': 0.08 };   // 가짜 값 — 예제 관세액을 만드는 데만 씀
  var FTA_IMP = { '독일': 1, '이탈리아': 1, '베트남': 1, '인도': 1, '중국': 1 };
  var FTA_EXP = { '미국': 1, '호주': 1, '독일': 1, '인도네시아': 1 };
  function sampleMonths() { return monthsBetween('2024-01', '2025-10'); }
  function sampleFiles() {
    var R = rng(20261103), months = sampleMonths(), r100 = function (v) { return Math.round(v / 100) * 100; };
    var imp = [['수리일자', '사업본부', '원산지국', '거래처명', 'HS부호', '물자대(원)', '관세액', 'FTA물자대', 'FTA절감액']];
    months.forEach(function (m, mi) {
      for (var i = 0; i < 10; i++) {
        var co = S_IMP_CO[Math.floor(R() * S_IMP_CO.length)], hs = S_HS_IMP[Math.floor(R() * S_HS_IMP.length)];
        var goods = r100((40 + R() * 260) * 1e6 * (1 + mi * 0.01)), rate = S_DUTY[hs.slice(0, 4)];
        var fta = FTA_IMP[co[1]] && R() < 0.7 ? goods : 0;
        var day = 1 + Math.floor(R() * 28), date = m + '-' + pad2(day);
        imp.push([i === 3 ? date.replace(/-/g, '.') : date, S_HQ[Math.floor(R() * S_HQ.length)], co[1], co[0], hs, goods,
          i === 7 && mi === 5 ? '' : Math.round((goods - fta) * rate), fta || '', fta ? Math.round(fta * rate) : '']);
      }
    });
    imp.push(['합계', '', '', '', '', '', '', '', '']);
    var exp = [['수출신고일', '본부', '목적국', '거래처', 'HS CODE', '수출금액', '물자대_FTA', '절감액']];
    months.forEach(function (m, mi) {
      var n = mi >= 12 ? 9 : 8;
      for (var i = 0; i < n; i++) {
        var co = S_EXP_CO[Math.floor(R() * S_EXP_CO.length)];
        if (mi < 12 && co[1] === '사우디아라비아') co = S_EXP_CO[Math.floor(R() * 5)];          // 사우디 거래는 2025년에 새로 생김
        var amt = r100((300 + R() * 900) * 1e6), fta = FTA_EXP[co[1]] && R() < 0.8 ? amt : 0;
        exp.push([m + '-' + pad2(1 + Math.floor(R() * 28)), S_HQ[Math.floor(R() * 3)], co[1], co[0], S_HS_EXP[Math.floor(R() * S_HS_EXP.length)], amt, fta || '', fta ? Math.round(fta * 0.05) : '']);
      }
    });
    var ref = [['환급년월', '본부', '환급금액', '환급건수']];
    months.forEach(function (m) { S_HQ.forEach(function (h, hi) { ref.push([m, h, r100((20 + R() * 80) * 1e6 / (hi + 1)), 5 + Math.floor(R() * 30)]); }); });
    var err = [['년월', '수출입구분', '신고건수', '오류건수', '오류점수']];
    months.forEach(function (m) {
      ['수입', '수출'].forEach(function (k) {
        var d = k === '수입' ? 380 + Math.floor(R() * 120) : 210 + Math.floor(R() * 80), e = Math.floor(R() * 9);
        err.push([m.replace('-', '년 ') + '월', k, d, e, e * (2 + Math.floor(R() * 3))]);
      });
    });
    // (v1.2) 결정문 현황 — 가짜 부품 24건. 종전세율·연간 수입액 열은 예제에만 있다(실제 관리 파일에는 없을 수 있다 → 절감 추정은 「—」).
    var rul = [['연번', '완제품', '품명', '결정세번', '품목분류사전심사결정문번호', '시행일자', '관세율', '관세사', '종전세율', '연간 수입액(원)']];
    var R_ITEMS = ['BLOCK ASSY(가상)', 'WIPER ARM(가상)', 'BELT,SEAT(가상)', 'HORN(가상)', 'DRUM UPPER(가상)', 'PIPE(가상)', 'SPLIT FLANGE(가상)', 'PARKING BRAKE(가상)', 'PEDAL ASSY(가상)', 'PIN(가상)', 'BRACKET(가상)', 'COVER(가상)'];
    var R_HS = [['8431.49-9000', '0'], ['8479.89-9099', '8'], ['8431.43-0000', '0'], ['8512.30-0000', '8'], ['7304.31-0000', '0'], ['7326.90-9000', '8'], ['9401.99-1000', 'FCN0'], ['8481.20-1000', '8']];
    var R_PROD = ['EXCAVATOR', 'EXCAVATOR', 'Wheel Loader', '천공기'], R_BROKER = ['가상관세법인 A', '가상관세법인 B'];
    for (var ri = 0; ri < 24; ri++) {
      var mi2 = 2 + Math.floor(R() * (months.length - 2)), hsr = R_HS[Math.floor(R() * R_HS.length)];
      rul.push([ri + 1, R_PROD[Math.floor(R() * R_PROD.length)], R_ITEMS[ri % R_ITEMS.length], hsr[0], '품목분류' + (1 + Math.floor(R() * 4)) + '과-' + (1000 + Math.floor(R() * 4000)) + '(가상)',
        months[mi2] + '-' + pad2(1 + Math.floor(R() * 28)), hsr[1], R_BROKER[Math.floor(R() * 2)], 8, r100((20 + R() * 300) * 1e6)]);
    }
    return [
      { name: '예제_수입통관실적_ERP.xlsx', kind: 'import', aoa: imp },
      { name: '예제_수출통관실적_ERP.xlsx', kind: 'export', aoa: exp },
      { name: '예제_관세환급실적.xlsx', kind: 'refund', aoa: ref },
      { name: '예제_수출입오류점수.xlsx', kind: 'errors', aoa: err },
      { name: '예제_품목분류결정문현황.xlsx', kind: 'ruling', aoa: rul }
    ];
  }
  // 관세환급 신청 현황(환급프로그램에서 내려받는 모양) — 가짜 30줄 + 합계 줄. 머리글은 실제 파일과 같은 19열.
  // 본부 열 대신 「제품그룹」 번호가 있고, 번호표에 없는 새 번호(B999) 1줄을 일부러 넣었다. 예제 5종(sampleFiles)에는 넣지 않는다.
  // (v1.4.6) n 줄로 만들 수 있다(기본 30 = v1.4.5 와 똑같은 내용). 60줄이 넘으면 한 달에 7줄씩 2025년 안에 둔다.
  function sampleRefundApply(n) {
    n = n || 30;
    var R = rng(20261116), r100 = function (v) { return Math.round(v / 100) * 100; }, perMonth = n <= 60 ? 5 : Math.ceil(n / 11);
    var head = ['제출번호', '접수번호', '접수일자', '세번부호', '결정일자', '품 명', '수출물량', '단위', '수출금액', '환급액', '금액대비(%)', '환급단가', '수출월', '신청업체', '제품그룹', '제조업체', '접수세관', '접수년도', '수출형태'];
    var groups = ['B110', 'B111', 'B112', 'B130', 'B161', 'B163'], items = [['BUCKET(가상)', '8431.41-0000'], ['ENGINE ASSY(가상)', '8408.20-9000'], ['PIN(가상)', '8431.49-9090'], ['HOSE(가상)', '4009.42-0000']];
    var aoa = [head], total = 0;
    for (var i = 0; i < n; i++) {
      var m = 1 + Math.floor(i / perMonth), d = 1 + Math.floor(R() * 20), it = items[Math.floor(R() * items.length)];
      var qty = 10 + Math.floor(R() * 90), amt = r100((50 + R() * 450) * 1e6), ref = r100(amt * (0.005 + R() * 0.02));
      var grp = i === 17 ? 'B999' : groups[Math.floor(R() * groups.length)];
      total += ref;
      aoa.push(['S2025-' + pad2(m) + pad2(i + 1), '0201-25-' + (100000 + i * 37), '2025-' + pad2(m) + '-' + pad2(d), it[1], '2025-' + pad2(m) + '-' + pad2(d + 7), it[0], qty, 'EA', amt,
        i % 4 === 0 ? ref.toLocaleString('en-US') : ref, Math.round(ref / amt * 10000) / 100, Math.round(ref / qty), m === 1 ? '2024-12' : '2025-' + pad2(m - 1),
        '가상중공업(가상)', grp, ['가상정밀(가상)', '가상기공(가상)'][i % 2], '가상세관', 2025, i % 3 ? '직수출' : '로컬수출']);
    }
    aoa.push(['합계', '', '', '', '', '', '', '', '', total, '', '', '', '', '', '', '', '', '']);
    return { name: n === 30 ? '예제_관세환급신청현황.xlsx' : '예제_관세환급신청현황_' + n + '행(가상).xlsx', kind: 'refund', aoa: aoa, total: total };
  }
  // (v1.5.0) 관세환급 신청 현황 두 달치 — 2025.01 은 21열(「환급구분」을 세 번째에, 「비고」를 맨 끝에 더함) 12줄, 2025.02 는 19열 10줄. 둘 다 합계 줄.
  // 머리글이 다른 파일을 따로 · 함께 올려도 합쳐지는지 보는 시험용. 가짜 데이터이고 예제 5종에는 넣지 않는다.
  function sampleRefundMonths() {
    var R = rng(20261117), r100 = function (v) { return Math.round(v / 100) * 100; };
    var head19 = ['제출번호', '접수번호', '접수일자', '세번부호', '결정일자', '품 명', '수출물량', '단위', '수출금액', '환급액', '금액대비(%)', '환급단가', '수출월', '신청업체', '제품그룹', '제조업체', '접수세관', '접수년도', '수출형태'];
    var groups = ['B110', 'B111', 'B112', 'B130', 'B161', 'B163'], items = [['BUCKET(가상)', '8431.41-0000'], ['ENGINE ASSY(가상)', '8408.20-9000'], ['PIN(가상)', '8431.49-9090']];
    function make(m, n, wide) {
      var head = wide ? head19.slice(0, 2).concat(['환급구분'], head19.slice(2), ['비고']) : head19.slice(), aoa = [head], total = 0;
      for (var i = 0; i < n; i++) {
        var d = 1 + Math.floor(R() * 20), it = items[Math.floor(R() * items.length)], qty = 10 + Math.floor(R() * 90);
        var amt = r100((50 + R() * 450) * 1e6), ref = r100(amt * (0.005 + R() * 0.02)), grp = groups[Math.floor(R() * groups.length)];
        total += ref;
        var row = ['S2025-' + pad2(m) + pad2(i + 1), '0201-25-' + (200000 + m * 1000 + i), '2025-' + pad2(m) + '-' + pad2(d), it[1], '2025-' + pad2(m) + '-' + pad2(d + 7), it[0], qty, 'EA', amt,
          ref, Math.round(ref / amt * 10000) / 100, Math.round(ref / qty), '2025-' + pad2(m), '가상중공업(가상)', grp, '가상정밀(가상)', '가상세관', 2025, i % 3 ? '직수출' : '로컬수출'];
        if (wide) { row.splice(2, 0, i % 2 ? '개별환급' : '간이정액'); row.push(i === 0 ? '시험용(가상)' : ''); }
        aoa.push(row);
      }
      var tot = head.map(function (h) { return h === '환급액' ? total : ''; }); tot[0] = '합계'; aoa.push(tot);
      return { name: '예제_관세환급신청현황_2025-' + pad2(m) + '(가상).xlsx', kind: 'refund', aoa: aoa, total: total, rows: n, cols: head.length };
    }
    return [make(1, 12, true), make(2, 10, false)];
  }
  // (v1.6.0) 결정문 현황 + 고정비 절감 금액 열 — 가짜 데이터. 예제 5종(sampleFiles)에는 넣지 않는다(금액 열 없는 파일도 계속 시험).
  var RULING_AMT_HEAD = ['연번', '완제품', '품명', '결정세번', '품목분류사전심사결정문번호', '시행일자', '관세율', '관세사', '종전세율', '연간 수입액', '경정청구 금액', '관세유보금액', '관세절감 impact', '경정청구일', '진행상태', '비고'];
  // 확인용 2건: 가) 2025-10 결정 · 2026-02 경정청구 300만 · 유보 200만 / 나) 2026-03 결정 · 경정청구 없음 · 유보 100만
  function sampleRulingCheck() {
    return { name: '예제_결정문금액_확인2건(가상).xlsx', kind: 'ruling', aoa: [RULING_AMT_HEAD,
      ['가', 'EXCAVATOR', 'PIN(가상)', '8431.49-9000', '품목분류4과-1001(가상)', '2025-10-15', '0', '가상관세법인 A', '8', 50000000, 3000000, 2000000, 5000000, '2026-02-10', '환급완료', '확인 가(가상)'],
      ['나', 'Wheel Loader', 'HORN(가상)', '8512.30-0000', '품목분류3과-1002(가상)', '2026-03-05', '0', '가상관세법인 B', '8', 12500000, '', 1000000, 1000000, '', '경정청구중', '확인 나(가상)']] };
  }
  // 여러 해 · 여러 상태 14건. 2015년 결정문 · 복수 세율(0, 8) · 경정청구일이 빈 경정청구 금액 1건 · 금액이 아직 없는 건(추정 대상)을 일부러 넣었다.
  function sampleRulingAmounts() {
    var rows = [
      [1, 'EXCAVATOR', 'BLOCK ASSY(가상)', '8431.49-9000', '품목분류4과-2001(가상)', '2015-06-12', '0', '가상관세법인 A', '8', 120000000, 9600000, '', 9600000, '2026-01-20', '환급완료', '2015년 결정 → 2026년 경정청구(가상)'],
      [2, 'EXCAVATOR', 'WIPER ARM(가상)', '8479.89-9099', '품목분류2과-2002(가상)', '2024-03-04', '0', '가상관세법인 B', '8', 40000000, 3200000, '', 3200000, '2024-09-10', '환급완료', ''],
      [3, 'Wheel Loader', 'BELT,SEAT(가상)', '8431.43-0000', '품목분류4과-2003(가상)', '2024-11-18', '0', '가상관세법인 A', '6.5', 30000000, 1950000, 1500000, 3450000, '2025-04-02', '환급완료', ''],
      [4, '천공기', 'HORN(가상)', '8512.30-0000', '품목분류3과-2004(가상)', '2025-02-07', '0, 8', '가상관세법인 B', '8', 25000000, '', 1000000, 1000000, '', '재심사', '세율 두 개(가상)'],
      [5, 'EXCAVATOR', 'DRUM UPPER(가상)', '7304.31-0000', '품목분류1과-2005(가상)', '2025-08-21', '0', '가상관세법인 A', '8', 80000000, 4800000, 3000000, 7800000, '2026-03-15', '환급완료', ''],
      [6, 'EXCAVATOR', 'PIPE(가상)', '7326.90-9000', '품목분류1과-2006(가상)', '2025-12-03', '0', '가상관세법인 B', '8', 60000000, '', 2500000, 2500000, '', '경정청구중', ''],
      [7, 'Wheel Loader', 'SPLIT FLANGE(가상)', '9401.99-1000', '품목분류2과-2007(가상)', '2026-01-14', 'FCN0', '가상관세법인 A', '8', 45000000, 1800000, 2000000, 3800000, '2026-05-08', '환급완료', ''],
      [8, 'EXCAVATOR', 'PARKING BRAKE(가상)', '8481.20-1000', '품목분류2과-2008(가상)', '2026-02-11', '3', '가상관세법인 B', '8', 70000000, '', 3500000, 3500000, '', '유보', ''],
      [9, '천공기', 'PEDAL ASSY(가상)', '8431.43-0000', '품목분류4과-2009(가상)', '2026-03-25', '0', '가상관세법인 A', '8', 20000000, 1600000, '', 1600000, '', '환급완료', '경정청구일 빈칸(가상)'],
      [10, 'EXCAVATOR', 'PIN(가상)', '8431.49-9000', '품목분류4과-2010(가상)', '2026-04-09', '0', '가상관세법인 B', '8', 90000000, '', 4000000, 4000000, '', '심판청구', ''],
      [11, 'Wheel Loader', 'BRACKET(가상)', '8479.89-9099', '품목분류2과-2011(가상)', '2026-05-19', '0', '가상관세법인 A', '8', 35000000, '', 1500000, 1500000, '', '경정청구중', ''],
      [12, 'EXCAVATOR', 'COVER(가상)', '7326.90-9000', '품목분류1과-2012(가상)', '2026-06-02', '0', '가상관세법인 B', '8', 50000000, '', '', '', '', '접수', '금액 아직 없음(가상)'],
      [13, '천공기', 'BLOCK ASSY(가상)', '8431.49-9000', '품목분류4과-2013(가상)', '2026-07-16', '0', '가상관세법인 A', '6.5', 40000000, '', '', '', '', '접수', '금액 아직 없음(가상)'],
      [14, 'EXCAVATOR', 'HORN(가상)', '8512.30-0000', '품목분류3과-2014(가상)', '2026-08-27', '8', '가상관세법인 B', '8', 15000000, '', '', '', '', '종결', '세율 그대로(가상)']
    ];
    return { name: '예제_결정문금액_14건(가상).xlsx', kind: 'ruling', aoa: [RULING_AMT_HEAD].concat(rows) };
  }
  // (v1.7.0) ERP EXPORT 원본 열 이름(Sheet1 · 55열 · Curr 5개 · HS 열 없음) — 가짜 15줄. 실제 머리글 55개 중 모르는 이름은 「ERP 기타 열 NN(가상)」.
  // 일부러 넣은 것: Req.Date(다른 달) · Division · FOB($) · Invoice Amt.(짝지으면 안 되는 열), 같은 신고번호 2줄, 신고번호 빈칸 · 영문 시작 · 13자리,
  // Plant 1111 · 빈칸, 결제방법 GN 2줄(소문자 gn 포함). 손계산은 test/logic.test.js v1.7.0.
  function sampleExportErp() {
    var head = [];
    for (var c = 1; c <= 55; c++) head.push('ERP 기타 열 ' + pad2(c) + '(가상)');
    var known = { 1: 'Invoice No.', 2: 'Certifcate No.', 3: 'Declaration Date', 4: 'Req.Date', 5: 'Plant', 6: 'Division', 7: 'Sold-to Party Name', 8: 'Curr', 9: 'FOB($)', 10: 'FOB(￦)',
      11: 'Invoice Amt.', 12: 'Destination', 13: 'Payment', 14: 'AgentNm', 24: 'Curr', 26: 'Curr', 28: 'Curr', 30: 'Curr' };
    Object.keys(known).forEach(function (k) { head[k - 1] = known[k]; });
    // [신고일, Req.Date, Plant, Division, 업체, FOB(원), 국가, 결제, 신고번호]
    var data = [
      ['2025-10-15', '2025-09-30', 1000, 'CE', '가상건설상사(미국)', 130000000, 'US', 'TT', '12345-25-1000011'],
      ['2026-09-10', '2026-08-28', 1000, 'CE', '가상건설상사(미국)', 200000000, 'US', 'TT', '12345-26-0900011'],
      ['2026-09-20', '2026-08-30', 1130, 'EN', '가상머신(독일)', 100000000, 'DE', 'LC', '12345-26-0900021'],
      ['2026-10-02', '2026-09-25', 1000, 'CE', '가상건설상사(미국)', 300000000, 'US', 'TT', '12345-26-1000011'],
      ['2026-10-02', '2026-09-25', 1000, 'CE', '가상건설상사(미국)', 50000000, 'US', 'TT', '12345-26-1000011'],
      ['2026-10-05', '2026-09-26', 1100, 'CE', '가상중장비(브라질)', 120000000, 'BR', 'LC', '12345-26-1000021'],
      ['2026.10.07', '2026-09-27', 1111, 'CE', '가상기계무역(인니)', 80000000, 'ID', 'TT', '12345261000031'],
      ['2026-10-09', '2026-09-29', 1130, 'EN', '가상머신(독일)', 150000000, 'DE', 'DA', '12345-26-1000041'],
      ['2026-10-12', '2026-09-30', 1130, 'EN', '가상엔지니어링(호주)', 60000000, 'AU', 'TT', ''],
      ['2026-10-15', '2026-10-01', 6000, 'PS', '가상트레이딩(사우디)', 40000000, 'SA', 'TT', '12345-26-1000051'],
      ['2026-10-18', '2026-10-02', 6000, 'PS', '가상건설상사(미국)', 30000000, 'US', 'GN', '12345-26-1000061'],
      ['2026-10-20', '2026-10-03', '', 'PS', '가상엔지니어링(호주)', 20000000, 'AU', 'TT', '12345-26-1000071'],
      ['2026-10-22', '2026-10-05', 1100, 'CE', '가상칠레상사(칠레)', 10000000, 'CL', 'gn', '12345-26-1000101'],
      ['2026-10-25', '2026-10-06', 1000, 'CE', '가상인도상사(인도)', 90000000, 'IN', 'TT', 'A2345-26-1000081'],
      ['2026-10-28', '2026-10-08', 1100, 'CE', '가상중장비(브라질)', 110000000, 'BR', 'TT', '12345-26-100009']
    ];
    var aoa = [head];
    data.forEach(function (d, i) {
      var row = head.map(function () { return ''; });
      row[0] = 'INV-26' + pad2(i + 1) + '(가상)'; row[1] = d[8]; row[2] = d[0]; row[3] = d[1]; row[4] = d[2]; row[5] = d[3]; row[6] = d[4];
      row[7] = 'USD'; row[8] = Math.round(d[5] / 1300); row[9] = d[5]; row[10] = Math.round(d[5] / 1300) + 1; row[11] = d[6]; row[12] = d[7]; row[13] = '가상관세법인 ' + (i % 2 ? 'B' : 'A');
      row[23] = 'KRW'; row[25] = 'USD'; row[27] = 'EUR'; row[29] = 'KRW';
      aoa.push(row);
    });
    return { name: '예제_수출통관실적_ERP원본열(가상).xlsx', kind: 'export', sheet: 'Sheet1', aoa: aoa };
  }
  // (v1.8.0) 한 파일의 시트들 → 읽을 시트 고르기. sheets = [{ name, aoa(머리글 줄부터), offset }] (빈 시트는 이미 뺀 것).
  //   집계표 이름(SUMMARY_SHEET_RE)은 건너뛰고, 나머지를 머리글이 같은 것끼리 묶어 종류 판단이 가장 잘 되는 묶음을 고른다(같으면 줄이 많은 쪽).
  //   묶음에 들지 않은 시트는 「열 구성이 다름」으로 건너뛴다. 모든 시트가 집계표 이름이면 이름 규칙 없이 고른다.
  //   → { use: [시트], skipped: [{ name, why }], detect }
  function pickSheets(sheets, fileName) {
    var list = (sheets || []).filter(function (sh) { return sh && sh.aoa && sh.aoa.length > 1; }), skipped = [];
    var named = list.filter(function (sh) { return !SUMMARY_SHEET_RE.test(sh.name || ''); });
    if (named.length) list.forEach(function (sh) { if (named.indexOf(sh) < 0) skipped.push({ name: sh.name, why: '집계표' }); });
    else named = list;
    var groups = {}, order = [];
    named.forEach(function (sh) {
      var sig = uniqueHeaders(sh.aoa[0]).map(normKey).join('|');
      if (!groups[sig]) { groups[sig] = []; order.push(sig); }
      groups[sig].push(sh);
    });
    var best = null;
    order.forEach(function (sig) {
      var g = groups[sig], d = detectKind(g[0].aoa[0].map(String), (fileName || '') + ' ' + g[0].name), rows = g.reduce(function (t, sh) { return t + sh.aoa.length - 1; }, 0);
      var c = { sheets: g, d: d, rows: rows };
      if (!best || (!!c.d.kind) - (!!best.d.kind) > 0 || ((!!c.d.kind) === (!!best.d.kind) && (c.d.ratio > best.d.ratio || (c.d.ratio === best.d.ratio && c.rows > best.rows)))) best = c;
    });
    if (!best) return { use: [], skipped: skipped, detect: { kind: null, ratio: 0, reason: '' } };
    named.forEach(function (sh) { if (best.sheets.indexOf(sh) < 0) skipped.push({ name: sh.name, why: '열 구성이 다름' }); });
    var idx = function (nm) { return (sheets || []).map(function (sh) { return sh.name; }).indexOf(nm); };
    skipped.sort(function (a, b) { return idx(a.name) - idx(b.name); });
    return { use: best.sheets, skipped: skipped, detect: best.d };
  }
  // (v1.8.0) 월별 RAW 시트 파일(가짜) — 종합(집계표) · RAW1~RAW3(같은 55열 + Monetary Transaction) · 3월 소계(집계표) · Memo(열이 다름).
  // GN 2줄, 무환구분 불일치 2줄(N 인데 TT · GN 인데 Y), 같은 신고번호 2줄, Plant 빈칸 1줄. 손계산은 test/logic.test.js v1.8.0.
  function sampleExportRaw() {
    var head = sampleExportErp().aoa[0].slice();
    head[14] = 'Monetary Transaction';
    function sheet(rows) {
      return [head].concat(rows.map(function (d, i) {
        var row = head.map(function () { return ''; });
        row[0] = 'INV-' + d[0].slice(5, 7) + pad2(i + 1) + '(가상)'; row[1] = d[7]; row[2] = d[0]; row[3] = d[0].slice(0, 8) + '01'; row[4] = d[1]; row[5] = 'CE'; row[6] = d[2];
        row[7] = 'USD'; row[8] = Math.round(d[3] / 1300); row[9] = d[3]; row[10] = Math.round(d[3] / 1300); row[11] = d[4]; row[12] = d[5]; row[13] = '가상관세법인 A'; row[14] = d[6];
        row[23] = 'KRW'; row[25] = 'USD'; row[27] = 'EUR'; row[29] = 'KRW';
        return row;
      }));
    }
    // [신고일, Plant, 업체, FOB(원), 국가, Payment, Monetary, 신고번호]
    var raw1 = sheet([
      ['2026-01-05', 1000, '가상건설상사(미국)', 100000000, 'US', 'TT', 'Y', '12345-26-0010101'],
      ['2026-01-10', 1130, '가상머신(독일)', 50000000, 'DE', 'TT', 'Y', '12345-26-0010102'],
      ['2026-01-15', 6000, '가상건설상사(미국)', 5000000, 'US', 'GN', 'N', '12345-26-0010103'],
      ['2026-01-20', 1100, '가상중장비(브라질)', 70000000, 'BR', 'TT', 'N', '12345-26-0010104']]);
    var raw2 = sheet([
      ['2026-02-03', 1111, '가상기계무역(인니)', 80000000, 'ID', 'LC', 'Y', '12345-26-0020201'],
      ['2026-02-07', 1000, '가상건설상사(미국)', 40000000, 'US', 'GN', 'Y', '12345-26-0020202'],
      ['2026-02-25', '', '가상엔지니어링(호주)', 10000000, 'AU', 'TT', 'Y', '12345-26-0020203']]);
    var raw3 = sheet([
      ['2026-03-02', 1000, '가상건설상사(미국)', 120000000, 'US', 'TT', 'Y', '12345-26-0030301'],
      ['2026-03-02', 1000, '가상건설상사(미국)', 30000000, 'US', 'TT', 'Y', '12345-26-0030301'],
      ['2026-03-09', 1130, '가상머신(독일)', 60000000, 'DE', 'DA', ' y ', '12345-26-0030302'],
      ['2026-03-20', 6000, '가상트레이딩(사우디)', 20000000, 'SA', 'TT', 'Y', '12345-26-0030303']]);
    var sub3 = sheet([['2026-03-31', '', '3월 소계(가상)', 230000000, '', '', '', '']]);
    return { name: '예제_수출_RAW시트(가상).xlsx', kind: 'export', sheets: [
      { name: '종합', aoa: [['본부', '1월', '2월', '3월', '합계'], ['건기본부(가상)', 170000000, 80000000, 150000000, 400000000]] },
      { name: 'RAW1', aoa: raw1 }, { name: 'RAW2', aoa: raw2 }, { name: 'RAW3', aoa: raw3 },
      { name: '3월 소계', aoa: sub3 }, { name: 'Memo', aoa: [['메모', '내용'], ['가상', '시험용 메모(가상)']] }] };
  }
  // (v1.8.0) 수입 ERP 처럼 「Payment method」 열이 있는 가짜 수입 실적 — GN 1줄
  function sampleImportGN() {
    return { name: '예제_수입_결제방법GN(가상).xlsx', kind: 'import', aoa: [
      ['수리일자', '사업본부', '원산지국', '거래처명', 'HS부호', '물자대(원)', '관세액', 'Payment method'],
      ['2026-01-07', '건기본부', '중국', '가람정밀(가상)', '8431.49-9090', 30000000, 2400000, 'TT'],
      ['2026-01-12', '엔진본부', '일본', '한빛유압(가상)', '8482.10-0000', 20000000, 1600000, 'LC'],
      ['2026-01-20', '건기본부', '독일', '새솔산업(가상)', '8413.60-9000', 1500000, 0, 'GN'],
      ['2026-02-03', '부품센터', '중국', '솔빛고무(가상)', '4009.42-0000', 10000000, 800000, 'TT']] };
  }
  // (v1.9.0) ERP 수입실적 원본 열 이름(Sheet1 · 70열 · HS 열 없음) — 가짜 10줄 + 맨 아래 합계 행. 모르는 머리글은 「ERP 기타 열 NN(가상)」.
  // 일부러 넣은 것: Carry-in date · Declaration date desired · Sh.Country · Amount · ($)Taxable.Amt · Duty Type · Tot.Tax Sum · Tot.Ratal Amt(짝지으면 안 되는 열),
  // Vendor Name 2개(2번째 열은 다른 이름 — Vendor Code 옆 8번째 열이 업체), Short Descript. 2개, 이름 빈 열 2개,
  // Plant 1131 · 표에 없는 9999, GN 1줄, 같은 신고번호 2줄, 특송 신고번호(2235626B68687M), 끝 B(보세공장), 끝 글자 M · B 아님, 중간의 신고번호 빈 줄.
  // 손계산은 test/logic.test.js v1.9.0.
  function sampleImportErp() {
    var head = [];
    for (var c = 1; c <= 70; c++) head.push('ERP 기타 열 ' + pad2(c) + '(가상)');
    var known = { 1: 'Import declaration number', 2: 'Vendor Name', 3: 'Acceptance date', 4: 'Carry-in date', 5: 'Declaration date desired', 6: 'Plant', 7: 'Vendor Code', 8: 'Vendor Name',
      9: 'Supplier', 10: 'Origin', 11: 'Sh.Country', 12: 'Curr', 13: 'Amount', 14: '($)Taxable.Amt', 15: '(\\)Taxable.Amt', 16: 'Duty Type', 17: 'Tot.Duty Amt', 18: 'Tot.Tax Sum', 19: 'Tot.Ratal Amt',
      20: 'Payment method', 21: 'Customs Broker', 22: 'Short Descript.', 30: 'Short Descript.', 40: '', 41: '' };
    Object.keys(known).forEach(function (k) { head[k - 1] = known[k]; });
    var EXP = '가상특송관세사(가상)';
    // [신고번호, 수리일, Plant, Vendor Code, Vendor Name, Supplier, Origin, 물자대(원), 관세, 결제, 세율구분, 관세사]
    var data = [
      ['12345-26-000101M', '2026-01-08', 1000, 'V100', '가람정밀(가상)', 'CN', 'CN', 100000000, 8000000, 'TT', 'A', '가상관세법인 A'],
      ['12345-26-000102M', '2026-01-15', 1130, 'V200', '한빛유압(가상)', 'JP', 'JP', 50000000, 4000000, 'TT', 'C', '가상관세법인 A'],
      ['12345-26-000102M', '2026-01-15', 1130, 'V200', '한빛유압(가상)', 'JP', 'JP', 20000000, 1600000, 'TT', 'C', '가상관세법인 A'],
      ['2235626B68687M', '2026-01-20', 1131, 'V300', '새솔산업(가상)', 'US', 'US', 3000000, 240000, 'TT', 'A', EXP],
      ['12345-26-000103B', '2026-01-25', 1100, 'V400', '가상완성차부품(가상)', 'KR', 'KR', 200000000, 16000000, 'TT', 'A', '가상관세법인 B'],
      ['12345-26-000104M', '2026-01-28', 6000, 'V500', '솔빛고무(가상)', 'DE', 'DE', 1500000, 0, 'GN', 'A', '가상관세법인 B'],
      ['12345-26-000201M', '2026-02-03', 6000, 'V500', '솔빛고무(가상)', 'DE', 'DE', 10000000, 800000, 'LC', 'FCN1', '가상관세법인 B'],
      ['', '2026-02-10', 1111, 'V100', '가람정밀(가상)', 'CN', 'CN', 30000000, 2400000, 'TT', 'A', '가상관세법인 A'],
      ['12345-26-000202M', '2026-02-17', 9999, 'V600', '가상무역(가상)', 'VN', 'VN', 5000000, 400000, 'TT', 'A', '가상관세법인 A'],
      ['12345-26-000203', '2026-02-20', 1000, 'V100', '가람정밀(가상)', 'CN', 'CN', 8000000, 640000, 'TT', 'A', EXP]
    ];
    var aoa = [head], tg = 0, td = 0;
    data.forEach(function (d, i) {
      var row = head.map(function () { return ''; });
      row[0] = d[0]; row[1] = '가상포워더 ' + (i % 3 + 1) + '(가상)'; row[2] = d[1]; row[3] = d[1].slice(0, 8) + '01'; row[4] = '2025-12-31'; row[5] = d[2]; row[6] = d[3]; row[7] = d[4];
      row[8] = d[5]; row[9] = d[6]; row[10] = 'KR'; row[11] = 'USD'; row[12] = Math.round(d[7] / 1300) + 7; row[13] = Math.round(d[7] / 1300); row[14] = d[7]; row[15] = d[10]; row[16] = d[8];
      row[17] = Math.round(d[8] * 2.1 + d[7] * 0.1); row[18] = d[8] + 1000; row[19] = d[9]; row[20] = d[11]; row[21] = '부품(가상) ' + (i + 1); row[29] = '보조 설명(가상)';
      tg += d[7]; td += d[8];
      aoa.push(row);
    });
    var tot = head.map(function () { return ''; });
    tot[14] = tg; tot[16] = td; tot[12] = Math.round(tg / 1300);
    aoa.push(tot);
    return { name: '예제_수입실적_ERP원본열(가상).xlsx', kind: 'import', sheet: 'Sheet1', aoa: aoa };
  }
  // 표(첫 줄 머리글) → sheet_to_json 과 같은 객체 배열
  function aoaToRows(aoa) {
    var head = uniqueHeaders(aoa[0] || []);
    return aoa.slice(1).map(function (r) { var o = {}; head.forEach(function (h, i) { o[h] = r[i] == null ? '' : r[i]; }); return o; });
  }

  var api = {
    DATASETS: DATASETS, KINDS: KINDS, REFUND_HQ_CODES: REFUND_HQ_CODES, sampleRefundApply: sampleRefundApply, sampleRefundMonths: sampleRefundMonths, BY: BY, LIB_CATEGORIES: LIB_CATEGORIES, LIB_FIELDS: LIB_FIELDS,
    normKey: normKey, nameScore: nameScore, mapColumns: mapColumns, findHeaderRow: findHeaderRow, detectKind: detectKind, hasField: hasField,
    parseNum: parseNum, parseDate: parseDate, hs4: hs4, normalize: normalize,
    fileKey: fileKey, upsertFile: upsertFile, mergeFiles: mergeFiles, periodOverlaps: periodOverlaps, migrateSaved: migrateSaved,
    periodOf: periodOf, unionPeriod: unionPeriod, shiftMonth: shiftMonth, monthsBetween: monthsBetween, defaultRange: defaultRange, prevRange: prevRange,
    applyFilter: applyFilter, valuesOf: valuesOf, sum: sum, ratio: ratio, change: change, group: group, byMonth: byMonth, topN: topN,
    importStats: importStats, importReport: importReport, importBasis: importBasis, DECL_TYPES: DECL_TYPES, PLANT_HQ_ALWAYS: PLANT_HQ_ALWAYS, sampleImportErp: sampleImportErp, exportStats: exportStats, exportReport: exportReport, tradeTotal: tradeTotal, countDecl: countDecl, declNoOf: declNoOf, plantValue: plantValue,
    exportSettings: exportSettings, exportBasis: exportBasis, uniqueHeaders: uniqueHeaders, EXPORT_PLANT_HQ: EXPORT_PLANT_HQ, HQ_UNCLASSIFIED: HQ_UNCLASSIFIED, EXPORT_EXCLUDE_PAYMENT: EXPORT_EXCLUDE_PAYMENT,
    sampleExportErp: sampleExportErp, ftaStats: ftaStats,
    pickSheets: pickSheets, sampleExportRaw: sampleExportRaw, sampleImportGN: sampleImportGN, DASH_BASE_FROM: DASH_BASE_FROM, SUMMARY_SHEET_RE: SUMMARY_SHEET_RE, refundStats: refundStats, refundCountBasis: refundCountBasis, errorStats: errorStats,
    parseRate: parseRate, rulingStats: rulingStats, RULING_BY: RULING_BY, RULING_BASIS: RULING_BASIS, RULING_BASE_FROM: RULING_BASE_FROM, RULING_PROGRESS: RULING_PROGRESS,
    isProgress: isProgress, rowImpact: rowImpact, rulingPeriod: rulingPeriod, rulingMonths: rulingMonths, rulingDefaultRange: rulingDefaultRange,
    sampleRulingCheck: sampleRulingCheck, sampleRulingAmounts: sampleRulingAmounts,
    fmtNum: fmtNum, fmtPct: fmtPct, fmtSigned: fmtSigned, fmtSignedPct: fmtSignedPct, fmtShort: fmtShort, monthLabel: monthLabel,
    exportBook: exportBook,
    libValidate: libValidate, libAdd: libAdd, libRemove: libRemove, libSearch: libSearch, libCounts: libCounts, libToAoa: libToAoa,
    libFromRows: libFromRows, libSample: libSample, libLocationKind: libLocationKind,
    sampleFiles: sampleFiles, aoaToRows: aoaToRows
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Customs = api;
})(this);
