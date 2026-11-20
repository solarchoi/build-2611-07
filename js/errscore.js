/* 수출입통관 오류점수 분석 — 엔진 (v1.3)
 *
 * 화면(errors.js)은 판정하지 않는다. 관세청 유니패스 「귀책사유자별 오류현황 및 상세목록」 엑셀(수입·수출, 월별 시트)을 읽고,
 * 신고번호의 관세사부호로 인천·울산을 가르고, 월별·캠퍼스별 요약(건수·오류건수·오류점수·비율)·분기 경계·항목별·신고번호별·
 * AEO 관리대장 「발생사유 및 정정내용」 표·월별 공유 메일 초안·엑셀 표를 전부 여기서 만들고 test/logic.test.js 로 고정한다.
 * 브라우저(window.ErrScore)와 node(require) 양쪽에서 읽힌다.
 *
 * 지키는 것(기획자 메일 2026-11-04 「4. 수출입통관오류점수분석」)
 *   - 인천/울산 구분: 신고번호 앞 5자리(신고대행 관세사부호)가 43908 이면 울산, 아니면 인천. 부호 목록은 바꿀 수 있다(RULE).
 *   - 신고번호 체계: 5자리 관세사부호 + 2자리 신고년도 + 고유번호, 끝 글자 M = 수입(iMport) · X = 수출(eXport).
 *   - 오류건수는 「동일한 신고번호는 1건」 — 정정 줄 수가 아니라 신고번호 수다. 오류점수는 줄의 오류점수 합.
 *   - 신고건수(분모)는 이 엑셀에 없다. 종합 신고건수는 「현황목록」 시트의 총신고건, 인천 건수는 수출입실적분석에서 사람이 넣고,
 *     울산 = 총신고건 − 인천. 넣지 않으면 비율을 비워 둔다(짐작하지 않는다).
 *   - 분기 300점 이상이면 실물서류 제출 대상 — 경계는 바꿀 수 있고(기본 300) 어느 범위(종합·캠퍼스·수입/수출)에 적용되는지는 기획자 확인 사항이라 전부 보인다.
 *   - 회사 데이터는 저장소에 넣지 않는다. 예제는 가짜 신고번호·가짜 수치다.
 */
