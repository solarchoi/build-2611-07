/* 대시보드 화면 — 판정·계산은 customs.js 가 한다. 여기서는 파일을 읽고, 고른 열을 기억하고, 그린다. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var C = window.Customs, FR = window.FileRules;
  // (v1.10.0) files = 올린 파일 목록(이름 · 종류 · 기간 · 행 수) — 원본 행과 따로, 늘 저장한다(작다)
  var LS = { data: 'b2611-07.dash', unit: 'b2611-07.dash.unit', kinds: 'b2611-07.dash.kinds', settings: 'b2611-07.dash.settings', files: 'b2611-07.dash.files' };
  // (v1.7.0) 수출 설정(Plant → 본부 표 · GN 제외) — 이 브라우저에만 둔다. 값 정리는 customs.js(exportSettings).
  function loadSettings() { try { return C.exportSettings(JSON.parse(localStorage.getItem(LS.settings) || 'null')); } catch (e) { return C.exportSettings(null); } }
  function saveSettings(raw) { state.settings = C.exportSettings(raw); try { localStorage.setItem(LS.settings, JSON.stringify(raw)); } catch (e) { /* 기억 못 해도 이번 화면에는 반영 */ } }
  // 사람이 고른 종류 — { '머리글|머리글…': kind }. 같은 모양의 파일을 다음에 올리면 이 종류로 넣는다.
  function kindPrefs() { try { return JSON.parse(localStorage.getItem(LS.kinds) || '{}') || {}; } catch (e) { return {}; } }
  function setKindPref(headers, kind) { try { var p = kindPrefs(); p[headers.join('|')] = kind; localStorage.setItem(LS.kinds, JSON.stringify(p)); } catch (e) { /* 기억 못 해도 이번 화면에는 반영된다 */ } }
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  // (v1.5.0) sets[kind] = { files: [{ name, file, uploadedAt, headers, aoa(머리글 포함), offset, override, reason }], m: 합친 결과(build 가 붙임) }
  // 같은 종류 파일은 모두 더한다. 이름이 같은 파일은 그 파일만 바꾼다. 합치는 규칙은 customs.js(upsertFile · mergeFiles).
  // (v2.5.0) 금액 단위 — 원 · 백만원 · 천만원 · 억원. 예전 단위 저장값(뜻이 「올린 파일 단위」였음)은 한 번만 기본(억원)으로 바꾼다.
  function unitInit() { var v = null; try { if (localStorage.getItem(LS.unit + '.v') !== '2') { localStorage.setItem(LS.unit, C.UNIT_DEFAULT); localStorage.setItem(LS.unit + '.v', '2'); } v = localStorage.getItem(LS.unit); } catch (e) { v = null; } return C.normUnit(v); }
  var state = { sets: {}, pending: [], filter: {}, range: null, tab: 'trade', unit: unitInit(), open: {}, settings: null };
  state.settings = loadSettings();
  state.exfta = exftaLoad();   // (v2.4.0) 수출 FTA 분석본 결과(읽은 결과만 저장 — b2611-07.exfta.data)
  // (v1.10.0) 조회 모드: view = true 이면 sets 는 조회용 파일만(저장 안 함), saved 는 가려 둔 확정 데이터. held = FTA 파일(다음 단계 — 합계에 안 넣음)
  state.view = false; state.saved = null; state.held = []; state.lostFiles = [];
  state.base = function () { return state.view ? (state.saved || {}) : state.sets; };
  function openKey(k, f) { return k + '|' + C.fileKey(f); }
  function label(k) { return C.DATASETS[k].label; }

  function now() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function msg(html, cls) { $('d-msg').innerHTML = html ? '<div class="' + (cls || 'note') + '">' + html + '</div>' : ''; }

  // 파일 하나를 그 종류에 넣는다 → 안내 문구
  function putFile(k, item) {
    var s = state.sets[k] || (state.sets[k] = { files: [] });
    var r = C.upsertFile(s.files, item);
    s.files = r.files;
    var why = item.reason ? ' · 근거: ' + esc(item.reason) : '';
    return r.action === 'replaced'
      ? esc(item.file) + ' 파일을 새 것으로 바꿨습니다 — ' + esc(label(k)) + why
      : esc(item.file) + ' 파일을 더했습니다(이 종류 파일 ' + s.files.length + '개) — ' + esc(label(k)) + why;
  }
  // 이번에 넣은 파일이 낀 기간 겹침 → 경고 문구
  function overlapNotes(k, names) {
    var s = state.sets[k]; if (!s || !s.m) return [];
    return s.m.overlaps.filter(function (o) { return names[o.a] || names[o.b]; }).map(function (o) {
      return '<b>기간이 겹칩니다. 중복 집계일 수 있습니다</b> — ' + esc(label(k)) + ': ' + esc(o.a) + ' · ' + esc(o.b) + ' (' + C.monthLabel(o.from) + ' ~ ' + C.monthLabel(o.to) + ')';
    });
  }
  // 올린 파일 하나를 다른 종류로 옮긴다. 열 짝짓기는 새 종류 기준으로 처음부터 다시 한다.
  function changeKind(from, i, to) {
    var s = state.sets[from], f = s && s.files[i];
    if (!f || !C.DATASETS[to] || from === to) return false;
    var same = state.sets[to] && state.sets[to].files.filter(function (x) { return C.fileKey(x) === C.fileKey(f); })[0];
    if (same && !window.confirm('「' + label(to) + '」에 이름이 같은 파일 ' + same.file + ' 이(가) 있습니다. 이 파일로 바꿀까요?')) return false;
    s.files.splice(i, 1); if (!s.files.length) delete state.sets[from];
    f.override = {}; f.reason = '직접 고름';
    var text = putFile(to, f), names = {}; names[f.file] = 1;
    state.open[openKey(to, f)] = true;
    setKindPref(f.headers, to);
    var note = rebuild(true), ov = overlapNotes(to, names);
    msg(esc(f.file) + ' → ' + esc(label(to)) + '(으)로 옮겼습니다. ' + text + '. 같은 모양의 파일은 다음에도 이 종류로 넣습니다.' + (ov.length ? '<br>' + ov.join('<br>') : '') + note, ov.length || note ? 'warn' : 'ok');
    return true;
  }
  function dropFile(k, i) {
    var s = state.sets[k], f = s && s.files[i]; if (!f) return;
    s.files.splice(i, 1); if (!s.files.length) delete state.sets[k];
    delete state.open[openKey(k, f)];
    var note = rebuild(false);
    msg(esc(f.file) + ' 파일을 뺐습니다 — ' + esc(label(k)) + (state.sets[k] ? '(이 종류 파일 ' + state.sets[k].files.length + '개)' : '(이 종류 파일 없음)') + note, note ? 'warn' : 'ok');
  }

  /* ---------- 읽기 ---------- */
  function sheetsOf(wb) {
    return wb.SheetNames.map(function (n) {
      var aoa = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' });
      var hr = C.findHeaderRow(aoa);
      return { name: n, aoa: aoa.slice(hr), offset: hr };
    }).filter(function (s) { return s.aoa.length > 1; });
  }
  // 파일 묶음 → 종류별로 넣는다. 따로 올리든 함께 올리든 같은 종류는 모두 더한다(머리글이 달라도). 이름이 같은 파일은 그 파일만 바꾼다.
  // (v1.10.0) 파일 하나의 월 목록 — 파일 이름 기간이 있으면 그것, 없으면 지난번 계산한 데이터 기간
  function monthsOfFile(k, f) {
    if (f.meta && f.meta.period) return f.meta.period.months;
    var s = state.base()[k], i = s ? s.files.indexOf(f) : -1, p = i >= 0 && s.m && s.m.files[i] ? s.m.files[i].period : null;
    return p ? FR.monthsBetween(p.from, p.to) : [];
  }
  function rowsOfItem(item) { return (item.parts || [{ aoa: item.aoa }]).reduce(function (t, pt) { return t + Math.max(0, (pt.aoa || []).length - 1); }, 0); }
  function rowsOfOld(k, f) { var s = state.base()[k], i = s.files.indexOf(f), p = s.m && s.m.files[i]; return p && p.norm ? p.norm.records.length : rowsOfItem(f); }
  // (v1.10.0) 확정본: 같은 종류 · 겹치는 기간(또는 같은 이름) 파일이 있으면 「교체할까요?」 — 조용히 둘 다 더하지 않는다.
  //   → true(넣음) / false(사용자가 취소 — 새 파일을 올리지 않음)
  function placeConfirmed(k, item, sets) {
    var s = sets[k], months = item.meta && item.meta.period ? item.meta.period.months : null;
    var clash = !s ? [] : s.files.filter(function (f) {
      if (C.fileKey(f) === C.fileKey(item)) return true;
      if (!months) return false;
      var om = monthsOfFile(k, f); return om.some(function (m) { return months.indexOf(m) >= 0; });
    });
    if (clash.length) {
      var lines = clash.map(function (f) { return '  · ' + f.file + ' — 올린 시각 ' + (f.uploadedAt || '?') + ' · ' + C.fmtNum(rowsOfOld(k, f)) + '행' + (f.meta && f.meta.period ? ' · ' + f.meta.period.text : ''); });
      var ok = window.confirm('「' + item.file + '」(' + C.fmtNum(rowsOfItem(item)) + '행)과 기간이 겹치는 ' + label(k) + ' 파일이 있습니다.\n\n이전 파일:\n' + lines.join('\n') +
        '\n\n이전 파일을 교체할까요?\n[확인] 이전 파일을 빼고 새 파일로 교체  ·  [취소] 새 파일을 올리지 않음\n\n같은 월인데 행 수가 다르면 늦게 계상된 신고가 있다는 뜻입니다.');
      if (!ok) return false;
      s.files = s.files.filter(function (f) { return clash.indexOf(f) < 0; });
      item.replaced = clash.map(function (f) { return { file: f.file, uploadedAt: f.uploadedAt, rows: rowsOfOld(k, f) }; });
    }
    var t = sets[k] || (sets[k] = { files: [] }); t.files.push(item);
    return true;
  }
  // (v2.3.0) 확정본 ERP 수입 · 수출 실적 → 오류점수 화면이 쓰는 결과(인천 신고건수 · 본부 조인표). 실적 탭의 GN 제외 설정과 무관하게 GN 포함으로 센다.
  //   원본 행은 넣지 않는다. 같은 종류 · 같은 달만 바꾼다(규칙은 errscore.js). 조회 모드 · 예제는 넣지 않는다.
  function recordErp(items) {
    if (!items.length || !window.ErrScore) return '';
    var E = window.ErrScore, opts = Object.assign({}, state.settings, { excludeGN: false }), recs = { 수입: [], 수출: [] }, files = [];
    items.forEach(function (x) {
      var m = C.mergeFiles(x.kind, [x.item], opts); if (!m.ok) return;
      var k = x.kind === 'import' ? '수입' : '수출'; recs[k] = recs[k].concat(m.records);
      files.push({ name: x.item.file, kind: k, period: m.period ? m.period.from + '~' + m.period.to : null, rows: m.records.length });
    });
    if (!files.length) return '';
    var old = null; try { old = JSON.parse(localStorage.getItem(E.ERP_KEY) || 'null'); } catch (e) { old = null; }
    var t = E.erpStoreTrim(E.erpStoreMerge(old, E.erpStoreFrom(recs, { files: files, src: 'dashboard' })));
    try { localStorage.setItem(E.ERP_KEY, JSON.stringify(t.store)); } catch (e2) { return '<span data-k="erp-rec-fail">오류점수 화면용 ERP 결과를 저장하지 못했습니다(용량).</span>'; }
    return '<span data-k="erp-rec">오류점수 화면에도 인천 신고건수 · 본부로 기록했습니다(GN 포함 · ' + esc(files.map(function (x) { return x.name; }).join(', ')) + ') — 오류점수 화면에서 ERP 를 또 올리지 않아도 됩니다.</span>';
  }
  /* ---------- (v2.4.0) 수출 FTA(담당자 분석본) — 읽기 · 저장 · 세율표 적재. 계산은 C.readExportFta · C.exportFtaReport ---------- */
  function rawSheets(wb) { return wb.SheetNames.map(function (n) { return { name: n, aoa: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) }; }); }
  function exftaLoad() { try { return C.exftaUnpack(JSON.parse(localStorage.getItem(C.EXFTA_DATA_KEY) || 'null')); } catch (e) { return []; } }
  function exftaSave() { try { localStorage.setItem(C.EXFTA_DATA_KEY, JSON.stringify(C.exftaPack(state.exfta))); return true; } catch (e) { return false; } }
  function exRates() { try { return JSON.parse(localStorage.getItem(C.EXFTA_RATES_KEY) || 'null'); } catch (e) { return null; } }
  function addExportFta(f, info) {
    var r = C.readExportFta(rawSheets(f.wb), f.name, info.period && info.period.single ? info.period.single : null);
    r.uploadedAt = now();
    if (!r.ok) return { ok: false, note: '<span data-k="exfta-fail">' + esc(f.name) + ' — <b>수출 FTA: ' + esc(r.reason) + '</b>' + (r.pick ? ' 고른 시트 근거: ' + esc(r.pick.why) : '') + '</span>' };
    // 세율표 — 담당자가 채운 (협정 · HS · 국가 · 기본 · FTA) 를 쌓는다. 커버리지는 쌓기 전 기준.
    if (!state.loadingSample) {   // (v2.7.0) 예제(가상)의 세율은 세율표에 쌓지 않음
      var mg = C.exftaRatesMerge(exRates(), r); r.coverage = mg.coverage; r.rateConflicts = mg.conflicts.length;
      try { localStorage.setItem(C.EXFTA_RATES_KEY, JSON.stringify(mg.table)); } catch (e) { r.warnings.push('세율표를 저장하지 못했습니다(용량).'); }
    } else { r.coverage = null; r.rateConflicts = 0; }
    var mOf = function (x) { return x.months || [x.month]; }, rms = mOf(r);
    var old = state.exfta.filter(function (x) { return x.file === r.file || (x.hq === r.hq && mOf(x).some(function (m) { return rms.indexOf(m) >= 0; })); });
    state.exfta = state.exfta.filter(function (x) { return old.indexOf(x) < 0; }).concat([r]);
    var saved = state.loadingSample || state.example ? true : exftaSave(), ck = r.check;   // (v2.8.0) 예제는 저장 안 함
    renderSettings();
    return { ok: true, note: '<span data-k="exfta-ok">' + esc(f.name) + ' — 수출 FTA ' + esc(r.hq) + ' ' + esc(C.monthLabel(r.month)) + (old.length ? ' (이전 파일 ' + esc(old.map(function (x) { return x.file; }).join(', ')) + ' 을 교체)' : '') + ': 「' + esc(r.pick.sheet) + '」 ' + C.fmtNum(r.rows.length) + '행 · 판가 ' + eokU(ck ? ck.total.ours.amount : 0) + ' · 절감 ' + eokU(ck ? ck.total.ours.saving : r.rows.reduce(function (a, x) { return a + x.saving; }, 0)) + ' · ' +
      (ck ? (ck.ok ? '담당자 피벗과 일치' : '<b>담당자 피벗과 ' + ck.rows.filter(function (q) { return !q.ok; }).length + '개 협정이 다름</b>') : '피벗 없음') + (r.coverage ? ' · 세율표 새로 ' + C.fmtNum(r.coverage.added) + '건' : ' · 예제라 세율표에 넣지 않음') + (r.warnings.length ? ' · <b>' + esc(r.warnings.join(' / ')) + '</b>' : '') + (saved ? '' : ' · <b>이 브라우저에 저장하지 못했습니다</b>') + '</span>' };
  }
  function addFiles(list) {
    if (state.example && !state.loadingSample) endExample(true);   // (v2.8.0) 내 파일을 올리면 예제를 닫고 저장된 데이터 위에 올린다
    var notes = [], warn = false, names = {}, views = [], confirmedN = 0, erpItems = [];
    list.forEach(function (f) {
      var sheets = sheetsOf(f.wb);
      if (C.isBlankTemplate(rawSheets(f.wb))) { notes.push('<span data-k="blank-tpl">' + esc(f.name) + ' — <b>' + esc(C.BLANK_TEMPLATE_MSG) + '</b></span>'); warn = true; return; }   // (v2.8.0)
      if (!sheets.length) { notes.push(esc(f.name) + ' — 읽을 표가 없습니다.'); warn = true; return; }
      // (v1.8.0) 같은 모양의 시트는 모두 읽어 합친다(RAW1~RAW10 등). 집계표 · 열이 다른 시트는 건너뛰고 이름을 남긴다 — 고르는 규칙은 C.pickSheets
      var pk = C.pickSheets(sheets, f.name), use = pk.use, best = { s: use[0], d: pk.detect };
      var item = { name: f.name, file: f.name + (use.length === 1 && sheets.length > 1 ? ' · ' + best.s.name : ''), uploadedAt: now(), headers: C.uniqueHeaders(best.s.aoa[0]), aoa: best.s.aoa, offset: best.s.offset, override: {} };
      if (use.length > 1) item.parts = use.map(function (s) { return { sheet: s.name, aoa: s.aoa, offset: s.offset }; });
      if (pk.skipped.length) item.skippedSheets = pk.skipped;
      if (pk.promoted && pk.promoted.length) item.promotedSheets = pk.promoted;   // (v1.10.2) 집계표 이름이지만 열 구성으로 데이터로 읽은 시트
      // (v1.10.0) 파일 이름으로 종류 · 기간 · 확정본/조회용 · 월 귀속을 먼저 정한다(규칙은 filerules.js). 이름으로 못 정하면 내용 판별.
      var info = FR.describe(f.name, best.d);
      // (v2.0.0) 유니패스 오류점수 파일(이름에 「오류」 또는 시트 「귀책사유자별오류…」) — 오류점수 화면으로 보낸다(대시보드는 요약만 읽음)
      if (info.group === 'errscore' || FR.isErrorScoreFile(f.name, best.s.aoa[0], f.wb.SheetNames)) { notes.push('<span data-k="unipass"><b>' + esc(f.name) + ' — 유니패스 오류점수 파일입니다. 오류점수 화면으로 이동할까요?</b> 오류점수는 그 화면에서 계산하고, 대시보드 「오류점수」 탭은 그 결과를 읽어 보입니다. <a class="btn primary" href="errors.html">오류점수 화면으로</a></span>'); warn = true; return; }
      // (v2.4.0) 수출 FTA — 담당자 분석본(시트를 내용으로 고름). 수입 FTA 와 합치지 않는다.
      if (info.dataset === 'ftaExport' || (!info.dataset && C.isExportFtaBook(rawSheets(f.wb)))) { var xn = addExportFta(f, info); notes.push(xn.note); if (!xn.ok) warn = true; return; }
      if (info.group === 'fta' && !info.dataset) { state.held.push({ file: f.name, label: info.label, rows: rowsOfItem(item), uploadedAt: item.uploadedAt, warnings: info.warnings }); notes.push(esc(f.name) + ' — ' + esc(info.label) + ' 파일로 인식했습니다. FTA 집계는 다음 단계라 목록에만 올리고 합계에는 넣지 않습니다(물자대가 두 번 잡히지 않게).'); warn = true; return; }
      // 사람이 전에 같은 머리글의 파일 종류를 바꿔 준 적이 있으면 — 파일 이름으로 정하지 못한 경우에만 그 종류가 앞선다
      var byName = info.dataset && info.how.indexOf('파일 이름') === 0, pref = kindPrefs()[item.headers.join('|')];
      var kind = byName ? info.dataset : pref && C.DATASETS[pref] ? pref : best.d.kind;
      var reason = byName ? info.how : pref && C.DATASETS[pref] ? '전에 직접 고른 종류' : best.d.reason;
      item.meta = info;
      if (!kind) { state.pending.push(item); notes.push(esc(f.name) + ' — 어떤 자료인지 알아보지 못했습니다. 아래에서 종류를 골라 주세요.' + (C.skippedSheetNote(item.skippedSheets) ? ' ' + esc(C.skippedSheetNote(item.skippedSheets)) : '')); warn = true; return; }
      info.dataset = kind; item.reason = reason;
      info.warnings.forEach(function (w) { notes.push(esc(f.name) + ' — <b>' + esc(w) + '</b>'); warn = true; });
      if (info.mode === 'view' || state.loadingSample) { views.push({ kind: kind, item: item }); return; }   // (v2.8.0) 예제는 늘 조회용(저장 안 함)
      if (!placeConfirmed(kind, item, state.base())) { notes.push(esc(item.file) + ' — 올리지 않았습니다(이전 파일 그대로).'); warn = true; return; }
      confirmedN++;
      if ((kind === 'import' || kind === 'export') && !state.loadingSample) erpItems.push({ kind: kind, item: item });
      notes.push(esc(item.file) + (item.replaced ? ' — 이전 파일(' + esc(item.replaced.map(function (r) { return r.file + ' · ' + r.uploadedAt + ' · ' + C.fmtNum(r.rows) + '행'; }).join(', ')) + ')을 교체했습니다' : ' 파일을 더했습니다') + ' — ' + esc(label(kind)) + ' · ' + esc(info.modeWhy));
      names[kind] = names[kind] || {}; names[kind][item.file] = 1;
    });
    // 확정본을 올리면 조회 모드를 끝낸다(확정 데이터 화면으로). 조회용이 함께 있으면 그것만 조회 모드로 다시 연다.
    if (confirmedN && state.view && !state.example) endView(true);
    if (views.length) {
      if (!state.view) { state.saved = state.sets; state.sets = {}; state.view = true; }
      views.forEach(function (v) { putFile(v.kind, v.item); });
      if (!state.loadingSample) notes.push('<b>조회 모드</b> — ' + esc(views.map(function (v) { return v.item.file; }).join(', ')) + ' 은(는) 저장하지 않고 화면에만 보입니다. 저장된 확정 데이터는 그대로입니다.');
    }
    var note = rebuild(true);
    var en = recordErp(erpItems); if (en) notes.push(en);
    Object.keys(names).forEach(function (k) { overlapNotes(k, names[k]).forEach(function (t) { notes.push(t); warn = true; }); });
    msg(notes.join('<br>') + note, warn || state.pending.length || note ? 'warn' : 'ok');
  }
  // (v1.10.0) 조회 모드 끝내기 — 저장된 확정 데이터 화면으로 돌아간다(조회 데이터는 버림)
  function endView(silent) {
    if (!state.view) return;
    state.sets = state.saved || {}; state.saved = null; state.view = false; state.open = {};
    if (!silent) { var note = rebuild(true); msg('조회 모드를 끝냈습니다. 저장된 확정 데이터를 보입니다.' + note, note ? 'warn' : 'ok'); }
  }
  // (v1.10.0) 「이 결과를 저장」 — 누를 때만 조회 데이터를 확정 데이터에 넣는다(겹치면 교체할지 묻는다)
  function keepView() {
    if (!state.view) return;
    var views = state.sets, base = state.saved || {}, done = [], skip = [], keptErp = [];
    Object.keys(views).forEach(function (k) {
      views[k].files.forEach(function (f) {
        f.meta = f.meta || {}; f.meta.mode = 'confirmed'; f.meta.modeWhy = '조회 결과를 저장함(' + now() + ')'; f.meta.savedFromView = true;
        if (placeConfirmed(k, f, base)) { done.push(f.file); if (k === 'import' || k === 'export') keptErp.push({ kind: k, item: f }); } else skip.push(f.file);
      });
    });
    state.sets = base; state.saved = null; state.view = false;
    var note = rebuild(true), en = recordErp(keptErp); if (en) note += '<br>' + en;
    msg((done.length ? esc(done.join(', ')) + ' — 조회 결과를 저장했습니다.' : '') + (skip.length ? ' ' + esc(skip.join(', ')) + ' — 저장하지 않았습니다(이전 파일 그대로).' : '') + note, skip.length || note ? 'warn' : 'ok');
  }
  function readFiles(files) {
    var list = [], left = files.length;
    if (!left) return;
    Array.prototype.forEach.call(files, function (f) {
      var rd = new FileReader();
      rd.onload = function (e) {
        try { list.push({ name: f.name, wb: XLSX.read(new Uint8Array(e.target.result), { type: 'array' }) }); }
        catch (err) { msg('파일을 읽지 못했습니다: ' + esc(f.name) + ' — ' + esc(err.message), 'warn'); }
        if (--left === 0) addFiles(list);
      };
      rd.readAsArrayBuffer(f);
    });
  }
  // (v2.7.0) 예제 = samples/ 의 실제 구조 파일 9개(가상 데이터 · 2026년 9~10월). 실적 · FTA · 환급 · 결정문 7개는 탭으로,
  //   유니패스 오류점수 2개는 오류점수 화면과 같은 계산(errscore.summaryFrom)으로 요약을 만들어 오류점수 탭에. 신고번호가 이어져 지역 · 본부 · 관리대장도 채워짐.
  var EXAMPLES = { dash: ['2025-2026_예제(가상)_수입실적.xlsx', '2025-2026_예제(가상)_수출실적.xlsx', '2025-2026_예제(가상)_수입FTA.xlsx', '2025-2026_예제(가상)_수출FTA_건기.xlsx', '2025-2026_예제(가상)_수출FTA_엔진.xlsx', '2025-2026_예제(가상)_관세환급.xlsx', '2025-2026_예제(가상)_품목분류결정문.xlsx'], err: ['2025_예제(가상)_수입오류.xlsx', '2025_예제(가상)_수출오류.xlsx', '2026_예제(가상)_수입오류.xlsx', '2026_예제(가상)_수출오류.xlsx'] };
  function fetchBook(n) { return fetch('samples/' + encodeURIComponent(n)).then(function (r) { if (!r.ok) throw new Error(n + ' — ' + r.status); return r.arrayBuffer(); }).then(function (b) { return { name: n, wb: XLSX.read(new Uint8Array(b), { type: 'array' }) }; }); }
  // ERP 실적 예제 → 오류점수용 레코드(GN 포함 — 관세청 총신고건과 같은 기준)
  function erpRecordsOf(f, kind) {
    var sh = sheetsOf(f.wb), pk = C.pickSheets(sh, f.name), u = pk.use[0]; if (!u) return [];
    var m = C.mergeFiles(kind, [{ name: f.name, file: f.name, headers: C.uniqueHeaders(u.aoa[0]), aoa: u.aoa, offset: u.offset, override: {} }], Object.assign({}, state.settings, { excludeGN: false }));
    return m.ok ? m.records : [];
  }
  function sampleErrors(errFiles, dashFiles) {
    var E = window.ErrScore; if (!E) return '';
    var rule = E.normRule((function () { try { return JSON.parse(localStorage.getItem('build-2611-07.err.rule') || 'null'); } catch (e) { return null; } })());
    var books = errFiles.map(function (f) { return E.readWorkbook(rawSheets(f.wb), f.name, rule); });
    var fi = dashFiles.filter(function (f) { return /수입실적/.test(f.name); })[0], fe = dashFiles.filter(function (f) { return /수출실적/.test(f.name); })[0];
    var ri = fi ? erpRecordsOf(fi, 'import') : [], re = fe ? erpRecordsOf(fe, 'export') : [];
    var store = E.erpStoreFrom({ 수입: ri, 수출: re }, { files: [fi && { name: fi.name, kind: '수입', rows: ri.length }, fe && { name: fe.name, kind: '수출', rows: re.length }].filter(Boolean), src: 'example' });
    // (v2.8.0) 해마다 계산(오류점수는 월 1~12 로 묶어 한 해씩) · 저장하지 않고 이 화면에서만(state.sampleErr)
    var res = E.summaryFromYears(books, store, { rule: rule });
    state.sampleErr = res.saved;
    return ' 유니패스 오류점수 예제(' + res.years.join(' · ') + '년 수입 · 수출)는 오류점수 화면과 같은 계산으로 오류점수 탭에 넣었습니다.';
  }
  // (v2.8.0) 예제 닫기 — 저장된 내 데이터(실적 · 수출 FTA · 오류점수 요약)로 돌아간다
  function endExample(silent) {
    if (!state.example) return;
    state.example = false; state.sampleErr = null; state.exfta = state.exftaSaved || exftaLoad(); state.exftaSaved = null;
    endView(true);
    if (!silent) { var note = rebuild(true); msg('예제를 닫았습니다. 저장된 내 데이터를 보입니다.' + note, note ? 'warn' : 'ok'); }
  }
  function loadSample() {
    msg('예제 파일 11개를 읽는 중…', 'note');
    Promise.all(EXAMPLES.dash.concat(EXAMPLES.err).map(fetchBook)).then(function (list) {
      var dash = list.filter(function (f) { return EXAMPLES.dash.indexOf(f.name) >= 0; }), err = list.filter(function (f) { return EXAMPLES.err.indexOf(f.name) >= 0; });
      endExample(true);
      if (!state.view) { state.saved = state.sets; state.view = true; }
      state.sets = {}; state.pending = []; state.open = {}; state.held = [];
      state.example = true; state.exftaSaved = state.exfta; state.exfta = []; state.loadingSample = true;
      var en = sampleErrors(err, dash);
      addFiles(dash);
      state.loadingSample = false;
      rebuild(true);
      msg('<span data-k="sample-ok">예제 11종(가상 데이터 · 2025 ~ 2026)으로 결과 화면을 보여 드립니다 — <b>저장하지 않습니다.</b> 수입실적 · 수출실적 · 수입FTA · 수출FTA(건기 · 엔진) · 관세환급 · 품목분류 결정문은 각 탭에.' + esc(en) + ' 내 파일을 올리거나 「예제 닫기」를 누르면 저장된 내 데이터로 돌아갑니다. 예제 데이터는 실제 사내 데이터가 아닙니다.</span>', 'ok');
    }).catch(function (e) { state.loadingSample = false; msg('예제 파일을 읽지 못했습니다: ' + esc(e.message) + ' — 사이트 주소(http)로 열어야 합니다(파일을 바로 열면 읽지 못함).', 'warn'); });
  }

  /* ---------- 계산 묶기(엔진 호출) ---------- */
  function build(k) { var s = state.sets[k]; s.m = C.mergeFiles(k, s.files, state.settings); }
  function ready(k) { return state.sets[k] && state.sets[k].m && state.sets[k].m.ok ? state.sets[k] : null; }
  // 다시 계산하고 그린다. 기억하지 못했으면 그 알림 문구(HTML)를 돌려준다 — 부른 쪽이 안내 문구 뒤에 붙인다.
  // (v2.6.0) 실적 밖 자료의 달 — 수입 FTA(수리월 · 파일 이름 기간 밖 제외) · 수출 FTA(분석본 월) · 오류점수 요약(유니패스 시트 월)
  function extraPeriods() {
    var out = [], span = function (ms) { ms = ms.filter(Boolean).sort(); return ms.length ? { from: ms[0], to: ms[ms.length - 1] } : null; };
    var fs = ready('ftaImport'); if (fs) { var fp = {}; fs.files.forEach(function (f) { if (f.meta && f.meta.period) fp[f.file || f.name] = f.meta.period.months; }); out.push(span(C.ftaImportReport(fs.m.records, { filePeriods: fp }).months)); }
    out.push(span((state.exfta || []).filter(function (f) { return f.ok; }).map(function (f) { return f.month; })));
    var es = errSummary(); if (es && window.ErrScore) out.push(span(window.ErrScore.summaryMonthly(es).map(function (x) { return x.ym; })));
    return out.filter(Boolean);
  }
  function rangeText(rg) { if (!rg) return ''; return rg.from === rg.to ? C.monthLabel(rg.to) : C.monthLabel(rg.from) + ' ~ ' + C.monthLabel(rg.to); }
  function rebuild(resetRange) {
    Object.keys(state.sets).forEach(build);
    // (v2.1.0) 수입 FTA 는 탭 안에서 월을 따로 고른다 — 공통 조회 기간 · 본부/국가 조건에 섞지 않음
    var basePeriod = C.unionPeriod(C.KINDS.map(function (k) { return k !== 'ftaImport' && ready(k) ? ready(k).m.period : null; }));
    // (v2.6.0) 수입 FTA · 수출 FTA · 오류점수 탭도 상단 기간을 따른다 — 그 자료의 달도 고를 수 있게 합치되, 기본 기간은 실적이 있으면 실적 기준(v2.1.0: FTA 파일의 다른 달이 수입 탭 기준월을 바꾸지 않게)
    var period = C.unionPeriod([basePeriod].concat(extraPeriods()));
    state.period = period;
    if (period && (resetRange || !state.range || state.range.from < period.from || state.range.to > period.to)) state.range = C.defaultRange(basePeriod || period);
    if (!period) state.range = null;
    // (v1.6.0) 결정문 탭은 기간을 따로 — 기본 2026-01 ~ 자료 마지막 달(규칙은 customs.js)
    var rs = ready('ruling'), rper = rs ? C.rulingPeriod(rs.m.records) : null, rms = C.rulingMonths(rper);
    state.rperiod = rper;
    if (rper && (resetRange || !state.rrange || rms.indexOf(state.rrange.from) < 0 || rms.indexOf(state.rrange.to) < 0)) state.rrange = C.rulingDefaultRange(rper);
    if (!rper) state.rrange = null;
    var note = save();
    renderSets(); renderFilter(); renderTab();
    return note;
  }
  function save() {
    if (!$('d-remember').checked) return '';
    var keep = {};
    // (v1.10.0) 조회 모드의 파일은 절대 저장하지 않는다 — 가려 둔 확정 데이터(base)만
    var base = state.base(), list = [];
    Object.keys(base).forEach(function (k) {
      keep[k] = { files: base[k].files.map(function (f, i) {
        // (v1.8.0) 여러 시트면 parts 만 기억한다(aoa 는 첫 시트와 같아 비워 둔다 — 되읽을 때 채움)
        var o = { name: f.name, file: f.file, uploadedAt: f.uploadedAt, headers: f.headers, aoa: f.parts ? [] : f.aoa, offset: f.offset, override: f.override, reason: f.reason };
        if (f.parts) o.parts = f.parts;
        if (f.skippedSheets) o.skippedSheets = f.skippedSheets;
        if (f.promotedSheets) o.promotedSheets = f.promotedSheets;
        if (f.meta) o.meta = f.meta;
        var p = base[k].m && base[k].m.files[i];
        list.push({ file: f.file, kind: k, uploadedAt: f.uploadedAt, rows: p && p.norm ? p.norm.records.length : null, period: f.meta && f.meta.period ? f.meta.period.text : p && p.period ? p.period.from + '~' + p.period.to : null, rule: f.meta ? f.meta.rule : null });
        return o;
      }) };
    });
    // 파일 목록(작다)은 원본 행과 따로 늘 저장 — 원본이 커서 못 남겨도 무엇을 올렸는지는 남는다
    try { localStorage.setItem(LS.files, JSON.stringify({ v: 1, files: list })); } catch (e0) { /* 목록도 못 남기면 그대로 */ }
    try { localStorage.setItem(LS.data, JSON.stringify({ v: 2, sets: keep })); return ''; }
    catch (e) {
      // 남겨 두면 다음에 열 때 지금과 다른 옛 자료가 보인다 → 지운다
      try { localStorage.removeItem(LS.data); } catch (e2) { /* 지우지 못해도 화면은 계속 */ }
      return '<br><b>데이터가 커서 이 브라우저에 원본 행을 기억하지 못했습니다.</b> 파일 목록(이름 · 종류 · 기간 · 행 수)만 남겼습니다. 다음에 열 때 다시 올려 주세요.';
    }
  }
  function restore() {
    try {
      var raw0 = JSON.parse(localStorage.getItem(LS.data) || 'null');
      state.oldErrors = !!(raw0 && raw0.sets && raw0.sets.errors);   // (v2.0.0) 예전 오류점수 집계표 — 되읽지 않고 알림
      var j = C.migrateSaved(raw0);
      Object.keys(j.sets).forEach(function (k) { j.sets[k].files.forEach(function (f) { f.headers = C.uniqueHeaders(f.headers); }); state.sets[k] = j.sets[k]; });
    } catch (e) { state.sets = {}; }
    // (v1.10.0) 목록에는 있는데 원본 행이 없는 파일 = 용량 때문에 기억하지 못한 파일 → 다시 올려 달라고 알린다
    try {
      var fl = JSON.parse(localStorage.getItem(LS.files) || 'null'), have = {};
      Object.keys(state.sets).forEach(function (k) { state.sets[k].files.forEach(function (f) { have[k + '|' + f.file] = 1; }); });
      state.lostFiles = fl && Array.isArray(fl.files) ? fl.files.filter(function (x) { return x && x.file && C.DATASETS[x.kind] && !have[x.kind + '|' + x.file]; }) : [];
    } catch (e3) { state.lostFiles = []; }
    return Object.keys(state.sets).length > 0;
  }

  /* ---------- 올린 데이터 표 · 열 짝짓기 ---------- */
  var REASON = function (sc) { return sc === 'user' ? '직접 고름' : sc === 'user-none' ? '없음으로 고름' : sc === 1 ? '같은 이름' : sc >= 0.95 ? '같은 뜻 낱말' : sc ? '이름 일부 포함' : ''; };
  function example(f, h) { var c = f.headers.indexOf(h); for (var i = 1; c >= 0 && i < f.aoa.length && i <= 50; i++) { var v = f.aoa[i][c]; if (v != null && String(v).trim()) return String(v); } return ''; }
  function plabel(p) { return p ? C.monthLabel(p.from) + ' ~ ' + C.monthLabel(p.to) : '—'; }
  // (v1.10.0) 파일 하나의 판별 정보(종류 · 기간 · 확정본/조회용 · 월 귀속) · 경고 — 규칙은 filerules.js, 날짜 사정은 customs.js(fileDates)
  function fileInfo(k, f, p) {
    var mt = f.meta, d = p.dates || {}, w = [], info = [];
    if (!mt) return '';
    info.push('인식: ' + label(k) + ' (' + (mt.how || '내용') + ')');
    info.push('기간: ' + (mt.period ? mt.period.text + (mt.period.promoted ? '(한 달 전체)' : '') : p.period ? plabel(p.period) + ' (데이터)' : '—'));
    info.push(mt.mode === 'view' ? '조회용 — 저장 안 함' : '확정본');
    info.push('월 귀속: ' + mt.rule + ' ' + (mt.ruleText || ''));
    if (d.noDate) info.push('날짜 빈 행 ' + C.fmtNum(d.noDate) + '건은 ' + mt.forceMonth + '로 넣음');
    if (f.replaced) info.push('교체한 이전 파일: ' + f.replaced.map(function (r) { return r.file + '(' + r.uploadedAt + ' · ' + C.fmtNum(r.rows) + '행)'; }).join(', '));
    if (!mt.period && !p.period) w.push('기간을 판별하지 못함');
    if (!d.dateHeader) w.push('날짜 열을 찾지 못함' + (FR.DATE_COL[k] ? ' — 「' + FR.DATE_COL[k] + '」' : ''));
    if (d.dateBlank) w.push('월 미지정 행 ' + C.fmtNum(d.dateBlank) + '건 (날짜 빈칸 — 실적 합계에서 빠짐)');
    if (d.outside) w.push('파일명 기간을 벗어난 행 ' + C.fmtNum(d.outside) + '건' + (mt.forceMonth ? ' (파일 이름 월로 넣음)' : ''));
    (mt.warnings || []).forEach(function (x) { w.push(x); });
    return '<br><small class="sub" data-k="finfo">' + esc(info.join(' · ')) + '</small>' + w.map(function (x) { return ' <span class="tag bad-t" data-k="fwarn">' + esc(x) + '</span>'; }).join('');
  }
  // (v1.10.0) 조회 모드 띠 — 「조회 모드 · 기간 · 저장되지 않습니다」 + 보관 안내 + [이 결과를 저장] · [조회 모드 끝내기]
  function renderViewBar() {
    var bar = $('d-viewbar'), top = $('d-viewtop'); if (!bar) return;
    if (!state.view) { bar.hidden = true; bar.innerHTML = ''; if (top) { top.hidden = true; top.innerHTML = ''; } return; }
    if (state.example) {   // (v2.8.0) 예제 — 저장 안 함 · 닫으면 저장된 내 데이터
      var ex = '<b>예제(가상 데이터)를 보는 중 — 저장하지 않습니다.</b> 내 파일을 올리거나 「예제 닫기」를 누르면 저장된 내 데이터로 돌아갑니다.';
      bar.hidden = false; bar.innerHTML = '<div class="note viewbar" data-k="examplebar">' + ex + '<div class="btnrow"><button class="btn" type="button" data-example-end>예제 닫기</button></div></div>';
      if (top) { top.hidden = false; top.innerHTML = '<div class="note viewbar" data-k="exampletop">' + ex + ' <button class="x" type="button" data-example-end>예제 닫기</button></div>'; }
      return;
    }
    var lines = [], first = null;
    Object.keys(state.sets).forEach(function (k) {
      var s = state.sets[k]; s.files.forEach(function (f, i) {
        var p = s.m && s.m.files[i], d = p && p.dates || {}; first = first || f.meta;
        lines.push(FR.viewBanner(f.meta || {}, { from: d.from, to: d.to, rows: d.rows }) + ' — ' + f.file);
      });
    });
    bar.hidden = false;
    bar.innerHTML = '<div class="warn viewbar" data-k="viewbar"><b>' + esc(lines.join(' / ')) + '</b>' +
      '<p class="sub">' + esc(FR.keepHint(first)) + ' · ' + esc(FR.BASIS_TEXT) + '</p>' +
      '<p class="sub">같은 EXPORT 파일을 여러 번 받으면 Windows 가 「EXPORT-수입 (1).XLSX」처럼 괄호를 붙입니다. 보관할 파일은 표준 파일명(2026-10_수입실적.xlsx)으로 바꿔 올려 주세요.</p>' +
      '<div class="btnrow"><button class="btn primary" type="button" data-view-keep>이 결과를 저장</button><button class="btn" type="button" data-view-end>조회 모드 끝내기</button></div></div>';
    if (top) { top.hidden = false; top.innerHTML = '<div class="warn viewbar" data-k="viewtop"><b>' + esc(lines.join(' / ')) + '</b> <button class="x" type="button" data-view-keep>이 결과를 저장</button> <button class="x" type="button" data-view-end>조회 모드 끝내기</button></div>'; }
  }
  function renderSets() {
    var ks = C.KINDS.filter(function (k) { return state.sets[k]; });
    var h = '';
    renderViewBar();
    // (v1.10.0) 용량 때문에 원본 행을 기억하지 못한 파일 · FTA(다음 단계) 파일
    var lost = state.lostFiles.filter(function (x) { return !(state.base()[x.kind] && state.base()[x.kind].files.some(function (f) { return f.file === x.file; })); });
    if (lost.length) h += '<div class="warn" data-k="lost"><b>지난번 올린 파일 중 원본 행을 기억하지 못한 파일 ' + lost.length + '개</b> — 다시 올려 주세요: ' + esc(lost.map(function (x) { return x.file + (x.period ? '(' + x.period + ')' : '') + (x.rows != null ? ' ' + C.fmtNum(x.rows) + '행' : ''); }).join(', ')) + '</div>';
    if (state.held.length) h += '<div class="note" data-k="held"><b>FTA 파일 — 다음 단계에서 집계(합계에 넣지 않음)</b><ul>' + state.held.map(function (x, i) { return '<li>' + esc(x.file) + ' — ' + esc(x.label) + ' · ' + C.fmtNum(x.rows) + '행' + (x.warnings && x.warnings.length ? ' · <span class="tag bad-t">' + esc(x.warnings.join(' / ')) + '</span>' : '') + ' <button class="x" type="button" data-drop-held="' + i + '">빼기</button></li>'; }).join('') + '</ul></div>';
    if (state.pending.length) {
      h += '<div class="warn"><b>종류를 골라 주세요</b><ul>' + state.pending.map(function (p, i) {
        return '<li>' + esc(p.file) + ' — 열: ' + esc(p.headers.slice(0, 8).join(', ')) + ' <select data-pending="' + i + '"><option value="">종류 고르기</option>' +
          C.KINDS.map(function (k) { return '<option value="' + k + '">' + esc(label(k)) + '</option>'; }).join('') + '</select> <button class="x" data-drop-pending="' + i + '">빼기</button></li>';
      }).join('') + '</ul></div>';
    }
    if (ks.length) {
      h += '<div class="tablewrap" style="margin-top:12px"><table class="sets"><thead><tr><th>자료</th><th>파일</th><th>자료 기준일<br><small class="sub">(파일을 올린 날)</small></th><th>데이터 기간</th><th>읽은 줄</th><th>건너뛴 줄</th><th>열 확인</th></tr></thead><tbody>';
      ks.forEach(function (k) {
        var s = state.sets[k], m = s.m;
        s.files.forEach(function (f, i) {
          var p = m.files[i], n = p.norm, miss = p.res.missing, open = state.open[openKey(k, f)] || miss.length;
          var ov = m.overlaps.filter(function (o) { return o.a === p.file || o.b === p.file; });
          h += '<tr data-kind="' + k + '" data-file="' + i + '"' + (miss.length ? ' class="flag"' : '') + '><td><b>' + esc(label(k)) + '</b><br><small class="sub">' + esc(C.DATASETS[k].source) + ' · ' + esc(C.DATASETS[k].cycle) + (f.reason ? ' · 근거: ' + esc(f.reason) : '') + '</small>' +
            '<br><label class="sub"><small>종류 바꾸기</small> <select data-rekind="' + k + '" data-i="' + i + '" aria-label="' + esc(f.file) + ' 종류 바꾸기">' +
            C.KINDS.map(function (o) { return '<option value="' + o + '"' + (o === k ? ' selected' : '') + '>' + esc(label(o)) + '</option>'; }).join('') + '</select></label></td>' +
            '<td class="wrapcell">' + esc(f.file) +
            // (v1.8.0) 어느 시트를 몇 줄씩 읽었는지 · 건너뛴 시트
            (p.sheets ? '<br><small class="sub" data-k="sheets">시트 ' + p.sheets.length + '장 합침 — ' + esc(p.sheets.map(function (x) { return x.sheet + ' ' + C.fmtNum(x.n) + '줄'; }).join(' · ')) + '</small>' : '') +
            (p.skippedSheets && p.skippedSheets.length ? '<br><small class="sub" data-k="skipped-sheets">건너뛴 시트: ' + esc(p.skippedSheets.map(function (x) { return x.name + '(' + x.why + ')'; }).join(', ')) + '</small>' : '') +
            (f.promotedSheets && f.promotedSheets.length ? '<br><small class="sub" data-k="promoted-sheets">시트 ' + esc(f.promotedSheets.map(function (x) { return "'" + x + "'"; }).join(', ')) + ' 을(를) 열 구성으로 데이터로 읽었습니다(이름은 집계표처럼 보이지만 필요한 열이 있음)</small>' : '') +
            fileInfo(k, f, p) +
            '</td><td data-k="asof" title="올린 시각 ' + esc(f.uploadedAt) + '">' + esc(String(f.uploadedAt || '').slice(0, 10) || '—') + '</td><td>' + plabel(n && n.period) + '</td>' +
            '<td class="num">' + (n ? C.fmtNum(n.records.length) : '—') + '</td><td class="num">' + (n ? C.fmtNum(n.skipped.length) : '—') + '</td>' +
            '<td>' + (miss.length ? '<span class="tag bad-t">못 찾은 열 ' + miss.length + '</span>' : '<span class="tag ok-t">필수 열 모두 찾음</span>') +
            (ov.length ? ' <span class="tag bad-t" title="' + esc(ov.map(function (o) { return (o.a === p.file ? o.b : o.a) + ' (' + C.monthLabel(o.from) + ' ~ ' + C.monthLabel(o.to) + ')'; }).join(', ')) + '">기간 겹침 — 중복 집계일 수 있음</span>' : '') +
            (n && n.unknownCodes && n.unknownCodes.length ? ' <span class="tag bad-t" title="본부 번호표에 없는 번호 — 열 확인을 눌러 보세요">새 제품그룹 번호 ' + esc(n.unknownCodes.join('·')) + '</span>' : '') +
            // (v1.7.0) 수출 — 뺀 줄 · 확인할 줄
            // (v1.9.0) 수입(신고번호 열 있음) — 「제외 GN N줄 · 합계 행 N줄」을 늘 보인다
            (n && k === 'import' && p.res.map.declNo ? ' <span class="tag ah-t" data-k="imp-drop" title="실적에서 빼는 줄은 결제방법 GN(설정에서 끌 수 있음)과 맨 아래 신고번호가 빈 합계 행뿐입니다">' + (p.res.map.payment && state.settings.excludeGN !== false ? '제외 GN ' + C.fmtNum(n.excluded.n) + '줄' : 'GN 포함') + ' · 합계 행 ' + C.fmtNum(n.totalRows.n) + '줄</span>' :
            n && n.excluded && n.excluded.n ? ' <span class="tag ah-t" data-k="gn" title="결제방법 GN(샘플 등 무환거래) 줄은 수입 · 수출 실적에서 뺍니다(설정에서 끌 수 있음)">제외 GN ' + C.fmtNum(n.excluded.n) + '줄</span>' : '') +
            (n && n.mismatch && n.mismatch.n ? ' <span class="tag bad-t" data-k="mismatch" title="Monetary Transaction 이 N 인데 Payment 가 GN 이 아니거나 그 반대 — 입력 오류인지 확인(실적에서 빼는 기준은 Payment GN)">무환 · GN 불일치 ' + C.fmtNum(n.mismatch.n) + '줄</span>' : '') +
            (n && n.declBad && n.declBad.n ? ' <span class="tag ah-t" title="빈칸이거나 형식이 다른 신고번호 — 건수에서 빼고 금액은 더합니다">신고번호 확인 필요 ' + C.fmtNum(n.declBad.n) + '줄</span>' : '') +
            (n && n.unclassified && n.unclassified.n ? ' <span class="tag bad-t" title="Plant 번호표에 없는 값 · 빈칸 — 설정에서 표를 고치면 본부로 셉니다">' + esc(C.HQ_UNCLASSIFIED) + ' ' + C.fmtNum(n.unclassified.n) + '줄</span>' : '') +
            ' <button class="x" data-toggle="' + k + '" data-i="' + i + '">' + (open ? '접기' : '열 확인') + '</button>' +
            ' <button class="x" data-drop-file="' + k + '" data-i="' + i + '" aria-label="' + esc(f.file) + ' 빼기">이 파일 빼기</button></td></tr>';
          if (open) h += '<tr class="maprow"><td colspan="7">' + mapTable(k, i) + '</td></tr>';
        });
        // 종류별 합계 줄
        var bad = m.files.filter(function (p) { return !p.ok; }).length, part = [];
        Object.keys(m.partial).forEach(function (key) { var fd = C.DATASETS[k].fields.filter(function (x) { return x.key === key; })[0]; part.push((fd ? fd.label : key) + ' 열 없는 파일: ' + m.partial[key].join(', ')); });
        h += '<tr class="sum" data-kind-sum="' + k + '"><td><b>' + esc(label(k)) + ' 합계</b></td><td>파일 ' + s.files.length + '개</td><td></td><td>' + plabel(m.period) + '</td>' +
          '<td class="num">' + C.fmtNum(m.records.length) + '</td><td class="num">' + C.fmtNum(m.skipped.length) + '</td><td>' +
          (bad ? '<span class="tag bad-t">못 찾은 열이 있는 파일 ' + bad + '개 — 열을 고르거나 그 파일을 빼면 계산합니다</span>' : '<span class="tag ok-t">모두 더해 계산</span>') +
          (k === 'import' && m.map.declNo ? ' <span class="tag ah-t" data-k="imp-drop-sum">제외 GN ' + C.fmtNum(m.excluded) + '줄 · 합계 행 ' + C.fmtNum(m.totalRows) + '줄</span>' : m.excluded ? ' <span class="tag ah-t">제외 GN ' + C.fmtNum(m.excluded) + '줄</span>' : '') +
          (m.overlaps.length ? ' <span class="tag bad-t">기간이 겹칩니다. 중복 집계일 수 있습니다</span>' : '') +
          (part.length ? '<br><small class="sub">' + esc(part.join(' / ')) + '</small>' : '') + '</td></tr>';
      });
      h += '</tbody></table></div><p class="sub" style="margin-top:8px">같은 종류의 엑셀은 따로 올리든 함께 올리든 모두 더해 계산합니다(머리글이 달라도 파일마다 열을 짝지어 합칩니다). 이름이 같은 파일을 다시 올리면 더하지 않고 그 파일만 바꿉니다. 데이터 기간이 겹치는 파일은 중복 집계일 수 있어 알려 드립니다. 필요 없는 파일은 「이 파일 빼기」로 뺍니다.</p>' +
        '<p class="sub" data-k="basis-note" style="margin-top:4px">월 귀속: <b>' + esc(FR.BASIS_TEXT) + '</b>(수입 Declaration date desired 는 희망일이라 쓰지 않음). 파일 이름이 단일 월(2026-09_수입실적)이면 파일 전체를 그 월로, 범위 · 연(2026-01~10 · 2026)이면 행 날짜로 넣습니다.</p>' +
        '<p class="sub" data-k="erp-note" style="margin-top:4px">자료 기준일 = 파일을 올린 날입니다. <b>ERP 는 월 마감 뒤에도 신고가 더해지므로 같은 달 파일을 다시 올리면 숫자가 바뀔 수 있습니다.</b></p>';
    }
    $('d-sets').innerHTML = h;
    // (v2.3.0) 탭은 늘 보인다 — 자료가 없는 탭은 「자료가 없습니다 … 올려 주세요」 안내(빈 화면 · 숨김 대신)
    $('d-view').hidden = false;
    $('d-filter').hidden = !state.range;
  }
  function mapTable(k, i) {
    var f = state.sets[k].files[i], p = state.sets[k].m.files[i], res = p.res, n = p.norm;
    var h = (res.missing.length ? '<div class="warn" data-k="missing">이 열을 찾지 못했습니다: <b>' + esc(res.missing.join(', ')) + '</b>' + (C.skippedSheetNote(f.skippedSheets) ? '<br>' + esc(C.skippedSheetNote(f.skippedSheets)) + '<br>' : '. ') + '아래에서 엑셀의 어느 열인지 골라 주세요. 고르기 전에는 이 종류를 집계하지 않습니다.</div>' : '') +
      '<table class="map"><thead><tr><th>필요한 항목</th><th>엑셀 열</th><th>열 번호</th><th>근거</th><th>예시 값</th></tr></thead><tbody>';
    C.DATASETS[k].fields.forEach(function (fd) {
      var cur = res.map[fd.key] || '', col = cur ? f.headers.indexOf(cur) + 1 : 0;
      h += '<tr' + (fd.req && !cur ? ' class="flag"' : '') + '><td>' + esc(fd.label) + (fd.req ? ' <small class="req">필수</small>' : ' <small class="sub">선택</small>') + '</td>' +
        '<td><select data-map="' + k + '" data-i="' + i + '" data-f="' + fd.key + '"><option value="">(없음)</option>' + f.headers.map(function (hd) { return '<option' + (hd === cur ? ' selected' : '') + '>' + esc(hd) + '</option>'; }).join('') + '</select></td>' +
        '<td class="num" data-k="col">' + (col ? col + '번째' : '—') + '</td>' +
        '<td>' + esc(REASON(res.score[fd.key])) + '</td><td class="wrapcell">' + esc(cur ? example(f, cur) : '') + '</td></tr>';
    });
    h += '</tbody></table>';
    if (res.unused.length) h += '<p class="sub">쓰지 않은 열: ' + esc(res.unused.join(', ')) + '</p>';
    if (n && n.issues.length) h += '<div class="note"><b>읽으며 확인한 것</b><ul>' + n.issues.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
      (n.skipped.length ? '<p class="sub" style="margin:6px 0 0">건너뛴 줄: ' + n.skipped.slice(0, 8).map(function (x) { return x.row + '행(' + esc(x.reason) + ')'; }).join(', ') + (n.skipped.length > 8 ? ' 외' : '') + '</p>' : '') + '</div>';
    return h;
  }

  /* ---------- 거르기 ---------- */
  // 지금 탭의 조회 기간 — 결정문 탭은 따로(state.rrange)
  function isRulingRange() { return state.tab === 'ruling' && !!state.rrange; }
  function curRange() { return isRulingRange() ? state.rrange : state.range; }
  function renderFilter() {
    if (!state.range) return;
    var rul = isRulingRange(), cr = curRange();
    var ms = rul ? C.rulingMonths(state.rperiod) : C.monthsBetween(state.period.from, state.period.to);
    var opt = function (v, sel, lab) { return '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + esc(lab == null ? v : lab) + '</option>'; };
    $('f-from').innerHTML = ms.map(function (m) { return opt(m, cr.from, C.monthLabel(m)); }).join('');
    $('f-to').innerHTML = ms.map(function (m) { return opt(m, cr.to, C.monthLabel(m)); }).join('');
    var hqs = {}, cos = {};
    C.KINDS.forEach(function (k) { var s = k !== 'ftaImport' && ready(k); if (!s) return; C.valuesOf(s.m.records, 'hq').forEach(function (v) { hqs[v] = 1; }); if (C.hasField(k, 'country')) C.valuesOf(s.m.records, 'country').forEach(function (v) { cos[v] = 1; }); });
    $('f-hq').innerHTML = opt('', state.filter.hq || '', '전체') + Object.keys(hqs).sort().map(function (v) { return opt(v, state.filter.hq); }).join('');
    $('f-country').innerHTML = opt('', state.filter.country || '', '전체') + Object.keys(cos).sort().map(function (v) { return opt(v, state.filter.country); }).join('');
    $('f-unit').value = state.unit;
    if (rul) {
      $('f-note').innerHTML = '결정문 조회 기간 <b>' + C.monthLabel(cr.from) + ' ~ ' + C.monthLabel(cr.to) + '</b> · ' + esc(C.RULING_BASIS) +
        ' · 결정문 탭은 기간을 따로 가집니다(기본 ' + C.monthLabel(C.RULING_BASE_FROM) + '부터, 다른 탭 기간은 그대로) · 금액은 원화 원본을 고른 단위(' + esc(state.unit) + ')로 나눠 보입니다.';
      return;
    }
    var pr = C.prevRange(state.range);
    $('f-note').innerHTML = '조회 기간 <b>' + C.monthLabel(state.range.from) + ' ~ ' + C.monthLabel(state.range.to) + '</b> · 전년 동기 ' + C.monthLabel(pr.from) + ' ~ ' + C.monthLabel(pr.to) +
      (pr.overlap ? ' <span class="tag bad-t">12개월을 넘게 골라 전년 동기와 겹칩니다</span>' : '') + ' · 금액은 원화 원본을 고른 단위(' + esc(state.unit) + ')로 나눠 보입니다.';
  }
  function filtered(k) {
    var s = ready(k); if (!s) return null;
    var f = C.applyFilter(s.m.records, k, { hq: state.filter.hq, country: state.filter.country });
    return { recs: f.records, ignored: f.ignored, set: s };
  }

  /* ---------- 그림(SVG) ---------- */
  var COL = ['#154b6e', '#0b6e99', '#0a6045', '#b07a12', '#6b4fa0'], PREV = '#9fb2c4';
  function niceMax(v) { if (!(v > 0)) return 1; var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10)), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  function axisFmt(kind) { return kind === 'pct' ? function (v) { return C.fmtPct(v, 0); } : kind === 'count' ? function (v) { return C.fmtNum(v); } : function (v) { return v === 0 ? '0' : C.fmtUnitNum(v, state.unit); }; }   // (v2.5.0) 금액 축 = 고른 단위 숫자(제목에 단위)
  function legend(series, x0) { var x = x0; return series.map(function (s, i) { var t = '<rect x="' + x + '" y="8" width="11" height="11" rx="2" fill="' + s.color + '"/><text x="' + (x + 15) + '" y="18" class="lg">' + esc(s.name) + '</text>'; x += 30 + s.name.length * 12; return t; }).join(''); }
  function frame(title, svg) { return '<figure class="chart-box"><figcaption>' + esc(title) + '</figcaption>' + svg + '</figure>'; }
  // 월별 막대(묶음) 또는 선. type: 'bar' | 'line'
  function monthChart(title, months, series, type, fmtKind) {
    if (!fmtKind || fmtKind === 'money') title = UT(title);
    var W = 640, H = 250, L = 62, R = 12, T = 30, B = 30, iw = W - L - R, ih = H - T - B;
    var max = niceMax(Math.max.apply(null, [0].concat.apply([], series.map(function (s) { return s.values.filter(function (v) { return v != null; }); }))));
    // (v2.3.0) 비율 축 눈금 간격(max ÷ 4)이 1% 미만이면 소수 첫째 자리 — 정수로 반올림하면 「2% · 2% · 1%」처럼 같은 값이 겹친다
    var fmt = fmtKind === 'pct' && max / 4 < 0.01 ? function (v) { return C.fmtPct(v, 1); } : axisFmt(fmtKind), step = iw / Math.max(1, months.length), y = function (v) { return T + ih - (v / max) * ih; };
    var b = legend(series, L);
    for (var g = 0; g <= 4; g++) { var gv = max * g / 4; b += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(gv) + '" y2="' + y(gv) + '" class="grid"/><text x="' + (L - 6) + '" y="' + (y(gv) + 4) + '" class="ax" text-anchor="end">' + esc(fmt(gv)) + '</text>'; }
    var every = Math.ceil(months.length / 12);
    months.forEach(function (m, i) { if (i % every === 0) b += '<text x="' + (L + step * i + step / 2) + '" y="' + (H - 10) + '" class="ax" text-anchor="middle">' + esc(m.slice(2, 4) + '.' + m.slice(5, 7)) + '</text>'; });
    if (type === 'bar') {
      var bw = Math.max(2, (step * 0.72) / series.length);
      series.forEach(function (s, si) { s.values.forEach(function (v, i) { if (v == null || v <= 0) return; var x = L + step * i + step * 0.14 + bw * si; b += '<rect x="' + x.toFixed(1) + '" y="' + y(v).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (T + ih - y(v)).toFixed(1) + '" fill="' + s.color + '"><title>' + esc(C.monthLabel(months[i]) + ' ' + s.name + ' ' + s.fmt(v)) + '</title></rect>'; }); });
    } else {
      series.forEach(function (s) {
        var seg = [], segs = [];
        s.values.forEach(function (v, i) { if (v == null) { if (seg.length) segs.push(seg); seg = []; } else seg.push([L + step * i + step / 2, y(v), v, i]); });
        if (seg.length) segs.push(seg);
        var one = s.values.filter(function (v) { return v != null; }).length === 1;   // (v2.3.0) 점이 하나뿐 — 선 대신 점과 값 라벨
        segs.forEach(function (sg) { if (one) { b += '<text x="' + sg[0][0].toFixed(1) + '" y="' + (sg[0][1] - 9).toFixed(1) + '" class="ax val" text-anchor="middle" data-k="one-label">' + esc(s.fmt(sg[0][2])) + '</text>'; return; } b += '<polyline fill="none" stroke="' + s.color + '" stroke-width="2.4"' + (s.dash ? ' stroke-dasharray="6 4"' : '') + ' points="' + sg.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>'; });
        segs.forEach(function (sg) { sg.forEach(function (p) { b += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="' + s.color + '"><title>' + esc(C.monthLabel(months[p[3]]) + ' ' + s.name + ' ' + s.fmt(p[2])) + '</title></circle>'; }); });
      });
    }
    return frame(title, '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(title) + '">' + b + '</svg>');
  }
  // 가로 막대 — 상위 N
  // (v2.2.0) color 는 색 하나 또는 함수(줄 → 색). 본부로 묶으면 본부 고정색(C.hqColor) — 탭이 달라도 · 조건을 바꿔도 같은 본부는 같은 색
  function hqFill(r) { return C.hqColor(r.label); }
  function hbar(title, rows, fmt, color) {
    if (fmt === money) title = UT(title);
    var W = 640, rowH = 26, L = 170, R = 110, T = 8, H = T + rows.length * rowH + 8;
    var max = niceMax(Math.max.apply(null, [0].concat(rows.map(function (r) { return r.value || 0; }))));
    var b = '';
    rows.forEach(function (r, i) {
      var yy = T + i * rowH, w = r.value > 0 ? (r.value / max) * (W - L - R) : 0, lab = String(r.label);
      if (lab.length > 13) lab = lab.slice(0, 12) + '…';
      b += '<text x="' + (L - 8) + '" y="' + (yy + 17) + '" class="ax lab" text-anchor="end"><title>' + esc(r.label) + '</title>' + esc(lab) + '</text>' +
        '<rect x="' + L + '" y="' + (yy + 5) + '" width="' + w.toFixed(1) + '" height="16" rx="3" fill="' + (typeof color === 'function' ? color(r) : color || COL[0]) + '"/>' +
        '<text x="' + (L + w + 6).toFixed(1) + '" y="' + (yy + 17) + '" class="ax">' + esc(fmt(r.value)) + '</text>';
    });
    if (!rows.length) b = '<text x="20" y="24" class="ax">데이터 없음</text>';
    return frame(title, '<svg class="chart" viewBox="0 0 ' + W + ' ' + Math.max(H, 40) + '" role="img" aria-label="' + esc(title) + '">' + b + '</svg>');
  }

  /* ---------- 카드·표 ---------- */
  function money(v) { return C.fmtShort(v, state.unit); }
  function kpi(label, value, sub, how, key) {
    return '<div class="kpi"' + (key ? ' data-k="' + key + '"' : '') + '><span class="kpi-l">' + esc(label) + '</span><b class="kpi-v">' + esc(value) + '</b>' +
      (sub ? '<small>' + sub + '</small>' : '') + (how ? '<span class="kpi-how">' + esc(how) + '</span>' : '') + '</div>';
  }
  function empty(k) { return '<div class="kpi empty"><span class="kpi-l">' + esc(C.DATASETS[k].label) + '</span><b class="kpi-v">자료 없음</b><small>' + esc(C.DATASETS[k].source) + '를 올리면 보입니다' + (state.sets[k] ? ' — 못 찾은 열을 먼저 골라 주세요' : '') + '</small></div>'; }
  function ignoredNote(list) { return list && list.length ? '<p class="sub">이 자료에는 ' + esc(list.join('·')) + ' 열이 없어 ' + esc(list.join('·')) + ' 조건을 걸지 않았습니다.</p>' : ''; }
  function table(head, rows, foot, cls) {
    return '<div class="tablewrap"><table class="' + (cls || '') + '"><thead><tr>' + head.map(function (h, i) { return '<th' + (i ? ' class="num"' : '') + '>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr' + (r.cls ? ' class="' + r.cls + '"' : '') + '>' + r.cells.map(function (c, i) { return '<td' + (i ? ' class="num"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('') +
      (foot ? '<tr class="sum">' + foot.map(function (c, i) { return '<td' + (i ? ' class="num"' : '') + '>' + c + '</td>'; }).join('') + '</tr>' : '') + '</tbody></table></div>';
  }
  function n0(v) { return esc(C.fmtNum(v)); }   // 건수 등 — 그대로
  // (v2.5.0) 금액 칸 — 고른 단위로 나눈 숫자(머리글에 단위). 같은 화면의 카드 · 표 · 축이 모두 같은 단위.
  function m0(v) { return esc(C.fmtUnitNum(v, state.unit)); }
  function ms0(v) { return v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : '') + C.fmtUnitNum(v, state.unit); }
  function U(h) { return h + '(' + esc(state.unit) + ')'; }
  function UT(t) { return t + ' (단위: ' + state.unit + ')'; }
  function signCls(v) { return v == null ? '' : v < 0 ? ' class="neg"' : v > 0 ? ' class="pos"' : ''; }
  function sp(v, txt) { return '<span' + signCls(v) + '>' + esc(txt) + '</span>'; }

  // (v1.7.0) 두 탭 맨 위 「수출입 합계」 한 줄 — 계산은 C.tradeTotal
  function tradeTotalLine() {
    var fi = filtered('import'), fe = filtered('export'), t = C.tradeTotal(fi ? fi.recs : null, fe ? fe.recs : null, state.range);
    var parts = (fi ? '수입 물자대 ' + esc(money(t.importGoods)) + ' · ' + C.fmtNum(t.importN) + '건' : '수입 자료 없음') + ' + ' +
      (fe ? '수출금액 ' + esc(money(t.exportAmount)) + ' · ' + C.fmtNum(t.exportN) + '건' : '수출 자료 없음');
    return '<p class="trade-total-line" data-k="trade-total"><b>수출입 합계</b> <span class="tt-v">' + (t.both ? esc(money(t.amount)) + ' · ' + C.fmtNum(t.n) + '건' : '—') + '</span>' +
      ' <small>(' + parts + (t.both ? '' : ' — 두 자료가 모두 있어야 합계를 냅니다') + (fi && fi.set.m.map.declNo ? ' · 수입 · 수출 건수는 신고번호 기준' : ' · 수출 건수는 신고번호 기준') + ')</small></p>';
  }
  // (v1.9.0) 월별 물자대 · 관세 막대(왼쪽 축) + 관세부담율 선(오른쪽 축, %)
  function importChart(title, months, goods, duty, burden) {
    title = UT(title);
    var W = 640, H = 250, L = 62, R = 46, T = 30, B = 30, iw = W - L - R, ih = H - T - B;
    var maxA = niceMax(Math.max.apply(null, [0].concat(goods.concat(duty).filter(function (v) { return v != null; })))), maxP = niceMax(Math.max.apply(null, [0].concat(burden.filter(function (v) { return v != null; }))));
    var fmt = axisFmt('money'), step = iw / Math.max(1, months.length), ya = function (v) { return T + ih - (v / maxA) * ih; }, yp = function (v) { return T + ih - (v / maxP) * ih; };
    var b = legend([{ name: '물자대', color: COL[0] }, { name: '관세', color: COL[3] }, { name: '관세부담율', color: COL[4] }], L);
    for (var g = 0; g <= 4; g++) {
      b += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + ya(maxA * g / 4) + '" y2="' + ya(maxA * g / 4) + '" class="grid"/><text x="' + (L - 6) + '" y="' + (ya(maxA * g / 4) + 4) + '" class="ax" text-anchor="end">' + esc(fmt(maxA * g / 4)) + '</text>' +
        '<text x="' + (W - R + 6) + '" y="' + (yp(maxP * g / 4) + 4) + '" class="ax">' + esc(C.fmtPct(maxP * g / 4, 1)) + '</text>';
    }
    var every = Math.ceil(months.length / 12), bw = Math.max(2, step * 0.34), segs = [], seg = [];
    months.forEach(function (m, i) {
      var cx = L + step * i + step / 2;
      if (i % every === 0) b += '<text x="' + cx + '" y="' + (H - 10) + '" class="ax" text-anchor="middle">' + esc(m.slice(2, 4) + '.' + m.slice(5, 7)) + '</text>';
      [[goods[i], COL[0], '물자대', -bw], [duty[i], COL[3], '관세', 0]].forEach(function (x) {
        if (x[0] != null && x[0] > 0) b += '<rect x="' + (cx + x[3]).toFixed(1) + '" y="' + ya(x[0]).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (T + ih - ya(x[0])).toFixed(1) + '" fill="' + x[1] + '"><title>' + esc(C.monthLabel(m) + ' ' + x[2] + ' ' + money(x[0])) + '</title></rect>';
      });
      if (burden[i] == null) { if (seg.length) segs.push(seg); seg = []; } else seg.push([cx, yp(burden[i]), burden[i], m]);
    });
    if (seg.length) segs.push(seg);
    segs.forEach(function (sg) {
      b += '<polyline fill="none" stroke="' + COL[4] + '" stroke-width="2.4" points="' + sg.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
      sg.forEach(function (p) { b += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="' + COL[4] + '"><title>' + esc(C.monthLabel(p[3]) + ' 관세부담율 ' + C.fmtPct(p[2], 2)) + '</title></circle>'; });
    });
    return frame(title, '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(title) + '">' + b + '</svg>');
  }
  // 「수입 실적」 탭 — (v1.9.0) 계산은 C.importReport · C.importStats. 여기서는 그리기만 한다.
  function renderTrade() {
    $('sum-trade').innerHTML = tradeTotalLine();
    var fi = filtered('import');
    if (!fi) { $('kpi-trade').innerHTML = empty('import'); ['ch-trade', 'tb-trade-report', 'ch-trade-by', 'tb-trade'].forEach(function (id) { $(id).innerHTML = ''; }); return; }
    var m = fi.set.m, has = { payment: !!m.map.payment, declNo: !!m.map.declNo, supplier: !!m.map.supplier }, hasHs = !!m.map.hs;
    var bySel = $('by-trade'), hsOpt = bySel.querySelector('option[value="hs4"]');
    hsOpt.disabled = !hasHs; hsOpt.textContent = hasHs ? 'HS 4단위' : 'HS 4단위(HS 열 없음)';
    if (!hasHs && bySel.value === 'hs4') bySel.value = 'hq';
    var by = bySel.value, top = +$('top-trade').value, BYL = C.BY[by];
    var r = C.importReport(fi.recs, state.range, state.settings, has), s = C.importStats(fi.recs, state.range, by);
    var base = C.monthLabel(r.base), k = '', ch = '', tb = '', pct2 = function (v) { return esc(C.fmtPct(v, 2)); };
    var notes = ['<b>기준</b> ' + esc(r.basis), '전월 · 전년 동월 대비는 기준월 <b>' + base + '</b>(조회 기간의 마지막 달)'];
    if (has.declNo) notes.push('<span data-k="imp-drop">' + (state.settings.excludeGN === false && has.payment ? 'GN 포함(설정에서 껐습니다)' : '제외 GN ' + C.fmtNum(m.excluded) + '줄') + ' · 합계 행 ' + C.fmtNum(m.totalRows) + '줄(파일 전체)</span>');
    else if (has.payment) notes.push(state.settings.excludeGN === false ? '결제방법 GN(무환) 포함 — 설정에서 껐습니다' : '제외 GN ' + C.fmtNum(m.excluded) + '줄(파일 전체)');
    if (r.total.badN) notes.push('신고번호 확인 필요 ' + C.fmtNum(r.total.badN) + '줄 — 건수에서 빼고 금액은 더함');
    if (r.total.dutyExcl != null) notes.push('보세공장(B) 관세 ' + esc(money(r.total.dutyExcl)) + '는 관세 합계에서 뺐습니다');
    if (r.unclassified.rows) notes.push('<b>' + esc(C.HQ_UNCLASSIFIED) + ' ' + C.fmtNum(r.unclassified.n) + '건 · ' + esc(money(r.unclassified.goods)) + '</b>' + (r.unclassified.codes.length ? '(Plant ' + esc(r.unclassified.codes.join('·')) + ')' : '(Plant 빈칸)') + ' — 설정에서 Plant 표를 고치면 본부로 셉니다');
    k += '<p class="rul-basis" data-k="imp-basis">' + notes.join(' · ') + '</p>';
    function vsSub(v) {
      if (v.goods.prev == null && v.goods.rate == null && v.n.prev == null) return C.monthLabel(v.month) + ' 자료 없음';
      return base + ' vs ' + C.monthLabel(v.month) + ' · ' + sp(v.goods.diff, (v.goods.diff > 0 ? '+' : '') + money(v.goods.diff)) + ' · 건수 ' + esc(C.fmtSigned(v.n.diff)) + '건';
    }
    var per = C.monthLabel(state.range.from) + ' ~ ' + C.monthLabel(state.range.to);
    k += kpi('수입 물자대', money(r.total.goods), per, '합계' + (has.payment ? ' · ' + (state.settings.excludeGN === false ? 'GN 포함' : 'GN 제외') : ''), 'imp-goods') +
      kpi('관세', money(r.total.duty), has.declNo ? '보세공장(B) 관세 제외' : '', '합계(Tot.Duty Amt)', 'imp-duty') +
      kpi('관세부담율', C.fmtPct(r.total.burden, 2), '', '계산: 관세 ÷ 물자대', 'imp-burden') +
      kpi('수입 건수', C.fmtNum(r.total.n) + '건', has.declNo ? '신고번호 고유 개수' + (r.total.badN ? ' · 확인 필요 ' + r.total.badN + '줄 제외' : '') : '줄 수', has.declNo ? '같은 신고번호 여러 줄 = 1건' : '', 'imp-n') +
      kpi('전월 대비', C.fmtSignedPct(r.mom.goods.rate), vsSub(r.mom), '계산: (기준월 − 전월) ÷ 전월 · 물자대', 'imp-mom') +
      kpi('전년 동월 대비', C.fmtSignedPct(r.yoy.goods.rate), vsSub(r.yoy), '계산: (기준월 − 전년 같은 달) ÷ 전년 같은 달 · 물자대', 'imp-yoy');
    ch += importChart('월별 수입 물자대 · 관세 · 관세부담율', r.months, r.monthly.map(function (c) { return c.goods; }), r.monthly.map(function (c) { return c.duty; }), r.monthly.map(function (c) { return c.burden; }));
    if (r.suppliers) ch += hbar('공급지역(Supplier)별 물자대 상위 10', r.suppliers.map(function (c) { return { label: c.key, value: c.goods }; }), money, COL[0]);
    // 표 ① 본부 × 월
    var head = ['본부'];
    r.months.map(C.monthLabel).forEach(function (lab) { head.push(esc(lab) + '<br><small>건수</small>', esc(lab) + '<br><small>' + U('물자대') + '</small>', esc(lab) + '<br><small>' + U('관세') + '</small>', esc(lab) + '<br><small>부담율</small>'); });
    head.push('기간 합계<br><small>건수</small>', '기간 합계<br><small>' + U('물자대') + '</small>', '기간 합계<br><small>' + U('관세') + '</small>', '기간 합계<br><small>부담율</small>');
    var c4 = function (x) { return [n0(x.n), m0(x.goods), m0(x.duty), pct2(x.burden)]; };
    var rows = r.pivot.map(function (p) {
      var c = [esc(p.hq)]; p.months.forEach(function (x) { c = c.concat(c4(x)); });
      return { cls: p.unclassified ? 'uncl' : '', cells: c.concat(c4(p.total)) };
    });
    var foot = ['합계']; r.monthly.forEach(function (x) { foot = foot.concat(c4(x)); });
    tb += '<h3 class="tb-h">① 본부 × 월 — 건수 · 물자대 · 관세 · 관세부담율</h3><p class="sub">' + esc(r.basis) + ' · 본부 순서는 설정의 Plant 표 → 그 밖 → ' + esc(C.HQ_UNCLASSIFIED) + '. 본부별 건수를 더하면 합계보다 클 수 있습니다(한 신고번호가 여러 본부에 걸칠 때).</p>' + ignoredNote(fi.ignored) +
      table(head, rows, foot.concat(c4(r.total)), 'imp-pivot');
    // 표 ② 공급지역 상위 10
    tb += '<h3 class="tb-h">② 공급지역(Supplier) 상위 10 — 물자대 큰 순 · 비중</h3>' + (r.suppliers ?
      table(['공급지역', '건수', U('물자대'), '비중'], r.suppliers.concat(r.supplierRest ? [r.supplierRest] : []).map(function (c) { return { cls: c === r.supplierRest ? 'rest' : '', cells: [esc(c.key), n0(c.n), m0(c.goods), esc(C.fmtPct(c.share))] }; }),
        ['합계(' + r.supplierN + '곳)', n0(r.total.n), m0(r.total.goods), r.total.goods ? '100.0%' : '—'], 'imp-supplier') : '<p class="sub" data-k="no-supplier">이 자료에는 공급지역(Supplier) 열이 없습니다.</p>');
    // 표 ③ 신고 종류
    tb += '<h3 class="tb-h">③ 신고 종류별 — 신고번호 끝 글자(M 일반 수입 · B 보세공장 사용신고)</h3>' + (r.declTypes ?
      '<p class="sub">모두 실적(건수 · 물자대)에 넣습니다. 보세공장 사용신고(B)의 관세는 관세 합계에서 빼고 참고로만 보입니다.</p>' +
      table(['신고 종류', '건수', U('물자대'), U('관세'), U('관세 집계 제외(참고)')], r.declTypes.map(function (t) { return { cells: [esc(t.label), n0(t.n), m0(t.goods), t.dutyExcluded ? '<span class="sub">집계 제외</span>' : m0(t.duty), t.dutyExcluded ? m0(t.dutyExcl) : '—'] }; }),
        ['합계', n0(r.total.n), m0(r.total.goods), m0(r.total.duty), m0(r.total.dutyExcl)], 'imp-decltype') : '<p class="sub" data-k="no-decl">이 자료에는 신고번호 열이 없어 신고 종류를 나누지 않습니다.</p>');
    $('kpi-trade').innerHTML = k; $('ch-trade').innerHTML = ch; $('tb-trade-report').innerHTML = tb;
    // 묶음별 물자대 · 관세(v1.8.0 까지의 수입 표) — 그대로 아래에 둔다
    var t = C.topN(s.groups, top);
    $('ch-trade-by').innerHTML = hbar(BYL + '별 수입 물자대 상위 ' + top, t.rows.map(function (g) { return { label: g.key, value: g.goods }; }), money, by === 'hq' ? hqFill : COL[0]);
    $('tb-trade').innerHTML = '<h3 class="tb-h">수입 — ' + esc(BYL) + '별 물자대 · 관세 · 관세부담율</h3>' +
      table([esc(BYL), '건수', U('물자대'), U('관세'), '관세부담율'], t.rows.concat(t.rest ? [t.rest] : []).map(function (g) { return { cls: g === t.rest ? 'rest' : '', cells: [esc(g.key), n0(g.n), m0(g.goods), m0(g.duty), pct2(g.burden)] }; }),
        ['합계', n0(s.n), m0(s.goods), m0(s.duty), pct2(s.burden)], 'trade-imp');
  }
  // (v1.7.0) 월별 금액 막대 + 건수 선(오른쪽 축)
  function comboChart(title, months, amounts, counts) {
    title = UT(title);
    var W = 640, H = 250, L = 62, R = 46, T = 30, B = 30, iw = W - L - R, ih = H - T - B;
    var maxA = niceMax(Math.max.apply(null, [0].concat(amounts.filter(function (v) { return v != null; })))), maxN = niceMax(Math.max.apply(null, [0].concat(counts)));
    var fmt = axisFmt('money'), step = iw / Math.max(1, months.length), ya = function (v) { return T + ih - (v / maxA) * ih; }, yn = function (v) { return T + ih - (v / maxN) * ih; };
    var b = legend([{ name: '금액(FOB)', color: COL[2] }, { name: '건수', color: COL[3] }], L);
    for (var g = 0; g <= 4; g++) {
      b += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + ya(maxA * g / 4) + '" y2="' + ya(maxA * g / 4) + '" class="grid"/><text x="' + (L - 6) + '" y="' + (ya(maxA * g / 4) + 4) + '" class="ax" text-anchor="end">' + esc(fmt(maxA * g / 4)) + '</text>' +
        '<text x="' + (W - R + 6) + '" y="' + (yn(maxN * g / 4) + 4) + '" class="ax">' + esc(C.fmtNum(maxN * g / 4)) + '</text>';
    }
    var every = Math.ceil(months.length / 12), bw = Math.max(2, step * 0.6), pts = [];
    months.forEach(function (m, i) {
      var cx = L + step * i + step / 2;
      if (i % every === 0) b += '<text x="' + cx + '" y="' + (H - 10) + '" class="ax" text-anchor="middle">' + esc(m.slice(2, 4) + '.' + m.slice(5, 7)) + '</text>';
      var v = amounts[i]; if (v != null && v > 0) b += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + ya(v).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (T + ih - ya(v)).toFixed(1) + '" fill="' + COL[2] + '"><title>' + esc(C.monthLabel(m) + ' 금액 ' + money(v)) + '</title></rect>';
      pts.push([cx, yn(counts[i] || 0), counts[i] || 0, m]);
    });
    if (pts.length) {
      b += '<polyline fill="none" stroke="' + COL[3] + '" stroke-width="2.4" points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
      pts.forEach(function (p) { b += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="' + COL[3] + '"><title>' + esc(C.monthLabel(p[3]) + ' 건수 ' + C.fmtNum(p[2]) + '건') + '</title></circle>'; });
    }
    return frame(title, '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(title) + '">' + b + '</svg>');
  }
  // (v1.7.0) 「수출 실적」 탭 — 계산은 C.exportReport · C.exportStats. 여기서는 그리기만 한다.
  function renderExport() {
    $('sum-export').innerHTML = tradeTotalLine();
    var fe = filtered('export');
    if (!fe) { $('kpi-export').innerHTML = empty('export'); ['ch-export', 'tb-export-report', 'ch-export-by', 'tb-export'].forEach(function (id) { $(id).innerHTML = ''; }); return; }
    var m = fe.set.m, hasHs = !!m.map.hs, bySel = $('by-export'), hsOpt = bySel.querySelector('option[value="hs4"]');
    hsOpt.disabled = !hasHs; hsOpt.textContent = hasHs ? 'HS 4단위' : 'HS 4단위(HS 열 없음)';
    if (!hasHs && bySel.value === 'hs4') bySel.value = 'hq';
    var by = bySel.value, top = +$('top-export').value, BYL = C.BY[by];
    var r = C.exportReport(fe.recs, state.range, state.settings), e = C.exportStats(fe.recs, state.range, by);
    var base = C.monthLabel(r.base), k = '', ch = '', tb = '';
    var notes = ['<b>기준</b> ' + esc(r.basis), '전월 · 전년 동월 대비는 기준월 <b>' + base + '</b>(조회 기간의 마지막 달)'];
    if (m.excluded) notes.push('제외 GN ' + C.fmtNum(m.excluded) + '줄(파일 전체)');
    else if (state.settings.excludeGN === false) notes.push('설정에서 GN 제외를 껐습니다');
    if (r.total.badN) notes.push('신고번호 확인 필요 ' + C.fmtNum(r.total.badN) + '줄 — 건수에서 빼고 금액은 더함');
    if (r.unclassified.rows) notes.push('<b>' + esc(C.HQ_UNCLASSIFIED) + ' ' + C.fmtNum(r.unclassified.n) + '건 · ' + esc(money(r.unclassified.amount)) + '</b>' + (r.unclassified.codes.length ? '(Plant ' + esc(r.unclassified.codes.join('·')) + ')' : '(Plant 빈칸)') + ' — 설정에서 Plant 표를 고치면 본부로 셉니다');
    k += '<p class="rul-basis" data-k="exp-basis">' + notes.join(' · ') + '</p>';
    function vsSub(v, label) {
      if (v.amount.prev == null && v.amount.rate == null && v.n.prev == null) return C.monthLabel(v.month) + ' 자료 없음';
      return base + ' vs ' + C.monthLabel(v.month) + ' · ' + sp(v.amount.diff, (v.amount.diff > 0 ? '+' : '') + money(v.amount.diff)) + ' · 건수 ' + esc(C.fmtSigned(v.n.diff)) + '건';
    }
    k += kpi('수출금액(FOB 원화)', money(r.total.amount), C.monthLabel(state.range.from) + ' ~ ' + C.monthLabel(state.range.to), '합계 · ' + (state.settings.excludeGN === false ? 'GN 포함' : 'GN 제외'), 'exp-amount') +
      kpi('수출 건수', C.fmtNum(r.total.n) + '건', '신고번호 고유 개수' + (r.total.badN ? ' · 확인 필요 ' + r.total.badN + '줄 제외' : ''), '같은 신고번호 여러 줄 = 1건', 'exp-n') +
      kpi('전월 대비', C.fmtSignedPct(r.mom.amount.rate), vsSub(r.mom), '계산: (기준월 − 전월) ÷ 전월', 'exp-mom') +
      kpi('전년 동월 대비', C.fmtSignedPct(r.yoy.amount.rate), vsSub(r.yoy), '계산: (기준월 − 전년 같은 달) ÷ 전년 같은 달', 'exp-yoy');
    ch += comboChart('월별 수출금액 · 건수', r.months, r.monthly.map(function (c) { return c.amount; }), r.monthly.map(function (c) { return c.n; }));
    ch += hbar('국가별 수출금액 상위 10', r.countries.map(function (c) { return { label: c.key, value: c.amount }; }), money, COL[2]);
    // 표 ① 본부 × 월(월말 보고 모양)
    var head = ['본부'], mh = r.months.map(C.monthLabel);
    mh.forEach(function (lab) { head.push(esc(lab) + '<br><small>건수</small>', esc(lab) + '<br><small>' + U('FOB') + '</small>'); });
    head.push('기간 합계<br><small>건수</small>', '기간 합계<br><small>' + U('FOB') + '</small>', '전월 대비<br><small>' + base + ' FOB</small>');
    var rows = r.pivot.map(function (p) {
      var c = [esc(p.hq)];
      p.months.forEach(function (x) { c.push(n0(x.n), m0(x.amount)); });
      c.push(n0(p.total.n), m0(p.total.amount), sp(p.mom.amount.rate, C.fmtSignedPct(p.mom.amount.rate)));
      return { cls: p.unclassified ? 'uncl' : '', cells: c };
    });
    var foot = ['합계']; r.monthly.forEach(function (x) { foot.push(n0(x.n), m0(x.amount)); });
    foot.push(n0(r.total.n), m0(r.total.amount), sp(r.mom.amount.rate, C.fmtSignedPct(r.mom.amount.rate)));
    tb += '<h3 class="tb-h">① 본부 × 월 — 건수 · FOB(' + esc(state.unit) + ')</h3><p class="sub">' + esc(r.basis) + ' · 본부 순서는 설정의 Plant 표 → 그 밖 → ' + esc(C.HQ_UNCLASSIFIED) + '. 본부별 건수를 더하면 합계보다 클 수 있습니다(한 신고번호가 여러 본부에 걸칠 때).</p>' + ignoredNote(fe.ignored) +
      table(head, rows, foot, 'exp-pivot');
    // 표 ② 국가 상위 10
    tb += '<h3 class="tb-h">② 국가(Destination) 상위 10 — 금액 큰 순 · 비중</h3>' +
      table(['국가', '건수', U('FOB'), '비중'], r.countries.concat(r.countryRest ? [r.countryRest] : []).map(function (c) { return { cls: c === r.countryRest ? 'rest' : '', cells: [esc(c.key), n0(c.n), m0(c.amount), esc(C.fmtPct(c.share))] }; }),
        ['합계(' + r.countryN + '개국)', n0(r.total.n), m0(r.total.amount), r.total.amount ? '100.0%' : '—'], 'exp-country');
    $('kpi-export').innerHTML = k; $('ch-export').innerHTML = ch; $('tb-export-report').innerHTML = tb;
    // 묶음별 전년 동기 대비(v1.6.0 까지의 수출 표) — 그대로 아래에 둔다
    var months = C.monthsBetween(state.range.from, state.range.to), te = C.topN(e.groups, top), cb = '';
    cb += monthChart('월별 수출금액 — 올해와 전년 동기', months, [{ name: '올해', color: COL[2], values: e.monthly.map(function (x) { return x.amount; }), fmt: money }, { name: '전년 동기', color: PREV, dash: true, values: e.monthly.map(function (x) { return x.prev; }), fmt: money }], 'line');
    cb += hbar(BYL + '별 수출금액 상위 ' + top, te.rows.map(function (g) { return { label: g.key, value: g.amount }; }), money, by === 'hq' ? hqFill : COL[2]);
    $('ch-export-by').innerHTML = cb;
    $('tb-export').innerHTML = '<h3 class="tb-h">' + esc(BYL) + '별 수출금액 전년 동기 대비</h3>' + (e.hasPrev ? '' : '<p class="sub">전년 동기 자료가 없습니다.</p>') +
      table([esc(BYL), '건수', U('수출금액'), U('전년 동기'), U('증감'), '증감률'], te.rows.concat(te.rest ? [te.rest] : []).map(function (g) {
        return { cls: g === te.rest ? 'rest' : '', cells: [esc(g.key), n0(g.n), m0(g.amount), m0(g.prev), sp(g.diff, ms0(g.diff)), sp(g.rate, C.fmtSignedPct(g.rate))] };
      }), ['합계', n0(e.n), m0(e.amount), m0(e.prev), sp(e.diff, ms0(e.diff)), sp(e.rate, C.fmtSignedPct(e.rate))], 'trade-exp');
  }
  // (v1.7.0) 설정 — Plant → 본부 표 · GN 제외. 값 정리는 C.exportSettings, 저장은 이 브라우저.
  function renderSettings() {
    var st = state.settings;
    $('d-settings-body').innerHTML = '<label class="chk"><input type="checkbox" id="set-gn"' + (st.excludeGN ? ' checked' : '') + '> 결제방법 <b>' + esc(C.EXPORT_EXCLUDE_PAYMENT) + '</b>(샘플 등 무환거래) 줄을 <b>수입 · 수출</b> 실적에서 빼기(기본 켜짐) — 수입은 「Payment method」, 수출은 「Payment」 열</label>' +
      '<p class="sub" style="margin:8px 0 4px">Plant 번호 → 본부(수입 · 수출 같은 표). 1131(엔진본부)은 표를 고쳐도 늘 들어갑니다. 표에 없는 번호 · 빈칸은 「' + esc(C.HQ_UNCLASSIFIED) + '」로 따로 셉니다. 글자로 적힌 본부 이름은 그대로 둡니다.</p>' +
      '<div class="tablewrap"><table class="set-plant"><thead><tr><th>Plant 번호</th><th>본부</th><th></th></tr></thead><tbody>' +
      st.rows.map(function (r, i) { return '<tr><td><input type="text" data-set="code" value="' + esc(r.code) + '" aria-label="Plant 번호 ' + (i + 1) + '"></td><td><input type="text" data-set="hq" value="' + esc(r.hq) + '" aria-label="본부 ' + (i + 1) + '"></td><td><button class="x" type="button" data-set-del="' + i + '">빼기</button></td></tr>'; }).join('') +
      '<tr class="new"><td><input type="text" data-set-new="code" placeholder="새 번호"></td><td><input type="text" data-set-new="hq" placeholder="본부 이름"></td><td><button class="x" type="button" data-set-add>더하기</button></td></tr>' +
      '</tbody></table></div><div class="btnrow" style="margin-top:8px"><button class="btn" type="button" data-set-reset>기본 표로 되돌리기</button>' +
      '<span class="sub">' + (st.custom ? '고친 표를 쓰는 중 · ' : '기본 표 · ') + '이 브라우저에만 저장됩니다(다른 PC · 다른 사람은 기본 표)</span></div>' +
      // (v2.1.0) 수입 FTA 미적용 사유 코드 이름(FTA N/A Code 01 ~ 07)
      '<p class="sub" style="margin:12px 0 4px">수입 FTA — 미적용 사유 코드(FTA N/A Code) 이름. 비우면 기본 이름입니다.</p><div class="tablewrap"><table class="set-na"><thead><tr><th>코드</th><th>이름</th></tr></thead><tbody>' +
      Object.keys(st.ftaNa).sort().map(function (k) { return '<tr><td>' + esc(k) + '</td><td><input type="text" data-set-na="' + esc(k) + '" value="' + esc(st.ftaNa[k]) + '" aria-label="미적용 사유 ' + esc(k) + ' 이름"></td></tr>'; }).join('') + '</tbody></table></div>';
    $('d-settings-body').insertAdjacentHTML('beforeend', exRatesHtml());
  }
  // (v2.4.0) 수출 FTA 세율표(분석본에서 모은 세율) — 쌓이면 「수출FTA 대표세율표」가 된다
  function exRatesHtml() {
    var list = C.exftaRatesList(exRates()), bad = list.filter(function (r) { return r.conflict; }).length;
    return '<h4 style="margin:16px 0 4px">수출 FTA 세율표 — 담당자 분석본에서 모은 세율</h4><p class="sub" data-k="exrates-sum">' + C.fmtNum(list.length) + '가지(협정 · HS · 국가)' + (bad ? ' · <b class="diff">세율 불일치 ' + bad + '건</b>(같은 협정 · HS · 국가인데 달마다 또는 같은 달 안에서 세율이 다름 — 연도 바뀜이거나 입력 오류)' : '') + '. 분석본을 올릴 때마다 쌓입니다.</p>' +
      (list.length ? '<div class="tablewrap" style="max-height:320px;overflow:auto"><table class="exrates"><thead><tr><th>대상FTA</th><th>HS Code</th><th>국가</th><th class="num">기본관세율</th><th class="num">FTA관세율</th><th>달</th><th>불일치</th></tr></thead><tbody>' + list.map(function (r) { return '<tr' + (r.conflict ? ' class="conflict"' : '') + '><td>' + esc(r.fta) + '</td><td>' + esc(r.hs) + '</td><td>' + esc(r.country) + '</td><td class="num">' + r.base + '%</td><td class="num">' + r.rate + '%</td><td>' + esc(r.months.join(', ')) + '</td><td>' + (r.conflict ? '<span class="diff">' + esc(r.why) + '</span>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '') +
      '<div class="btnrow" style="margin-top:8px"><button class="btn" type="button" data-exrates-xlsx' + (list.length ? '' : ' disabled') + '>세율표 엑셀 내보내기</button></div>';
  }
  function exportExRates() {
    var list = C.exftaRatesList(exRates()); if (!list.length) return;
    var aoa = [['대상FTA', 'HS Code', '국가', 'FTA기본관세율(%)', '적용년도FTA관세율(%)', '본 달', '세율 불일치']].concat(list.map(function (r) { return [r.fta, r.hs, r.country, r.base, r.rate, r.months.join(', '), r.conflict ? r.why : '']; }));
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), '수출FTA세율표'); XLSX.writeFile(wb, '수출FTA_세율표_' + todayStr() + '.xlsx');
  }
  function settingsFromForm(extra) {
    var rows = [];
    document.querySelectorAll('#d-settings-body table.set-plant tbody tr:not(.new)').forEach(function (tr, i) {
      if (extra && extra.del === i) return;
      rows.push({ code: tr.querySelector('[data-set="code"]').value, hq: tr.querySelector('[data-set="hq"]').value });
    });
    if (extra && extra.add) rows.push(extra.add);
    var na = {}; document.querySelectorAll('#d-settings-body [data-set-na]').forEach(function (el) { na[el.dataset.setNa] = el.value; });
    return { plant: rows, excludeGN: $('set-gn').checked, ftaNa: na };
  }
  function applySettings(raw, text) {
    saveSettings(raw); renderSettings();
    var note = Object.keys(state.sets).length ? rebuild(false) : '';
    msg(text + (Object.keys(state.sets).length ? ' 올린 수출 자료를 다시 계산했습니다.' : '') + note, note ? 'warn' : 'ok');
  }
  // (v1.9.1) 관세율표 — FTA 탭을 처음 열 때 한 번만 받는다(js/tariff.js 가 캐시). 실패해도 다른 집계는 그대로.
  function showTariffMeta() {
    var el = $('tariff-meta'), T = window.Tariff;
    if (!el || !T || el.dataset.state) return;
    el.dataset.state = 'loading'; el.textContent = '관세율표를 불러오는 중…';
    T.loadTariff().then(function (r) {
      el.dataset.state = r.ok ? 'ok' : 'fail';
      el.classList.toggle('warn', !r.ok);
      el.textContent = r.ok ? T.tariffMetaText(r.meta) + ' (' + r.meta.source + ')' : T.FAIL_TEXT + ' — 세율 조회만 건너뜁니다.';
    });
  }
  /* ---------- (v2.1.0) 수입 FTA — 「FTA 수입 실적 보고」 메일 표를 ERP 수입FTA 파일로. 계산은 C.ftaImportReport, 여기서는 그리기만 ---------- */
  var FTA_SNAP_KEY = 'b2611-07.fta.snapshots';
  function ftaSnaps() { try { var j = JSON.parse(localStorage.getItem(FTA_SNAP_KEY) || '[]'); return Array.isArray(j) ? j : []; } catch (e) { return []; } }
  // (v2.5.0) FTA 탭 숫자 — 고른 단위(state.unit) · 소수 둘째(원은 정수). 메일 표(eokMail)만 늘 억원 · 소수 둘째(보고 양식).
  function eokT(v) { return v == null ? '—' : C.fmtUnitNum(v, state.unit, 2); }
  function eokU(v) { var t = eokT(v); return t === '—' ? t : t + state.unit; }
  function eokMail(v) { return v == null ? '—' : (v / 1e8).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function pctT(v) { return v == null ? '—' : (v * 100).toFixed(2) + '%'; }
  function todayStr() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function ftaReport() {
    var s = ready('ftaImport'); if (!s) return null;
    var fp = {}; s.files.forEach(function (f) { if (f.meta && f.meta.period) fp[f.file || f.name] = f.meta.period.months; });
    return { set: s, rep: C.ftaImportReport(s.m.records, { range: state.range, filePeriods: fp, today: todayStr(), naNames: state.settings.ftaNa }) };
  }
  var FTA_HEAD = ['BG', '물자대(전체)', '물자대(협정국 수입_가능)', '물자대(FTA)', '절감액(FTA)', '비율'];
  function ftaTable(rows, key) {
    return table(FTA_HEAD, rows.filter(function (r) { return !r.total; }).map(function (r) { return { cells: [esc(r.hq), eokT(r.all), eokT(r.poss), eokT(r.fta), eokT(r.saving), pctT(r.rate)] }; }),
      rows.filter(function (r) { return r.total; }).map(function (r) { return ['총합계', eokT(r.all), eokT(r.poss), eokT(r.fta), eokT(r.saving), pctT(r.rate)]; })[0], 'fta-imp ' + key);
  }
  // 메일용 표 — Outlook 에 붙여넣으면 표 모양 그대로(인라인 스타일 HTML 표)
  function mailCumTitle(rep) { var f = rep.range.from, t = rep.month; return f === t.slice(0, 4) + '-01' ? t.slice(0, 4) + '년 1~' + (+t.slice(5, 7)) + '월' : rangeText(rep.range); }
  function ftaMailHtml(rep) {
    var th = 'style="border:1px solid #9aa8b6;background:#dbe5f1;padding:4px 8px;font-weight:bold;text-align:center"', td = 'style="border:1px solid #9aa8b6;padding:4px 8px;text-align:right"', tl = 'style="border:1px solid #9aa8b6;padding:4px 8px;text-align:left"';
    function one(title, rows) {
      return '<p style="margin:10px 0 4px;font-weight:bold">' + esc(title) + ' (단위: 억원)</p><table style="border-collapse:collapse;font-family:맑은 고딕,sans-serif;font-size:10pt"><tr>' + FTA_HEAD.map(function (h) { return '<th ' + th + '>' + esc(h) + '</th>'; }).join('') + '</tr>' +
        rows.map(function (r) { var b = r.total ? ';font-weight:bold;background:#f2f2f2' : ''; return '<tr><td ' + tl.replace('"', '"' + b.slice(1) + ';') + '>' + esc(r.total ? '총합계' : r.hq) + '</td>' + [eokMail(r.all), eokMail(r.poss), eokMail(r.fta), eokMail(r.saving), pctT(r.rate)].map(function (v) { return '<td ' + td.replace('"', '"' + b.slice(1) + ';') + '>' + v + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>';
    }
    var m = +rep.month.slice(5, 7);
    return '<div>' + one(rep.year + '년 ' + m + '월 FTA 수입 실적(당월)', rep.current) + one(mailCumTitle(rep) + ' FTA 수입 실적(누적)', rep.cumulative) + '<p style="font-size:9pt;color:#666">' + esc(rep.basis) + '</p></div>';
  }
  function ftaMailText(rep) {
    var line = function (r) { return [r.total ? '총합계' : r.hq, eokMail(r.all), eokMail(r.poss), eokMail(r.fta), eokMail(r.saving), pctT(r.rate)].join('\t'); };
    return ['당월 ' + rep.month, FTA_HEAD.join('\t')].concat(rep.current.map(line), ['', '누적 ' + rep.range.from + ' ~ ' + rep.month, FTA_HEAD.join('\t')], rep.cumulative.map(line)).join('\n');
  }
  function copyHtml(html, text) {
    function fallback() {
      var d = document.createElement('div'); d.contentEditable = 'true'; d.style.position = 'fixed'; d.style.left = '-9999px'; d.innerHTML = html; document.body.appendChild(d);
      var r = document.createRange(); r.selectNodeContents(d); var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } sel.removeAllRanges(); d.remove(); return ok;
    }
    if (navigator.clipboard && window.ClipboardItem) return navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]).then(function () { return true; }, function () { return fallback(); });
    return Promise.resolve(fallback());
  }
  // (v2.2.0) 화면 순서: [5-1] 상단 줄 → [5-2] 카드 4 → [5-3] 월별 절감액(본부별 쌓은 막대) → [5-4] 활용 흐름 → [5-5] 협정별 → [5-6] 사후적용 대기 → [5-7] 표
  //   두 축 차트는 만들지 않는다(비율 선을 막대에 겹치지 않음). 본부 색 = C.hqColor(고정), 노랑은 사후적용 대기(조치 필요)에만.
  var FTA_WARN = '#d9a400', FTA_WARN_LINE = '#8a6500', FTA_FLOW = ['#154b6e', '#2f6f99', '#4f8fba'], FTA_OTHER = '#8a95a1';
  function ftaHqOrder(rows) { var o = C.FTA_HQ_ORDER.slice(); rows.forEach(function (q) { if (o.indexOf(q.hq) < 0) o.push(q.hq); }); return o; }
  function monTick(m) { return m.slice(2, 4) + '.' + m.slice(5); }
  // 월별 막대 — series = 쌓을 [{ name, color, get(month) }]. 숫자 라벨은 합계가 가장 큰 달과 고른 달에만. 마우스를 올리면 그 달 전체 내역(title).
  function ftaBars(title, months, series, sel, key, legendOn) {
    var W = 640, H = 250, L = 56, R = 12, T = legendOn ? 30 : 18, B = 30, iw = W - L - R, ih = H - T - B, n = months.length, step = iw / Math.max(1, n), bw = Math.min(40, step * 0.62);
    var tots = months.map(function (m) { return series.reduce(function (a, s) { return a + (s.get(m) || 0); }, 0); });
    var max = niceMax(Math.max.apply(null, [0].concat(tots))), y = function (v) { return T + ih - (v / max) * ih; }, peak = tots.indexOf(Math.max.apply(null, tots));
    var b = legendOn ? legend(series.map(function (s) { return { name: s.name, color: s.color }; }), L) : '';
    for (var g = 0; g <= 4; g++) { var gv = max * g / 4; b += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(gv).toFixed(1) + '" y2="' + y(gv).toFixed(1) + '" class="grid"/><text x="' + (L - 6) + '" y="' + (y(gv) + 4).toFixed(1) + '" class="ax" text-anchor="end">' + esc(eokT(gv)) + '</text>'; }
    months.forEach(function (m, i) {
      var cx = L + step * i + step / 2, acc = 0, tip = C.monthLabel(m) + (series.length > 1 ? ' 합계 ' + eokU(tots[i]) + '' : '');
      if (m === sel) b += '<rect x="' + (L + step * i + 1).toFixed(1) + '" y="' + T + '" width="' + (step - 2).toFixed(1) + '" height="' + ih + '" class="sel-band"/>';
      series.forEach(function (s) {
        var v = s.get(m) || 0; tip += '\n' + s.name + ' ' + eokU(v) + ''; if (v <= 0) return;
        b += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + y(acc + v).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (y(acc) - y(acc + v)).toFixed(1) + '" fill="' + s.color + '"' + (s.stroke ? ' stroke="' + s.stroke + '"' : '') + '/>';
        acc += v;
      });
      if ((i === peak && tots[i] > 0) || (m === sel && tots[i] > 0)) b += '<text x="' + cx.toFixed(1) + '" y="' + (y(tots[i]) - 5).toFixed(1) + '" class="ax val" text-anchor="middle" data-lab="' + m + '">' + esc(eokT(tots[i])) + '</text>';
      b += '<text x="' + cx.toFixed(1) + '" y="' + (H - 10) + '" class="ax' + (m === sel ? ' val' : '') + '" text-anchor="middle">' + esc(monTick(m)) + '</text>';
      b += '<rect x="' + (L + step * i).toFixed(1) + '" y="' + T + '" width="' + step.toFixed(1) + '" height="' + ih + '" fill="transparent" class="hit"><title>' + esc(tip) + '</title></rect>';
    });
    return frame(title, '<svg class="chart" data-k="' + key + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(title) + '">' + b + '</svg>');
  }
  // 가로막대 — rows = [{ label, value, color, note }] · 오른쪽에 금액(고른 단위)과 보조 글
  function ftaHbar(title, rows, key) {
    var W = 480, rowH = 30, L = 132, R = 150, T = 8, H = T + rows.length * rowH + 8;   // 반 폭 칸에 들어가도 글자가 작아지지 않게
    var max = niceMax(Math.max.apply(null, [0].concat(rows.map(function (r) { return r.value || 0; })))), b = '';
    rows.forEach(function (r, i) {
      var yy = T + i * rowH, w = r.value > 0 ? (r.value / max) * (W - L - R) : 0;
      b += '<text x="' + (L - 8) + '" y="' + (yy + 19) + '" class="ax lab" text-anchor="end">' + esc(r.label) + '</text>' +
        '<rect x="' + L + '" y="' + (yy + 6) + '" width="' + Math.max(w, r.value > 0 ? 1 : 0).toFixed(1) + '" height="18" rx="3" fill="' + r.color + '"><title>' + esc(r.label + ' ' + eokU(r.value) + '' + (r.note ? ' · ' + r.note : '')) + '</title></rect>' +
        '<text x="' + (L + w + 6).toFixed(1) + '" y="' + (yy + 19) + '" class="ax val">' + esc(eokT(r.value)) + (r.note ? '<tspan class="ax" dx="6">' + esc(r.note) + '</tspan>' : '') + '</text>';
    });
    if (!rows.length) b = '<text x="20" y="24" class="ax">데이터 없음</text>';
    return frame(title, '<svg class="chart" data-k="' + key + '" viewBox="0 0 ' + W + ' ' + Math.max(H, 40) + '" role="img" aria-label="' + esc(title) + '">' + b + '</svg>');
  }
  function ftaKpi(label, value, sub, cls, key, extra) {
    return '<div class="kpi' + (cls ? ' ' + cls : '') + '" data-k="' + key + '"' + (extra || '') + '><span class="kpi-l">' + esc(label) + '</span><b class="kpi-v">' + esc(value) + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
  }
  function renderFtaImport() {
    var el = $('fta-imp'); if (!el) return;
    var x = ftaReport();
    if (!x || !x.rep.month) { el.innerHTML = '<div class="note" data-k="fta-none"><b>수입 FTA 자료가 없습니다. ERP 수입FTA 엑셀을 올려 주세요.</b> 올리면 「FTA 수입 실적 보고」 메일의 표를 만듭니다. 예: 2026-01~10_수입FTA.xlsx(확정본 · 저장) · EXPORT-수입FTA.XLSX(조회 모드 · 저장 안 함). 수입실적 합계에는 더하지 않습니다(같은 신고를 란 단위로 받은 자료).</div>'; return; }
    var r = x.rep, k = r.kpi, mo = +r.month.slice(5, 7), cmp = C.ftaCompare(r, ftaSnaps()), pc = r.pending.cumulative, ex = r.excluded;
    if (r.empty) { state.ftaLast = null; el.innerHTML = '<div class="note" data-k="fta-empty"><b>선택 기간(' + esc(rangeText(r.range)) + ')에 자료가 없습니다.</b> 수입 FTA 자료가 있는 달: ' + esc(r.months.length ? C.monthLabel(r.months[0]) + ' ~ ' + C.monthLabel(r.months[r.months.length - 1]) : '—') + ' — 위의 조회 기간을 바꿔 보세요.</div>'; return; }
    state.ftaLast = r; var rgT = rangeText(r.range);
    var confirmed = !!cmp;
    // [5-1] 상단 줄
    var h = '<div class="fta-top"><div class="fta-top-l"><span class="sub" data-k="fta-month">당월 ' + esc(C.monthLabel(r.month)) + '</span>' +
      ' <span class="badge ' + (confirmed ? 'ok' : 'no') + '" data-k="fta-badge">' + (confirmed ? '확정' : '미확정') + '</span>' +
      ' <button class="btn" type="button" data-fta-confirm>이 달 실적 확정</button></div>' +
      '<div class="fta-top-r" data-k="fta-basis" title="' + esc(r.basis) + '">최신 ERP · GN 제외 · 수리일자 기준 · 조회 기간 ' + esc(rangeText(r.range)) + ' · 단위 ' + esc(state.unit) + '</div></div>';
    // [5-2] 카드 4
    var mom = k.momPct == null ? '<span class="sub">전월(' + esc(C.monthLabel(k.prevMonth)) + ') 자료 없음 —</span>' :
      '전월 대비 <b class="' + (k.momPct >= 0 ? 'up' : 'down') + '">' + (k.momPct >= 0 ? '▲ ' : '▼ ') + Math.abs(k.momPct * 100).toFixed(2) + '%</b> <span class="sub">(' + esc(C.monthLabel(k.prevMonth)) + ' ' + eokU(k.prevSaving) + ')</span>';
    h += '<div class="kpis fta4">' +
      ftaKpi(mo + '월 절감액', eokU(k.saving) + '', mom, '', 'fta-k-saving') +
      ftaKpi('선택 기간 누적 절감액(' + rgT + ')', eokU(k.cumSaving) + '', '월평균 ' + eokU(k.avgSaving) + ' <span class="sub">(' + k.cumMonths + '개월)</span>', '', 'fta-k-cum') +
      ftaKpi(mo + '월 FTA 활용률', pctT(k.rate), '미활용 ' + eokU(k.unused) + ' <span class="sub">(가능 − FTA)</span><br>협정국 수입 비중 ' + pctT(k.possShare) + ' <span class="sub">(가능 ÷ 전체)</span>', '', 'fta-k-rate') +
      (k.pendingAmount > 0 ? ftaKpi('사후적용 대기', eokU(k.pendingAmount) + ' · ' + C.fmtNum(k.pendingDecls) + '건', '' + rgT + ' 수리분 · ' + C.fmtNum(k.pendingLines) + '란 — 눌러서 목록 보기', 'warn clk', 'fta-k-pending', ' role="button" tabindex="0" data-fta-goto="fta-pend-sec"') :
        ftaKpi('사후적용 대기', '대기 없음', '' + rgT + ' 수리분', 'none', 'fta-k-pending')) + '</div>';
    // [5-3] 월별 절감액 — 본부별 쌓은 막대
    var allHq = []; r.monthlyHq.forEach(function (q) { q.rows.forEach(function (w) { if (allHq.indexOf(w.hq) < 0) allHq.push(w.hq); }); });
    var hqS = ftaHqOrder(allHq.map(function (q) { return { hq: q }; })).filter(function (q) { return allHq.indexOf(q) >= 0; }).map(function (hq) {
      return { name: hq, color: C.hqColor(hq), get: function (m) { var row = r.monthlyHq.filter(function (q) { return q.month === m; })[0]; var w = row && row.rows.filter(function (z) { return z.hq === hq; })[0]; return w ? w.saving : 0; } };
    });
    h += '<div class="charts">' + ftaBars('월별 절감액 — 본부별 (' + state.unit + ')', r.series, hqS, r.month, 'fta-ch-saving', true);
    // [5-4] 활용 흐름
    h += ftaHbar(mo + '월 활용 흐름 (' + state.unit + ')', [
      { label: '물자대(전체)', value: k.all, color: FTA_FLOW[0], note: '100%' },
      { label: '협정국 수입 가능', value: k.poss, color: FTA_FLOW[1], note: '전체 대비 ' + pctT(k.possShare) },
      { label: 'FTA 적용', value: k.fta, color: FTA_FLOW[2], note: '활용률 ' + pctT(k.rate) }], 'fta-ch-flow');
    // [5-5] 협정별 절감액 — 큰 순서 + 기타
    var ag = C.ftaAgreeGroups(r.agreements.cumulative);
    h += ftaHbar('협정별 절감액 — ' + rgT + ' (' + state.unit + ')', ag.top.map(function (a) { return { label: a.code + ' ' + (a.name || '(이름 없음)'), value: a.saving, color: FTA_FLOW[0] }; })
      .concat(ag.other ? [{ label: ag.other.name, value: ag.other.saving, color: FTA_OTHER, note: ag.other.codes.join(' · ') }] : []), 'fta-ch-agree') + '</div>';
    // [5-6] 사후적용 대기 금액 — 월별 막대 + 목록
    h += '<h3 class="tb-h" id="fta-pend-sec">사후적용 대기(FTA N/A 04 · 미적용) — ' + rgT + ' ' + C.fmtNum(pc.lines) + '란 · 신고 ' + C.fmtNum(pc.decls) + '건 · ' + eokU(pc.amount) + '</h3>';
    h += '<div class="charts">' + ftaBars('월별 사후적용 대기 금액 — 수리월 기준 (' + state.unit + ')', r.series, [{ name: '대기 금액', color: FTA_WARN, stroke: FTA_WARN_LINE, get: function (m) { var p = r.pendingMonthly.filter(function (q) { return q.month === m; })[0]; return p ? p.amount : 0; } }], r.month, 'fta-ch-pending', false) + '</div>';
    h += '<p class="sub">사후적용이 끝나면 ERP 에서 Duty Type 이 F 로 바뀌어 다음 파일에서 자동으로 빠집니다. 경과일수 = 오늘 − 수리일자 · <span class="late">30일 이상은 빨간색</span>.</p>' +
      (pc.list.length ? table(['신고번호', '본부', '수리일자', '경과일수', U('물자대'), '사유(N/A Reason)'], pc.list.map(function (p) { var late = p.days != null && p.days >= 30; return { cls: late ? 'late' : '', cells: [esc(p.declNo), esc(p.hq), esc(p.date || ''), p.days == null ? '—' : C.fmtNum(p.days) + '일', eokT(p.goods), esc(p.reason)] }; }), null, 'fta-pending') : '<p class="sub">대기 중인 건이 없습니다.</p>');
    // [5-7] 표 — 메일용 당월 · 누적 + 복사
    h += '<h3 class="tb-h">메일용 표 <button class="btn primary" type="button" data-fta-copy>메일용 표 복사</button> <span class="sub" id="fta-copied" aria-live="polite"></span></h3><p class="sub">' + esc(r.basis) + '</p>';
    h += '<h3 class="tb-h">' + r.year + '년 ' + mo + '월 당월 <small class="sub">(단위: ' + esc(state.unit) + ')</small></h3>' + ftaTable(r.current, 'fta-cur');
    h += '<h3 class="tb-h">' + '선택 기간 ' + rgT + ' 누적 <small class="sub">(단위: ' + esc(state.unit) + ')</small></h3>' + ftaTable(r.cumulative, 'fta-cum');
    var tot = cmp ? cmp.rows.filter(function (q) { return q.hq === '총합계'; })[0] : null;
    h += '<div class="' + (cmp ? 'note' : 'sub') + '" data-k="fta-cmp">' + (cmp && tot && tot.then ? '<b>' + mo + '월 확정(' + esc(window.ErrScore ? window.ErrScore.localTime(cmp.confirmedAt) : cmp.confirmedAt) + ') 당시 FTA ' + eokU(tot.then.fta) + ' → 현재 ' + eokU(tot.now.fta) + ' · 사후적용 등 소급 ' + (tot.diff.fta >= 0 ? '증가 ' : '감소 ') + eokU(Math.abs(tot.diff.fta)) + '</b>' +
      table(['BG', '확정 FTA', '현재 FTA', '차이', '확정 절감액', '현재 절감액', '차이'], cmp.rows.filter(function (q) { return q.then; }).map(function (q) { return { cells: [esc(q.hq), eokT(q.then.fta), eokT(q.now.fta), eokT(q.diff.fta), eokT(q.then.saving), eokT(q.now.saving), eokT(q.diff.saving)] }; }), null, 'fta-cmp') :
      '확정 당시 값: — (' + mo + '월은 아직 확정하지 않았습니다. 위의 「이 달 실적 확정」을 누르면 지금 값을 남겨 두고, 나중에 사후적용 등으로 바뀐 만큼을 보여 줍니다.)') + '</div>';
    // 미적용 사유별 — 행을 누르면 그 사유의 신고번호 목록
    var rm = {}; r.reasons.month.forEach(function (q) { rm[q.key] = q; });
    h += '<h3 class="tb-h">미적용 사유별 물자대 — ' + rgT + ' <small class="sub">(04 는 사후적용 대기로 따로 · ' + esc(state.unit) + ' · 행을 누르면 신고번호 목록)</small></h3>' +
      '<div class="tablewrap"><table class="fta-reasons"><thead><tr><th>코드</th><th>사유</th><th class="num">' + rgT + ' 물자대</th><th class="num">란</th><th class="num">' + mo + '월 물자대</th></tr></thead><tbody>' +
      r.reasons.cumulative.map(function (q) {
        var m = rm[q.key], open = state.ftaReasonOpen === q.key;
        var row = '<tr class="clk' + (open ? ' open' : '') + '" data-fta-reason="' + esc(q.key) + '" tabindex="0" aria-expanded="' + open + '"><td>' + esc(q.code || '—') + '</td><td>' + (open ? '▾ ' : '▸ ') + esc(q.name) + '</td><td class="num">' + eokT(q.goods) + '</td><td class="num">' + C.fmtNum(q.lines) + '</td><td class="num">' + (m ? eokT(m.goods) : '—') + '</td></tr>';
        if (open) {
          var lim = q.decls.slice(0, 50);
          row += '<tr class="sub-row" data-k="fta-reason-list"><td colspan="5">' + table(['신고번호', '본부', '수리일자', U('물자대'), '란'], lim.map(function (d) { return { cells: [esc(d.declNo), esc(d.hq), esc(d.date || ''), eokT(d.goods), C.fmtNum(d.lines)] }; }), null, 'fta-reason-decls') +
            (q.decls.length > lim.length ? '<p class="sub">물자대 큰 순서 50건만 — 외 ' + C.fmtNum(q.decls.length - lim.length) + '건</p>' : '') + '</td></tr>';
        }
        return row;
      }).join('') + '</tbody></table></div>' +
      '<p class="sub">사유 코드 없이 A · C 세율로 통관된 줄은 「사유 없음(A)」 · 「사유 없음(C)」 — 대부분 비협정국 수입입니다. 코드 이름은 설정에서 고칩니다.</p>';
    // HS 6단위 절감액 상위 10
    var hm = {}; r.hs.month.forEach(function (q) { hm[q.hs6] = q; });
    h += '<h3 class="tb-h">HS 6단위 절감액 상위 10 — ' + rgT + ' <small class="sub">(' + esc(state.unit) + ')</small></h3>' +
      (!r.hs.has ? '<p class="sub" data-k="fta-hs-none">이 파일에는 HS 코드 열(HS-Code)이 없어 이 표를 만들지 않습니다.</p>' :
        table(['HS 6단위', '' + rgT + ' 절감액', '물자대(FTA)', '란', mo + '월 절감액'], r.hs.cumulative.map(function (q) { var m = hm[q.hs6]; return { cells: [esc(q.hs6), eokT(q.saving), eokT(q.ftaGoods), C.fmtNum(q.lines), m ? eokT(m.saving) : '—'] }; }), null, 'fta-hs'));
    var sk = x.set.m.skipped.length;
    h += '<p class="sub" data-k="fta-excluded">제외 — GN ' + C.fmtNum(ex.gn) + '란 ' + eokU(ex.gnAmount) + ' · Duty Type \'F\' 단독 ' + C.fmtNum(ex.fOnly) + '란(물자대(FTA)에 넣지 않음, 전체에는 포함) · 기간 밖 ' + C.fmtNum(ex.outside) + '란' + (sk ? ' · 읽지 못한 줄 ' + C.fmtNum(sk) + '란' : '') + '. GN 은 실적 탭 설정과 관계없이 늘 뺍니다.</p>';
    el.innerHTML = h;
  }
  function exKpi(label, value, sub, key) { return '<div class="kpi" data-k="' + key + '"><span class="kpi-l">' + esc(label) + '</span><b class="kpi-v">' + esc(value) + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>'; }
  function renderExportFta() {
    var el = $('exfta'); if (!el) return;
    var rep = C.exportFtaReport(state.exfta, { range: state.range, rates: exRates() });
    if (!rep.month) { el.innerHTML = '<div class="note" data-k="exfta-none"><b>수출 FTA 자료가 없습니다. FTA 담당자 분석본을 올려 주세요.</b> 예: 2026-10_수출FTA_건기.xlsx · 2026-10_수출FTA_엔진.xlsx(시트 5개 — 세율을 채운 분석 시트를 내용으로 골라 집계). 수입 FTA 와는 별개입니다(수출 = 바이어가 아낀 관세 · 대표세율 기반).</div>'; return; }
    var c = rep.current, mo = +rep.month.slice(5, 7), rgT = rangeText(rep.range), cu = rep.cumulative;
    if (rep.empty) { el.innerHTML = '<div class="note" data-k="exfta-empty"><b>선택 기간(' + esc(rgT) + ')에 자료가 없습니다.</b> 수출 FTA 분석본이 있는 달: ' + esc(rep.months.map(C.monthLabel).join(', ') || '—') + ' — 위의 조회 기간을 바꿔 보세요.</div>'; return; }
    var h = '<div class="fta-top"><div class="fta-top-l"><span class="sub" data-k="exfta-month">당월 ' + esc(C.monthLabel(rep.month)) + '</span></div>' +
      '<div class="fta-top-r" data-k="exfta-basis" title="' + esc(rep.basis) + '">담당자 분석본 기준 · 판가(원화) · 조회 기간 ' + esc(rgT) + ' · 단위 ' + esc(state.unit) + '</div></div>';
    var calcTxt = function (x) { return x ? ' <span class="sub" data-k="exfta-calc">(세율표로 계산하면 ' + eokU(x.saving) + ')</span>' : ''; };
    h += '<div class="kpis fta4">' + exKpi(mo + '월 절감액', eokU(c.saving) + '', c.byHq.map(function (q) { return esc(q.hq) + ' ' + eokT(q.saving); }).join(' · ') + calcTxt(c.calc), 'exfta-k-saving') +
      exKpi('선택 기간 누적 절감액(' + rgT + ')', eokU(rep.cumulative.saving) + '', '판가 ' + eokU(rep.cumulative.amount) + ' · 유효절감율 ' + pctT(rep.cumulative.rate) + calcTxt(rep.cumulative.calc), 'exfta-k-cum') +
      exKpi('선택 기간 대상 판가', eokU(cu.amount) + '', '유효절감율 ' + pctT(cu.rate) + ' <span class="sub">(절감 ÷ 판가)</span>', 'exfta-k-amount') +
      exKpi('선택 기간 분석 건수', C.fmtNum(cu.lines) + '행', '파일 ' + rep.files.length + '개(' + esc(rep.files.map(function (f) { return C.monthLabel(f.month) + ' ' + f.hq; }).join(' · ')) + ')', 'exfta-k-lines') + '</div>';
    // 월별 절감액 — 본부별 쌓기(수입 FTA 와 같은 본부 고정색)
    var hqs = []; rep.monthlyHq.forEach(function (q) { q.rows.forEach(function (w) { if (hqs.indexOf(w.hq) < 0) hqs.push(w.hq); }); });
    hqs = C.FTA_HQ_ORDER.filter(function (x) { return hqs.indexOf(x) >= 0; }).concat(hqs.filter(function (x) { return C.FTA_HQ_ORDER.indexOf(x) < 0; }));
    var series = hqs.map(function (hq) { return { name: hq, color: C.hqColor(hq), get: function (m) { var row = rep.monthlyHq.filter(function (q) { return q.month === m; })[0], w = row && row.rows.filter(function (z) { return z.hq === hq; })[0]; return w ? w.saving : 0; } }; });
    h += '<div class="charts">' + ftaBars('월별 절감액 — 본부별 (' + state.unit + ')', rep.series, series, rep.month, 'exfta-ch-saving', true);
    h += ftaHbar('선택 기간 협정별 절감액 (' + state.unit + ' · 유효절감율)', rep.agreements.map(function (a) { return { label: a.key, value: a.saving, color: FTA_FLOW[0], note: '판가 ' + eokT(a.amount) + ' · ' + pctT(a.rate) }; }), 'exfta-ch-agree') + '</div>';
    h += '<p class="sub" data-k="exfta-rate-note">판가가 커도 절감이 작은 협정이 있습니다(예: 한-미 — 미국 수출 세율이 원래 0% 라 판가가 커도 절감은 0 에 가까움). 막대 길이(절감액)와 함께 <b>유효절감율(절감 ÷ 판가)</b>을 보세요.</p>';
    h += '<h3 class="tb-h">협정별 판가 · 절감액 — ' + esc(rgT) + ' <small class="sub">(' + esc(state.unit) + ')</small></h3>' + table(['대상FTA', '행', '판가', '절감액', '유효절감율', '세율표로 계산하면'], rep.agreements.map(function (a) { return { cells: [esc(a.key), C.fmtNum(a.lines), eokT(a.amount), eokT(a.saving), pctT(a.rate), a.calc ? '(' + eokT(a.calc.saving) + ')' : '—'] }; }),
      ['합계', C.fmtNum(cu.lines), eokT(cu.amount), eokT(cu.saving), pctT(cu.rate), cu.calc ? '(' + eokT(cu.calc.saving) + ')' : '—'], 'exfta-agree');
    // [5] 담당자 피벗 대조 — 파일마다
    rep.files.forEach(function (f) {
      var ck = f.check;
      h += '<h3 class="tb-h">담당자 피벗 대조 — ' + esc(C.monthLabel(f.month) + ' ' + f.hq) + (ck ? ' <small class="sub">(' + esc(ck.sheet) + ')</small> <span class="badge ' + (ck.ok ? 'ok' : 'bad') + '" data-k="exfta-check-' + esc(f.hq) + '">' + (ck.ok ? '일치' : ck.rows.filter(function (q) { return !q.ok; }).length + '개 협정 다름') + '</span>' : ' <span class="badge no">피벗 없음</span>') + '</h3>';
      if (!ck) return;
      h += '<div class="tablewrap"><table class="exfta-check"><thead><tr><th>대상FTA</th><th class="num">분석본 판가</th><th class="num">피벗 판가</th><th class="num">차이</th><th class="num">분석본 절감</th><th class="num">피벗 절감</th><th class="num">차이</th></tr></thead><tbody>' +
        ck.rows.concat([{ fta: '합계', ours: ck.total.ours, pivot: ck.total.pivot, diffAmount: ck.total.ours.amount - ck.total.pivot.amount, diffSaving: ck.total.ours.saving - ck.total.pivot.saving, ok: ck.total.ok, sum: true }]).map(function (q) {
          var bad = !q.ok ? ' class="diff"' : '';
          return '<tr' + (q.sum ? ' class="sum"' : '') + (q.ok ? '' : ' data-bad="1"') + '><td>' + esc(q.fta) + '</td><td class="num">' + eokT(q.ours.amount) + '</td><td class="num">' + (q.pivot ? eokT(q.pivot.amount) : '피벗에 없음') + '</td><td class="num"><span' + bad + '>' + (q.diffAmount == null ? '—' : C.fmtNum(Math.round(q.diffAmount)) + '원') + '</span></td><td class="num">' + eokT(q.ours.saving) + '</td><td class="num">' + (q.pivot ? eokT(q.pivot.saving) : '—') + '</td><td class="num"><span' + bad + '>' + (q.diffSaving == null ? '—' : C.fmtNum(Math.round(q.diffSaving)) + '원') + '</span></td></tr>';
        }).join('') + '</tbody></table></div>';
    });
    h += '<h3 class="tb-h">국가별 절감액 상위 — ' + esc(rgT) + ' <small class="sub">(대상국 · ' + esc(state.unit) + ')</small></h3>' + table(['국가', '행', '판가', '절감액', '유효절감율'], rep.countries.map(function (q) { return { cells: [esc(q.key), C.fmtNum(q.lines), eokT(q.amount), eokT(q.saving), pctT(q.rate)] }; }), null, 'exfta-country');
    // [7] 담당자 제외 건 — 집계에는 넣지 않고 따로 · 펼쳐 보기
    var exN = rep.files.reduce(function (a, f) { return a + (f.excluded ? f.excluded.rows.length : 0); }, 0);
    h += '<details class="settings" data-k="exfta-excl"><summary>담당자 제외 ' + C.fmtNum(exN) + '건 — 집계에 넣지 않음(펼쳐서 목록)</summary>' + rep.files.map(function (f) {
      var x = f.excluded; if (!x || !x.rows.length) return '<p class="sub">' + esc(f.hq) + ' — 제외 건 없음</p>';
      return '<p class="sub"><b>' + esc(C.monthLabel(f.month) + ' ' + f.hq) + '</b> — 「' + esc(x.sheet) + '」 ' + x.rows.length + '건</p><div class="tablewrap"><table class="exfta-excl"><thead><tr>' + x.headers.map(function (hd) { return '<th>' + esc(hd) + '</th>'; }).join('') + '</tr></thead><tbody>' + x.rows.map(function (r) { return '<tr>' + r.map(function (v) { return '<td>' + esc(v) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
    }).join('') + '</details>';
    // 하단 — 기준 · 고른 시트의 채움 비율 · 세율표 커버리지
    h += '<div class="sub" data-k="exfta-foot"><p><b>담당자 분석본 기준 · 판가(원화) · 조회 기간 ' + esc(rgT) + '</b> — ' + esc(rep.basis) + '</p>' + rep.files.map(function (f) {
      var cv = f.coverage;
      return '<p data-k="exfta-pick">' + esc(C.monthLabel(f.month) + ' ' + f.hq) + ' — ' + esc(f.file) + ': 「' + esc(f.pick.sheet) + '」 집계(' + esc(f.pick.why) + ')' + (f.warnings && f.warnings.length ? ' · <b>' + esc(f.warnings.join(' / ')) + '</b>' : '') +
        (cv ? '<br>세율표: 이번 분석본의 세율 ' + C.fmtNum(cv.total) + '가지 중 세율표에 이미 있던 것 <b>' + pctT(cv.pct) + '</b> · 새로 추가 ' + C.fmtNum(cv.added) + '건' + (f.rateConflicts ? ' · <b class="diff">세율 불일치 ' + f.rateConflicts + '건</b>' : '') : '') + '</p>';
    }).join('') + '<p>A단계(세율표로 자동 계산)는 아직 쓰지 않습니다 — 「세율표로 계산하면」은 담당자 값과 벌어지는 곳을 점검하는 참고값입니다. 모은 세율표는 설정에서 보고 내보냅니다.</p></div>';
    el.innerHTML = h;
  }
  function renderFta() {
    showTariffMeta();
    renderFtaImport();
    if (!state.range) return;
    var by = $('by-fta').value, BYL = C.BY[by], k = '', ch = '', tb = '', months = C.monthsBetween(state.range.from, state.range.to), monthly = [];
    ['import', 'export'].forEach(function (kind, i) {
      var f = filtered(kind), nm = kind === 'import' ? '수입' : '수출';
      if (!f) { k += empty(kind); return; }
      var s = C.ftaStats(f.recs, kind, state.range, by, f.set.m.map), part = f.set.m.partial;
      if (!s.available) { k += kpi(nm + ' FTA 활용률', '열 없음', part.ftaGoods ? '일부 파일(' + esc(part.ftaGoods.join(', ')) + ')에 물자대_FTA 열이 없어 계산하지 않습니다' : '물자대_FTA 열을 골라 주세요', '', kind + '-util'); return; }
      k += kpi(nm + ' FTA 활용률', C.fmtPct(s.util), money(s.ftaGoods) + ' / ' + esc(money(s.goods)), '계산: 물자대_FTA ÷ 물자대', kind + '-util') +
        kpi(nm + ' FTA 절감액', s.hasSaving ? money(s.saving) : '열 없음', !s.hasSaving && part.saving ? '일부 파일(' + esc(part.saving.join(', ')) + ')에 절감액 열이 없어 계산하지 않습니다' : '', s.hasSaving ? '합계' : '', kind + '-saving');
      ch += hbar(nm + ' ' + BYL + '별 FTA 활용률', s.groups.slice(0, 10).map(function (g) { return { label: g.key, value: g.util }; }), function (v) { return C.fmtPct(v); }, by === 'hq' ? hqFill : COL[i ? 2 : 0]);
      monthly.push({ name: nm + ' 절감액', color: COL[i ? 2 : 0], values: s.monthly.map(function (m) { return m.saving; }), fmt: money });
      tb += '<h3 class="tb-h">' + nm + ' FTA — ' + esc(BYL) + '별 물자대 · 물자대_FTA · 절감액</h3>' + ignoredNote(f.ignored) +
        table([esc(BYL), U('물자대'), U('물자대_FTA'), 'FTA 활용률', U('절감액')], s.groups.map(function (g) { return { cells: [esc(g.key), m0(g.goods), m0(g.ftaGoods), esc(C.fmtPct(g.util)), m0(g.saving)] }; }),
          ['합계', m0(s.goods), m0(s.ftaGoods), esc(C.fmtPct(s.util)), m0(s.saving)], 'fta-' + kind);
    });
    if (monthly.length) ch = monthChart('월별 FTA 절감액', months, monthly, 'bar') + ch;
    $('kpi-fta').innerHTML = k; $('ch-fta').innerHTML = ch; $('tb-fta').innerHTML = tb;
  }
  function renderRefund() {
    var f = filtered('refund'), k = '', ch = '', tb = '';
    if (!f) { $('kpi-refund').innerHTML = empty('refund'); $('ch-refund').innerHTML = ''; $('tb-refund').innerHTML = ''; return; }
    var s = C.refundStats(f.recs, state.range, f.set.m.map), cntHead = '건수(' + s.countLabel + ')';
    k += kpi('관세환급 합계', money(s.amount), s.count != null ? esc(C.fmtNum(s.count) + '건 · ' + s.countLabel) : '', '합계', 'ref-amount') +
      kpi('월 평균', money(s.monthAvg), '데이터 있는 ' + s.monthsWithData + '개월', '계산: 합계 ÷ 데이터 있는 달 수', 'ref-avg') +
      kpi('최근 달 환급액', s.last ? money(s.last.amount) : '—', s.last ? C.monthLabel(s.last.month) : '', '', 'ref-last');
    ch += monthChart('월별 관세환급액', s.months, [{ name: '환급액', color: COL[1], values: s.monthly.map(function (m) { return m.amount; }), fmt: money }], 'bar');
    ch += hbar('본부별 관세환급액', s.pivot.map(function (p) { return { label: p.hq, value: p.total }; }), money, hqFill);
    tb += '<h3 class="tb-h">본부별 월별 관세환급 실적 <small class="sub">(금액 단위: ' + esc(state.unit) + ')</small></h3>' + ignoredNote(f.ignored) +
      table(['본부'].concat(s.months.map(C.monthLabel), ['합계', esc(cntHead)]), s.pivot.map(function (p) { return { cells: [esc(p.hq)].concat(p.months.map(m0), [m0(p.total), n0(p.count)]) }; }),
        ['합계'].concat(s.monthly.map(function (m) { return m0(m.amount); }), [m0(s.amount), n0(s.count)]), 'refund-pivot');
    $('kpi-refund').innerHTML = k; $('ch-refund').innerHTML = ch; $('tb-refund').innerHTML = tb;
  }
  // (v1.10.0) 오류 비율은 분자 · 분모가 모두 있을 때만 — 그 달 오류점수 자료가 없으면 0% 가 아니라 「자료 없음」(미집계)
  // (v2.0.0) 오류점수 탭은 오류점수 화면(errors.html)이 저장한 요약(b2611-07.err.summary)을 읽기만 한다 — 계산은 errscore.js 한 곳.
  //   보이는 것: 종합(수입 + 수출) 신고건수 · 오류점수 · 비율(= 오류점수 ÷ 신고건수), 월별 추이. 지역 · 본부 · 관리대장은 오류점수 화면에만.
  function errSummary() { if (state.example && state.sampleErr) return state.sampleErr; try { var j = JSON.parse(localStorage.getItem('b2611-07.err.summary') || 'null'); return j && Array.isArray(j.rows) && j.rows.length ? j : null; } catch (e) { return null; } }
  function errRate(v) { return v == null ? '자료 없음' : C.fmtPct(v / 100, 2); }
  function renderErrors() {
    var sum = errSummary(), ES = window.ErrScore;
    if (!sum || !ES) {
      $('kpi-errors').innerHTML = '<div class="note" data-k="err-none" style="grid-column:1/-1"><b>오류점수 요약이 없습니다. 오류점수 화면에서 유니패스 파일을 올려 주세요.</b> 오류점수는 관세청 유니패스 현황목록 · 상세목록만 받고, 계산은 오류점수 화면에서 합니다. 대시보드는 그 결과를 읽어 보여 줍니다.<div class="btnrow" style="margin-top:8px"><a class="btn primary" href="errors.html">오류점수 화면으로</a></div></div>';
      $('ch-errors').innerHTML = ''; $('tb-errors').innerHTML = ''; return;
    }
    // (v2.6.0) 상단 조회 기간 — 종합 카드 = 기간 합계(오류점수 합 ÷ 신고건수 합), 당월 = 기간의 마지막 달, 추이 = 기간의 달(자료 없는 달은 빈칸)
    var rs = ES.rangeSummary(sum, state.range), rgT = rangeText({ from: rs.from, to: rs.to }), months = rs.months, t = rs.total, last = rs.last;
    var mo = months.map(function (m) { return rs.byMonth[m] || { ym: m, total: { rate: null } }; });
    if (rs.empty) { $('kpi-errors').innerHTML = '<div class="note" data-k="err-empty" style="grid-column:1/-1"><b>선택 기간(' + esc(rgT) + ')에 자료가 없습니다.</b> 오류점수 요약이 있는 달: ' + esc(ES.summaryMonthly(sum).map(function (x) { return C.monthLabel(x.ym); }).join(', ')) + ' — 위의 조회 기간을 바꿔 보세요.</div>'; $('ch-errors').innerHTML = ''; $('tb-errors').innerHTML = ''; return; }
    var miss = months.filter(function (m) { return !rs.byMonth[m]; });
    var k = kpi('선택 기간 종합 신고건수', C.fmtNum(t.decl), rgT + (t.partial ? ' · 수입 · 수출 중 한쪽 자료만 있는 달이 있음' : ' · 수입 + 수출(유니패스 현황목록)'), '기간 합계', 'err-decl') +
      kpi('선택 기간 오류점수', C.fmtNum(t.score), '오류건수 ' + C.fmtNum(t.err) + '건(점수 발생 ' + C.fmtNum(t.errScored) + ')', '기간 합계', 'err-score') +
      kpi('선택 기간 오류 비율', errRate(t.rate), '오류점수 ' + C.fmtNum(t.score) + ' ÷ 신고건수 ' + C.fmtNum(t.decl), '계산: 오류점수 ÷ 신고건수(기간 합계)', 'err-rate') +
      kpi(C.monthLabel(rs.to) + ' 당월', last ? errRate(last.total.rate) : '자료 없음', last ? '신고 ' + C.fmtNum(last.total.decl) + ' · 오류점수 ' + C.fmtNum(last.total.score) : '이 달 유니패스 자료 없음', '기간의 마지막 달', 'err-cum');
    var ch = monthChart('월별 오류 비율 = 오류점수 ÷ 신고건수', months, [{ name: '오류 비율', color: COL[4], values: mo.map(function (x) { return x.total.rate == null ? null : x.total.rate / 100; }), fmt: function (v) { return C.fmtPct(v, 2); } }], 'line', 'pct');
    var tb = (miss.length ? '<p class="sub" data-k="err-miss">자료 없음: ' + esc(miss.map(C.monthLabel).join(', ')) + ' — 그 달은 추이에서 빈칸입니다(유니패스는 월 단위).</p>' : '') + '<p class="sub" data-k="err-basis">조회 기간 ' + esc(rgT) + ' · 오류점수 화면에서 ' + esc(ES.localTime(sum.updatedAt)) + ' 에 계산한 요약 · 기준: ' + esc(sum.basis || '') + ' · 파일: ' + esc((sum.files || []).map(function (f) { return f.name; }).join(', ')) + '. 지역(인천 · 울산) · 본부 세부와 관리대장은 <a href="errors.html">오류점수 화면</a>에서 봅니다. 대시보드의 기간 · 본부 · 국가 필터는 오류점수에 걸리지 않습니다.</p>';
    $('kpi-errors').innerHTML = k; $('ch-errors').innerHTML = ch; $('tb-errors').innerHTML = tb;
  }
  // (v1.6.0) 연도별 쌓은 막대 + 누계 선. rows = [{year, ...}], stacks = [{key, name, color}], line = {key, name, color}
  function yearChart(title, rows, stacks, line) {
    title = UT(title);
    var W = 640, H = 260, L = 62, R = 12, T = 30, B = 30, iw = W - L - R, ih = H - T - B;
    var max = niceMax(Math.max.apply(null, [0].concat(rows.map(function (r) { return Math.max(r.total || 0, line ? r[line.key] || 0 : 0); }))));
    var fmt = axisFmt('money'), step = iw / Math.max(1, rows.length), y = function (v) { return T + ih - (v / max) * ih; };
    var b = legend(stacks.concat(line ? [line] : []), L);
    for (var g = 0; g <= 4; g++) { var gv = max * g / 4; b += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(gv) + '" y2="' + y(gv) + '" class="grid"/><text x="' + (L - 6) + '" y="' + (y(gv) + 4) + '" class="ax" text-anchor="end">' + esc(fmt(gv)) + '</text>'; }
    var bw = Math.min(56, step * 0.6);
    rows.forEach(function (r, i) {
      var cx = L + step * i + step / 2, top = T + ih;
      b += '<text x="' + cx + '" y="' + (H - 10) + '" class="ax" text-anchor="middle">' + esc(String(r.year)) + '</text>';
      stacks.forEach(function (s) {
        var v = r[s.key]; if (!(v > 0)) return;
        var h = (v / max) * ih; top -= h;
        b += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" fill="' + s.color + '"><title>' + esc(r.year + '년 ' + s.name + ' ' + money(v)) + '</title></rect>';
      });
    });
    if (line && rows.length) {
      var pts = rows.map(function (r, i) { return [L + step * i + step / 2, y(r[line.key] || 0), r]; });
      b += '<polyline fill="none" stroke="' + line.color + '" stroke-width="2.4" points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
      pts.forEach(function (p) { b += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.5" fill="' + line.color + '"><title>' + esc(p[2].year + '년까지 ' + line.name + ' ' + money(p[2][line.key])) + '</title></circle>'; });
    }
    if (!rows.length) b += '<text x="' + L + '" y="' + (T + 24) + '" class="ax">데이터 없음</text>';
    return frame(title, '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(title) + '">' + b + '</svg>');
  }
  // (v1.2) 품목분류 결정문 현황 — 관세율은 올린 파일 값을 그대로 보인다(물품설명서 초안에는 여전히 싣지 않는다)
  // (v1.6.0) 금액 열(경정청구 · 유보 · impact)이 있으면 impact 카드 · 연도별 그래프 · 완제품별 절감액 · 진행상태별 · 세율 인하 표를 더한다.
  //          기간은 결정문 탭 전용(state.rrange). 계산 · 기준은 모두 C.rulingStats.
  function renderRuling() {
    var f = filtered('ruling'), k = '', ch = '', tb = '';
    if (!f) { $('kpi-ruling').innerHTML = empty('ruling'); $('ch-ruling').innerHTML = ''; $('tb-ruling').innerHTML = ''; return; }
    var s = C.rulingStats(f.recs, state.rrange || state.range, $('by-ruling').value, $('sort-ruling').value), am = s.amounts;
    var mo = function (v) { return v == null ? '—' : money(v); };
    var cls = function (h, c) { return h.replace('class="kpi"', 'class="kpi ' + c + '"'); };
    var ext = am || s.has.status || s.has.claimDate || s.has.note;
    if (am || s.has.claimDate) {
      var notes = ['<b>기간 기준</b> ' + esc(s.basis)];
      if (s.has.claim) notes.push(s.claimOutsideN ? '<b>경정청구 금액 중 ' + esc(money(s.claimOutside)) + '은 기간 밖 결정문 건</b>(' + s.claimOutsideN + '건)' : '경정청구 금액 중 기간 밖 결정문 건은 없습니다');
      if (s.noDateN) notes.push('경정청구일이 비어 집계에서 뺀 경정청구 금액 ' + s.noDateN + '건 · ' + esc(money(s.noDate)) + '(파일 전체)');
      if (s.impactOnlyN) notes.push('경정청구 · 유보가 비고 impact 값만 있는 ' + s.impactOnlyN + '건 ' + esc(money(s.impactOnly)) + '은 시행일자 기준으로 합계에 넣었습니다');
      if (s.mismatchN) notes.push('impact 값이 경정청구 + 유보와 맞지 않는 ' + s.mismatchN + '건 — 합계는 경정청구 + 유보로 계산하고, 목록에는 impact 칸 값을 보입니다');
      k += '<p class="rul-basis" data-k="rul-basis">' + notes.join(' · ') + '</p>';
    }
    if (am) {
      k += cls(kpi('관세절감 impact 합계', mo(s.impact), '경정청구 ' + esc(mo(s.claim)) + ' + 관세유보 ' + esc(mo(s.reserve)) + (s.impactOnlyN ? ' + impact 값만 있는 ' + s.impactOnlyN + '건 ' + esc(money(s.impactOnly)) : ''), '계산: 경정청구 금액(경정청구일 기준) + 관세유보금액(시행일자 기준)', 'rul-impact'), 'big') +
        kpi('경정청구 환급액', mo(s.claim), s.has.claim ? C.fmtNum(s.claimN) + '건 · 경정청구일 기준' + (s.claimOutsideN ? ' · 그중 ' + esc(money(s.claimOutside)) + '은 기간 밖 결정문 건' : '') : '경정청구 금액 열이 있을 때 보입니다', s.has.claim ? '경정청구일 기준' : '', 'rul-claim') +
        kpi('관세유보액', mo(s.reserve), s.has.reserve ? '시행일자 기준' : '관세유보금액 열이 있을 때 보입니다', s.has.reserve ? '시행일자 기준' : '', 'rul-reserve');
    }
    k += kpi('결정문 건수', C.fmtNum(s.n), '완제품 ' + s.products + '종 · 관세사 ' + s.brokers + '곳', am ? '시행일자 기준' : '합계', 'rul-n');
    if (am || s.has.status) k += kpi('진행중 건수', s.progress == null ? '—' : C.fmtNum(s.progress) + '건', s.progress == null ? '진행상태 열이 있을 때 보입니다' : '경정청구중 + 재심사 + 심판청구', s.progress == null ? '' : '현재 상태 · 기간 무관', 'rul-progress');
    var sub = function (h) { return am ? cls(h, 'small') : h; };
    k += sub(kpi('관세율 0% 결정', C.fmtNum(s.zero) + '건', C.fmtPct(s.zeroRate) + ' (0% 건수 ÷ 결정 건수)' + (s.multiRate ? ' · 복수 세율 ' + s.multiRate + '건 제외' : ''), '계산: 0% 건수 ÷ 결정 건수', 'rul-zero')) +
      sub(kpi('종전보다 낮아진 건', s.withPrev ? C.fmtNum(s.lowered) + '건' : '—', s.withPrev ? '종전세율이 있는 ' + s.withPrev + '건 중' : '종전세율 열이 있을 때 보입니다', s.withPrev ? '계산: 결정세율 < 종전세율' : '', 'rul-lowered')) +
      sub(kpi(am ? '절감 추정(참고)' : '절감 추정(연간)', s.saving == null ? '—' : money(s.saving),
        am ? (s.saving == null ? '금액이 아직 없는 건 중 계산할 수 있는 건이 없습니다' : '금액이 아직 없는 ' + s.savingN + '건만 · 실제 금액과 더하지 않습니다')
          : s.saving == null ? '종전세율 · 연간 수입액 열이 있을 때 계산합니다' : s.savingN + '건 기준 · 추정치', s.saving == null ? '' : '계산: 연간 수입액 × (종전세율 − 결정세율)', 'rul-saving')) +
      sub(kpi('최근 시행', s.latest ? s.latest.date : '—', s.latest ? esc(s.latest.item) : '', '', 'rul-latest'));

    if (am) ch += yearChart('연도별 관세절감 impact(파일 전체 · 경정청구는 경정청구일 연도, 유보는 시행일자 연도)', s.yearly,
      [{ key: 'claim', name: '경정청구', color: COL[0] }, { key: 'reserve', name: '관세유보', color: COL[3] }].concat(s.impactOnlyN || s.yearly.some(function (y) { return y.other; }) ? [{ key: 'other', name: 'impact만', color: COL[4] }] : []),
      { key: 'cum', name: '누계', color: COL[2] });
    ch += monthChart('월별 결정문 시행 건수', s.months, [{ name: '결정 건수', color: COL[2], values: s.monthly.map(function (m) { return m.n || null; }), fmt: C.fmtNum }], 'bar', 'count');
    ch += hbar(s.byLabel + '별 결정 건수', s.groups.filter(function (g) { return g.n; }).slice(0, 12).map(function (g) { return { label: g.key, value: g.n }; }), C.fmtNum, COL[2]);

    var amH = am ? ['경정청구', '관세유보', 'impact'] : [];
    var amC = function (o) { return am ? [esc(mo(o.claim)), esc(mo(o.reserve)), esc(mo(o.impact))] : []; };
    tb += '<h3 class="tb-h">' + esc(s.byLabel) + '별</h3>' + ignoredNote(f.ignored) +
      table([s.byLabel, '결정 건수', '관세율 0%', '0% 비율', am ? '절감 추정(금액 없는 건)' : '절감 추정'].concat(amH), s.groups.map(function (g) { return { cells: [esc(g.key), n0(g.n), n0(g.zero), esc(C.fmtPct(g.zeroRate)), esc(g.saving == null ? '—' : money(g.saving))].concat(amC(g)) }; }),
        ['합계', n0(s.n), n0(s.zero), esc(C.fmtPct(s.zeroRate)), esc(s.saving == null ? '—' : money(s.saving))].concat(amC(s)), 'ruling-by');
    if (am) {
      tb += '<h3 class="tb-h">완제품별 절감액(impact 큰 순)</h3><p class="sub">' + esc(s.basis) + '</p>' +
        table(['완제품', '결정 건수', '경정청구', '관세유보', 'impact'], s.byProduct.map(function (g) { return { cells: [esc(g.key), n0(g.n)].concat(amC(g)) }; }), ['합계', n0(s.n)].concat(amC(s)), 'ruling-product-amt');
      tb += '<h3 class="tb-h">연도별 절감 impact(파일 전체)</h3>' +
        table(['연도', '경정청구(경정청구일 연도)', '관세유보(시행일자 연도)', '합계', '누계'], s.yearly.map(function (y) { return { cells: [esc(String(y.year)), esc(mo(y.claim)), esc(mo(y.reserve)), esc(mo(y.total)), esc(money(y.cum))] }; }), null, 'ruling-year');
    }
    if (s.statuses) tb += '<h3 class="tb-h">진행상태별(현재 상태 · 기간 무관 · 파일 전체)</h3>' +
      table(['진행상태', '건수', '경정청구', '관세유보', 'impact'], s.statuses.map(function (g) { return { cells: [esc(g.key) + (g.progress ? ' <span class="tag bad-t">진행중</span>' : ''), n0(g.n), esc(mo(g.claim)), esc(mo(g.reserve)), esc(mo(g.impact))] }; }), null, 'ruling-status');
    tb += '<h3 class="tb-h">세율별 분포</h3>' + table(['관세율', '건수'], s.rates.map(function (r) { return { cells: [esc(r.key), n0(r.n)] }; }), null, 'ruling-rates');
    if (s.rateChanges.length) tb += '<h3 class="tb-h">세율 인하 분포(종전세율 → 결정세율)</h3>' +
      table(['종전 → 결정', '건수', '낮아짐'], s.rateChanges.map(function (c) { return { cells: [esc(c.key), n0(c.n), c.lowered == null ? '—' : c.lowered ? '예' : '아니오'] }; }), null, 'ruling-change');
    var head = ['시행일자', '완제품', '품명', '결정세번', '결정문번호', '관세율', '관세사'].concat(ext ? ['경정청구', '관세유보', 'impact', '경정청구일', '진행상태'] : []);
    tb += '<h3 class="tb-h">결정문 목록(' + (s.sort === 'impact' ? 'impact 큰 순' : '최근 시행 순') + ')</h3>' + table(head, s.list.map(function (r) {
      var c = [esc(r.date), esc(r.product), esc(r.item), esc(r.hs), esc(r.docNo || ''), esc(r.rateText || '—'), esc(r.broker || '')];
      if (ext) c = c.concat([esc(mo(r.claim)), esc(mo(r.reserve)), esc(mo(r.impactRow)), esc(r.claimDate || '—'), esc(r.status || '—')]);
      return { cls: r.outside ? 'outside' : '', cells: c };
    }), null, 'ruling-list') + (s.claimOutsideN ? '<p class="sub">「기간 밖 결정문」은 시행일자는 기간 밖이지만 경정청구일이 기간 안이라 경정청구 금액이 들어간 건입니다.</p>' : '') +
      '<p class="sub">관세율은 올린 파일의 값을 그대로 보입니다. 물품설명서 초안에는 세율을 싣지 않는 규칙이 그대로입니다.</p>';
    $('kpi-ruling').innerHTML = k; $('ch-ruling').innerHTML = ch; $('tb-ruling').innerHTML = tb;
  }
  var RENDER = { trade: renderTrade, export: renderExport, fta: renderFta, exfta: renderExportFta, refund: renderRefund, errors: renderErrors, ruling: renderRuling };
  // (v2.3.0) 탭별 「자료 없음」 안내 — 오류점수 · 수입 FTA 는 각 render 함수가 안내한다
  var NODATA = {
    trade: { kind: 'import', box: 'kpi-trade', text: '수입 실적 자료가 없습니다. 위에서 ERP 수입실적 엑셀을 올려 주세요.', clear: ['sum-trade', 'ch-trade', 'tb-trade-report', 'ch-trade-by', 'tb-trade'] },
    export: { kind: 'export', box: 'kpi-export', text: '수출 실적 자료가 없습니다. 위에서 ERP 수출실적 엑셀을 올려 주세요.', clear: ['sum-export', 'ch-export', 'tb-export-report', 'ch-export-by', 'tb-export'] },
    refund: { kind: 'refund', box: 'kpi-refund', text: '관세환급 자료가 없습니다. 위에서 환급프로그램의 관세환급 신청 현황 엑셀을 올려 주세요.', clear: ['ch-refund', 'tb-refund'] },
    ruling: { kind: 'ruling', box: 'kpi-ruling', text: '품목분류 결정문 자료가 없습니다. 위에서 결정문 현황 엑셀을 올려 주세요.', clear: ['ch-ruling', 'tb-ruling'] }
  };
  function renderTab() {
    // (v2.3.0) 누른 탭으로 늘 간다(자료가 없다고 다른 탭으로 되돌리지 않음) — 그 탭 자료가 없으면 아래에서 안내만
    document.querySelectorAll('.tab').forEach(function (b) { var on = b.dataset.tab === state.tab; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.classList.toggle('on', on); });
    Object.keys(RENDER).forEach(function (t) { $('t-' + t).hidden = t !== state.tab; });
    var nd = NODATA[state.tab];
    if (nd && !ready(nd.kind)) { $(nd.box).innerHTML = '<div class="note" data-k="nodata-' + state.tab + '" style="grid-column:1/-1"><b>' + esc(nd.text) + '</b></div>'; nd.clear.forEach(function (id) { $(id).innerHTML = ''; }); return; }
    RENDER[state.tab]();
  }

  /* ---------- 엑셀 ---------- */
  function exportXlsx() {
    var data = {};
    C.KINDS.forEach(function (k) {
      var s = k !== 'ftaImport' && ready(k); if (!s) return;   // (v2.1.0) 수입 FTA 는 집계 내보내기에 넣지 않음(탭의 메일용 표 복사로)
      var m = s.m;
      data[k] = { file: m.files.map(function (p) { return p.file; }).join(' + '), period: m.period, records: m.records, map: m.map, skipped: m.skipped,
        files: m.files.map(function (p) { return { file: p.file, uploadedAt: p.uploadedAt, period: p.period, n: p.norm.records.length, skipped: p.norm.skipped.length, excluded: p.excluded, totalRows: p.totalRows }; }) };
    });
    var book = C.exportBook({ range: state.range, rulingRange: state.rrange, filter: state.filter, unit: state.unit, data: data, exportOpts: state.settings });
    var wb = XLSX.utils.book_new();
    book.forEach(function (sh) { XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sh.aoa), sh.name); });
    XLSX.writeFile(wb, '수출입통관_집계_' + state.range.from.replace('-', '') + '-' + state.range.to.replace('-', '') + '.xlsx');
  }

  /* ---------- 이벤트 ---------- */
  var drop = $('d-drop');
  ['dragover', 'dragenter'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { readFiles(e.dataTransfer.files); });
  $('d-file').addEventListener('change', function () { readFiles(this.files); this.value = ''; });
  $('btn-dash-sample').addEventListener('click', loadSample);
  // (v2.3.0) 지우기 — 지울 항목을 체크로 보인다. 사람이 손으로 입력한 관리대장 · 수입 FTA 확정값은 기본 해제.
  var CLEAR_ITEMS = [
    { id: 'data', label: '실적 데이터 (수입 · 수출 · 관세환급 · 품목분류 · 수입 FTA · 수출 FTA)', on: true, keys: function () { return [LS.data, LS.kinds, LS.files, C.EXFTA_DATA_KEY]; } },
    { id: 'errsum', label: '오류점수 요약 (유니패스 · ERP 인천 건수 결과 포함)', on: true, keys: function () { var E = window.ErrScore || {}; return [E.SUMMARY_KEY || 'b2611-07.err.summary', E.ERP_KEY || 'b2611-07.err.erp', E.BOOKS_KEY || 'b2611-07.err.books']; } },
    { id: 'notes', label: '오류점수 관리대장 입력값 — 사람이 손으로 입력한 내용', on: false, keys: function () { return [(window.ErrScore && window.ErrScore.NOTES_KEY) || 'build-2611-07.err.notes']; } },
    { id: 'snaps', label: '수입 FTA 확정 스냅샷', on: false, keys: function () { return [FTA_SNAP_KEY]; } },
    { id: 'exrates', label: '수출 FTA 세율표 (분석본에서 모은 세율)', on: false, keys: function () { return [C.EXFTA_RATES_KEY]; } }
  ];
  function clearDialog() {
    var dlg = $('d-clear-dlg');
    if (!dlg) {
      dlg = document.createElement('dialog'); dlg.id = 'd-clear-dlg'; dlg.className = 'clear-dlg'; dlg.setAttribute('aria-labelledby', 'd-clear-h');
      dlg.innerHTML = '<form method="dialog"><h3 id="d-clear-h" style="margin-top:0">이 브라우저에서 지울 항목</h3>' + CLEAR_ITEMS.map(function (c) { return '<label class="chk"><input type="checkbox" data-clear="' + c.id + '"> ' + esc(c.label) + '</label>'; }).join('') +
        '<p class="sub">지운 것은 되돌릴 수 없습니다. 관리대장 입력값은 먼저 오류점수 화면의 「대장 엑셀 내보내기」로 받아 두세요.</p><div class="btnrow"><button class="btn primary" value="ok" data-clear-ok>지우기</button> <button class="btn" value="cancel">취소</button></div></form>';
      document.body.appendChild(dlg);
      dlg.addEventListener('close', function () { if (dlg.returnValue === 'ok') doClear(CLEAR_ITEMS.filter(function (c) { return dlg.querySelector('[data-clear="' + c.id + '"]').checked; })); });
    }
    CLEAR_ITEMS.forEach(function (c) { dlg.querySelector('[data-clear="' + c.id + '"]').checked = c.on; });
    dlg.returnValue = ''; if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function doClear(sel) {
    endExample(true);
    if (!sel.length) { msg('고른 항목이 없어 아무것도 지우지 않았습니다.', 'ok'); return; }
    sel.forEach(function (c) { c.keys().forEach(function (k) { try { localStorage.removeItem(k); } catch (e) { /* 지우지 못해도 화면은 계속 */ } }); });
    var ids = sel.map(function (c) { return c.id; });
    if (ids.indexOf('data') >= 0) { state.exfta = []; state.sets = {}; state.pending = []; state.open = {}; state.range = null; state.rrange = null; state.view = false; state.saved = null; state.held = []; state.lostFiles = []; }
    var NAME = { data: '실적 데이터', errsum: '오류점수 요약', notes: '관리대장 입력값', snaps: '수입 FTA 확정 스냅샷', exrates: '수출 FTA 세율표' };
    var kept = CLEAR_ITEMS.filter(function (c) { return ids.indexOf(c.id) < 0; }).map(function (c) { return NAME[c.id]; });
    rebuild(); msg('<span data-k="clear-done">' + esc(ids.map(function (i) { return NAME[i]; }).join(' · ')) + '을(를) 지웠습니다.' + (kept.length ? ' ' + esc(kept.join(' · ')) + '은(는) 남겨 두었습니다.' : '') + '</span>', 'ok');
  }
  $('btn-dash-clear').addEventListener('click', clearDialog);
  // (v1.10.0) 조회 모드 띠의 버튼
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-example-end]')) endExample(false);
    else if (e.target.closest('[data-view-keep]')) keepView();
    else if (e.target.closest('[data-view-end]')) endView(false);
    else { var hb = e.target.closest('[data-drop-held]'); if (hb) { state.held.splice(+hb.dataset.dropHeld, 1); renderSets(); } }
  });
  $('d-remember').addEventListener('change', function () { if (this.checked) save(); else localStorage.removeItem(LS.data); });
  $('d-sets').addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.map) { var f = state.sets[t.dataset.map].files[+t.dataset.i]; f.override[t.dataset.f] = t.value; state.open[openKey(t.dataset.map, f)] = true; var nt = rebuild(false); if (nt) msg(nt.replace(/^<br>/, ''), 'warn'); }
    else if (t.dataset.pending != null && t.value) {
      var p = state.pending.splice(+t.dataset.pending, 1)[0]; p.reason = '직접 고름';
      var text = putFile(t.value, p), nm = {}; nm[p.file] = 1; state.open[openKey(t.value, p)] = true; setKindPref(p.headers, t.value);
      var note = rebuild(true), ov = overlapNotes(t.value, nm);
      msg(text + (ov.length ? '<br>' + ov.join('<br>') : '') + note, ov.length || note ? 'warn' : 'ok');
    }
    else if (t.dataset.rekind) { if (!changeKind(t.dataset.rekind, +t.dataset.i, t.value)) t.value = t.dataset.rekind; }
  });
  $('d-sets').addEventListener('click', function (e) {
    var t = e.target;
    if (t.dataset.toggle) { var ok = openKey(t.dataset.toggle, state.sets[t.dataset.toggle].files[+t.dataset.i]); state.open[ok] = !state.open[ok]; renderSets(); }
    else if (t.dataset.dropFile) dropFile(t.dataset.dropFile, +t.dataset.i);
    else if (t.dataset.dropPending != null) { state.pending.splice(+t.dataset.dropPending, 1); renderSets(); }
  });
  $('f-from').addEventListener('change', function () { var r = curRange(); r.from = this.value; if (r.to < this.value) r.to = this.value; renderFilter(); renderTab(); });
  $('f-to').addEventListener('change', function () { var r = curRange(); r.to = this.value; if (r.from > this.value) r.from = this.value; renderFilter(); renderTab(); });
  $('f-hq').addEventListener('change', function () { state.filter.hq = this.value; renderTab(); });
  $('f-country').addEventListener('change', function () { state.filter.country = this.value; renderTab(); });
  $('f-unit').addEventListener('change', function () { state.unit = this.value; localStorage.setItem(LS.unit, this.value); renderFilter(); renderTab(); });
  $('btn-f-reset').addEventListener('click', function () { state.range = C.defaultRange(state.period); state.rrange = C.rulingDefaultRange(state.rperiod); state.filter = {}; renderFilter(); renderTab(); });
  $('btn-dash-xlsx').addEventListener('click', exportXlsx);
  document.querySelector('.tabs').addEventListener('click', function (e) { var b = e.target.closest('.tab'); if (b) { state.tab = b.dataset.tab; if (state.tab === 'fta') showTariffMeta(); renderFilter(); renderTab(); } });
  ['by-trade', 'top-trade', 'by-export', 'top-export', 'by-fta', 'by-ruling', 'sort-ruling'].forEach(function (id) { $(id).addEventListener('change', renderTab); });
  // (v1.7.0) 설정
  // (v2.1.0) 수입 FTA 탭
  $('fta-imp').addEventListener('click', function (e) {
    var r = state.ftaLast; if (!r) return;
    if (e.target.closest('[data-fta-copy]')) {
      var html = ftaMailHtml(r); state.ftaMail = html;
      copyHtml(html, ftaMailText(r)).then(function (ok) { $('fta-copied').textContent = ok ? '복사했습니다 — Outlook 메일 본문에 붙여넣으세요(표 모양 그대로).' : '복사하지 못했습니다 — 표를 끌어 선택해 복사해 주세요.'; });
    } else if (e.target.closest('[data-fta-confirm]')) {
      var list = ftaSnaps(), had = list.some(function (q) { return q.ym === r.month; });
      if (had && !window.confirm(C.monthLabel(r.month) + ' 은(는) 이미 확정한 달입니다. 지금 값으로 다시 확정할까요?')) return;
      list = list.filter(function (q) { return q.ym !== r.month; }).concat([C.ftaSnapshot(r)]);
      try { localStorage.setItem(FTA_SNAP_KEY, JSON.stringify(list)); } catch (er) { /* 저장 못 해도 화면은 계속 */ }
      renderFtaImport(); $('fta-copied').textContent = C.monthLabel(r.month) + ' 실적을 확정했습니다(본부별 다섯 지표만 저장).';
    } else if (e.target.closest('[data-fta-goto]')) {   // (v2.2.0) 사후적용 대기 카드 → 목록
      var t = $(e.target.closest('[data-fta-goto]').getAttribute('data-fta-goto')); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (e.target.closest('[data-fta-reason]')) {   // (v2.2.0) 미적용 사유 행 → 신고번호 목록 펼치기 · 접기
      var key = e.target.closest('[data-fta-reason]').getAttribute('data-fta-reason');
      state.ftaReasonOpen = state.ftaReasonOpen === key ? null : key; renderFtaImport();
      var row = document.querySelector('[data-fta-reason="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"]'); if (row) row.focus();
    }
  });
  $('fta-imp').addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-fta-goto],[data-fta-reason]')) { e.preventDefault(); e.target.click(); }
  });
  $('d-settings-body').addEventListener('click', function (e) { if (e.target.closest('[data-exrates-xlsx]')) exportExRates(); });   // (v2.4.0)
  $('d-settings-body').addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'set-gn') applySettings(settingsFromForm(), '결제방법 ' + C.EXPORT_EXCLUDE_PAYMENT + ' 줄 ' + (t.checked ? '빼기를 켰습니다.' : '빼기를 껐습니다(GN 포함).'));
    else if (t.dataset.set) applySettings(settingsFromForm(), 'Plant → 본부 표를 고쳤습니다.');
    else if (t.dataset.setNa) applySettings(settingsFromForm(), '수입 FTA 미적용 사유 이름을 고쳤습니다.');
  });
  $('d-settings-body').addEventListener('click', function (e) {
    var t = e.target;
    if (t.dataset.setDel != null) applySettings(settingsFromForm({ del: +t.dataset.setDel }), 'Plant 번호 한 줄을 뺐습니다.');
    else if (t.dataset.setAdd != null) {
      var c = document.querySelector('[data-set-new="code"]').value.trim(), h = document.querySelector('[data-set-new="hq"]').value.trim();
      if (!c || !h) { msg('새 Plant 번호와 본부 이름을 모두 적어 주세요.', 'warn'); return; }
      applySettings(settingsFromForm({ add: { code: c, hq: h } }), 'Plant ' + esc(c) + ' → ' + esc(h) + ' 을(를) 더했습니다.');
    } else if (t.dataset.setReset != null) {
      try { localStorage.removeItem(LS.settings); } catch (er) { /* 지우지 못해도 화면은 기본 표 */ }
      state.settings = C.exportSettings(null); renderSettings();
      var note = Object.keys(state.sets).length ? rebuild(false) : '';
      msg('Plant 표와 GN 제외를 기본값으로 되돌렸습니다.' + note, note ? 'warn' : 'ok');
    }
  });
  renderSettings();
  $('f-unit').value = state.unit;   // (v2.5.0) 기억한 실적이 없어 조건 줄을 그리지 않아도 고른 단위를 보인다

  if (location.hash === '#example') loadSample();
  else if (restore()) { var rn = rebuild(true); msg('이 브라우저에 기억한 데이터를 불러왔습니다. 오늘 엑셀을 올리면 같은 종류 파일에 더합니다(이름이 같은 파일은 바꿉니다).' + rn + oldErrNote(), rn || state.oldErrors ? 'warn' : 'note'); }
  else {   // (v2.3.0) 기억한 실적이 없어도 탭과 안내를 보인다. 열 때 한 번만 — 자료가 있는 탭(오류점수 요약 → 수입 FTA)에서 시작(누른 탭을 되돌리지는 않음)
    if (!ready('import')) { if (errSummary()) state.tab = 'errors'; else if (ready('ftaImport')) state.tab = 'fta'; }
    rebuild(true);   // (v2.6.0) 실적이 없어도 수출 FTA · 오류점수 요약의 달로 기간을 정한다
  }
  if (!state.range && state.oldErrors) msg(oldErrNote().replace(/^<br>/, ''), 'warn');
  // (v2.0.0) 예전에 기억한 오류점수 집계표(errors 종류)는 되읽지 않는다 — 한 번 알림
  function oldErrNote() { return state.oldErrors ? '<br><b>예전에 올린 오류점수 집계표는 더 이상 쓰지 않습니다</b> — 오류점수는 <a href="errors.html">오류점수 화면</a>에서 유니패스 원본(현황목록 · 상세목록)으로 계산합니다.' : ''; }
})();
