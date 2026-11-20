/* 오류점수 화면 — 판정은 errscore.js 가 한다. 여기서는 읽고, 고르고, 그린다. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); }, E = window.ErrScore, C = window.Customs, FR = window.FileRules;
  var LS = { rule: 'build-2611-07.err.rule', notes: 'build-2611-07.err.notes', th: 'build-2611-07.err.th' };
  function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  // (v1.11.0) rule = 지역 표({ ulsan, incheon } — 예전 { ulsan } 저장값은 새 기본 표로 옮김) · erp = ERP 실적(인천 분모 · 본부 조인, 저장하지 않음) · manual = 직접 넣은 인천 건수
  var state = { books: [], rule: E.normRule(load(LS.rule, null)), notes: load(LS.notes, {}), th: load(LS.th, E.THRESHOLD), counts: { 수입: {}, 수출: {} }, countSrc: { 수입: {}, 수출: {} }, manual: { 수입: {}, 수출: {} }, erp: { 수입: null, 수출: null }, erpSum: null, hq: null, checks: [], summary: null, rows: [], decls: [] };
  // (v2.3.0) ERP 결과(b2611-07.err.erp) · 유니패스 읽은 결과(b2611-07.err.books) — 새로고침 · 다른 메뉴에 다녀와도 남게. 원본 엑셀 행은 저장하지 않는다.
  state.erpStore = E.erpStoreValid(load(E.ERP_KEY, null));
  function hasErp() { return E.erpStoreHas(state.erpStore); }
  function hasErpNow() { return !!state.erpSum; }
  function saveErp(list) {
    var recs = { 수입: [], 수출: [] }, files = [];
    list.forEach(function (x) { var k = x.kind === 'import' ? '수입' : '수출'; recs[k] = recs[k].concat(x.records); files.push({ name: x.file, kind: k, period: x.period ? x.period.from + '~' + x.period.to : null, rows: x.records.length }); });
    var part = E.erpStoreFrom(recs, { files: files, src: 'errors' }), t = E.erpStoreTrim(E.erpStoreMerge(state.erpStore, part));
    state.erpStore = t.store; state.erpDropped = t.dropped;
    if (state.example) return;   // (v2.8.0) 예제는 저장 안 함
    try { localStorage.setItem(E.ERP_KEY, JSON.stringify(t.store)); state.erpSaveOk = true; } catch (e) { state.erpSaveOk = false; }
  }
  function saveBooks() { if (state.example) return; try { localStorage.setItem(E.BOOKS_KEY, JSON.stringify(E.booksPack(state.books))); state.booksSaveOk = true; } catch (e) { state.booksSaveOk = false; } }
  function renderSrc() { var t = E.erpSourceText(state.erpStore); $('e-erpsrc').innerHTML = t ? '<b>' + esc(t) + '</b>' : 'ERP 실적이 아직 없습니다 — 인천 신고건수 · 본부는 ERP 수입실적 · 수출실적(여기서 또는 대시보드에서)을 올리면 채워집니다.'; }
  // (v2.0.0) 요약 저장 — 집계가 바뀔 때마다 덮어쓴다(원본 행은 넣지 않음). 대시보드 오류점수 탭은 이것을 읽기만 한다.
  function saveSummary() {
    var erp = (E.erpStoreValid(state.erpStore) ? state.erpStore.files : []).map(function (x) { return { name: x.name, kind: x.kind, period: x.period || null, rows: x.rows, src: x.src }; });
    state.saved = E.buildSummary(state.summary, state.hq, state.books, { erp: erp });
    if (state.example) return;   // (v2.8.0) 예제 요약은 대시보드가 읽는 저장값에 쓰지 않음
    try { localStorage.setItem(E.SUMMARY_KEY, JSON.stringify(state.saved)); state.savedOk = true; } catch (e) { state.savedOk = false; }
  }
  function saveNotes() { try { localStorage.setItem(LS.notes, JSON.stringify(state.notes)); return true; } catch (e) { return false; } }
  function saveRule() { try { localStorage.setItem(LS.rule, JSON.stringify(state.rule)); } catch (e) { /* 기억 못 해도 이번 화면에는 반영 */ } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function n(v) { return v == null ? '—' : Number(v).toLocaleString('ko-KR'); }
  function pc(v) { return v == null ? '—' : v + '%'; }
  // (v1.10.0) 오류비율은 분자(오류점수)와 분모(총신고건)가 모두 있을 때만 — 없으면 0% 가 아니라 「자료 없음」
  function rt(v) { return v == null ? '자료 없음' : v + '%'; }
  function stat(k, v) { return '<div class="stat"><b>' + v + '</b>' + esc(k) + '</div>'; }
  function table(head, rows, cls) { return '<div class="tablewrap"><table class="' + (cls || '') + '"><thead><tr>' + head.map(function (h, i) { return '<th' + (i > 1 ? ' class="num"' : '') + '>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>'; }

  function recompute() {
    // (v2.7.0) 계산 순서는 errscore.summaryFrom 한 곳(대시보드 예제도 같은 함수). ERP 결과는 저장값(b2611-07.err.erp) · 인천 신고건수 = ERP 실적만(v2.0.0)
    var res = E.summaryFrom(state.books, hasErp() ? state.erpStore : null, { rule: state.rule, threshold: state.th });
    state.rows = res.rows; state.erpSum = res.erpSum; state.summary = res.summary; state.hq = res.hq;
    E.KINDS.forEach(function (k) { state.counts[k] = res.counts[k]; state.countSrc[k] = {}; Object.keys(res.counts[k]).forEach(function (m) { state.countSrc[k][m] = 'ERP'; }); });
    state.checks = E.regionChecks(state.summary, state.books, state.erpSum);
    state.decls = E.byDecl(state.rows);
    saveSummary();
    var mg = E.migrateNotes(state.notes, state.decls); if (mg.moved) { state.notes = mg.notes; saveNotes(); }
    fillMonths();
    render();
  }
  // (v1.11.0) ERP 실적(수입 · 수출) 읽기 — customs.js 그대로, GN 포함으로 고정(실적 탭의 GN 제외 설정과 무관)
  function erpSettings() { var raw = null; try { raw = JSON.parse(localStorage.getItem('b2611-07.dash.settings') || 'null'); } catch (e) { raw = null; } var o = C.exportSettings(raw); o.excludeGN = false; return o; }
  function erpKindOf(b) {
    var byName = FR.kindByName(b.name);
    if (byName && (byName.group === 'errscore' || byName.group === 'fta' || byName.group === 'refund' || byName.group === 'ruling')) return null;
    if (byName && byName.dataset) return byName.dataset;
    var sh = b.sheets.map(function (x) { var hr = C.findHeaderRow(x.aoa); return { name: x.name, aoa: x.aoa.slice(hr), offset: hr }; }).filter(function (x) { return x.aoa.length > 1; });
    var d = C.pickSheets(sh, b.name).detect; return d.kind === 'import' || d.kind === 'export' ? d.kind : null;
  }
  function readErp(b, kind) {
    var sh = b.sheets.map(function (x) { var hr = C.findHeaderRow(x.aoa); return { name: x.name, aoa: x.aoa.slice(hr), offset: hr }; }).filter(function (x) { return x.aoa.length > 1; });
    var pk = C.pickSheets(sh, b.name), u = pk.use[0];
    if (!u) return { file: b.name, kind: kind, records: [], missing: ['읽을 표 없음'] };
    var item = { name: b.name, file: b.name, headers: C.uniqueHeaders(u.aoa[0]), aoa: u.aoa, offset: u.offset, override: {} };
    if (pk.use.length > 1) item.parts = pk.use.map(function (x) { return { sheet: x.name, aoa: x.aoa, offset: x.offset }; });
    var m = C.mergeFiles(kind, [item], erpSettings()), p = m.files[0];
    return { file: b.name, kind: kind, records: m.ok ? m.records : [], missing: p.res.missing, period: m.period, gn: m.records.filter(function (r) { return String(r.payment || '').toUpperCase() === 'GN'; }).length, dateCol: m.map.date, declCol: m.map.declNo };
  }
  // (v1.10.0) 올린 파일 목록 — 파일명 / 인식된 종류 / 기간 / 월 귀속 기준 / 읽은 행 수 / 경고. 현황 · 상세가 둘 다 있으면 오류점수 합계를 맞춰 보고 차액을 보인다.
  function fileRow(b) {
    var part = b.hasDetail && b.hasStatus ? '현황 + 상세' : b.hasDetail ? '상세목록' : b.hasStatus ? '현황목록' : '—';
    var period = b.fileMonth ? (b.fileYear ? b.fileYear + '-' : '') + (b.fileMonth < 10 ? '0' : '') + b.fileMonth : '';
    var ms = b.months.concat(Object.keys(b.status).map(Number)).filter(function (m, i, a) { return a.indexOf(m) === i; }).sort(function (x, y) { return x - y; });
    if (!b.fileMonth) period = ms.length ? ms.join(', ') + '월(시트 이름)' : '판별 못 함';
    var basis = b.fileMonth ? 'A 파일 이름' : ms.length ? 'C 시트 이름' : 'D 월 미지정';
    var warn = b.notes.slice(); if (!b.kind) warn.unshift('종류(수입 · 수출)를 판별하지 못함'); if (!ms.length && !b.noMonth) warn.push('기간을 판별하지 못함');
    if (b.skipped) warn.push('읽지 못한 줄 ' + b.skipped);
    // (v1.10.3) 시트 행 = 정정 줄 + 빈 줄 + 합계 · 소계 줄 + 읽지 못한 줄 — 기대값(시트 행 수)과 바로 맞춰 볼 수 있게
    var nrows = b.rows.length + (b.hasStatus ? ' (현황 ' + Object.keys(b.status).length + '줄)' : '') + (b.blankRows ? ' · 빈 줄 ' + b.blankRows : '') + (b.totalRows ? ' · 합계 · 소계 줄 ' + b.totalRows + ' 제외' : '') + (b.sheetRows ? ' / 시트 ' + b.sheetRows + '행' : '');
    return '<tr><td>' + esc(b.fileName) + '</td><td>' + esc((b.kind || '구분 모름') + ' 오류점수 · ' + part) + '</td><td>' + esc(period) + '</td><td>' + esc(basis) + '</td><td class="num">' + esc(nrows) + '</td><td>' + (warn.length ? '<span class="bad">' + esc(warn.join(' / ')) + '</span>' : '—') + '</td></tr>';
  }
  function bookKey(b) { return [b.kind || '?', b.year || '', b.fileMonth || '전체', (b.hasDetail ? 'D' : '') + (b.hasStatus ? 'S' : '')].join('|'); }
  function erpRow(x) {
    var lab = x.kind === 'import' ? '수입 실적(ERP · GN 포함)' : '수출 실적(ERP · GN 포함)', basis = x.kind === 'import' ? '행 날짜 — 수리일자(Acceptance date)' : '행 날짜 — 신고일자(Declaration Date)';
    var warn = x.missing && x.missing.length ? '<span class="bad">못 찾은 열: ' + esc(x.missing.join(', ')) + '</span>' : '—';
    return '<tr><td>' + esc(x.file) + '</td><td>' + esc(lab) + '</td><td>' + esc(x.period ? x.period.from + ' ~ ' + x.period.to : '—') + '</td><td>' + esc(basis) + '</td><td class="num">' + esc(n(x.records.length) + (x.gn ? ' (GN ' + n(x.gn) + ')' : '')) + '</td><td>' + warn + '</td></tr>';
  }
  function setBooks(raw, opts) {
    opts = opts || {};
    if (!opts.example && state.example) { state.example = false; state.books = E.booksUnpack(load(E.BOOKS_KEY, null)); state.erpStore = E.erpStoreValid(load(E.ERP_KEY, null)); }   // (v2.8.0) 예제를 닫고 저장된 내 결과로
    var blanks = raw.filter(function (b) { return C && C.isBlankTemplate(b.sheets); });   // (v2.8.0) 빈 양식(머리글 + 예시 한 줄)은 집계에 올리지 않음
    raw = raw.filter(function (b) { return blanks.indexOf(b) < 0; });
    if (blanks.length && !raw.length) { $('e-msg').innerHTML = '<div class="warn" data-k="blank-tpl">' + blanks.map(function (b) { return esc(b.name) + ' — <b>' + esc(C.BLANK_TEMPLATE_MSG) + '</b>'; }).join('<br>') + '</div>'; return; }
    var errs = [], erps = [];
    raw.forEach(function (b) { var k = C && FR ? erpKindOf(b) : null; if (k) erps.push({ b: b, k: k }); else errs.push(b); });
    erps.forEach(function (x) { state.erp[x.k === 'import' ? '수입' : '수출'] = readErp(x.b, x.k); });
    if (erps.length) saveErp(erps.map(function (x) { return state.erp[x.k === 'import' ? '수입' : '수출']; }));
    // (v2.0.0) 수입 · 수출 파일을 따로 올려도 앞 파일이 사라지지 않게 — 같은 열쇠(수입·수출 · 연도 · 파일 이름 월 · 현황/상세)의 파일만 바꾼다
    errs.map(function (b) { return E.readWorkbook(b.sheets, b.name, state.rule); }).forEach(function (nb) {
      var key = bookKey(nb); state.books = state.books.filter(function (ob) { return bookKey(ob) !== key && ob.fileName !== nb.fileName; }); state.books.push(nb);
    });
    if (errs.length) saveBooks();
    var chk = E.statusCheck(state.books), diff = chk.filter(function (c) { return c.diff !== 0; });
    var erpList = ['수입', '수출'].filter(function (k) { return state.erp[k]; }).map(function (k) { return erpRow(state.erp[k]); });
    var list = table(['파일명', '인식된 종류', '기간', '월 귀속 기준', '읽은 행 수', '경고'], state.books.map(fileRow).concat(erpList), 'e-files');
    var chkTxt = chk.length ? '<p class="sub">현황목록 총 오류점수 ↔ 상세목록 오류점수 합계: ' + chk.map(function (c) { return esc(c.month + '월 ' + c.kind + ' ' + n(c.status) + '점 ↔ ' + n(c.detail) + '점' + (c.diff ? ' (차액 ' + (c.diff > 0 ? '+' : '') + c.diff + '점)' : ' (같음)')); }).join(' · ') + '</p>' : '';
    var erpTxt = '<p class="sub" data-k="erp-note">인천 신고건수 = ERP 실적의 신고번호 고유 개수(수입 수리일자 · 수출 신고일자 기준, <b>GN 포함</b> — 관세청 총신고건에 GN 이 들어 있어서 실적 탭의 「GN 제외」 설정을 따르지 않습니다). ' + (erpList.length ? '' : 'ERP 수입실적 · 수출실적 파일을 함께 올리면 인천 건수와 본부(PLANT)를 자동으로 채웁니다.') + '</p>';
    var ok = state.books.some(function (b) { return b.rows.length || b.hasStatus; });
    $('e-msg').innerHTML = '<div class="' + (ok && !diff.length ? 'ok' : 'warn') + '">' + list + chkTxt + erpTxt + (diff.length ? '<p><b>현황목록과 상세목록의 오류점수가 다릅니다</b> — 위 차액을 확인해 주세요.</p>' : '') + '</div>';
    if (state.booksSaveOk === false || state.erpSaveOk === false) $('e-msg').innerHTML += '<div class="warn" data-k="save-fail">이 브라우저에 결과를 저장하지 못했습니다(용량) — 새로고침하면 다시 올려야 합니다.</div>';
    if (state.erpDropped && state.erpDropped.length) $('e-msg').innerHTML += '<div class="warn">저장 용량(1MB)을 넘어 오래된 달의 본부 조인표를 지웠습니다: ' + esc(state.erpDropped.map(function (x) { return x.month + ' ' + x.kind; }).join(', ')) + ' — 신고건수는 남아 있습니다.</div>';
    if (blanks.length) $('e-msg').innerHTML += '<div class="warn" data-k="blank-tpl">' + blanks.map(function (b) { return esc(b.name) + ' — <b>' + esc(C.BLANK_TEMPLATE_MSG) + '</b>'; }).join('<br>') + '</div>';
    if (state.example) $('e-msg').innerHTML = '<div class="note" data-k="example-note"><b>예제(가상 데이터)를 보는 중 — 저장하지 않습니다.</b> 내 파일을 올리면 예제는 닫히고 저장된 내 결과로 돌아갑니다.</div>' + $('e-msg').innerHTML;
    renderSrc();
    ['e-rule', 'e-view', 'e-ledger', 'e-mail'].forEach(function (id) { $(id).hidden = !ok; });
    if (ok) recompute();
  }
  function render() { renderBrokers(); renderCards(); renderChecks(); renderTable(); renderHq(); renderQuarters(); renderCompare(); renderCounts(); fillScope(); renderItems(); renderLedger(); renderMail(); }
  var REG = { 인천: '인천', 울산: '울산' }; REG[E.UNREGION] = '지역 미분류';
  function regLabel(c) { return REG[c] || c; }
  function renderBrokers() {
    var list = E.brokers(state.rows, state.rule), un = list.filter(function (b) { return b.campus === E.UNREGION; });
    var opt = function (b, v, t) { return '<option value="' + v + '"' + (b.campus === v ? ' selected' : '') + '>' + t + '</option>'; };
    $('e-brokers').innerHTML = (un.length ? '<div class="warn" data-k="unregion"><b>지역 미분류 부호 ' + un.length + '개</b> — ' + esc(un.map(function (b) { return b.broker + '(' + b.err + '건 · ' + b.score + '점)'; }).join(', ')) + '. 인천 · 울산 어느 쪽에도 넣지 않았습니다. 아래에서 지역을 골라 주세요(새 관세사일 수 있음).</div>' : '') +
      table(['관세사부호(신고인부호)', '지역', '신고번호 수', '오류점수'], list.map(function (b) {
        return '<tr' + (b.campus === E.UNREGION ? ' class="flag"' : '') + '><td>' + b.broker + '</td><td><select data-broker="' + b.broker + '" aria-label="' + b.broker + ' 지역">' + opt(b, '인천', '인천') + opt(b, '울산', '울산') + opt(b, E.UNREGION, '지역 미분류') + '</select></td><td class="num">' + n(b.err) + '</td><td class="num">' + n(b.score) + '</td></tr>';
      }), 'brokers') +
      '<p class="sub" data-k="rule-now">지금 표 — 울산 ' + esc(state.rule.ulsan.join(' · ') || '없음') + ' / 인천 ' + esc(state.rule.incheon.join(' · ') || '없음') + '</p>' +
      '<div class="ctrl"><label>부호 더하기 <input type="text" id="e-addcode" inputmode="numeric" maxlength="5" style="width:6em" placeholder="5자리"></label> <select id="e-addreg"><option value="인천">인천</option><option value="울산">울산</option></select> <button class="btn" type="button" id="e-addbtn">더하기</button> <button class="btn" type="button" id="e-rulereset">기본 표로</button></div>';
  }
  function setRegion(code, reg) {
    var r = state.rule; r.ulsan = r.ulsan.filter(function (x) { return x !== code; }); r.incheon = r.incheon.filter(function (x) { return x !== code; });
    if (reg === '울산') r.ulsan.push(code); else if (reg === '인천') r.incheon.push(code);
    state.rule = E.normRule(r); saveRule(); recompute();
  }
  function renderCards() {
    var S = state.summary, c = S.totalCum, over = S.quarters.filter(function (q) { return q.over; }), last = S.months[S.months.length - 1];
    // (v1.10.1) 전사 = 수출입 합계 — 분모는 수입 + 수출 현황목록 총신고건(한쪽이 없으면 「자료 없음」). 계산은 errscore.js summarize(total.종합)
    var T = S.total[last].종합;
    $('e-cards').innerHTML = '<div class="stats" data-k="corp">' + stat(last + '월 전사 오류점수', n(T.score)) + stat(last + '월 전사 총신고건', T.decl == null ? '자료 없음' : n(T.decl)) + stat(last + '월 전사 오류비율', rt(T.rate)) + '</div>' +
      '<p class="sub" data-k="corp-note">전사 = 수출입 합계(수입 + 수출 현황목록 총신고건). 수입 · 수출 중 한쪽 현황목록이 없는 달은 전사 오류비율을 「자료 없음」으로 둡니다.</p>' +
      '<div class="stats">' + stat(last + '월 인천 오류점수', n(S.total[last].인천.score)) + stat(last + '월 울산 오류점수', n(S.total[last].울산.score)) + stat('누적 인천', n(c.인천.score)) + stat('누적 울산', n(c.울산.score)) + stat('경계 이상 분기·범위', over.length) + '</div>';
  }
  function renderTable() {
    var S = state.summary, rows = [];
    S.months.slice().reverse().forEach(function (m) {
      [['수출입', S.total[m], null], ['수입', S.kinds.수입.months[m], '수입'], ['수출', S.kinds.수출.months[m], '수출']].forEach(function (p) {
        ['종합', '인천', '울산', E.UNREGION].forEach(function (cp) {
          var x = p[1][cp]; if (cp === E.UNREGION && !x.err) return;
          var src = cp === '인천' && p[2] && state.countSrc[p[2]][m] ? ' <small class="sub">(' + esc(state.countSrc[p[2]][m]) + ')</small>' : '';
          rows.push('<tr' + (cp === '종합' ? ' class="sum"' : cp === E.UNREGION ? ' class="flag"' : '') + '><td>' + m + '월 ' + p[0] + '</td><td>' + regLabel(cp) + '</td><td class="num">' + n(x.decl) + src + '</td><td class="num">' + n(x.err) + '</td><td class="num">' + n(x.scored) + '</td><td class="num">' + n(x.score) + '</td><td class="num">' + rt(x.rate) + '</td></tr>');
        });
      });
    });
    $('e-table').innerHTML = table(['월 · 구분', '지역', '신고건수', '오류건수(0점 포함)', '점수 발생 건수', '오류점수', '비율'], rows, 'err-months');
  }
  // (v1.11.0) 검증 — 인천 + 울산 = 현황목록(신고건수 · 오류점수), 계산과 요약 시트(팀 수기) 둘 다
  function renderChecks() {
    var c = state.checks, bad = c.filter(function (x) { return !x.ok; });
    $('e-checks').innerHTML = (c.length ? (bad.length ? '<div class="warn" data-k="checks-bad"><b>맞지 않는 곳 ' + bad.length + '개</b> — 인천 + 울산이 현황목록과 다릅니다. 팀 수기 자료(요약 시트)의 입력 오류이거나, 지역 미분류 부호 · 인천 건수 출처를 확인해 주세요.</div>' : '<div class="ok" data-k="checks-ok">모두 맞습니다 — 인천 + 울산 = 현황목록(신고건수 · 오류점수).</div>') + '<p class="sub">요약 시트(팀 수기)는 울산을 「총신고건 − 인천」으로 적어 합계 검사로는 인천 입력 오류가 잡히지 않습니다. 그래서 요약 시트의 인천 건수를 ERP 인천 건수(GN 제외 — 팀 수기 기준)와도 대조합니다. 분모로는 늘 GN 포함 값을 씁니다.</p>' + ('') : '<p class="sub">인천 신고건수가 없어 아직 검증하지 못했습니다.</p>') +
      (c.length ? table(['월 · 구분', '출처', '항목', '인천', '울산', '인천 + 울산', '기준(현황목록 · ERP)', '차이'], c.map(function (x) {
        return '<tr' + (x.ok ? '' : ' class="over"') + '><td>' + x.month + '월 ' + x.kind + '</td><td>' + esc(x.source) + '</td><td>' + esc(x.item) + '</td><td class="num">' + n(x.incheon) + '</td><td class="num">' + n(x.ulsan) + '</td><td class="num">' + n(x.sum) + '</td><td class="num">' + n(x.expect) + '</td><td class="num">' + (x.ok ? '0' : '<b>' + (x.diff > 0 ? '+' : '') + n(x.diff) + '</b>' + (x.unregion ? ' <small>(지역 미분류 ' + n(x.unregion) + '점)</small>' : '') + (x.ulsan < 0 ? ' <small>(울산이 음수 — 인천 건수가 총신고건보다 큼)</small>' : '')) + '</td></tr>';
      }), 'checks') : '');
  }
  // (v1.11.0) 본부별(PLANT) — 인천은 ERP 신고번호 조인, 울산은 전량 건기본부
  function renderHq() {
    var H = state.hq, rows = [];
    if (!H) { $('e-hq').innerHTML = ''; return; }
    state.summary.months.slice().reverse().forEach(function (m) {
      ['수입', '수출'].forEach(function (k) {
        (H.kinds[k][m] || []).forEach(function (x) {
          var nomatch = x.hq === E.HQ_NOMATCH, odd = nomatch || x.hq === E.HQ_NOPLANT || x.region === '지역 미분류';
          rows.push('<tr' + (odd ? ' class="flag"' : '') + '><td>' + m + '월 ' + k + '</td><td>' + esc(regLabel(x.region)) + '</td><td>' + esc(x.hq || '—') + '</td><td class="num">' + (nomatch ? '—' : n(x.decl)) + '</td><td class="num">' + n(x.err) + '</td><td class="num">' + n(x.scored) + '</td><td class="num">' + n(x.score) + '</td><td class="num">' + (nomatch || x.decl == null ? '—' : rt(x.rate)) + '</td></tr>');
        });
      });
    });
    var nf = H.notFound, hasErp = hasErpNow();
    $('e-hq').innerHTML = '<p class="sub" data-k="ulsan-note"><b>' + esc(H.ulsanNote) + '</b>. 인천은 ERP 실적과 신고번호로 조인해 PLANT → 본부(1000 · 1100 · 1111 건기본부, 1130 · 1131 엔진본부, 6000 부품센터). 신고건수는 ERP 본부별 신고번호 수(GN 포함).</p>' +
      '<p class="sub" data-k="hq-split">「Plant 없음」 = ERP 에 있으나 Plant 가 빈 건(분모에만), 「ERP 미매칭」 = 오류 건인데 신고번호를 ERP 에서 못 찾은 건(분자에만 — 비율은 「—」). 두 집단을 한 줄에 합치지 않습니다.</p>' +
      (hasErp ? '' : '<div class="warn">ERP 실적 파일이 없어 인천 신고건수 · 본부를 정할 수 없습니다 — 인천 건은 모두 ERP 미매칭입니다. ERP 수입실적 · 수출실적을 함께 올려 주세요.</div>') +
      (H.noJoin && H.noJoin.length ? '<div class="warn" data-k="hq-nojoin"><b>본부 조인 정보 없음 — ERP 재업로드 필요</b>: ' + esc(H.noJoin.map(function (x) { return x.month + '월 ' + x.kind; }).join(', ')) + ' (저장 용량 때문에 오래된 달의 신고번호 → 본부 표를 지웠습니다. 신고건수는 남아 있습니다.)</div>' : '') +
      (H.uncovered.length && hasErp ? '<p class="sub" data-k="hq-uncovered">ERP 실적이 없는 달 — 그 달 인천 건은 ERP 미매칭: ' + esc(H.uncovered.map(function (x) { return x.month + '월 ' + x.kind; }).join(', ')) + ' (그 달 ERP 실적을 함께 올리면 본부로 나뉩니다)</p>' : '') +
      (nf.length ? '<div class="warn" data-k="hq-notfound"><b>ERP 미매칭 신고번호 ' + nf.length + '개</b> — 늦은 계상이거나 ERP 조회 기간 밖일 수 있습니다: ' + esc(nf.map(function (x) { return x.month + '월 ' + x.kind + ' ' + x.declNo; }).join(', ')) + '</div>' : '') +
      table(['월 · 구분', '지역', '본부', '신고건수', '오류건수(0점 포함)', '점수 발생 건수', '오류점수', '비율'], rows, 'err-hq');
  }
  function renderQuarters() {
    var qs = state.summary.quarters, hot = qs.filter(function (q) { return q.over || q.near; });
    $('e-quarters').innerHTML = (hot.length ? '<div class="warn">경계 이상 ' + qs.filter(function (q) { return q.over; }).length + '곳 · 경계의 80% 이상 ' + qs.filter(function (q) { return q.near; }).length + '곳입니다.</div>' : '<div class="ok">모든 범위가 경계의 80% 아래입니다.</div>') +
      table(['범위', '캠퍼스', '분기', '오류점수', '판정'], qs.map(function (q) { return '<tr' + (q.over ? ' class="over"' : '') + '><td>' + q.kind + '</td><td>' + q.campus + '</td><td class="num">' + q.q + '분기</td><td class="num">' + n(q.score) + '</td><td class="num">' + (q.over ? '경계 이상' : q.near ? '80% 이상' : '') + '</td></tr>'; }), 'quarters');
  }
  function renderCompare() {
    var c = E.compare(state.books, state.summary);
    if (!c.rows.length) { $('e-compare').innerHTML = '<p class="sub">요약 시트가 없어 대조하지 않았습니다.</p>'; return; }
    var diff = c.rows.filter(function (x) { return x.scoreDiff !== 0 || x.errDiff !== 0; });
    $('e-compare').innerHTML = '<div class="' + (c.scoreDiffs.length ? 'warn' : 'ok') + '">' + c.rows.length + '칸 대조: 점수가 다른 칸 ' + c.scoreDiffs.length + ' · 건수만 다른 칸 ' + (diff.length - c.scoreDiffs.length) + '. 오류건수는 메일 규칙대로 신고번호 수로 셉니다.</div>' +
      (diff.length ? table(['구분 · 월', '캠퍼스', '계산 건수', '대장 건수', '계산 점수', '대장 점수', '점수 차이'], diff.map(function (x) { return '<tr' + (x.scoreDiff ? ' class="over"' : '') + '><td>' + x.kind + ' ' + x.month + '월</td><td>' + x.campus + '</td><td class="num">' + x.calcErr + '</td><td class="num">' + x.handErr + '</td><td class="num">' + n(x.calcScore) + '</td><td class="num">' + n(x.handScore) + '</td><td class="num">' + x.scoreDiff + '</td></tr>'; }), 'compare') : '');
  }
  function renderCounts() {
    $('e-counts').innerHTML = table(['구분', '월', '인천 신고건수', '출처'], [].concat.apply([], E.KINDS.map(function (k) { return state.summary.months.map(function (m) {
      var v = state.counts[k][m], src = state.countSrc[k][m] || '';
      return '<tr' + (src ? '' : ' class="flag"') + '><td>' + k + '</td><td>' + m + '월</td><td class="num">' + n(v) + '</td><td>' + esc(src || 'ERP 필요 — 그 달 ERP 실적을 함께 올려 주세요') + '</td></tr>'; }); })), 'counts') +
      '<p class="sub" data-k="summary-saved">' + (state.savedOk ? '요약을 저장했습니다(' + esc(E.localTime(state.saved.updatedAt)) + ' · ' + esc(E.SUMMARY_BASIS) + ') — 대시보드 「오류점수」 탭이 이 요약을 읽습니다.' : '<b>요약을 이 브라우저에 저장하지 못했습니다</b> — 대시보드 「오류점수」 탭에 보이지 않습니다.') + '</p>';
  }
  function fillScope() { var sel = $('e-scope'); if (sel.options.length) return; sel.innerHTML = ['전체', '수입', '수출', '인천', '울산'].map(function (s) { return '<option>' + s + '</option>'; }).join(''); }
  function fillMonths() {   // 파일을 바꾸면 달 목록도 바뀐다 — 없어진 달이 선택에 남지 않게 하되, 남아 있는 달은 그대로 둔다
    ['e-lmonth', 'e-mmonth'].forEach(function (id) { var el = $(id), keep = el.value; el.innerHTML = state.summary.months.slice().reverse().map(function (m) { return '<option value="' + m + '">' + m + '월</option>'; }).join(''); if (state.summary.months.indexOf(+keep) >= 0) el.value = keep; });
  }
  function renderItems() {
    var sc = $('e-scope').value, rows = state.rows.filter(function (r) { return sc === '전체' || r.kind === sc || r.campus === sc; });
    $('e-items').innerHTML = table(['항목명', '항목코드', '정정 줄', '신고번호 수', '오류점수', '비중'], E.topItems(rows, 15).map(function (t) { return '<tr><td>' + esc(t.item) + '</td><td>' + esc(t.code) + '</td><td class="num">' + n(t.n) + '</td><td class="num">' + n(t.err) + '</td><td class="num">' + n(t.score) + '</td><td class="num">' + pc(t.share) + '</td></tr>'; }), 'items');
  }
  // (v1.12.0) 인천 오류건 관리대장 — 자동: 구분 · 연번 · 사업부 · 신고번호 · 정정일자 · 오류점수 / 담당자 입력: DRAFT NO · 발생사유 · 귀책 · 관련부서 · 담당자
  function ledgerOf(month) { return E.ledgerRows(state.decls, state.notes, state.erpSum, { month: month }); }
  function inp(r, f, ph, w) { return '<input type="text" data-key="' + esc(r.key) + '" data-note="' + f + '" value="' + esc(r[f]) + '" placeholder="' + esc(ph || '') + '"' + (f === 'blame' ? ' list="e-blames"' : '') + ' style="width:' + (w || 8) + 'em" aria-label="' + esc(r.declNo + ' ' + f) + '">'; }
  function renderLedger() {
    var m = +$('e-lmonth').value, rows = ledgerOf(m), pg = E.ledgerProgress(rows, m);
    // 미입력 줄을 위로, 그 안에서는 점수 큰 순서(연번은 그대로)
    var view = rows.slice().sort(function (a, b) { return (b.missing - a.missing) || (b.score - a.score) || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.no - b.no); });
    var noErp = !hasErpNow();
    $('e-lprog').innerHTML = '<div class="' + (pg.missing ? 'warn' : 'ok') + '" data-k="ledger-progress"><b>' + esc(pg.text) + '</b>' + (pg.total ? ' · 입력 완료 ' + pg.done + '건' : '') + (noErp && pg.total ? ' · ERP 실적을 함께 올리면 사업부가 자동으로 채워집니다' : '') + '</div>';
    $('e-ltable').innerHTML = rows.length ? '<datalist id="e-blames"><option value="화주"><option value="관세사"></datalist>' + table(E.LEDGER_HEAD, view.map(function (r) {
      var st = r.score > 0 ? ' style="background:#fff4e5"' : ' style="color:var(--sub)"';
      var div = r.divAuto ? esc(r.div) : inp(r, 'div', r.divWhy || '미분류', 6);
      return '<tr data-k="ledger-row"' + st + (r.missing ? ' class="flag"' : '') + '><td>' + esc(r.kind) + '</td><td class="num">' + r.no + '</td><td>' + div + '</td><td>' + inp(r, 'draft', 'e-mail · SAP 문서번호', 13) + '</td><td>' + esc(r.declNo) + '</td><td>' + esc(r.date) + '</td><td class="num">' + (r.score > 0 ? '<b>' + n(r.score) + '</b>' : '0') + '</td>' +
        '<td><textarea data-key="' + esc(r.key) + '" data-note="reason" rows="2" style="width:22em;font:inherit" placeholder="' + esc(r.hint || '발생사유 및 정정내용') + '" aria-label="' + esc(r.declNo) + ' 발생사유">' + esc(r.reason) + '</textarea></td><td>' + inp(r, 'blame', '화주 · 관세사', 6) + '</td><td>' + inp(r, 'dept', '', 7) + '</td><td>' + inp(r, 'owner', '', 6) + '</td></tr>';
    }), 'ledger') : '<p class="sub">이 달은 인천에서 발생한 오류건이 없습니다.</p>';
  }
  // 입력할 때마다 바로 저장(입력값이 사라지지 않게) — 진행 상황은 칸을 떠날 때 다시 그림
  function onNote(e, redraw) {
    var k = e.target.dataset.key, f = e.target.dataset.note; if (!k || !f) return;
    (state.notes[k] = state.notes[k] || {})[f] = e.target.value;
    if (!saveNotes()) $('e-lprog').innerHTML = '<div class="warn"><b>입력값을 이 브라우저에 저장하지 못했습니다</b> — 「대장 엑셀 내보내기」로 지금 내용을 받아 두세요.</div>';
    else if (redraw) renderLedger();
  }
  function exportLedger() {
    var all = $('e-lscope').value === 'all', m = +$('e-lmonth').value, rows = ledgerOf(all ? null : m);
    var wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(E.ledgerAoa(rows));
    ws['!cols'] = [6, 5, 7, 24, 18, 12, 8, 50, 8, 12, 10].map(function (w) { return { wch: w }; });
    var yr = state.summary.year || '', tag = all ? '전체' : (yr ? yr + '-' : '') + (m < 10 ? '0' : '') + m;
    XLSX.utils.book_append_sheet(wb, ws, all ? '관리대장_전체' : '관리대장_' + m + '월');
    XLSX.writeFile(wb, '인천오류건관리대장_' + tag + '.xlsx');
  }
  function renderMail() {
    var m = +$('e-mmonth').value, d = E.mailDraft(state.summary, m, { top: E.topItems(state.rows.filter(function (r) { return r.month === m; }), 5) });
    $('e-msub').value = d.subject; $('e-mbody').value = d.body;
  }
  function readFile(f) { return new Promise(function (ok, no) { var rd = new FileReader(); rd.onerror = no; rd.onload = function (ev) { var wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' }); ok({ name: f.name, sheets: wb.SheetNames.map(function (n) { return { name: n, aoa: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) }; }) }); }; rd.readAsArrayBuffer(f); }); }

  $('e-file').addEventListener('change', function (e) { var fs = [].slice.call(e.target.files); if (!fs.length) return; Promise.all(fs.map(readFile)).then(setBooks).catch(function (er) { $('e-msg').innerHTML = '<div class="warn">파일을 읽지 못했습니다: ' + esc(er.message) + '</div>'; }); e.target.value = ''; });
  // (v2.7.0) 예제 = samples/ 의 실제 구조 파일(가상 데이터) — 유니패스 수입 · 수출 오류점수 + ERP 수입 · 수출 실적(신고번호가 서로 이어져 지역 · 본부 · 관리대장이 채워짐)
  // (v2.8.0) 오류점수 화면은 한 해씩 — 예제는 최근 해(2026) 유니패스 수입 · 수출 + ERP 실적(2025~2026). 저장하지 않는다.
  var EXAMPLES = ['2026_예제(가상)_수입오류.xlsx', '2026_예제(가상)_수출오류.xlsx', '2025-2026_예제(가상)_수입실적.xlsx', '2025-2026_예제(가상)_수출실적.xlsx'];
  function fetchRaw(n) { return fetch('samples/' + encodeURIComponent(n)).then(function (rs) { if (!rs.ok) throw new Error(n + ' — ' + rs.status); return rs.arrayBuffer(); }).then(function (buf) { var wb = XLSX.read(new Uint8Array(buf), { type: 'array' }); return { name: n, sheets: wb.SheetNames.map(function (s) { return { name: s, aoa: XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, raw: true, defval: '' }) }; }) }; }); }
  $('e-sample').addEventListener('click', function () { Promise.all(EXAMPLES.map(fetchRaw)).then(function (raw) { state.example = true; state.books = []; state.erpStore = null; state.erp = { 수입: null, 수출: null }; setBooks(raw, { example: true }); }).catch(function (er) { $('e-msg').innerHTML = '<div class="warn">예제 파일을 읽지 못했습니다: ' + esc(er.message) + ' — 사이트 주소(http)로 열어야 합니다.</div>'; }); });
  // 「비우기」 — 올린 파일과 그 요약(대시보드가 읽는 값)을 비운다. 관리대장 입력값은 지우지 않는다.
  $('e-clear').addEventListener('click', function () { state.example = false; state.books = []; state.erp = { 수입: null, 수출: null }; state.erpStore = null; state.erpSum = null; try { [E.SUMMARY_KEY, E.ERP_KEY, E.BOOKS_KEY].forEach(function (k) { localStorage.removeItem(k); }); } catch (e) { /* 지우지 못해도 화면은 비움 */ } renderSrc(); ['e-rule', 'e-view', 'e-ledger', 'e-mail'].forEach(function (id) { $(id).hidden = true; }); $('e-msg').innerHTML = ''; });
  $('e-brokers').addEventListener('change', function (e) { var b = e.target.dataset.broker; if (b) setRegion(b, e.target.value); });
  $('e-brokers').addEventListener('click', function (e) {
    if (e.target.id === 'e-addbtn') { var c = ($('e-addcode').value || '').replace(/\D/g, ''); if (c.length !== 5) { $('e-addcode').focus(); return; } setRegion(c, $('e-addreg').value); }
    else if (e.target.id === 'e-rulereset') { state.rule = E.normRule(null); saveRule(); recompute(); }
  });
  $('e-th').value = state.th;
  $('e-th').addEventListener('change', function () { var v = E.toNum(this.value); if (v == null || v <= 0) { this.value = state.th; return; } state.th = v; localStorage.setItem(LS.th, JSON.stringify(v)); recompute(); });
  $('e-scope').addEventListener('change', renderItems);
  $('e-lmonth').addEventListener('change', renderLedger);
  $('e-mmonth').addEventListener('change', renderMail);
  $('e-ltable').addEventListener('input', function (e) { onNote(e, false); });
  $('e-ltable').addEventListener('change', function (e) { onNote(e, true); });
  $('e-lxlsx').addEventListener('click', exportLedger);
  // 대장 입력값은 다른 「지우기」 · 「비우기」로 지워지지 않는다 — 여기서만, 한 번 더 확인
  $('e-lclear').addEventListener('click', function () {
    var n0 = Object.keys(state.notes).length; if (!n0) return;
    if (!window.confirm('관리대장에 입력한 내용 ' + n0 + '건을 이 브라우저에서 지웁니다. 되돌릴 수 없습니다.\n먼저 「대장 엑셀 내보내기」로 받아 두셨나요?\n\n[확인] 지우기 · [취소] 그대로 두기')) return;
    state.notes = {}; saveNotes(); renderLedger();
  });
  $('e-mcopy').addEventListener('click', function () { var b = this; (navigator.clipboard ? navigator.clipboard.writeText($('e-mbody').value) : Promise.resolve()).then(function () { b.textContent = '복사했습니다'; setTimeout(function () { b.textContent = '본문 복사'; }, 1200); }); });
  $('e-xlsx').addEventListener('click', function () { var wb = XLSX.utils.book_new(); E.exportBook({ summary: state.summary, rows: state.rows, decls: state.decls, notes: state.notes, ledger: ledgerOf(null) }).forEach(function (s) { XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.aoa), s.name); }); XLSX.writeFile(wb, '수출입오류점수_' + new Date().toISOString().slice(0, 10) + '.xlsx'); });
  // (v2.3.0) 열 때 저장값을 먼저 읽는다 — 유니패스 결과가 있으면 화면 전체, ERP 결과만 있으면 출처 줄만
  (function restoreSaved() {
    renderSrc();
    var bs = []; try { bs = E.booksUnpack(load(E.BOOKS_KEY, null)); } catch (e) { bs = []; }
    if (!bs.length) return;
    state.books = bs;
    $('e-msg').innerHTML = '<div class="ok" data-k="restored">저장된 결과를 되살렸습니다 — 유니패스 파일 ' + bs.length + '개(' + esc(bs.map(function (b) { return b.fileName; }).join(', ')) + ')' + (hasErp() ? ' · ERP 실적' : '') + '. 새 파일을 올리면 같은 파일 · 같은 달만 바뀝니다.</div>';
    ['e-rule', 'e-view', 'e-ledger', 'e-mail'].forEach(function (id) { $(id).hidden = false; });
    recompute();
  })();
  window.__err = { state: state };
  if (location.hash === '#example') $('e-sample').click();
})();
