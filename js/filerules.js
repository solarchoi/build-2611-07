/* 수출입통관 업무 대시보드 — 올린 파일 판별 규칙 (v1.10.0)
 *
 * 올린 파일을 「무엇으로 인식하고 어느 월에 넣을지」만 정한다. 집계 계산은 하지 않는다(customs.js · errscore.js).
 *   - 종류: 파일 이름을 대소문자 구분 없이 오류 → FTA → 환급 → 결정문 → 실적 순서로 본다(「수입FTA」에도 「수입」이 있어서 순서가 중요).
 *           어느 것에도 안 걸리면 null — 기존 내용 판별(detectKind)로 넘긴다(이름을 바꾸지 않은 옛 파일도 올라가게).
 *   - 기간: 일곱 형태를 긴 것부터 순서대로 시도한다(「2026-11-01~18」 안에 「2026-11-01」 · 「2026-11」이 들어 있어서).
 *   - 확정본 / 조회용: 월 · 월 범위 · 연 · 한 달을 다 덮는 일자 범위 = 확정본, 일자 · 일부 일자 범위 = 조회용.
 *           환급 · 오류점수 · 결정문은 늘 확정본. 이름에 EXPORT 가 있고 기간이 없으면 조회용(ERP 즉석 다운로드).
 *   - 월 귀속: A 파일 이름 단일 월 → 그 월 / B 범위 · 연 → 행 날짜 / C 기간 없음 → 행 날짜(오류점수는 시트 이름) / D 그것도 없으면 월 미지정.
 *     수입은 수리일자(Acceptance date), 수출은 신고일자(Declaration Date) — 열 위치가 아니라 머리글 이름으로 찾는다(customs.js DATASETS).
 * 브라우저(window.FileRules)와 node(require) 양쪽에서 읽힌다.
 */