(function (root) {
  'use strict';

  // (v1.11.0) 지역 표 — 신고인부호(신고번호 앞 5자리). 실제 데이터로 비교해 팀 숫자와 맞은 방식. 설정 화면에서 고친다.
  var RULE = { ulsan: ['43908', '44924', '44788'], incheon: ['22356', '22371', '42158', '15553'] };
  var UNREGION = '미분류';                                 // 화면 이름 「지역 미분류」
  var THRESHOLD = 300;                                   // 분기 오류점수 경계(실물서류 제출)
  var KINDS = ['수입', '수출'];
  var CAMPUSES = ['인천', '울산'];
  var LETTER = { M: '수입', X: '수출', B: '수입' };          // (v1.10.0) B = 보세공장(완성차) — 수입 쪽
  // (v1.10.0) 파일 이름 기간(2026-10_수입오류_현황목록) — 규칙은 filerules.js
  var FR = root.FileRules || (typeof require === 'function' ? require('./filerules.js') : null);

  function clean(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
  function normKey(s) { return String(s == null ? '' : s).replace(/[\s()\[\]·_\-/.]/g, '').toLowerCase(); }
  function toNum(v) { if (typeof v === 'number') return isFinite(v) ? v : null; var s = clean(v).replace(/,/g, ''); if (s === '' || s === '-') return null; var n = Number(s); return isFinite(n) ? n : null; }
  function round(v, d) { var p = Math.pow(10, d == null ? 1 : d); return Math.round(v * p) / p; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }

  /* ---------- 신고번호 ---------- */
  // (v1.10.0) 신고인부호 5자 + 연도 2자 + 일련번호 5~7자(영문 섞일 수 있음 — 특송 관세사 발번 「B17742」) + 구분문자(M · X · B).
  //   숫자로 분해하지 않는다: 비교용 no 는 대문자로 바꾸고 공백 · 하이픈만 지운 원문, raw 는 받은 그대로.
  function parseDeclNo(v) {
    var raw = clean(v), s = raw.toUpperCase().replace(/[\s\-]/g, '');
    var m = s.match(/^(\d{5})(\d{2})([0-9A-Z]{5,7}?)([MXB])?$/);
    if (!m) return null;
    return { no: s, raw: raw, broker: m[1], year: 2000 + Number(m[2]), seq: m[3], kind: m[4] ? LETTER[m[4]] : null, bonded: m[4] === 'B' };
  }
  // (v1.11.0) 지역 = 신고번호 앞 5자리(신고인부호)로만. 표에 없는 부호는 「지역 미분류」(임의로 인천 · 울산에 넣지 않는다).
  function campusOf(declNo, rule) {
    var p = parseDeclNo(declNo); if (!p) return null;
    var r = normRule(rule);
    return r.ulsan.indexOf(p.broker) >= 0 ? '울산' : r.incheon.indexOf(p.broker) >= 0 ? '인천' : UNREGION;
  }
  // 저장된 지역 표 정리 — 예전 형식({ ulsan } 만, 「울산 아니면 인천」)이면 새 기본 표에 예전에 고른 울산 부호를 더한다
  function normRule(rule) {
    var codes = function (a) { return uniq((a || []).map(function (x) { return String(x).replace(/\D/g, ''); }).filter(function (x) { return x.length === 5; })); };
    if (!rule) return { ulsan: RULE.ulsan.slice(), incheon: RULE.incheon.slice() };
    if (!rule.incheon) { var u = uniq(RULE.ulsan.concat(codes(rule.ulsan))); return { ulsan: u, incheon: RULE.incheon.filter(function (x) { return u.indexOf(x) < 0; }) }; }
    var ul = codes(rule.ulsan); return { ulsan: ul, incheon: codes(rule.incheon).filter(function (x) { return ul.indexOf(x) < 0; }) };
  }

  /* ---------- 날짜 ---------- */
  function parseDate(v) {
    if (v instanceof Date) return isNaN(v) ? null : v.getFullYear() + '-' + pad2(v.getMonth() + 1) + '-' + pad2(v.getDate());
    if (typeof v === 'number' && v > 20000 && v < 80000) { var t = new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86400000)); return t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate()); }
    var m = clean(v).match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/); if (!m) { m = clean(v).match(/^(\d{4})(\d{2})(\d{2})/); if (!m) return null; }
    var y = +m[1], mo = +m[2], d = +m[3]; if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
    return y + '-' + pad2(mo) + '-' + pad2(d);
  }
  function monthOfName(name) { var m = clean(name).match(/(\d{1,2})\s*월/); return m ? +m[1] : null; }

  /* ---------- 시트 읽기 ---------- */
  var FIELDS = [
    { key: 'declNo', label: '신고번호', aliases: ['신고번호', '수출신고번호', '수입신고번호', '신고번호(란)'], req: true },
    { key: 'score', label: '오류점수', aliases: ['오류점수', '점수', '감점'], req: true },
    { key: 'score2', label: '변경 후 오류점수', aliases: ['변경후오류점수', '변경 후 오류점수', '변경후점수'] },
    { key: 'fixedAt', label: '정정일자 및 시간', aliases: ['정정일자및시간', '정정일자', '정정일시', '정정일'] },
    { key: 'accept', label: '수리구분', aliases: ['수리구분', '수리전후'] },
    { key: 'fixType', label: '정정구분', aliases: ['정정구분'] },
    { key: 'code', label: '항목코드', aliases: ['항목코드', '코드'] },
    { key: 'item', label: '항목명', aliases: ['항목명', '항목', '정정항목'] },
    { key: 'before', label: '정정전내역', aliases: ['정정전내역', '정정전', '변경전'] },
    { key: 'after', label: '정정후내역', aliases: ['정정후내역', '정정후', '변경후'] },
    { key: 'lane', label: '란번호', aliases: ['란번호', '란'] },
    { key: 'payer', label: '귀책사유자부호', aliases: ['귀책사유자부호', '귀책사유자'] }
  ];
  function mapHeaders(headers) {
    var map = {}, used = {};
    FIELDS.forEach(function (f) {
      var hit = null;
      headers.forEach(function (h, i) { if (hit != null || used[i]) return; var n = normKey(h); if (n && f.aliases.some(function (a) { return normKey(a) === n; })) hit = i; });
      if (hit == null) headers.forEach(function (h, i) { if (hit != null || used[i]) return; var n = normKey(h); if (n && f.aliases.some(function (a) { var k = normKey(a); return k.length >= 3 && n.indexOf(k) >= 0; })) hit = i; });
      if (hit != null) { map[f.key] = hit; used[hit] = 1; }
    });
    var missing = FIELDS.filter(function (f) { return f.req && map[f.key] == null; }).map(function (f) { return f.label; });
    return { map: map, missing: missing };
  }
  function findHeaderRow(aoa, must) {
    for (var i = 0; i < Math.min(aoa.length, 12); i++) {
      var row = (aoa[i] || []).map(normKey);
      if (must.every(function (m) { return row.some(function (c) { return c.indexOf(normKey(m)) >= 0; }); })) return i;
    }
    return -1;
  }
  function classifySheet(name) {
    var n = clean(name);
    if (/상세/.test(n)) return 'detail';
    if (/현황/.test(n)) return 'status';
    if (/요약/.test(n)) return 'summary';
    return null;
  }
  function kindOfText(s) { var t = clean(s); if (/수입|import/i.test(t) && !/수출/.test(t)) return '수입'; if (/수출|export/i.test(t) && !/수입/.test(t)) return '수출'; return null; }

  // 상세목록 시트 → 정규화 줄. month 는 시트 이름에서, 없으면 정정일자에서.
  function readDetail(aoa, opts) {
    opts = opts || {};
    if (!aoa.some(function (r) { return (r || []).some(function (c) { return clean(c) !== ''; }); })) return { rows: [], skipped: 0 };   // 그 달 오류 없음(빈 시트)
    var hi = findHeaderRow(aoa, ['신고번호', '오류점수']);
    if (hi < 0) return { rows: [], skipped: 0, error: '머리글(신고번호 · 오류점수)을 찾지 못했습니다.' };
    // (v1.10.3) 한 시트에 표가 둘 이상(팀이 오른쪽에 같은 머리글로 작업 영역을 붙임) — 가장 왼쪽 표만 읽는다.
    //   머리글 줄에서 「신고번호」 · 「오류점수」 · 「No」가 두 번째로 나오는 열부터는 읽지 않는다(중복 집계 방지).
    var all = aoa[hi].map(clean), cut = all.length;
    ['신고번호', '오류점수', 'No'].forEach(function (k) {
      var at = all.map(function (h, i) { return normKey(h) === normKey(k) ? i : -1; }).filter(function (i) { return i >= 0; });
      if (at.length > 1 && at[1] < cut) cut = at[1];
    });
    var headers = all.slice(0, cut), mh = mapHeaders(headers);
    if (mh.missing.length) return { rows: [], skipped: 0, error: '필요한 열이 없습니다: ' + mh.missing.join(' · ') };
    var rows = [], skipped = 0, totalRows = 0, noMonth = 0, blank = 0, m = mh.map;
    aoa.slice(hi + 1).forEach(function (r0) {
      var r = (r0 || []).slice(0, cut);
      var p = parseDeclNo(r[m.declNo]);
      if (!p) {
        if (!r.some(function (c) { return clean(c) !== ''; })) { blank++; return; }   // 빈 줄(오른쪽 작업 영역에만 값이 있는 줄 포함)
        // (v1.10.0) 신고번호 빈 맨 아래 합계 줄 · (v1.10.3) 팀이 넣은 소계 줄(「인천CAM 33」처럼 점수가 옆 칸에 있어도) — 신고번호가 없고 숫자가 있으면 데이터가 아니다
        if (!clean(r[m.declNo]) && r.some(function (c) { return toNum(c) != null; })) { totalRows++; return; }
        skipped++; return;
      }
      var fixedAt = m.fixedAt != null ? parseDate(r[m.fixedAt]) : null;
      // (v1.10.0) 오류점수는 날짜 열(정정일자)로 월을 정하지 않는다 — 파일 이름, 없으면 시트 이름. 둘 다 없으면 월 미지정(알림)
      var month = opts.month || null;
      if (!month) noMonth++;
      rows.push({
        kind: opts.kind || p.kind || null, month: month, year: opts.year || (fixedAt ? +fixedAt.slice(0, 4) : p.year),
        declNo: p.no, broker: p.broker, campus: campusOf(p.no, opts.rule), lane: m.lane != null ? clean(r[m.lane]) : '',
        fixedAt: fixedAt, fixedRaw: m.fixedAt != null ? clean(r[m.fixedAt]) : '',
        accept: m.accept != null ? clean(r[m.accept]) : '', fixType: m.fixType != null ? clean(r[m.fixType]) : '',
        code: m.code != null ? clean(r[m.code]) : '', item: m.item != null ? clean(r[m.item]) : '',
        score: toNum(r[m.score]) || 0, score2: m.score2 != null ? toNum(r[m.score2]) : null,
        before: m.before != null ? clean(r[m.before]) : '', after: m.after != null ? clean(r[m.after]) : ''
      });
    });
    return { rows: rows, skipped: skipped, totalRows: totalRows, noMonth: noMonth, blank: blank, sheetRows: aoa.length - hi - 1, cutAt: cut < all.length ? cut : null, headers: headers, map: m };
  }
  // 현황목록 시트 → { total(총신고건), score, rate } — 귀책사유자 한 줄
  function readStatus(aoa) {
    var hi = findHeaderRow(aoa, ['총신고건']); if (hi < 0) return null;
    var h = aoa[hi].map(normKey), iT = h.indexOf(normKey('총신고건')), iS = h.findIndex(function (c) { return c.indexOf('오류점수') >= 0; }), iR = h.findIndex(function (c) { return c.indexOf('비율') >= 0; });
    var r = aoa[hi + 1]; if (!r) return null;
    return { total: toNum(r[iT]), score: iS >= 0 ? toNum(r[iS]) : null, rate: iR >= 0 ? toNum(r[iR]) : null };
  }
  // 요약 시트(담당자가 손으로 정리한 표) → hand[월][종합|인천|울산] = { decl, err, score }. 월 머리글 칸부터 건수·오류건수·오류점수·비율 순서다.
  function readHandSummary(aoa) {
    var hi = -1, cols = {};
    for (var i = 0; i < Math.min(aoa.length, 6); i++) {
      var found = {}; (aoa[i] || []).forEach(function (c, j) { var m = clean(c).match(/^(\d{1,2})\s*월$/); if (m) found[+m[1]] = j; });
      if (Object.keys(found).length) { hi = i; cols = found; break; }
    }
    if (hi < 0) return {};
    var hand = {};
    aoa.slice(hi + 1).forEach(function (r) {
      var label = clean((r || [])[0]); if (['종합', '인천', '울산'].indexOf(label) < 0) return;
      Object.keys(cols).forEach(function (m) {
        var c = cols[m], decl = toNum(r[c]), err = toNum(r[c + 1]), score = toNum(r[c + 2]);
        if (decl == null && err == null && score == null) return;
        (hand[m] = hand[m] || {})[label] = { decl: decl, err: err, score: score };
      });
    });
    return hand;
  }
  // 통합문서 한 권: sheets = [{ name, aoa }]. 수입/수출은 요약 제목 → 파일명 → 신고번호 끝 글자 순으로 정한다.
  function readWorkbook(sheets, fileName, rule) {
    var kind = null, notes = [], rows = [], status = {}, skipped = 0, sumYear = null;
    // (v1.10.3) 시트 이름 끝 공백(「귀책사유자별오류현황목록_10월 」) — 처음 한 번 trim 해 모든 비교 · 알림에 같은 이름을 쓴다
    sheets = (sheets || []).map(function (s) { return { name: clean(s.name), aoa: s.aoa || [] }; });
    var sm = sheets.filter(function (s) { return classifySheet(s.name) === 'summary'; })[0];
    if (sm) {
      var first = (sm.aoa[0] || []).concat(sm.aoa[1] || []).map(clean).join(' '); kind = kindOfText(first);
      // (v1.10.3) 연도도 요약 시트 A1 제목에서 — 「▣ 2026년 수입오류점수 현황」
      var ym = first.match(/(20\d{2})\s*년/); if (ym) sumYear = +ym[1];
    }
    if (!kind) kind = kindOfText(fileName || '');
    var details = sheets.filter(function (s) { return classifySheet(s.name) === 'detail'; });
    var statuses = sheets.filter(function (s) { return classifySheet(s.name) === 'status'; });
    if (!details.length && !sm && !statuses.length) { // 시트 이름이 없으면 머리글로 찾는다
      sheets.forEach(function (s) { if (findHeaderRow(s.aoa, ['신고번호', '오류점수']) >= 0) details.push(s); else if (findHeaderRow(s.aoa, ['총신고건']) >= 0) statuses.push(s); });
    }
    // (v1.10.0) 월은 파일 이름(2026-10_…)이 먼저, 없으면 시트 이름(…_10월). 정정일자로는 정하지 않는다.
    var per = FR ? FR.periodOfName(fileName || '') : null, fileMonth = per && per.single ? +per.single.slice(5, 7) : null, fileYear = per && per.single ? +per.single.slice(0, 4) : null;
    // (v1.10.0) 현황목록만 있어도 받는다(검증용 — 총신고건 · 총 오류점수). 상세목록만 있어도 받는다(본부 배분용).
    if (!details.length && !statuses.length && !sm) return { kind: kind, rows: [], status: {}, hand: {}, notes: ['현황목록 · 상세목록 시트를 찾지 못했습니다(시트 이름에 「현황」 · 「상세」 또는 머리글에 총신고건 · 신고번호 · 오류점수).'], skipped: 0, months: [], detailMonths: [], fileMonth: fileMonth, fileName: fileName || '' };
    var totalRows = 0, noMonth = 0, blankRows = 0, sheetRows = 0, detailMonths = [], year = fileYear || sumYear || null, perSheet = [];
    details.forEach(function (s) {
      var mo = fileMonth || monthOfName(s.name);
      var d = readDetail(s.aoa, { month: mo, year: year, kind: kind, rule: rule });
      if (d.error) { notes.push(s.name + ': ' + d.error); return; }
      rows = rows.concat(d.rows); skipped += d.skipped; totalRows += d.totalRows || 0; noMonth += d.noMonth || 0; blankRows += d.blank || 0; sheetRows += d.sheetRows || 0;
      if (d.cutAt != null) notes.push(s.name + ': 오른쪽 작업 영역(' + (d.cutAt + 1) + '번째 열부터)은 같은 머리글이 다시 나와 읽지 않았습니다(중복 집계 방지).');
      perSheet.push({ sheet: s.name, month: mo, sheetRows: d.sheetRows || 0, rows: d.rows.length, blank: d.blank || 0, totalRows: d.totalRows || 0, skipped: d.skipped || 0, cutAt: d.cutAt });
      if (mo && detailMonths.indexOf(mo) < 0) detailMonths.push(mo);
    });
    if (!details.length && statuses.length) notes.push('상세목록 없음 — 현황목록(총신고건 · 총 오류점수)만 읽었습니다.');
    if (noMonth) notes.push('월 미지정 ' + noMonth + '줄 — 파일 이름(2026-10_…)이나 시트 이름(…_10월)에 월이 없어 월별 집계에 넣지 못했습니다.');
    if (!kind) { // 신고번호 끝 글자 다수결
      var c = {}; rows.forEach(function (r) { var p = parseDeclNo(r.declNo); if (p && p.kind) c[p.kind] = (c[p.kind] || 0) + 1; });
      kind = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; })[0] || null;
      rows.forEach(function (r) { if (!r.kind) r.kind = kind; });
    }
    statuses.forEach(function (s) {
      var mo = fileMonth || monthOfName(s.name), st = readStatus(s.aoa);
      if (st && !mo) notes.push(s.name + ': 현황목록의 월을 알 수 없습니다 — 파일 이름에 2026-10 처럼 넣어 주세요.');
      if (mo && st) status[mo] = st;
    });
    var months = uniq(rows.map(function (r) { return r.month; }).filter(Boolean)).sort(function (a, b) { return a - b; });   // 오류 있는 달(현황목록의 달은 status)
    if (!kind) notes.push('수입인지 수출인지 알 수 없습니다 — 파일 이름에 「수입」 또는 「수출」을 넣어 주세요.');
    return { kind: kind, rows: rows, status: status, hand: sm ? readHandSummary(sm.aoa) : {}, notes: notes, skipped: skipped, totalRows: totalRows, noMonth: noMonth, months: months, detailMonths: detailMonths,
      hasDetail: details.length > 0, hasStatus: Object.keys(status).length > 0, fileMonth: fileMonth, fileYear: fileYear, year: year, summaryYear: sumYear, period: per,
      blankRows: blankRows, sheetRows: sheetRows, perSheet: perSheet, fileName: fileName || '' };
  }
  // (v1.10.0) 현황목록 총 오류점수 ↔ 상세목록 오류점수 합계 — 둘 다 올라온 수입 · 수출 × 월만. 다르면 차액을 숨기지 않고 보인다.
  function statusCheck(books) {
    var st = { 수입: {}, 수출: {} }, det = { 수입: {}, 수출: {} };
    (books || []).forEach(function (b) {
      if (!b.kind || !st[b.kind]) return;
      Object.keys(b.status || {}).forEach(function (m) { st[b.kind][m] = b.status[m]; });
      (b.detailMonths || []).forEach(function (m) { if (det[b.kind][m] == null) det[b.kind][m] = 0; });
      b.rows.forEach(function (r) { if (r.month) det[b.kind][r.month] = (det[b.kind][r.month] || 0) + (r.score || 0); });
    });
    var out = [];
    KINDS.forEach(function (k) {
      Object.keys(st[k]).map(Number).sort(function (a, b) { return a - b; }).forEach(function (m) {
        if (det[k][m] == null || st[k][m].score == null) return;
        var d = round(det[k][m], 2), s = st[k][m].score;
        out.push({ kind: k, month: m, detail: d, status: s, diff: round(d - s, 2) });
      });
    });
    return out;
  }

  /* ---------- 규칙 다시 적용 · 부호표 · 인천 건수 · 대장 대조 ---------- */
  function applyRule(books, rule) { books.forEach(function (b) { b.rows.forEach(function (r) { r.campus = campusOf(r.declNo, rule); }); }); return books; }
  function brokers(rows, rule) {
    var g = {}, r0 = normRule(rule);
    rows.forEach(function (r) { var x = g[r.broker] || (g[r.broker] = { broker: r.broker, decls: {}, score: 0 }); x.decls[r.declNo] = 1; x.score += r.score || 0; });
    return Object.keys(g).sort().map(function (k) { return { broker: k, err: Object.keys(g[k].decls).length, score: round(g[k].score, 2), campus: r0.ulsan.indexOf(k) >= 0 ? '울산' : r0.incheon.indexOf(k) >= 0 ? '인천' : UNREGION }; });
  }
  // 요약 시트에 있는 인천 신고건수를 기본값으로(메일: 인천 건수는 수출입실적분석에서, 울산 = 총신고건 − 인천)
  function countsFromBooks(books) {
    var c = { 수입: {}, 수출: {} };
    books.forEach(function (b) { if (!b.kind || !b.hand) return; Object.keys(b.hand).forEach(function (m) { var x = b.hand[m].인천; if (x && x.decl != null) c[b.kind][m] = x.decl; }); });
    return c;
  }

  /* ---------- (v1.11.0) 인천 분모 = ERP 실적 · 본부(PLANT) 세부 · 검증 ---------- */
  var HQ_NONE = '본부 미분류', HQ_ULSAN = '건기본부', HQ_REGION = '지역 미분류';
  var HQ_ORDER = ['건기본부', '엔진본부', '부품센터', HQ_NONE, HQ_REGION];
  function declKey(v) { return clean(v).toUpperCase().replace(/[\s\-]/g, ''); }
  // erp = { 수입: [레코드], 수출: [레코드] } — customs.js 가 읽은 ERP 실적(수입 수리일자 · 수출 Declaration Date 로 month, Plant → hq).
  //   GN(무환)을 포함한 레코드를 넘긴다(관세청 총신고건에 GN 이 들어 있음 — 실적 탭의 GN 제외 설정과 무관).
  //   → { counts: { 수입: { 월: 인천 신고건수 } }, byHq: { 수입: { 월: { 본부: 건수 } } }, index: { 신고번호: { kind, hq, plant, month } } }
  function erpSummary(erp, year) {
    // countsNoGN = GN(무환)을 뺀 인천 신고건수 — 분모로는 쓰지 않고, 팀 수기 자료(요약 시트, GN 제외로 적음)와 대조할 때만 쓴다
    var out = { counts: { 수입: {}, 수출: {} }, countsNoGN: { 수입: {}, 수출: {} }, byHq: { 수입: {}, 수출: {} }, index: {}, rows: { 수입: 0, 수출: 0 } };
    KINDS.forEach(function (k) {
      var seen = {}, gnDecl = {}, list = (erp || {})[k] || [];
      list.forEach(function (r) { if (String(r.payment || '').toUpperCase() === 'GN') gnDecl[declKey(r.declNo)] = 1; });
      list.forEach(function (r) {
        var key = declKey(r.declNo); if (!key) return;
        out.rows[k]++;
        if (!out.index[key]) out.index[key] = { kind: k, hq: r.hq || HQ_NONE, plant: r.plant || '', month: r.month || '' };
        if (!r.month || (year && String(r.month).slice(0, 4) !== String(year))) return;
        var m = +String(r.month).slice(5, 7), mk = m + '|' + key;
        if (seen[mk]) return; seen[mk] = 1;
        out.counts[k][m] = (out.counts[k][m] || 0) + 1;
        if (!gnDecl[key]) out.countsNoGN[k][m] = (out.countsNoGN[k][m] || 0) + 1;
        var h = out.byHq[k][m] || (out.byHq[k][m] = {}), hq = r.hq || HQ_NONE;
        h[hq] = (h[hq] || 0) + 1;
      });
    });
    return out;
  }
  // 본부 세부: 인천 건은 ERP 와 신고번호로 조인해 본부(월과 무관 — 오류 달과 수리 달이 다를 수 있음), 못 찾으면 본부 미분류(버리지 않음).
  //   울산 건은 세부 자료가 없어 전부 건기본부. 지역 미분류 건은 따로. 분모: 인천 본부 = ERP 본부별 건수, 건기본부에 울산 신고건수를 더함.
  function hqBreakdown(summary, books, erpSum) {
    // uncovered = ERP 실적이 없는 달(그 달 인천 건은 본부 미분류 — 「못 찾음」 경고와 구분)
    var idx = erpSum ? erpSum.index : {}, out = { kinds: {}, notFound: [], uncovered: [], hqs: HQ_ORDER.slice(), ulsanNote: '울산은 세부 자료가 없어 전량 건기본부로 집계' };
    var all = []; (books || []).forEach(function (b) { if (b.kind) all = all.concat(b.rows.filter(function (r) { return r.month; })); });
    KINDS.forEach(function (k) {
      out.kinds[k] = {};
      summary.months.forEach(function (m) {
        var g = {}, rows = all.filter(function (r) { return r.kind === k && r.month === m; });
        rows.forEach(function (r) {
          var hq;
          if (r.campus === '울산') hq = HQ_ULSAN;
          else if (r.campus === '인천') {
            var e = idx[declKey(r.declNo)], covered = !!(erpSum && erpSum.counts[k][m] != null);
            hq = e ? e.hq : HQ_NONE;
            if (!e && covered && !out.notFound.some(function (x) { return x.declNo === r.declNo && x.month === m; })) out.notFound.push({ kind: k, month: m, declNo: r.declNo });
            if (!e && !covered && !out.uncovered.some(function (x) { return x.kind === k && x.month === m; })) out.uncovered.push({ kind: k, month: m });
          }
          else hq = HQ_REGION;
          if (out.hqs.indexOf(hq) < 0) out.hqs.splice(out.hqs.length - 2, 0, hq);
          (g[hq] = g[hq] || []).push(r);
        });
        var mm = summary.kinds[k].months[m], byHq = erpSum && erpSum.byHq[k][m] ? erpSum.byHq[k][m] : null;
        out.kinds[k][m] = out.hqs.filter(function (h) { return g[h] || (byHq && byHq[h]) || (h === HQ_ULSAN && mm.울산.decl); }).map(function (h) {
          var decl = null;
          if (byHq) { decl = byHq[h] || 0; if (h === HQ_ULSAN && mm.울산.decl != null) decl += mm.울산.decl; }
          if (h === HQ_REGION) decl = null;
          return Object.assign({ hq: h }, cell(g[h] || [], decl));
        });
      });
    });
    return out;
  }
  // 검증: 인천 + 울산 신고건수 = 현황 총신고건, 인천 + 울산 오류점수 = 현황 오류점수 — 계산 결과와 요약 시트(팀 수기 자료) 둘 다.
  function regionChecks(summary, books, erpSum) {
    var out = [];
    function add(k, m, source, item, inc, uls, expect, extra) {
      if (inc == null || uls == null || expect == null) return;
      var sumv = round(inc + uls, 2), diff = round(sumv - expect, 2);
      out.push(Object.assign({ kind: k, month: m, source: source, item: item, incheon: inc, ulsan: uls, sum: sumv, expect: expect, diff: diff, ok: diff === 0 && uls >= 0 }, extra || {}));
    }
    KINDS.forEach(function (k) {
      summary.months.forEach(function (m) {
        var mm = summary.kinds[k].months[m];
        add(k, m, '계산', '신고건수', mm.인천.decl, mm.울산.decl, mm.statusTotal);
        add(k, m, '계산', '오류점수', mm.인천.score, mm.울산.score, mm.statusScore, { unregion: mm.미분류.score });
      });
    });
    (books || []).forEach(function (b) {
      if (!b.kind || !b.hand) return;
      Object.keys(b.hand).map(Number).forEach(function (m) {
        var h = b.hand[m], mm = summary.kinds[b.kind].months[m]; if (!h || !mm) return;
        add(b.kind, m, '요약 시트', '신고건수', h.인천 && h.인천.decl, h.울산 && h.울산.decl, mm.statusTotal);
        add(b.kind, m, '요약 시트', '오류점수', h.인천 && h.인천.score, h.울산 && h.울산.score, mm.statusScore);
        // 요약 시트는 울산을 「총신고건 − 인천」으로 적어 위 검사로는 인천 입력 오류가 안 잡힌다 → 인천 건수를 ERP(GN 제외 — 팀 수기 기준)와 대조
        var eg = erpSum && erpSum.countsNoGN[b.kind] ? erpSum.countsNoGN[b.kind][m] : null, hi = h.인천 && h.인천.decl;
        if (eg != null && hi != null) out.push({ kind: b.kind, month: m, source: '요약 시트 ↔ ERP', item: '인천 신고건수(GN 제외)', incheon: hi, ulsan: null, sum: hi, expect: eg, diff: round(hi - eg, 2), ok: hi === eg });
      });
    });
    return out.sort(function (a, b) { return a.month - b.month || a.kind.localeCompare(b.kind) || a.source.localeCompare(b.source); });
  }
  // 엔진 계산 ↔ 담당자 요약 표. 점수 차이가 먼저고, 건수 차이는 따로 센다(대장에 0점 신고번호를 뺀 달이 있다).
  function compare(books, summary) {
    var out = [];
    books.forEach(function (b) {
      if (!b.kind || !b.hand) return;
      Object.keys(b.hand).map(Number).sort(function (a, c) { return a - c; }).forEach(function (m) {
        CAMPUSES.forEach(function (cp) {
          var h = b.hand[m][cp]; if (!h) return;
          var mm = summary.kinds[b.kind].months[m], calc = mm ? mm[cp] : { err: 0, score: 0 };
          var ds = round((calc.score || 0) - (h.score || 0), 1), de = (calc.err || 0) - (h.err || 0);
          out.push({ kind: b.kind, month: m, campus: cp, calcErr: calc.err || 0, calcScore: calc.score || 0, handErr: h.err || 0, handScore: round(h.score || 0, 2), scoreDiff: ds, errDiff: de });
        });
      });
    });
    return { rows: out, scoreDiffs: out.filter(function (x) { return x.scoreDiff !== 0; }), errDiffs: out.filter(function (x) { return x.errDiff !== 0; }) };
  }

  /* ---------- 집계 ---------- */
  function distinct(rows) { return uniq(rows.map(function (r) { return r.declNo; })).length; }
  function sum(rows) { return round(rows.reduce(function (a, r) { return a + (r.score || 0); }, 0), 2); }
  function rateOf(score, decl) { return decl > 0 && score != null ? round(score / decl * 100, 2) : null; }
  // (v1.11.0) scored = 점수 발생 건수(신고번호별 오류점수 합 > 0). err(오류건수)는 0점 건도 포함 — 팀 자료와 대조하기 쉽게 둘 다
  function scoredOf(rows) { var g = {}; rows.forEach(function (r) { g[r.declNo] = (g[r.declNo] || 0) + (r.score || 0); }); return Object.keys(g).filter(function (k) { return g[k] > 0; }).length; }
  function cell(rows, decl) { var s = sum(rows); return { decl: decl == null ? null : decl, err: distinct(rows), scored: scoredOf(rows), score: s, rate: rateOf(s, decl) }; }
  // books: readWorkbook 결과들 · counts: { 수입: { 9: 1002 }, 수출: {...} } 인천 신고건수(수출입실적분석)
  function summarize(books, counts, opts) {
    opts = opts || {}; counts = counts || {};
    var all = [], status = { 수입: {}, 수출: {} };
    books.forEach(function (b) { if (!b.kind) return; all = all.concat(b.rows.filter(function (r) { return r.month; })); Object.keys(b.status).forEach(function (m) { status[b.kind][m] = b.status[m]; }); });
    var months = uniq(all.map(function (r) { return r.month; })).concat(Object.keys(status.수입).map(Number), Object.keys(status.수출).map(Number));
    months = uniq(months).filter(Boolean).sort(function (a, b) { return a - b; });
    var year = all.length ? all.map(function (r) { return r.year; }).filter(Boolean).sort()[0] : null;
    var out = { months: months, year: year, kinds: {}, total: {} };
    KINDS.forEach(function (k) {
      var kr = all.filter(function (r) { return r.kind === k; }), per = {};
      months.forEach(function (m) {
        var mr = kr.filter(function (r) { return r.month === m; }), st = status[k][m], total = st ? st.total : null;
        var inc = counts[k] && counts[k][m] != null ? toNum(counts[k][m]) : null;
        var uls = total != null && inc != null ? total - inc : null;
        per[m] = { 종합: cell(mr, total), 인천: cell(mr.filter(function (r) { return r.campus === '인천'; }), inc), 울산: cell(mr.filter(function (r) { return r.campus === '울산'; }), uls),
          미분류: cell(mr.filter(function (r) { return r.campus === UNREGION; }), null), statusScore: st ? st.score : null, statusTotal: total };
      });
      out.kinds[k] = { months: per, cum: cumOf(per, months) };
    });
    months.forEach(function (m) {
      var t = {};
      ['종합', '인천', '울산', UNREGION].forEach(function (c) {
        var a = out.kinds.수입.months[m][c], b = out.kinds.수출.months[m][c];
        var decl = a.decl != null && b.decl != null ? a.decl + b.decl : null, score = round(a.score + b.score, 2);
        t[c] = { decl: decl, err: a.err + b.err, scored: a.scored + b.scored, score: score, rate: rateOf(score, decl) };
      });
      out.total[m] = t;
    });
    out.totalCum = cumOf(out.total, months);
    out.quarters = quarters(out, opts.threshold);
    return out;
  }
  function cumOf(per, months) {
    var c = {};
    ['종합', '인천', '울산', UNREGION].forEach(function (cp) {
      var decl = 0, dk = true, err = 0, scored = 0, score = 0;
      months.forEach(function (m) { var x = per[m][cp]; if (x.decl == null) dk = false; else decl += x.decl; err += x.err; scored += x.scored || 0; score += x.score; });
      c[cp] = { decl: dk && months.length ? decl : null, err: err, scored: scored, score: round(score, 2), rate: dk ? rateOf(round(score, 2), decl) : null };
    });
    return c;
  }
  // 분기별 오류점수 — 범위(수입·수출·수출입 × 종합·인천·울산) 전부
  function quarters(summary, threshold) {
    var th = threshold == null ? THRESHOLD : threshold, out = [];
    var scopes = [{ kind: '수출입', get: function (m) { return summary.total[m]; } }, { kind: '수입', get: function (m) { return summary.kinds.수입.months[m]; } }, { kind: '수출', get: function (m) { return summary.kinds.수출.months[m]; } }];
    scopes.forEach(function (sc) {
      ['종합', '인천', '울산'].forEach(function (cp) {
        for (var q = 1; q <= 4; q++) {
          var ms = summary.months.filter(function (m) { return Math.ceil(m / 3) === q; }); if (!ms.length) continue;
          var s = round(ms.reduce(function (a, m) { return a + sc.get(m)[cp].score; }, 0), 2);
          out.push({ kind: sc.kind, campus: cp, q: q, months: ms, score: s, over: s >= th, near: s < th && s >= th * 0.8, threshold: th });
        }
      });
    });
    return out;
  }
  // 항목명별 — 줄 수 · 신고번호 수 · 오류점수 · 비중
  function topItems(rows, n) {
    var g = {}, total = sum(rows);
    rows.forEach(function (r) { var k = r.item || '(항목명 없음)'; if (!g[k]) g[k] = { item: k, codes: [], n: 0, decls: [], score: 0 }; g[k].n++; g[k].score += r.score || 0; if (g[k].decls.indexOf(r.declNo) < 0) g[k].decls.push(r.declNo); if (r.code && g[k].codes.indexOf(r.code) < 0) g[k].codes.push(r.code); });
    var list = Object.keys(g).map(function (k) { var x = g[k]; return { item: x.item, code: x.codes.join('·'), n: x.n, err: x.decls.length, score: round(x.score, 2), share: total > 0 ? round(x.score / total * 100, 1) : null }; });
    list.sort(function (a, b) { return b.score - a.score || b.n - a.n || (a.item < b.item ? -1 : 1); });
    return n ? list.slice(0, n) : list;
  }
  // 신고번호별 — 관리대장의 한 줄 재료
  function byDecl(rows) {
    var g = {};
    rows.forEach(function (r) {
      var x = g[r.declNo] || (g[r.declNo] = { declNo: r.declNo, kind: r.kind, campus: r.campus, broker: r.broker, month: r.month, fixedAt: null, n: 0, score: 0, items: [], accepts: [], changes: [] });
      x.n++; x.score += r.score || 0;
      if (r.fixedAt && (!x.fixedAt || r.fixedAt < x.fixedAt)) x.fixedAt = r.fixedAt;
      if (r.item && x.items.indexOf(r.item) < 0) x.items.push(r.item);
      if (r.accept && x.accepts.indexOf(r.accept) < 0) x.accepts.push(r.accept);
      if (r.item && (r.score || 0) > 0) x.changes.push(r.item + ' ' + (r.before || '') + ' → ' + (r.after || ''));
    });
    var list = Object.keys(g).map(function (k) { g[k].score = round(g[k].score, 2); return g[k]; });
    list.sort(function (a, b) { return (a.month || 0) - (b.month || 0) || b.score - a.score || (a.declNo < b.declNo ? -1 : 1); });
    return list;
  }
  // (v1.12.0) AEO 관리대장과 같은 11열 — 「No」 대신 「연번」
  var LEDGER_HEAD = ['구분', '연번', '사업부', 'DRAFT NO', '신고번호', '정정일자', '오류점수', '발생사유 및 정정내용', '귀책', '관련부서', '담당자'];
  // (예전 규칙 — 시험 고정용) notes[declNo] — 오류점수가 있는 신고번호만, 사유를 안 썼으면 정정 내역. v1.12.0 화면 · 엑셀은 ledgerRows 를 쓴다.
  function ledger(decls, notes, opts) {
    notes = notes || {}; opts = opts || {};
    var list = opts.all ? decls : decls.filter(function (d) { return d.score > 0; });
    var cnt = { 수입: 0, 수출: 0 };
    return list.map(function (d) {
      var n = notes[d.declNo] || {}; cnt[d.kind] = (cnt[d.kind] || 0) + 1;
      return [d.kind || '', cnt[d.kind], n.div || '', n.draft || '', d.declNo, d.fixedAt || '', d.score, n.reason || d.changes.slice(0, 3).join(' / '), n.blame || '', n.dept || '', n.owner || ''];
    });
  }

  /* ---------- (v1.12.0) 인천 오류건 관리대장 ---------- */
  // 사업부는 팀 표기처럼 짧게(건기본부 → 건기). 못 정하면 null(화면 「미분류」 — 담당자가 고쳐 적을 수 있음).
  var DIV_SHORT = { '건기본부': '건기', '엔진본부': '엔진', '부품센터': '부품' };
  var LEDGER_INPUT = ['draft', 'reason', 'blame', 'dept', 'owner'];      // 담당자가 채우는 다섯 칸(+ 사업부를 못 정했을 때 div)
  function noteKey(declNo, month) { return declNo + '|' + month; }       // 입력값 열쇠 = 신고번호 + 월(집계 데이터와 따로 저장)
  // 예전 입력값(열쇠 = 신고번호만)을 그 신고번호가 나온 달의 열쇠로 옮긴다. 옮긴 예전 열쇠는 지우고, 지금 자료에 없는 예전 열쇠는 그대로 둔다.
  function migrateNotes(notes, decls) {
    var out = {}, moved = 0; notes = notes || {};
    Object.keys(notes).forEach(function (k) { out[k] = notes[k]; });
    (decls || []).forEach(function (d) {
      var old = out[d.declNo], key = noteKey(d.declNo, d.month);
      if (old && typeof old === 'object' && d.month && !out[key]) { out[key] = old; delete out[d.declNo]; moved++; }
    });
    return { notes: out, moved: moved };
  }
  // 대장 줄 — 인천 발생 신고번호만(울산은 세부 자료가 없어 대상 아님), 0점 건 포함. month 가 없으면 전체 월.
  //   연번 = 월 · 구분(수입 → 수출)마다 정정일자 · 신고번호 순. 화면 정렬(미입력 먼저)이 바뀌어도 번호는 그대로.
  function ledgerRows(decls, notes, erpSum, opts) {
    notes = notes || {}; opts = opts || {};
    var idx = erpSum ? erpSum.index : {}, order = { 수입: 0, 수출: 1 };
    var list = (decls || []).filter(function (d) { return d.campus === '인천' && d.month && (opts.month == null || d.month === opts.month); });
    list.sort(function (a, b) { return a.month - b.month || (order[a.kind] || 0) - (order[b.kind] || 0) || String(a.fixedAt || '').localeCompare(String(b.fixedAt || '')) || (a.declNo < b.declNo ? -1 : 1); });
    var cnt = {};
    return list.map(function (d) {
      var key = noteKey(d.declNo, d.month), n = notes[key] || {}, e = idx[declKey(d.declNo)], auto = e ? DIV_SHORT[e.hq] || null : null;
      var ck = d.month + '|' + d.kind; cnt[ck] = (cnt[ck] || 0) + 1;
      var row = { key: key, kind: d.kind || '', no: cnt[ck], month: d.month, declNo: d.declNo, date: d.fixedAt ? String(d.fixedAt).slice(0, 10) : '', score: d.score,
        div: auto || clean(n.div) || '', divAuto: !!auto, hint: d.changes.slice(0, 3).join(' / '), erp: !!e };
      LEDGER_INPUT.forEach(function (f) { row[f] = n[f] == null ? '' : String(n[f]); });
      row.missing = !clean(row.draft) || !clean(row.reason);                 // 미입력 = DRAFT NO 나 발생사유가 빈 줄
      return row;
    });
  }
  function ledgerProgress(rows, month) {
    var total = rows.length, missing = rows.filter(function (r) { return r.missing; }).length;
    return { total: total, missing: missing, done: total - missing, text: (month ? month + '월 ' : '') + '인천 발생 ' + total + '건 중 미입력 ' + missing + '건' };
  }
  // 엑셀 — AEO 관리대장과 같은 열 순서. 발생사유를 안 썼으면 빈칸(미입력이 입력된 것처럼 보이지 않게). 사업부를 못 정했으면 「미분류」.
  function ledgerAoa(rows) {
    return [LEDGER_HEAD].concat((rows || []).map(function (r) { return [r.kind, r.no, r.div || '미분류', r.draft, r.declNo, r.date, r.score, r.reason, r.blame, r.dept, r.owner]; }));
  }

  /* ---------- 월별 공유 메일 초안 ---------- */
  function f0(v) { return v == null ? '—' : Math.round(v).toLocaleString('ko-KR'); }
  function f1(v) { return v == null ? '—' : String(round(v, 1)); }
  function pct(v) { return v == null ? '—' : round(v, 1) + '%'; }
  function upTo(summary, m, cp) { return summary.months.filter(function (x) { return x <= m; }).reduce(function (a, x) { return a + summary.total[x][cp].score; }, 0); }
  function upToKind(K, summary, m, cp) { return summary.months.filter(function (x) { return x <= m; }).reduce(function (a, x) { return a + K.months[x][cp].score; }, 0); }
  function mailDraft(summary, month, opts) {
    opts = opts || {};
    var m = month || summary.months[summary.months.length - 1]; if (!m) return { subject: '', body: '' };
    var prev = summary.months.filter(function (x) { return x < m; }).pop();
    var T = summary.total[m], P = prev ? summary.total[prev] : null, n = summary.months.filter(function (x) { return x <= m; }).length;
    var yr = summary.year ? summary.year + '년 ' : '';
    var lines = [];
    lines.push('수신인께!');
    lines.push('');
    lines.push(m + '월 수출입 오류관리대장을 배포하오니, AEO 위험성평가 등에 참고하여 주시기 바랍니다.');
    lines.push('');
    var delta = P ? round(T.인천.score - P.인천.score, 1) : null, cumI = upTo(summary, m, '인천');   // 기획자 메일의 1) 줄은 인천 기준이다(2,524건 · 71점)
    lines.push('1) 수출입 오류 현황 : (건수) ' + f0(T.인천.decl) + '건 (오류점수) ' + f1(T.인천.score) + '점' + (delta != null ? ' => ' + m + '월의 경우 ' + prev + '월 대비 오류점수 ' + (delta >= 0 ? delta + '점 증가' : (-delta) + '점 감소') : '') + ' => 월평균 오류점수 ' + f1(cumI / n) + '점');
    KINDS.forEach(function (k) {
      var K = summary.kinds[k], X = K.months[m], PX = prev ? K.months[prev] : null;
      var d2 = PX ? round(X.인천.score - PX.인천.score, 1) : null;
      lines.push('  - ' + k + '(인천) : (신고건수) ' + f0(X.인천.decl) + '건, (오류건수) ' + f0(X.인천.err) + '건, (오류점수) ' + f1(X.인천.score) + '점, (오류비율) ' + pct(X.인천.rate) + (d2 != null ? ' => ' + m + '월은 ' + prev + '월 대비 오류점수 ' + (d2 >= 0 ? d2 + '점 증가' : (-d2) + '점 감소') + ',' : ' =>') + ' 1~' + m + '월까지 누적 발생오류 점수는 ' + f1(upToKind(K, summary, m, '인천')) + '점');
      lines.push('    => 울산캠퍼스 ' + m + '월 ' + k + '오류 점수는 ' + f1(X.울산.score) + '점이며 1~' + m + '월까지 누적 발생오류 점수는 ' + f1(upToKind(K, summary, m, '울산')) + '점');
      if (opts.reasons && opts.reasons[k]) lines.push('    . ' + opts.reasons[k]);
    });
    lines.push('');
    lines.push('2) 수출입오류점수 발생세부 현황 => [항목별 상위 · 발생 사유를 적어 주세요]');
    var top = opts.top || [];
    top.slice(0, 5).forEach(function (t) { lines.push('  . ' + t.item + ' : ' + t.err + '건 ' + f1(t.score) + '점'); });
    lines.push('');
    lines.push('3) Next Step');
    lines.push('  . 각 사업본부 수출입담당자에게 오류발생 최소화 안내 및 교육 실시');
    lines.push('  . 수출신고후 7일이내 정정신고로 오류점수 미발생관리 실시');
    lines.push('');
    lines.push('[첨부파일] 1. ' + yr + 'AEO월별오류점수관리대장  2. 수출/수입귀책사유자별오류현황 및 상세목록  3. 신고인오류대장');
    lines.push('');
    lines.push('감사합니다.');
    return { subject: '(' + m + '월) 수출입 오류점수 현황 및 오류관리대장 공유', body: lines.join('\n') };
  }

  /* ---------- 엑셀 ---------- */
  function monthLabel(m, year) { return (year ? year + '년 ' : '') + m + '월'; }
  function summaryAoa(summary) {
    var ms = summary.months.slice().reverse(), head1 = ['구분', ''], head2 = ['', ''];
    ms.forEach(function (m) { head1.push(m + '월', '', '', ''); head2.push('신고건수', '오류건수', '오류점수', '비율(%)'); });
    head1.push('합계', '', '', ''); head2.push('신고건수', '오류건수', '오류점수', '비율(%)');
    var rows = [['▣ ' + (summary.year ? summary.year + '년도 ' : '') + '수출입오류점수 현황'], head1, head2];
    function line(a, b, get, cum) { var r = [a, b]; ms.forEach(function (m) { var x = get(m); r.push(x.decl == null ? '' : x.decl, x.err, x.score, x.rate == null ? '' : x.rate); }); r.push(cum.decl == null ? '' : cum.decl, cum.err, cum.score, cum.rate == null ? '' : cum.rate); return r; }
    rows.push(line('종합', '', function (m) { return summary.total[m].종합; }, summary.totalCum.종합));
    CAMPUSES.forEach(function (c) { rows.push(line('수출입', c, function (m) { return summary.total[m][c]; }, summary.totalCum[c])); });
    KINDS.forEach(function (k) { rows.push([]); rows.push(line(k, '종합', function (m) { return summary.kinds[k].months[m].종합; }, summary.kinds[k].cum.종합)); CAMPUSES.forEach(function (c) { rows.push(line(k, c, function (m) { return summary.kinds[k].months[m][c]; }, summary.kinds[k].cum[c])); }); });
    rows.push([]); rows.push(['규칙', '지역 = 신고번호 앞 5자리 신고인부호(울산 ' + RULE.ulsan.join(',') + ' · 인천 ' + RULE.incheon.join(',') + ', 그 밖 지역 미분류 — 설정에서 바꿀 수 있음) · 오류건수 = 신고번호 수(0점 포함) · 점수 발생 건수 = 오류점수 > 0 · 비율 = 오류점수 ÷ 신고건수 · 인천 신고건수 = ERP 실적 신고번호 고유 개수(GN 포함, 없으면 요약 시트 · 입력), 울산 = 총신고건 − 인천']);
    return rows;
  }
  function exportBook(ctx) {
    var s = ctx.summary, out = [];
    out.push({ name: '오류점수요약', aoa: summaryAoa(s) });
    // (v1.12.0) 관리대장 — 인천 · 0점 포함 · 11열(ctx.ledger 를 넘기면 그것, 아니면 예전 규칙)
    out.push({ name: '발생사유및정정내용', aoa: ctx.ledger ? ledgerAoa(ctx.ledger) : [LEDGER_HEAD].concat(ledger(ctx.decls, ctx.notes, { all: ctx.allDecls })) });
    out.push({ name: '분기', aoa: [['구분', '캠퍼스', '분기', '월', '오류점수', '경계', '판정']].concat(s.quarters.map(function (q) { return [q.kind, q.campus, q.q + '분기', q.months.join(','), q.score, q.threshold, q.over ? '경계 이상(실물서류 제출 대상)' : q.near ? '경계 80% 이상' : '']; })) });
    out.push({ name: '항목별', aoa: [['항목명', '항목코드', '정정 줄', '신고번호 수', '오류점수', '비중(%)']].concat(topItems(ctx.rows).map(function (t) { return [t.item, t.code, t.n, t.err, t.score, t.share == null ? '' : t.share]; })) });
    out.push({ name: '상세', aoa: [['구분', '월', '캠퍼스', '관세사부호', '신고번호', '란번호', '정정일자', '수리구분', '정정구분', '항목코드', '항목명', '오류점수', '변경 후 오류점수', '정정전내역', '정정후내역']].concat(ctx.rows.map(function (r) { return [r.kind, r.month, r.campus, r.broker, r.declNo, r.lane, r.fixedRaw || r.fixedAt || '', r.accept, r.fixType, r.code, r.item, r.score, r.score2 == null ? '' : r.score2, r.before, r.after]; })) });
    return out;
  }

  /* ---------- 예제 — 가짜 수치·가짜 신고번호(실제 사내 데이터가 아닙니다) ---------- */
  var SAMPLE_ITEMS = { 수입: ['원산지표시유무구분코드', '관세', '부가세과세과표총액', '과세가격원화금액', 'HS10단위부호', '신고수량', '운송보험료'], 수출: ['신고금액', '신고단가', '순중량', '송장번호', '결제금액', '모델규격명', '포장개수'] };
  function sampleBooks() {
    var books = [];
    KINDS.forEach(function (k, ki) {
      var letter = k === '수입' ? 'M' : 'X', sheets = [], seed = 17 + ki * 7;
      var hand = {};
      [7, 8, 9].forEach(function (mo, mi) {
        var total = k === '수입' ? [2023, 1543, 1764][mi] : [2453, 1933, 2227][mi];
        var detail = [['No', '귀책사유자부호', '신고번호', '란번호', '정정일자 및 시간', '수리구분', '정정구분', '항목코드', '항목명', '오류점수', '변경 후 오류점수', '정정전내역', '정정후내역']];
        var nDecl = [3, 4, 6][mi] + ki, no = 0, score = 0;
        for (var d = 0; d < nDecl; d++) {
          var broker = (d + mi + ki) % 3 === 0 ? '42158' : '43908';          // 셋에 하나 인천, 나머지 울산
          var decl = broker + '26' + String(600000 + seed * 37 + mo * 1000 + d * 13).slice(0, 6) + letter;
          var lines = 1 + ((d + mi) % 3);
          for (var l = 0; l < lines; l++) {
            var item = SAMPLE_ITEMS[k][(d + l + mi) % SAMPLE_ITEMS[k].length];
            var sc = [0, 1, 2, 5, 10, 3][(d * 2 + l + mi) % 6]; score += sc;
            detail.push([++no, '예제1177017', decl, '0', '2026-' + pad2(mo) + '-' + pad2(3 + d * 3 + l) + '  10:' + pad2(10 + l * 7) + ':00', l === 0 && d % 4 === 3 ? '수리전' : '수리후', '정정', 'A' + (800 + (d + l) % 20), item, sc, sc, String(1000 + d * 111), String(1000 + d * 111 + 50)]);
          }
        }
        var inc = k === '수입' ? [1260, 900, 1002][mi] : [1535, 1212, 1522][mi], cnt = { 인천: { d: {}, s: 0 }, 울산: { d: {}, s: 0 } };
        detail.slice(1).forEach(function (r) { var c = campusOf(r[2]); cnt[c].d[r[2]] = 1; cnt[c].s += r[9]; });
        var shift = k === '수출' && mo === 8 ? 5 : 0;      // 예제: 담당자 표가 5점 어긋난 달(대조 화면 시연용)
        hand[mo] = { 인천: [inc, Object.keys(cnt.인천.d).length, cnt.인천.s + shift], 울산: [total - inc, Object.keys(cnt.울산.d).length, cnt.울산.s - shift] };
        sheets.push({ name: '귀책사유자별오류현황목록_' + mo + '월', aoa: [['No', '귀책사유자부호', '귀책사유자상호', '관할지세관부호', '관할지세관', '총신고건', '오류점수', '비율'], [1, '예제1177017', '예제건설기계(주)', '012', '성남세관', total, score, round(score / total * 100, 1)]] });
        sheets.push({ name: '귀책사유자별오류상세목록_' + mo + '월', aoa: detail });
      });
      var hd = ['구분'], order = [9, 8, 7], line = function (cp) { var r = [cp]; order.forEach(function (mo) { r = r.concat(hand[mo][cp], ['']); }); return r; };
      order.forEach(function (mo) { hd.push(mo + '월', '', '', ''); });
      sheets.unshift({ name: '요약', aoa: [['▣ 2026년 ' + k + '오류점수 현황(예제)'], hd, [''].concat(['건수', '오류건수', '오류점수', '비율', '건수', '오류건수', '오류점수', '비율', '건수', '오류건수', '오류점수', '비율']), line('인천'), line('울산')] });
      books.push({ name: '예제_2026년' + k + '귀책사유자별오류현황및상세목록.xlsx', sheets: sheets });
    });
    return books;
  }

  var api = {
    RULE: RULE, THRESHOLD: THRESHOLD, KINDS: KINDS, CAMPUSES: CAMPUSES, FIELDS: FIELDS, LEDGER_HEAD: LEDGER_HEAD,
    noteKey: noteKey, migrateNotes: migrateNotes, ledgerRows: ledgerRows, ledgerProgress: ledgerProgress, ledgerAoa: ledgerAoa, DIV_SHORT: DIV_SHORT, LEDGER_INPUT: LEDGER_INPUT,
    parseDeclNo: parseDeclNo, statusCheck: statusCheck, campusOf: campusOf, normRule: normRule, UNREGION: UNREGION, erpSummary: erpSummary, hqBreakdown: hqBreakdown, regionChecks: regionChecks, declKey: declKey, HQ_ORDER: HQ_ORDER, parseDate: parseDate, monthOfName: monthOfName, classifySheet: classifySheet,
    mapHeaders: mapHeaders, findHeaderRow: findHeaderRow, readDetail: readDetail, readStatus: readStatus, readWorkbook: readWorkbook, readHandSummary: readHandSummary, applyRule: applyRule, brokers: brokers, countsFromBooks: countsFromBooks, compare: compare,
    summarize: summarize, quarters: quarters, topItems: topItems, byDecl: byDecl, ledger: ledger, mailDraft: mailDraft,
    summaryAoa: summaryAoa, exportBook: exportBook, sampleBooks: sampleBooks, round: round, toNum: toNum
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ErrScore = api;
})(this);