(function (root) {
  'use strict';

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function lastDay(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }            // m = 1~12, 윤년 포함
  function ym(y, m) { return y + '-' + pad2(m); }
  function ymd(y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d); }
  function okYear(y) { return y >= 2000 && y <= 2099; }
  function okMonth(m) { return m >= 1 && m <= 12; }
  function okDay(y, m, d) { return okMonth(m) && d >= 1 && d <= lastDay(y, m); }
  function baseName(name) { return String(name == null ? '' : name).replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, ''); }

  /* ---------- [1] 파일 이름 → 종류 ---------- */
  // 오류점수 · 관세환급 · 품목분류 결정문은 담당자가 따로 만드는 자료 — 조회용 판정을 하지 않는다.
  var ALWAYS_CONFIRMED = { errscore: 1, refund: 1, ruling: 1 };
  var LABEL = { errscore: '오류점수', fta: 'FTA', refund: '관세환급', ruling: '품목분류 결정문', perf: '실적' };

  // 「수입」 · 「수출」 중 하나만 있을 때만(「수출입」은 가르지 않는다). EXPORT 는 ERP 파일 이름이라 수출로 보지 않는다.
  function ioOf(u) { if (/수출입|수입수출/.test(u)) return null; var i = /수입/.test(u), x = /수출/.test(u); return i && !x ? '수입' : x && !i ? '수출' : null; }

  // → { group, io, part, label, dataset } 또는 null. dataset = 대시보드 자료 종류(import · export · refund · ruling) — 없으면 null.
  function kindByName(name) {
    var u = baseName(name).toUpperCase(), io = ioOf(u);
    if (/오류/.test(u)) return { group: 'errscore', io: io, part: /현황/.test(u) ? '현황' : /상세/.test(u) ? '상세' : null, label: (io || '') + '오류점수', dataset: null };
    if (/FTA/.test(u)) return { group: 'fta', io: io, part: null, label: (io || '') + ' FTA', dataset: null };
    if (/환급/.test(u)) return { group: 'refund', io: null, part: null, label: '관세환급', dataset: 'refund' };
    if (/결정문/.test(u)) return { group: 'ruling', io: null, part: null, label: '품목분류 결정문', dataset: 'ruling' };
    if (/실적/.test(u)) return { group: 'perf', io: io, part: null, label: (io || '') + '실적', dataset: io === '수입' ? 'import' : io === '수출' ? 'export' : null };
    return null;
  }
  function isExportName(name) { return /EXPORT/.test(baseName(name).toUpperCase()); }

  /* ---------- [2] 파일 이름 → 기간 ---------- */
  // 앞뒤가 숫자(또는 「-숫자」)로 이어지지 않을 때만 — 「2026-11-01」 안의 「2026-11」에 걸리지 않게.
  var B = '(?<![\\d])', E = '(?![\\d]|-\\d)';
  var PATTERNS = [
    { type: 1, re: new RegExp(B + '(\\d{4})-(\\d{2})-(\\d{2})~(\\d{4})-(\\d{2})-(\\d{2})' + E) },
    { type: 2, re: new RegExp(B + '(\\d{4})-(\\d{2})-(\\d{2})~(\\d{2})' + E) },
    { type: 3, re: new RegExp(B + '(\\d{4})-(\\d{2})-(\\d{2})' + E) },
    { type: 4, re: new RegExp(B + '(\\d{4})-(\\d{2})~(\\d{4})-(\\d{2})' + E) },
    { type: 5, re: new RegExp(B + '(\\d{4})-(\\d{2})~(\\d{2})' + E) },
    { type: 6, re: new RegExp(B + '(\\d{4})-(\\d{2})' + E) },
    { type: 7, re: new RegExp(B + '(20\\d{2})' + E) }
  ];
  // → { type(1~7), text, from, to(YYYY-MM-DD), months[YYYY-MM], unit('day'|'month'|'year'), confirmed, single(한 달이면 그 YYYY-MM) } 또는 null
  function periodOfName(name) {
    var s = baseName(name);
    for (var i = 0; i < PATTERNS.length; i++) {
      var p = PATTERNS[i], m = s.match(p.re); if (!m) continue;
      var n = m.slice(1).map(Number), r = build(p.type, n);
      if (r) { r.text = m[0]; return r; }
    }
    return null;
  }
  function build(type, n) {
    var y1, m1, d1, y2, m2, d2;
    if (type === 1) { y1 = n[0]; m1 = n[1]; d1 = n[2]; y2 = n[3]; m2 = n[4]; d2 = n[5]; if (!okYear(y1) || !okYear(y2) || !okDay(y1, m1, d1) || !okDay(y2, m2, d2)) return null; }
    else if (type === 2) { y1 = y2 = n[0]; m1 = m2 = n[1]; d1 = n[2]; d2 = n[3]; if (!okYear(y1) || !okDay(y1, m1, d1) || !okDay(y1, m1, d2)) return null; }
    else if (type === 3) { y1 = y2 = n[0]; m1 = m2 = n[1]; d1 = d2 = n[2]; if (!okYear(y1) || !okDay(y1, m1, d1)) return null; }
    else if (type === 4) { y1 = n[0]; m1 = n[1]; y2 = n[2]; m2 = n[3]; if (!okYear(y1) || !okYear(y2) || !okMonth(m1) || !okMonth(m2)) return null; d1 = 1; d2 = lastDay(y2, m2); }
    else if (type === 5) { y1 = y2 = n[0]; m1 = n[1]; m2 = n[2]; if (!okYear(y1) || !okMonth(m1) || !okMonth(m2)) return null; d1 = 1; d2 = lastDay(y2, m2); }
    else if (type === 6) { y1 = y2 = n[0]; m1 = m2 = n[1]; if (!okYear(y1) || !okMonth(m1)) return null; d1 = 1; d2 = lastDay(y1, m1); }
    else { y1 = y2 = n[0]; m1 = 1; m2 = 12; d1 = 1; d2 = 31; }
    var from = ymd(y1, m1, d1), to = ymd(y2, m2, d2);
    if (from > to) return null;
    // (2) 일자 범위가 그 월 1일 ~ 말일을 다 덮으면 확정본(월)으로 올린다
    var fullMonth = type === 2 && d1 === 1 && d2 === lastDay(y1, m1);
    var confirmed = type >= 4 || fullMonth;
    var months = monthsBetween(ym(y1, m1), ym(y2, m2));
    return { type: type, from: from, to: to, months: months, unit: type === 7 ? 'year' : type >= 4 || fullMonth ? 'month' : 'day', confirmed: confirmed, single: months.length === 1 && confirmed ? months[0] : null, promoted: fullMonth };
  }

  /* ---------- 확정본 / 조회용 · 월 귀속 기준 ---------- */
  // → { mode: 'confirmed' | 'view', why }
  function fileMode(group, period, exportName) {
    if (ALWAYS_CONFIRMED[group]) return { mode: 'confirmed', why: (LABEL[group] || group) + '은(는) 늘 확정본' };
    if (period) return period.confirmed ? { mode: 'confirmed', why: period.promoted ? '파일 이름 일자 범위가 한 달 전체(' + period.text + ')' : '파일 이름 기간 ' + period.text } : { mode: 'view', why: '파일 이름 기간이 일자(' + period.text + ')' };
    if (exportName) return { mode: 'view', why: 'ERP 원본 이름(EXPORT) · 기간 없음 — 즉석 조회' };
    return { mode: 'confirmed', why: '파일 이름에 기간 없음 — 행 날짜로 월을 정함' };
  }
  // → { code: 'A'|'B'|'C', text, forceMonth }  (D 월 미지정은 행마다 — 날짜가 빈 행)
  function monthRule(group, period, io) {
    var col = io === '수출' ? '신고일자(Declaration Date)' : io === '수입' ? '수리일자(Acceptance date)' : '날짜 열';
    if (group === 'errscore') return period && period.single ? { code: 'A', text: '파일 이름 ' + period.single + ' (오류점수는 파일 이름 · 시트 이름만)', forceMonth: period.single } : { code: 'C', text: '시트 이름의 월 (오류점수는 날짜 열을 쓰지 않음)', forceMonth: null };
    // 실적(수입 · 수출)은 파일 전체를 이 월로. 환급 · 결정문은 담당자 자료라 행 날짜를 그대로 두고, 파일 이름 월과 다르면 알리기만 한다.
    if (period && period.single && group === 'perf') return { code: 'A', text: '파일 이름 ' + period.single + ' — 파일 전체를 이 월로', forceMonth: period.single };
    if (period && period.single) return { code: 'A', text: '파일 이름 ' + period.single + ' (행 날짜가 다르면 알림)', forceMonth: null };
    if (period) return { code: 'B', text: '행마다 ' + col + ' (파일 이름 ' + period.text + ')', forceMonth: null };
    return { code: 'C', text: '행마다 ' + col + ' (파일 이름에 기간 없음)', forceMonth: null };
  }
  var DATE_COL = { import: 'Acceptance date', export: 'Declaration Date' };
  var BASIS_TEXT = '수입: 수리일자 기준 / 수출: 신고일자 기준';

  /* ---------- 파일 하나 판별 ---------- */
  // detect = 내용 판별 결과(customs.detectKind → { kind }) — 없으면 null. → 판별 정보(파일 목록 · 저장에 그대로 쓴다)
  var IO_OF_DATASET = { import: '수입', export: '수출' };
  var DATASET_LABEL = { import: '수입 실적', export: '수출 실적', refund: '관세환급', ruling: '품목분류 결정문', errors: '오류 비율 표' };
  function describe(name, detect) {
    var byName = kindByName(name), exp = isExportName(name), period = periodOfName(name), warnings = [];
    var contentKind = detect && detect.kind || null, dataset = null, how = '', io = byName ? byName.io : null, group = byName ? byName.group : null;
    // 기간이 함께 있으면 사람이 일부러 이름을 바꾼 것 — 이름 규칙을 따른다(EXPORT 글자만으로 조회용 · 내용 판별로 떨어뜨리지 않음)
    if (exp && !period && (!byName || byName.group === 'perf' || byName.group === 'fta')) {
      // EXPORT 원본: 종류는 내용으로, 이름의 수입 · 수출은 교차 확인에만
      dataset = contentKind; how = '내용(ERP 원본 이름)';
      var nameIo = ioOf(baseName(name).toUpperCase()), cIo = IO_OF_DATASET[contentKind] || null;
      if (nameIo && cIo && nameIo !== cIo) warnings.push('파일명은 ' + nameIo + '인데 내용은 ' + cIo + '로 보입니다. 확인이 필요합니다.');
      io = cIo || nameIo; group = byName && byName.group === 'fta' ? 'fta' : 'perf';
    } else if (byName && byName.group === 'errscore' && !byName.part) {
      // 「오류」만 있고 현황 · 상세가 없으면 — 대시보드의 오류 비율 표(월별 신고 · 오류건수 · 점수)일 수 있다 → 내용으로
      dataset = contentKind === 'errors' ? 'errors' : null; how = dataset ? '파일 이름 + 내용' : '파일 이름';
    } else if (byName) {
      dataset = byName.dataset; how = '파일 이름';
      if (byName.group === 'perf' && !io) warnings.push('파일 이름에 「수입」 · 「수출」이 없어 내용으로 정했습니다.'), dataset = contentKind, how = '내용';
      var cIo2 = IO_OF_DATASET[contentKind];
      if (byName.group === 'perf' && io && cIo2 && cIo2 !== io) warnings.push('파일명은 ' + io + '인데 내용은 ' + cIo2 + '로 보입니다. 확인이 필요합니다.');
    } else {
      dataset = contentKind; how = '내용'; io = IO_OF_DATASET[contentKind] || null;
      group = contentKind === 'refund' ? 'refund' : contentKind === 'ruling' ? 'ruling' : contentKind === 'errors' ? 'errscore' : contentKind ? 'perf' : null;
    }
    if (group === 'fta') dataset = null;                      // FTA 는 다음 단계 — 실적 합계에 넣지 않는다(물자대 두 번 방지)
    var mode = fileMode(group, period, exp), rule = monthRule(group, period, io);
    if (!group && !dataset) warnings.push('종류를 판별하지 못함');
    // 「기간을 판별하지 못함」은 파일 이름 · 행 날짜(오류점수는 시트 이름) 모두 없을 때 — 읽은 뒤에 화면 쪽에서 붙인다(dataWarnings)
    var label = group === 'fta' ? (io ? io + ' ' : '') + 'FTA' : group === 'errscore' && byName && dataset !== 'errors' ?(io || '') + '오류점수' + (byName.part ? ' ' + byName.part + '목록' : '') : DATASET_LABEL[dataset] || (byName ? byName.label : '알 수 없음');
    return {
      name: String(name || ''), group: group, label: label,
      io: io, part: byName ? byName.part : null, dataset: dataset, how: how, exportName: exp,
      period: period, mode: mode.mode, modeWhy: mode.why, rule: rule.code, ruleText: rule.text, forceMonth: rule.forceMonth,
      dateCol: dataset ? DATE_COL[dataset] || null : null, warnings: warnings
    };
  }

  /* ---------- [6] 기간 겹침 ---------- */
  // files = [{ name, dataset, months: [YYYY-MM] }] — 같은 종류이고 월이 하나라도 겹치는 앞 파일들
  function overlapsWith(file, files) {
    var set = {}; (file.months || []).forEach(function (m) { set[m] = 1; });
    return (files || []).filter(function (f) {
      if (f === file || f.dataset !== file.dataset || !file.dataset) return false;
      return (f.months || []).some(function (m) { return set[m]; });
    });
  }
  function monthsBetween(from, to) {
    var out = [], y = +from.slice(0, 4), m = +from.slice(5, 7);
    while (ym(y, m) <= to && out.length < 600) { out.push(ym(y, m)); m++; if (m > 12) { m = 1; y++; } }
    return out;
  }

  /* ---------- 조회 모드 문구 ---------- */
  function viewBanner(info, data) {
    if (info.period) return '조회 모드 · ' + info.period.text + ' · 저장되지 않습니다';
    if (data && data.from && data.to) return '조회 모드 · ' + data.from + ' ~ ' + data.to + ' (데이터 기준) · ' + Number(data.rows || 0).toLocaleString('en-US') + '행 · 저장되지 않습니다';
    return '조회 모드 · 저장되지 않습니다';
  }
  function keepHint(info) {
    var ex = (info && info.period && info.period.single) || '2026-10';
    var nm = info && info.dataset === 'export' ? '수출실적' : '수입실적';
    return '조회 결과를 보관하려면 ' + ex + '_' + nm + '.xlsx 형식으로 이름을 바꿔 다시 올리거나, [이 결과를 저장] 을 누르세요.';
  }

  var api = {
    kindByName: kindByName, isExportName: isExportName, periodOfName: periodOfName, fileMode: fileMode, monthRule: monthRule,
    describe: describe, overlapsWith: overlapsWith, monthsBetween: monthsBetween, lastDay: lastDay,
    viewBanner: viewBanner, keepHint: keepHint, DATE_COL: DATE_COL, BASIS_TEXT: BASIS_TEXT, ALWAYS_CONFIRMED: ALWAYS_CONFIRMED
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FileRules = api;
})(this);
